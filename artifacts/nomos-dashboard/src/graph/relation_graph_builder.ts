/**
 * relation_graph_builder.ts
 *
 * Top-level entry point for the NOMOS graph layer.
 *
 * Takes raw text (one query, one candidate block, or a full structured input
 * with CANDIDATES / CONSTRAINTS / OBJECTIVE sections) and returns an
 * OperandGraph that later evaluators can query structurally.
 *
 * Responsibilities:
 *   1. Call bindRelations() to get all measured entities + relation bindings.
 *   2. Forward the BindingResult to buildOperandGraph().
 *   3. Detect section-based candidate and objective text, attach candidate and
 *      objective nodes, and wire BELONGS_TO_CANDIDATE / BELONGS_TO_OBJECTIVE
 *      edges based on entity position within candidate sub-blocks.
 *
 * Candidate sub-block parsing:
 *   If the CANDIDATES: section contains sub-labels (e.g. "A:", "B:", "C:", "D:")
 *   one candidate node is created per label and entity nodes are wired to their
 *   exact candidate by comparing span.startIndex against block character ranges.
 *   Inputs with no sub-labels fall back to a single "candidates" node.
 *
 * This layer is deterministic and domain-agnostic.
 * It must run before domain-family routing.
 */

import { bindRelations }      from "../compiler/relation_binder.ts";
import { buildOperandGraph }  from "./operand_graph_builder.ts";
import type { OperandGraph, GraphNode, GraphEdge } from "./operand_graph_types.ts";
import type { BindingResult }                       from "../compiler/measured_entity_types.ts";

/* =========================================================
   ID helpers (graph-length-derived — no module-level state)
   =========================================================
   Using the graph's current node/edge count as the suffix guarantees that
   IDs generated here never collide with those produced by buildOperandGraph's
   IdFactory, because both node and edge arrays only grow: the suffix is always
   ≥ the length at the time of the call.
   ========================================================= */

function nextNodeId(graph: OperandGraph, prefix: string): string {
  return `${prefix}_${graph.nodes.length}`;
}

function nextEdgeId(graph: OperandGraph, prefix: string): string {
  return `${prefix}_${graph.edges.length}`;
}

/* =========================================================
   Section boundary helpers
   ========================================================= */

const TOP_SECTION_HEADER_RE = /^(STATE|CONSTRAINTS?|CANDIDATES?|OBJECTIVE)\s*:/im;
const CANDIDATE_HEADER_RE   = /^(CANDIDATES?)\s*:/im;
const OBJECTIVE_HEADER_RE   = /^(OBJECTIVE)\s*:/im;

/**
 * Find the character range [start, end) of a named section's body.
 *
 * `start` points to the first character after the header colon.
 * `end`   points to the start of the next top-level section header, or EOF.
 */
function sectionBodyRange(
  rawText:    string,
  headerRe:  RegExp,
): { start: number; end: number } | null {
  const hm = headerRe.exec(rawText);
  if (!hm) return null;

  const start = hm.index + hm[0].length;

  // Find next top-level section after this one
  const rest  = rawText.slice(start);
  const next  = TOP_SECTION_HEADER_RE.exec(rest);
  const end   = next ? start + next.index : rawText.length;

  return { start, end };
}

/* =========================================================
   Candidate sub-block parser
   ========================================================= */

export interface CandidateBlock {
  /** Semantic label extracted from the sub-header, e.g. "A", "B", "1". */
  candidateId:  string;
  /** Human-readable label (same as candidateId unless extended). */
  label:        string;
  /** Absolute character start in rawText (inclusive). */
  startOffset:  number;
  /** Absolute character end in rawText (exclusive). */
  endOffset:    number;
}

/**
 * Pattern for candidate sub-headers inside a CANDIDATES block.
 *
 * Matches lines that start with 1–2 uppercase letters or 1–2 digits followed
 * by optional whitespace and a colon.  This intentionally excludes multi-word
 * section headers like CANDIDATES: or CONSTRAINTS: (which are ≥3 chars).
 *
 * Examples matched: "A:", "B:", "C:", "D:", "A1:", "1:", "2:"
 * Examples not matched: "CANDIDATES:", "STATE:", "OBJECTIVE:"
 */
const CANDIDATE_SUBLABEL_RE = /^([A-Z]{1,2}|\d{1,2})\s*:/gm;

/**
 * Parse individual candidate sub-blocks (A:, B:, …) from within the
 * CANDIDATES section body.
 *
 * Returns an empty array when no sub-labels are found (simple inputs like
 * "CANDIDATES:\n80g dextrin before lifting" have no A:/B: dividers).
 */
export function parseCandidateBlocks(rawText: string): CandidateBlock[] {
  const range = sectionBodyRange(rawText, CANDIDATE_HEADER_RE);
  if (!range) return [];

  const { start: bodyStart, end: bodyEnd } = range;
  const bodyText = rawText.slice(bodyStart, bodyEnd);

  CANDIDATE_SUBLABEL_RE.lastIndex = 0;
  const hits: Array<{ id: string; absoluteOffset: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = CANDIDATE_SUBLABEL_RE.exec(bodyText)) !== null) {
    hits.push({ id: m[1], absoluteOffset: bodyStart + m.index });
  }

  if (hits.length === 0) return [];

  const blocks: CandidateBlock[] = [];
  for (let i = 0; i < hits.length; i++) {
    blocks.push({
      candidateId:  hits[i].id,
      label:        hits[i].id,
      startOffset:  hits[i].absoluteOffset,
      endOffset:    i + 1 < hits.length ? hits[i + 1].absoluteOffset : bodyEnd,
    });
  }
  return blocks;
}

