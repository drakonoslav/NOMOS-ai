/**
 * graph_backprop_index.ts
 *
 * Deterministic back-propagation index builder.
 *
 * Scans proof traces and the graph structure to build a node-keyed index
 * that answers: "What role did this node play in proof execution?"
 *
 * Exported functions:
 *   buildGraphBackpropIndex(graph, proofTraces, constraintResults)
 *   getNodeBackpropRecord(nodeId, index)
 *   stepReferencesNode(step, nodeId)
 *
 * Indexing rules (per proof step):
 *   selectedNodeIds        → role "selected"
 *   excludedNodeIds        → role "excluded"          (priority 1)
 *   aggregateSourceNodeIds → role "aggregate_source"  (priority 2)
 *   anchorNodeIds          → role "anchor"
 *   windowNodeIds          → role "window"
 *
 * When a node appears in multiple arrays for the same step the highest-priority
 * role is recorded:
 *   excluded > aggregate_source > selected > anchor > window
 */

import type { OperandGraph }           from "../../graph/operand_graph_types.ts";
import type { GraphConstraintProofTrace } from "../../graph/graph_proof_types.ts";
import type { GraphConstraintExecutionResult } from "../../graph/graph_constraint_types.ts";
import type {
  GraphBackpropIndex,
  GraphNodeBackpropRecord,
  NodeProofReference,
  NodeRoleInStep,
} from "./graph_backprop_types.ts";

/* =========================================================
   Internal helpers
   ========================================================= */

/**
 * Determine the highest-priority role for a node within one proof step.
 * Returns null if the node does not appear in any step array.
 */
function resolveRole(
  nodeId:       string,
  step:         {
    selectedNodeIds?:        string[];
    excludedNodeIds?:        string[];
    anchorNodeIds?:          string[];
    windowNodeIds?:          string[];
    aggregateSourceNodeIds?: string[];
  }
): NodeRoleInStep | null {
  if (step.excludedNodeIds?.includes(nodeId))        return "excluded";
  if (step.aggregateSourceNodeIds?.includes(nodeId)) return "aggregate_source";
  if (step.selectedNodeIds?.includes(nodeId))        return "selected";
  if (step.anchorNodeIds?.includes(nodeId))          return "anchor";
  if (step.windowNodeIds?.includes(nodeId))          return "window";
  return null;
}

/**
 * Collect all node IDs referenced in a step (across all arrays).
 * Returns the union without duplicates.
 */
function allNodeIdsInStep(step: {
  selectedNodeIds?:        string[];
  excludedNodeIds?:        string[];
  anchorNodeIds?:          string[];
  windowNodeIds?:          string[];
  aggregateSourceNodeIds?: string[];
}): string[] {
  const ids = new Set<string>([
    ...(step.selectedNodeIds        ?? []),
    ...(step.excludedNodeIds        ?? []),
    ...(step.anchorNodeIds          ?? []),
    ...(step.windowNodeIds          ?? []),
    ...(step.aggregateSourceNodeIds ?? []),
  ]);
  return [...ids];
}

/** Initialise an empty record for a node. */
function emptyRecord(nodeId: string): GraphNodeBackpropRecord {
  return {
    nodeId,
    proofReferences:      [],
    constraintReferences: [],
    candidateReferences:  [],
    summaryLines:         [],
  };
}

/* =========================================================
   Public API
   ========================================================= */

/**
 * Build the full back-propagation index.
 *
 * @param graph             — The OperandGraph (used for candidate linkage).
 * @param proofTraces       — All proof traces produced by the executor.
 * @param constraintResults — All execution results (used for constraint labels).
 *
 * Returns a Map<nodeId, GraphNodeBackpropRecord> covering every node in `graph`.
 * Nodes unreferenced by any proof step have empty proof/constraint/candidate
 * arrays and a "Not referenced" summary line.
 */
