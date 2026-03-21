/**
 * graph_constraint_executor.ts
 *
 * Deterministic constraint execution over the OperandGraph.
 *
 * This is the preferred evaluation path for temporal candidate constraints
 * where an OperandGraph has been built.
 *
 * Execution pipeline (per constraint):
 *
 *   1. selectCandidateEntities   — candidate filter (or all entities)
 *   2. filterEntitiesByTags      — tag intersection filter
 *   3. filterEntitiesByLabels    — label filter
 *   4. restrictEntitiesByAnchorWindow — temporal / spatial window filter
 *   5. aggregateSelectedQuantity — sum / count / max / min
 *   6. compare against threshold — produce pass/fail
 *   7. build proof trace         — node-aware auditable record
 *
 * Every execution returns both a `GraphConstraintExecutionResult` (with legacy
 * `explanationLines`) and a `GraphConstraintProofTrace` attached as `result.proof`.
 */

import type { OperandGraph }          from "./operand_graph_types.ts";
import type {
  GraphConstraintSpec,
  GraphConstraintExecutionResult,
} from "./graph_constraint_types.ts";
import {
  selectCandidateEntities,
  filterEntitiesByTags,
  filterEntitiesByLabels,
  restrictEntitiesByAnchorWindow,
  aggregateSelectedQuantity,
} from "./graph_query_engine.ts";
import { buildConstraintProofTrace } from "./graph_proof_trace.ts";

/* =========================================================
   Comparison helper
   ========================================================= */

function compare(
  observed: number,
  operator: GraphConstraintSpec["operator"],
  threshold: number
): boolean {
  switch (operator) {
    case ">=": return observed >= threshold;
    case "<=": return observed <= threshold;
    case ">":  return observed >  threshold;
    case "<":  return observed <  threshold;
    case "==": return observed === threshold;
  }
}

/* =========================================================
   Single constraint execution
   ========================================================= */

/**
 * Execute one constraint against the graph.
 *
 * Returns a `GraphConstraintExecutionResult` that includes:
 *   - `explanationLines`: concise step descriptions (legacy format)
 *   - `proof`: full node-aware GraphConstraintProofTrace
 */
export function executeGraphConstraint(
  graph: OperandGraph,
  spec:  GraphConstraintSpec
): GraphConstraintExecutionResult {
  const lines: string[] = [];
  const { selection, aggregation } = spec;

  // ── Step 1: candidate selection ──────────────────────────────────────────
  let nodes = selectCandidateEntities(graph, selection.candidateId);
  let ids   = nodes.map((n) => n.id);

  if (selection.candidateId) {
    lines.push(
      `selected ${ids.length} candidate-${selection.candidateId} ${ids.length === 1 ? "entity" : "entities"}`
    );
  } else {
    lines.push(`selected ${ids.length} ${ids.length === 1 ? "entity" : "entities"} (all candidates)`);
  }

  // ── Step 2: tag filter ────────────────────────────────────────────────────
  const tags = selection.entityTags ?? [];
  if (tags.length > 0) {
    ids = filterEntitiesByTags(graph, ids, tags);
    lines.push(
      `filtered by tags [${tags.join(", ")}]: ${ids.length} ${ids.length === 1 ? "entity" : "entities"}`
    );
  }

  // ── Step 3: label filter ──────────────────────────────────────────────────
  const labels = selection.entityLabels ?? [];
  if (labels.length > 0) {
    ids = filterEntitiesByLabels(graph, ids, labels);
    lines.push(
      `filtered by labels [${labels.join(", ")}]: ${ids.length} ${ids.length === 1 ? "entity" : "entities"}`
    );
  }

  // ── Step 4: anchor-window restriction ─────────────────────────────────────
  if (selection.anchorLabel || selection.relation || selection.windowMinutes != null) {
    ids = restrictEntitiesByAnchorWindow(
      graph,
      ids,
      selection.anchorLabel,
      selection.relation,
      selection.windowMinutes
    );

    const windowDesc  = selection.windowMinutes != null
      ? `${selection.windowMinutes}min `
      : "";
    const relDesc    = selection.relation ?? "relative to";
    const anchorDesc = selection.anchorLabel ?? "(any anchor)";
    lines.push(
      `restricted to ${windowDesc}${relDesc} ${anchorDesc}: ${ids.length} ${ids.length === 1 ? "entity" : "entities"}`
    );
  }

  // ── Step 5: aggregate ─────────────────────────────────────────────────────
  const observed = aggregateSelectedQuantity(
    graph,
    ids,
    aggregation.quantityUnit,
    aggregation.aggregation
  );
  lines.push(
    `aggregated ${aggregation.aggregation}(${aggregation.quantityUnit}) = ${observed}`
  );

  // ── Step 6: compare ───────────────────────────────────────────────────────
  const passed = compare(observed, spec.operator, spec.threshold);
  lines.push(
    `compared ${observed} ${spec.operator} ${spec.threshold} → ${passed ? "pass" : "fail"}`
  );

  // ── Step 7: build proof trace ─────────────────────────────────────────────
  const proof = buildConstraintProofTrace(graph, spec);

  return {
    constraintId:    spec.constraintId,
    passed,
    selectedNodeIds: ids,
    observedValue:   observed,
    operator:        spec.operator,
    threshold:       spec.threshold,
    explanationLines: lines,
    proof,
  };
}

/* =========================================================
   Constraint set execution
   ========================================================= */

/**
 * Execute all constraints in `specs` against the same graph.
 * Results are returned in the same order as `specs`.
 * Each result includes a proof trace.
 */
export function executeGraphConstraintSet(
  graph: OperandGraph,
  specs: GraphConstraintSpec[]
): GraphConstraintExecutionResult[] {
  return specs.map((spec) => executeGraphConstraint(graph, spec));
}