/* =========================================================
   Objective body extractor
   ========================================================= */

/**
 * Extract the full objective body text, trimmed and normalized.
 *
 * Captures everything between the OBJECTIVE: header and the next section
 * header (or EOF).  Normalizes internal whitespace to single spaces so the
 * label stays readable regardless of multi-line formatting.
 */
function extractObjectiveText(rawText: string): string {
  const range = sectionBodyRange(rawText, OBJECTIVE_HEADER_RE);
  if (!range) return "optimize";
  const body = rawText.slice(range.start, range.end).replace(/\s+/g, " ").trim();
  return body || "optimize";
}

/* =========================================================
   Public API
   ========================================================= */

export interface RelationGraphResult {
  graph:    OperandGraph;
  /** The raw BindingResult, available for downstream inspection. */
  rawText:  string;
}

/**
 * Parse `rawText` into an OperandGraph.
 *
 * Handles:
 *   - Simple one-liner: "80g cyclic dextrin 30 minutes before lifting"
 *   - Structured input with CANDIDATES: / CONSTRAINTS: / OBJECTIVE: sections
 *   - Multi-candidate blocks: "CANDIDATES:\nA: …\nB: …\nC: …"
 *
 * When sub-labels are detected, one candidate node is created per label and
 * entities are wired to their specific candidate by position.
 *
 * When no sub-labels are present, a single "candidates" node is created
 * (backward-compatible with simple inputs).
 */
export function buildRelationGraph(rawText: string): OperandGraph {
  const bindingResult: BindingResult = bindRelations(rawText);
  const graph:         OperandGraph  = buildOperandGraph(bindingResult);

  // Build a map from spanId → startIndex for position-based candidate matching
  const spanStart = new Map<string, number>(
    bindingResult.entities.map((e) => [e.id, e.startIndex])
  );

  // ── Candidate nodes ────────────────────────────────────────────────────────
  if (CANDIDATE_HEADER_RE.test(rawText)) {
    const blocks = parseCandidateBlocks(rawText);

    if (blocks.length > 0) {
      // ── Multi-candidate: one node per sub-label ──────────────────────────
      const candidateNodeIdByLabel = new Map<string, string>();

      for (const block of blocks) {
        const nodeId = nextNodeId(graph, "gn_candidate");
        const candidateNode: GraphNode = {
          id:    nodeId,
          type:  "candidate",
          label: block.label,
          data:  {
            candidateId: block.candidateId,
            source:      "CANDIDATES section",
          },
        };
        graph.nodes.push(candidateNode);
        candidateNodeIdByLabel.set(block.candidateId, nodeId);
      }

      // Wire each entity to the candidate whose block contains its span
      for (const node of graph.nodes) {
        if (node.type !== "entity") continue;
        const spanId = (node.data as Record<string, unknown>)?.entityId as string | undefined;
        if (!spanId) continue;

        const sIdx = spanStart.get(spanId);
        if (sIdx === undefined) continue;

        const block = blocks.find((b) => sIdx >= b.startOffset && sIdx < b.endOffset);
        if (!block) continue;

        const candidateNodeId = candidateNodeIdByLabel.get(block.candidateId);
        if (!candidateNodeId) continue;

        const edge: GraphEdge = {
          id:   nextEdgeId(graph, "ge_rg"),
          from: node.id,
          to:   candidateNodeId,
          type: "BELONGS_TO_CANDIDATE",
        };
        graph.edges.push(edge);
      }
    } else {
      // ── Single-candidate fallback: no A:/B: sub-labels detected ──────────
      const candidateNode: GraphNode = {
        id:    nextNodeId(graph, "gn_candidate"),
        type:  "candidate",
        label: "candidates",
        data:  { source: "CANDIDATES section" },
      };
      graph.nodes.push(candidateNode);

      for (const node of graph.nodes) {
        if (
          node.type === "entity" &&
          (node.data as Record<string, unknown>)?.role === "candidate_item"
        ) {
          const edge: GraphEdge = {
            id:   nextEdgeId(graph, "ge_rg"),
            from: node.id,
            to:   candidateNode.id,
            type: "BELONGS_TO_CANDIDATE",
          };
          graph.edges.push(edge);
        }
      }
    }
  }

  // ── Objective node ─────────────────────────────────────────────────────────
  if (OBJECTIVE_HEADER_RE.test(rawText)) {
    const objText = extractObjectiveText(rawText);

    const objectiveNode: GraphNode = {
      id:    nextNodeId(graph, "gn_objective"),
      type:  "objective",
      label: objText,
      data:  { source: "OBJECTIVE section", fullText: objText },
    };
    graph.nodes.push(objectiveNode);

    for (const node of graph.nodes) {
      if (
        node.type === "entity" &&
        (node.data as Record<string, unknown>)?.role === "objective_operand"
      ) {
        const edge: GraphEdge = {
          id:   nextEdgeId(graph, "ge_rg"),
          from: node.id,
          to:   objectiveNode.id,
          type: "BELONGS_TO_OBJECTIVE",
        };
        graph.edges.push(edge);
      }
    }
  }

  return graph;
}
