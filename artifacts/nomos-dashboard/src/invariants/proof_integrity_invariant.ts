/**
 * proof_integrity_invariant.ts
 *
 * Proof Integrity Invariant
 * ─────────────────────────
 * Every node ID referenced in any proof step must correspond to an actual node
 * in the OperandGraph.  No proof step may reference ghost (non-existent) nodes.
 *
 * "Ghost node" = a node ID that appears in a proof step's node-ID array but
 * has no matching entry in graph.nodes.
 *
 * Rules enforced:
 *   PI-01  selectedNodeIds contains only graph node IDs.
 *   PI-02  excludedNodeIds contains only graph node IDs.
 *   PI-03  anchorNodeIds contains only graph node IDs.
 *   PI-04  windowNodeIds contains only graph node IDs.
 *   PI-05  aggregateSourceNodeIds contains only graph node IDs.
 *   PI-06  selectedNodeIds and excludedNodeIds within the same step are
 *          disjoint — a node cannot simultaneously survive and be excluded.
 */

import type { OperandGraph }              from "../graph/operand_graph_types.ts";
import type { GraphConstraintProofTrace } from "../graph/graph_proof_types.ts";
import type { InvariantResult, InvariantViolation } from "./invariant_types.ts";

const NAME = "ProofIntegrity" as const;
const DESC = "Every proof step references only actual graph node IDs; no ghost or inferred nodes.";

interface ArraySpec {
  rule:    string;
  key:     "selectedNodeIds" | "excludedNodeIds" | "anchorNodeIds" | "windowNodeIds" | "aggregateSourceNodeIds";
  ruleTag: "PI-01" | "PI-02" | "PI-03" | "PI-04" | "PI-05";
}

const ARRAY_SPECS: ArraySpec[] = [
  { rule: "GHOST_SELECTED_NODE",         key: "selectedNodeIds",         ruleTag: "PI-01" },
  { rule: "GHOST_EXCLUDED_NODE",         key: "excludedNodeIds",         ruleTag: "PI-02" },
  { rule: "GHOST_ANCHOR_NODE",           key: "anchorNodeIds",           ruleTag: "PI-03" },
  { rule: "GHOST_WINDOW_NODE",           key: "windowNodeIds",           ruleTag: "PI-04" },
  { rule: "GHOST_AGGREGATE_SOURCE_NODE", key: "aggregateSourceNodeIds",  ruleTag: "PI-05" },
];

/**
 * Check proof integrity for one proof trace.
 */
function checkTrace(
  trace:     GraphConstraintProofTrace,
  nodeIds:   Set<string>,
  violations: InvariantViolation[]
): void {
  for (const step of trace.steps) {
    const stepRef = `constraint "${trace.constraintId}" step ${step.stepNumber} ("${step.label}")`;

    // PI-01..05: ghost node checks
    for (const { rule, key } of ARRAY_SPECS) {
      const ids = (step[key] as string[] | undefined) ?? [];
      for (const id of ids) {
        if (!nodeIds.has(id)) {
          violations.push({
            invariant: NAME,
            rule,
            message:   `${stepRef}: node ID "${id}" in ${key} does not exist in the graph.`,
            detail:    {
              constraintId: trace.constraintId,
              stepNumber:   step.stepNumber,
              stepLabel:    step.label,
              ghostNodeId:  id,
              array:        key,
            },
          });
        }
      }
    }

    // PI-06: selected ∩ excluded must be empty
    const selected = new Set((step.selectedNodeIds ?? []));
    const excluded = (step.excludedNodeIds ?? []);
    for (const id of excluded) {
      if (selected.has(id)) {
        violations.push({
          invariant: NAME,
          rule:      "NODE_IN_BOTH_SELECTED_AND_EXCLUDED",
          message:   `${stepRef}: node "${id}" appears in both selectedNodeIds and excludedNodeIds.`,
          detail:    {
            constraintId: trace.constraintId,
            stepNumber:   step.stepNumber,
            nodeId:       id,
          },
        });
      }
    }
  }
}

/**
 * Check proof integrity for a set of proof traces against a graph.
 *
 * @param traces — All proof traces produced by the executor.
 * @param graph  — The OperandGraph the traces were built from.
 */
export function checkProofIntegrity(
  traces: GraphConstraintProofTrace[],
  graph:  OperandGraph
): InvariantResult {
  const violations: InvariantViolation[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  for (const trace of traces) {
    checkTrace(trace, nodeIds, violations);
  }

  return {
    invariant:   NAME,
    description: DESC,
    passed:      violations.length === 0,
    violations,
  };
}
