/**
 * temporal_constraint_engine.ts
 *
 * Deterministic temporal constraint evaluator for NOMOS.
 *
 * Constitutional role:
 * - Orchestrates window resolution → event collection → aggregation →
 *   threshold comparison for one or more TemporalConstraints.
 * - Produces fully traceable TemporalConstraintResult objects with
 *   included event IDs, observed values, and line-by-line explanations.
 * - No LLM dependency. All evaluation steps are deterministic.
 * - Reusable across nutrition, training, scheduling, and any
 *   time-anchored domain.
 *
 * Invariant:
 *   IF a TemporalConstraint is present in the input set
 *   THEN its result MUST appear in the output set.
 *   Evaluation MUST NOT silently drop a constraint.
 */

import {
  TemporalAnchor,
  TemporalEvent,
  TemporalConstraint,
  TemporalConstraintResult,
  TemporalEvaluationSummary,
} from "./temporal_types.js";
import { resolveWindow, collectEventsInWindow, findAnchor } from "./time_window_algebra.js";
import { filterByTags, aggregateWindow } from "./window_aggregator.js";

/* =========================================================
   Core public functions
   ========================================================= */

/**
 * evaluateTemporalConstraint — evaluates a single TemporalConstraint against
 * the full event list and anchor table.
 *
 * Returns a TemporalConstraintResult with full traceability:
 *   - which events were inside the window
 *   - what value was aggregated
 *   - whether the threshold was met
 *   - a step-by-step explanation
 */
export function evaluateTemporalConstraint(
  events: TemporalEvent[],
  anchors: TemporalAnchor[],
  constraint: TemporalConstraint
): TemporalConstraintResult {
  const { window: win, aggregation: spec, operator, threshold, constraintId, label } = constraint;

  let anchor: TemporalAnchor;
  try {
    anchor = findAnchor(anchors, win.anchorId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      constraintId,
      passed: false,
      observedValue: 0,
      operator,
      threshold,
      includedEventIds: [],
      explanationLines: [
        `CONSTRAINT: ${label}`,
        `ERROR: ${msg}`,
        `Result: FAIL (anchor missing — constraint cannot be evaluated).`,
      ],
    };
  }

  const resolved = resolveWindow(anchor, win);
  const inWindow = collectEventsInWindow(events, resolved);
  const tagFiltered = filterByTags(inWindow, spec.filterTags);
  const observed = aggregateWindow(inWindow, spec);
  const passed = applyOperator(observed, operator, threshold);

  const tagDesc = spec.filterTags && spec.filterTags.length > 0
    ? ` [tags: ${spec.filterTags.join(", ")}]`
    : "";

  const explanationLines: string[] = [
    `CONSTRAINT: ${label}`,
    `  Anchor: "${anchor.label}" at t=${anchor.timeMinutes} min`,
    `  Window: [${resolved.absoluteStartMinutes}, ${resolved.absoluteEndMinutes}] min (${win.relation} anchor)`,
    `  Events in window: ${inWindow.length} total, ${tagFiltered.length} matching${tagDesc}`,
    `  Matched event IDs: [${tagFiltered.map((e) => e.eventId).join(", ") || "none"}]`,
    `  Fast carbs seen: ${debugCarbsByTag(inWindow, "fast")}g  |  Slow carbs seen: ${debugCarbsByTag(inWindow, "slow")}g`,
    `  Aggregation: ${spec.aggregation}("${spec.quantityKey}")${tagDesc} = ${observed}`,
    `  Threshold: ${observed} ${operator} ${threshold} → ${passed ? "PASS ✓" : "FAIL ✗"}`,
  ];

  return {
    constraintId,
    passed,
    observedValue: observed,
    operator,
    threshold,
    includedEventIds: tagFiltered.map((e) => e.eventId),
    explanationLines,
  };
}

/**
 * evaluateTemporalConstraintSet — evaluates all constraints and returns
 * per-constraint results plus a rolled-up TemporalEvaluationSummary.
 *
 * Invariant:
 *   output.constraintResults.length === constraints.length
 *   (every constraint has a corresponding result — none are dropped)
 */
export function evaluateTemporalConstraintSet(
  candidateId: string,
  events: TemporalEvent[],
  anchors: TemporalAnchor[],
  constraints: TemporalConstraint[]
): TemporalEvaluationSummary {
  if (constraints.length === 0) {
    throw new Error(
      `[NOMOS invariant] evaluateTemporalConstraintSet called with zero constraints for ` +
      `candidate "${candidateId}". Caller must not invoke evaluation with an empty constraint set.`
    );
  }

  const constraintResults = constraints.map((c) =>
    evaluateTemporalConstraint(events, anchors, c)
  );

  const allPassed = constraintResults.every((r) => r.passed);

  const debugFastCarbsGrams = sumQuantityByTag(events, "carbs", "fast");
  const debugSlowCarbsGrams = sumQuantityByTag(events, "carbs", "slow");

  return {
    candidateId,
    allPassed,
    constraintResults,
    debugFastCarbsGrams,
    debugSlowCarbsGrams,
  };
}

/* =========================================================
   Operator application
   ========================================================= */

function applyOperator(
  observed: number,
  operator: TemporalConstraint["operator"],
  threshold: number
): boolean {
  switch (operator) {
    case ">=": return observed >= threshold;
    case "<=": return observed <= threshold;
    case ">":  return observed > threshold;
    case "<":  return observed < threshold;
    case "==": return observed === threshold;
  }
}

/* =========================================================
   Debug helpers
   ========================================================= */

function debugCarbsByTag(events: TemporalEvent[], tag: string): number {
  return events
    .filter((e) => e.tags.includes(tag))
    .reduce((sum, e) => sum + (e.quantities["carbs"] ?? 0), 0);
}

function sumQuantityByTag(events: TemporalEvent[], key: string, tag: string): number {
  return events
    .filter((e) => e.tags.includes(tag))
    .reduce((sum, e) => sum + (e.quantities[key] ?? 0), 0);
}
