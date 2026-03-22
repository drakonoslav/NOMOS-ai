/**
 * fallback_evaluator.ts
 *
 * Fallback evaluators for NOMOS when no canonical graph is available.
 *
 * Two fallback paths:
 *   1. evaluateEventFallback — evaluate constraints over temporal event arrays
 *   2. evaluateTextFallback  — evaluate constraints over raw text (last resort)
 *
 * Both paths:
 *   - Produce an ExecutionTrace that explicitly records fallbackUsed=true
 *   - Produce simple pass/fail results without graph-native proof/diff/repair
 *   - Must be dispatched to by execution_router (never called directly)
 *
 * Design invariants:
 *   - proofMode/diffMode/repairMode are "event" or "text" — never "graph"
 *   - No canonical graph is consulted (only the inputs to each call)
 *   - All results carry route="event_fallback" or route="text_fallback"
 */

import type {
  FallbackEvaluationResult,
  ExecutionRoutingDecision,
} from "./execution_route_types.ts";
import type { GraphConstraintSpec } from "../graph/graph_constraint_types.ts";
import {
  buildEventFallbackTrace,
  buildTextFallbackTrace,
} from "./execution_trace.ts";

/* =========================================================
   Event data type
   ========================================================= */

/**
 * A minimal temporal event record used by event_fallback evaluation.
 *
 * Events have an entity label, a quantity in some unit, and an optional
 * anchor reference with offset.
 */
export interface FallbackEvent {
  entityLabel: string;
  amount: number;
  unit: string;
  tags?: string[];
  anchorLabel?: string;
  offsetMinutes?: number;
  candidateId?: string;
}

/* =========================================================
   Event fallback evaluation helpers
   ========================================================= */

