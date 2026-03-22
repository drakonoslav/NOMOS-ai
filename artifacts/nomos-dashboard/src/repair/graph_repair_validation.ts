/**
 * graph_repair_validation.ts
 *
 * Validates that a graph repair plan actually restores constraint feasibility.
 *
 * validateGraphRepairPlan(graph, repairedGraph, constraintSet):
 *   1. Re-runs graph-first evaluation over the repaired graph
 *   2. Records whether the target constraint now passes
 *   3. Records any previously-passing constraints that now fail (new violations)
 *   4. Records any remaining failing constraints
 *   5. Returns a GraphRepairValidationResult
 *
 * Design invariants:
 *   - Always re-evaluates (reEvaluated is always true)
 *   - Uses the same graph-first evaluator as the main evaluation path
 *   - Does not modify either input graph
 *   - Produces auditable summaryLines regardless of outcome
 */

import type { CanonicalGraph }            from "../graph/canonical_graph_types.ts";
import type { GraphConstraintSpec }        from "../graph/graph_constraint_types.ts";
import type { GraphRepairValidationResult } from "./graph_repair_types.ts";
import type { ExecutionRoutingDecision }   from "../execution/execution_route_types.ts";
import { evaluateGraphFirst }              from "../execution/graph_first_evaluator.ts";
import { resolveExecutionRoute }           from "../execution/execution_router.ts";

/* =========================================================
   Validation input
   ========================================================= */

export interface GraphRepairValidationInput {
  /** Stable plan ID from the GraphRepairPlan.id that was applied. */
  repairPlanId: string;

  /** The constraint that was violated and should now be restored. */
  targetConstraintId: string;

  /** All constraint specs to re-evaluate (including the target). */
  constraintSet: GraphConstraintSpec[];

  /** The original graph (before repair) — used to detect new violations. */
  originalGraph: CanonicalGraph;

  /** The repaired graph (output of applyGraphRepairPlan). */
  repairedGraph: CanonicalGraph;
}

/* =========================================================
   Public entry point
   ========================================================= */

/**
 * Re-run graph-first evaluation over the repaired graph and determine
 * whether the repair restored feasibility for the target constraint.
 */
export function validateGraphRepairPlan(
  input: GraphRepairValidationInput
): GraphRepairValidationResult {
  const {
    repairPlanId,
    targetConstraintId,
    constraintSet,
    originalGraph,
    repairedGraph,
  } = input;

  const summaryLines: string[] = [];

  // Build routing decision for both evaluations
  const makeDecision = (graph: CanonicalGraph): ExecutionRoutingDecision =>
    resolveExecutionRoute({ canonicalGraph: graph });

  // Re-evaluate original graph to establish baseline passing set
  const originalResult = evaluateGraphFirst({
    graph:           originalGraph,
    constraints:     constraintSet,
    routingDecision: makeDecision(originalGraph),
  });

  const originalPassSet = new Set(
    originalResult.constraintResults
      .filter((r) => r.passed)
      .map((r) => r.constraintId)
  );

  // Re-evaluate repaired graph
  const repairedResult = evaluateGraphFirst({
    graph:           repairedGraph,
    constraints:     constraintSet,
    routingDecision: makeDecision(repairedGraph),
  });

  // Check target constraint
  const targetResult = repairedResult.constraintResults.find(
    (r) => r.constraintId === targetConstraintId
  );
  const restoredFeasibility = targetResult?.passed ?? false;

  // Find remaining violations (non-target constraints still failing)
  const remainingViolations = repairedResult.constraintResults
    .filter((r) => !r.passed && r.constraintId !== targetConstraintId)
    .map((r) => r.constraintId);

  // Find new violations (constraints that were passing before but now fail)
  const newViolations = repairedResult.constraintResults
    .filter((r) => !r.passed && originalPassSet.has(r.constraintId))
    .map((r) => r.constraintId);

  // Build summary lines
  const targetLabel = targetResult?.label ?? targetConstraintId;
  summaryLines.push(
    `Target constraint '${targetLabel}': ${restoredFeasibility ? "pass ✓" : "fail ✗"}`
  );

  if (restoredFeasibility) {
    summaryLines.push("Repair successfully restored constraint feasibility.");
  } else {
    const obs = targetResult?.observedValue ?? 0;
    const thr = targetResult?.threshold ?? 0;
    const op  = targetResult?.operator ?? ">=";
    summaryLines.push(
      `Repair insufficient: observed ${obs} still fails ${op} ${thr}.`
    );
  }

  if (newViolations.length > 0) {
    summaryLines.push(`New violations introduced: [${newViolations.join(", ")}]`);
  } else {
    summaryLines.push("No new violations introduced.");
  }

  if (remainingViolations.length > 0) {
    summaryLines.push(`Remaining violations: [${remainingViolations.join(", ")}]`);
  } else if (restoredFeasibility) {
    summaryLines.push("All evaluated constraints pass in repaired graph.");
  }

  summaryLines.push(
    `Repair plan '${repairPlanId}' feasibility: ${restoredFeasibility ? "restored" : "not restored"}`
  );

  return {
    repairPlanId,
    reEvaluated:           true,
    restoredFeasibility,
    remainingViolations,
    newViolations,
    summaryLines,
  };
}