export function buildGraphBackpropIndex(
  graph:             OperandGraph,
  proofTraces:       GraphConstraintProofTrace[],
  constraintResults: GraphConstraintExecutionResult[]
): GraphBackpropIndex {
  const index: GraphBackpropIndex = new Map();

  // Pre-initialise a record for every graph node
  for (const node of graph.nodes) {
    index.set(node.id, emptyRecord(node.id));
  }

  // ── Build constraint label lookup ─────────────────────────────────────────
  const constraintLabel = new Map<string, string>();
  for (const r of constraintResults) {
    constraintLabel.set(r.constraintId, r.proof?.label ?? r.constraintId);
  }
  // Also pull labels from traces directly (in case results not supplied)
  for (const t of proofTraces) {
    if (!constraintLabel.has(t.constraintId)) {
      constraintLabel.set(t.constraintId, t.label);
    }
  }

  // ── Index proof steps ─────────────────────────────────────────────────────
  for (const trace of proofTraces) {
    const traceId = trace.constraintId;

    for (const step of trace.steps) {
      const stepId    = `${traceId}-step-${step.stepNumber}`;
      const nodeIds   = allNodeIdsInStep(step);

      for (const nodeId of nodeIds) {
        const role = resolveRole(nodeId, step);
        if (role === null) continue;

        // Get or create record (handle nodes not in graph — e.g., derived IDs)
        if (!index.has(nodeId)) {
          index.set(nodeId, emptyRecord(nodeId));
        }
        const record = index.get(nodeId)!;

        // Check if a reference for this (traceId, stepId) already exists
        const existingRef = record.proofReferences.find(
          (r) => r.proofStepId === stepId
        );
        if (existingRef) {
          // Keep highest-priority role (priority already encoded in resolveRole)
          const PRIORITY: Record<NodeRoleInStep, number> = {
            excluded:         5,
            aggregate_source: 4,
            selected:         3,
            anchor:           2,
            window:           1,
          };
          if (PRIORITY[role] > PRIORITY[existingRef.roleInStep]) {
            existingRef.roleInStep = role;
          }
        } else {
          const ref: NodeProofReference = {
            constraintId:   traceId,
            proofTraceId:   traceId,
            proofStepId:    stepId,
            proofStepLabel: step.label,
            roleInStep:     role,
          };
          record.proofReferences.push(ref);
        }
      }
    }
  }

  // ── Add constraint references ─────────────────────────────────────────────
  for (const [nodeId, record] of index) {
    const touchedConstraints = new Set(record.proofReferences.map((r) => r.constraintId));
    for (const cid of touchedConstraints) {
      record.constraintReferences.push({
        constraintId:    cid,
        constraintLabel: constraintLabel.get(cid) ?? cid,
      });
    }
  }

  // ── Add candidate references (from BELONGS_TO_CANDIDATE edges) ────────────
  for (const edge of graph.edges) {
    if (edge.type !== "BELONGS_TO_CANDIDATE") continue;
    const entityId    = edge.from;
    const candidateId = edge.to;
    const candidateNode = graph.nodes.find((n) => n.id === candidateId);
    if (!candidateNode) continue;

    const record = index.get(entityId);
    if (!record) continue;

    // Avoid duplicate candidate references
    if (!record.candidateReferences.some((c) => c.candidateId === candidateId)) {
      record.candidateReferences.push({
        candidateId:    candidateId,
        candidateLabel: candidateNode.label,
      });
    }
  }

  // ── Generate summary lines ────────────────────────────────────────────────
  for (const [, record] of index) {
    const lines: string[] = [];

    // Proof step summary
    const selectedCount      = record.proofReferences.filter((r) => r.roleInStep === "selected").length;
    const excludedCount      = record.proofReferences.filter((r) => r.roleInStep === "excluded").length;
    const aggregateCount     = record.proofReferences.filter((r) => r.roleInStep === "aggregate_source").length;
    const anchorCount        = record.proofReferences.filter((r) => r.roleInStep === "anchor").length;
    const windowCount        = record.proofReferences.filter((r) => r.roleInStep === "window").length;
    const totalProofRefs     = record.proofReferences.length;

    if (totalProofRefs === 0) {
      lines.push("This node was not referenced in any proof step.");
    } else {
      const parts: string[] = [];
      if (selectedCount > 0)  parts.push(`selected in ${selectedCount} ${selectedCount === 1 ? "step" : "steps"}`);
      if (excludedCount > 0)  parts.push(`excluded in ${excludedCount} ${excludedCount === 1 ? "step" : "steps"}`);
      if (aggregateCount > 0) parts.push(`contributed to aggregate in ${aggregateCount} ${aggregateCount === 1 ? "step" : "steps"}`);
      if (anchorCount > 0)    parts.push(`used as anchor in ${anchorCount} ${anchorCount === 1 ? "step" : "steps"}`);
      if (windowCount > 0)    parts.push(`referenced as window in ${windowCount} ${windowCount === 1 ? "step" : "steps"}`);
      lines.push(`This node was ${parts.join(", ")}.`);
    }

    // Candidate summary
    for (const c of record.candidateReferences) {
      lines.push(`This node belongs to candidate ${c.candidateLabel}.`);
    }

    // Constraint summary
    for (const c of record.constraintReferences) {
      lines.push(`This node participated in constraint: ${c.constraintLabel}.`);
    }

    record.summaryLines = lines;
  }

  return index;
}

/* =========================================================
   getNodeBackpropRecord
   ========================================================= */

/**
 * Look up the back-propagation record for a graph node.
 *
 * Returns null if the node is not in the index.
 */
export function getNodeBackpropRecord(
  nodeId: string,
  index:  GraphBackpropIndex
): GraphNodeBackpropRecord | null {
  return index.get(nodeId) ?? null;
}

/* =========================================================
   stepReferencesNode
   ========================================================= */

/**
 * Return true if `nodeId` appears in any of the step's highlight arrays.
 *
 * Used by the proof panel to mark steps that are relevant to a selected node.
 */
export function stepReferencesNode(
  step:   {
    selectedNodeIds?:        string[];
    excludedNodeIds?:        string[];
    anchorNodeIds?:          string[];
    windowNodeIds?:          string[];
    aggregateSourceNodeIds?: string[];
  },
  nodeId: string
): boolean {
  return (
    (step.selectedNodeIds        ?? []).includes(nodeId) ||
    (step.excludedNodeIds        ?? []).includes(nodeId) ||
    (step.anchorNodeIds          ?? []).includes(nodeId) ||
    (step.windowNodeIds          ?? []).includes(nodeId) ||
    (step.aggregateSourceNodeIds ?? []).includes(nodeId)
  );
}