function compareValues(
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

function matchesTags(event: FallbackEvent, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const eventTags = event.tags ?? [];
  return tags.every((t) => eventTags.includes(t.toLowerCase()));
}

function matchesAnchorWindow(
  event: FallbackEvent,
  anchorLabel: string | null | undefined,
  relation: string | null | undefined,
  windowMinutes: number | null | undefined
): boolean {
  if (!anchorLabel) return true;
  if (event.anchorLabel?.toLowerCase() !== anchorLabel.toLowerCase()) return false;
  if (windowMinutes != null && event.offsetMinutes != null) {
    return event.offsetMinutes <= windowMinutes;
  }
  return true;
}

/**
 * Evaluate a single GraphConstraintSpec against a flat event array.
 * Returns a simple result record without graph-native proof/diff/repair.
 */
function evaluateConstraintOverEvents(
  spec: GraphConstraintSpec,
  events: FallbackEvent[],
  explanationAccumulator: string[]
): { passed: boolean; observedValue: number; lines: string[] } {
  const lines: string[] = [];
  let pool = events.slice();

  if (spec.selection.candidateId) {
    pool = pool.filter((e) => e.candidateId === spec.selection.candidateId);
    lines.push(
      `filtered by candidateId '${spec.selection.candidateId}': ${pool.length} event(s)`
    );
  }

  if (spec.selection.entityTags && spec.selection.entityTags.length > 0) {
    pool = pool.filter((e) => matchesTags(e, spec.selection.entityTags!));
    lines.push(`filtered by tags [${spec.selection.entityTags.join(", ")}]: ${pool.length} event(s)`);
  }

  if (spec.selection.entityLabels && spec.selection.entityLabels.length > 0) {
    pool = pool.filter((e) =>
      spec.selection.entityLabels!.some(
        (l) => l.toLowerCase() === e.entityLabel.toLowerCase()
      )
    );
    lines.push(`filtered by labels [${spec.selection.entityLabels.join(", ")}]: ${pool.length} event(s)`);
  }

  if (spec.selection.anchorLabel || spec.selection.relation) {
    pool = pool.filter((e) =>
      matchesAnchorWindow(
        e,
        spec.selection.anchorLabel,
        spec.selection.relation,
        spec.selection.windowMinutes
      )
    );
    lines.push(
      `window restriction (anchor='${spec.selection.anchorLabel}', ` +
      `relation='${spec.selection.relation}', ` +
      `windowMinutes=${spec.selection.windowMinutes}): ${pool.length} event(s)`
    );
  }

  const unit = spec.aggregation.quantityUnit;
  const matching = pool.filter((e) => e.unit.toLowerCase() === unit.toLowerCase());
  lines.push(`events with unit '${unit}': ${matching.length}`);

  let observed = 0;
  switch (spec.aggregation.aggregation) {
    case "sum":
      observed = matching.reduce((acc, e) => acc + e.amount, 0);
      break;
    case "count":
      observed = matching.length;
      break;
    case "max":
      observed = matching.length > 0 ? Math.max(...matching.map((e) => e.amount)) : 0;
      break;
    case "min":
      observed = matching.length > 0 ? Math.min(...matching.map((e) => e.amount)) : 0;
      break;
  }

  lines.push(`aggregated ${spec.aggregation.aggregation}(${unit}) = ${observed}`);
  const passed = compareValues(observed, spec.operator, spec.threshold);
  lines.push(
    `compared ${observed} ${spec.operator} ${spec.threshold} → ${passed ? "pass" : "fail"} [event_fallback]`
  );
  explanationAccumulator.push(...lines);
  return { passed, observedValue: observed, lines };
}

/* =========================================================
   Event fallback evaluator
   ========================================================= */

/**
 * Evaluate GraphConstraintSpec[] over a flat event array.
 *
 * This is the fallback path when no canonical graph is available but
 * temporal event data exists.
 */
export function evaluateEventFallback(opts: {
  constraints: GraphConstraintSpec[];
  events: FallbackEvent[];
  routingDecision: ExecutionRoutingDecision;
}): FallbackEvaluationResult {
  const { constraints, events, routingDecision } = opts;
  const constraintIds = constraints.map((c) => c.constraintId);
  const notes: string[] = [
    `event_fallback selected: ${events.length} event(s) available`,
    "proof, diff, and repair are event-mode only — not graph-native",
  ];

  const constraintResults: FallbackEvaluationResult["constraintResults"] = [];
  for (const spec of constraints) {
    const acc: string[] = [];
    const { passed, observedValue, lines } = evaluateConstraintOverEvents(spec, events, acc);
    constraintResults.push({
      constraintId:     spec.constraintId,
      label:            spec.label,
      passed,
      observedValue,
      operator:         spec.operator,
      threshold:        spec.threshold,
      explanationLines: lines,
    });
  }

  const passCount = constraintResults.filter((r) => r.passed).length;
  const failCount  = constraintResults.length - passCount;

  const trace = buildEventFallbackTrace({
    routingReason: routingDecision.reason,
    constraintIds,
    notes,
  });

  return {
    route: "event_fallback",
    trace,
    routingDecision,
    constraintResults,
    allPassed: failCount === 0,
    passCount,
    failCount,
  };
}

/* =========================================================
   Text fallback evaluator
   ========================================================= */

/**
 * Minimal text-fallback evaluator.
 *
 * Produces pass=false for all constraints because NOMOS does not perform
 * raw-text semantic evaluation in this layer.  This path exists solely to
 * satisfy the route contract and produce an auditable trace.
 *
 * Callers that need text-based evaluation must pre-process their input into
 * FallbackEvent[] and use evaluateEventFallback instead.
 */
export function evaluateTextFallback(opts: {
  constraints: GraphConstraintSpec[];
  rawText: string;
  routingDecision: ExecutionRoutingDecision;
}): FallbackEvaluationResult {
  const { constraints, rawText, routingDecision } = opts;
  const constraintIds = constraints.map((c) => c.constraintId);
  const notes: string[] = [
    `text_fallback selected — raw text (${rawText.length} chars) provided`,
    "text_fallback does not perform semantic evaluation",
    "all constraint results are inconclusive (pass=false)",
    "proof, diff, and repair are text-mode only — not graph-native",
  ];

  const constraintResults: FallbackEvaluationResult["constraintResults"] =
    constraints.map((spec) => ({
      constraintId:     spec.constraintId,
      label:            spec.label,
      passed:           false,
      observedValue:    0,
      operator:         spec.operator,
      threshold:        spec.threshold,
      explanationLines: [
        `text_fallback: cannot evaluate '${spec.label}' from raw text`,
        "convert input to canonical entities/graph to enable graph_first evaluation",
      ],
    }));

  const trace = buildTextFallbackTrace({
    routingReason: routingDecision.reason,
    constraintIds,
    notes,
  });

  return {
    route: "text_fallback",
    trace,
    routingDecision,
    constraintResults,
    allPassed: false,
    passCount: 0,
    failCount: constraints.length,
  };
}
