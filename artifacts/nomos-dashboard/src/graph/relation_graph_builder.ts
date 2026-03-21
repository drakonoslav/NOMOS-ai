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
 *      edges based on entity.role.
 *
 * This layer is deterministic and domain-agnostic.
 * It must run before domain-family routing.
 */

import { bindRelations }      from "../compiler/relation_binder.ts";
import { buildOperandGraph }  from "./operand_graph_builder.ts";
import type { OperandGraph, GraphNode, GraphEdge } from "./operand_graph_types.ts";

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
   Candidate / objective detection
   ========================================================= */

const CANDIDATE_HEADER_RE = /^(CANDIDATES?)\s*:/im;
const OBJECTIVE_HEADER_RE = /^(OBJECTIVE)\s*:/im;

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
 *
 * Candidate and objective nodes are added when section headers are detected.
 * Entity nodes are connected via BELONGS_TO_CANDIDATE / BELONGS_TO_OBJECTIVE
 * based on the section role assigned during entity extraction.
 */
export function buildRelationGraph(rawText: string): OperandGraph {
  const bindingResult = bindRelations(rawText);
  const graph         = buildOperandGraph(bindingResult);

  // ── Candidate nodes ────────────────────────────────────────────────────────
  const hasCandidates = CANDIDATE_HEADER_RE.test(rawText);
  if (hasCandidates) {
    // NOTE: single candidate node is a known limitation — multi-candidate
    // inputs (A: / B: blocks) each need their own node.  Tracked for the
    // constraint algebra phase.  For now all candidate_item entities are
    // wired to one "candidates" node, which is correct for single-candidate
    // queries and degenerate (but non-crashing) for multi-candidate inputs.
    const candidateNode: GraphNode = {
      id:    nextNodeId(graph, "gn_candidate"),
      type:  "candidate",
      label: "candidates",
      data:  { source: "CANDIDATES section" },
    };
    graph.nodes.push(candidateNode);

    // Wire all entity nodes whose role is candidate_item
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

  // ── Objective node ─────────────────────────────────────────────────────────
  const hasObjective = OBJECTIVE_HEADER_RE.test(rawText);
  if (hasObjective) {
    // Extract objective text (everything after "OBJECTIVE:")
    const objMatch = rawText.match(/OBJECTIVE\s*:\s*(.*)/is);
    const objText  = objMatch?.[1]?.split("\n")[0]?.trim() ?? "optimize";

    const objectiveNode: GraphNode = {
      id:    nextNodeId(graph, "gn_objective"),
      type:  "objective",
      label: objText,
      data:  { source: "OBJECTIVE section" },
    };
    graph.nodes.push(objectiveNode);

    // Wire entity nodes whose role is objective_operand
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
