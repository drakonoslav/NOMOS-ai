/**
 * temporal_types.ts
 *
 * Canonical types for the NOMOS temporal constraint engine.
 *
 * Constitutional role:
 * - Defines the typed contract for time-window-based constraint evaluation.
 * - All types are domain-agnostic; the engine is reusable across nutrition,
 *   training, scheduling, and any other time-anchored domain.
 * - No evaluation logic lives here — types only.
 */

/**
 * Temporal relation of a window to its anchor point.
 *   "before" — window is at or before the anchor (negative offsets)
 *   "after"  — window is at or after the anchor (positive offsets)
 *   "around" — window spans both sides of the anchor
 */
export type TimeRelation = "before" | "after" | "around";

/**
 * A fixed reference point in time.
 *
 * Example — "lifting" at the zero origin:
 *   { anchorId: "lifting", label: "Lifting session", timeMinutes: 0 }
 */
export interface TemporalAnchor {
  anchorId: string;
  label: string;
  /** Absolute position in minutes (arbitrary origin, e.g. 0). */
  timeMinutes: number;
}

/**
 * A single time-stamped event with a quantity payload and classification tags.
 *
 * Example — "80g cyclic dextrin consumed 30 minutes before lifting":
 *   {
 *     eventId: "A_e1",
 *     label: "cyclic dextrin",
 *     category: "nutrition",
 *     timeMinutes: -30,
 *     quantities: { carbs: 80 },
 *     tags: ["fast", "carb", "fast_digesting"],
 *   }
 */
export interface TemporalEvent {
  eventId: string;
  label: string;
  category: string;
  /** Absolute time in minutes. Negative = before origin anchor. */
  timeMinutes: number;
  /** Named quantities for this event, e.g. { carbs: 80, protein: 0 }. */
  quantities: Record<string, number>;
  /** Classification tags, e.g. ["fast", "carb", "slow_digesting"]. */
  tags: string[];
}

/**
 * A resolved window with absolute start/end bounds.
 * Produced by resolveWindow; consumed by eventFallsInWindow.
 */
export interface ResolvedWindow {
  anchorId: string;
  absoluteStartMinutes: number;
  absoluteEndMinutes: number;
}

/**
 * A time window specification relative to a named anchor.
 *
 * Example — "within 90 minutes before lifting":
 *   { relation: "before", anchorId: "lifting", startOffsetMinutes: -90, endOffsetMinutes: 0 }
 *
 * For "before" windows, both offsets are ≤ 0 (the end offset is 0 at the anchor).
 * For "after"  windows, both offsets are ≥ 0.
 * For "around" windows, startOffset ≤ 0 and endOffset ≥ 0.
 */
export interface TimeWindow {
  relation: TimeRelation;
  anchorId: string;
  /** Inclusive lower bound in minutes relative to anchor (negative = before). */
  startOffsetMinutes: number;
  /** Inclusive upper bound in minutes relative to anchor (0 = at anchor). */
  endOffsetMinutes: number;
}

/**
 * Specifies how to aggregate event quantities within a window.
 *
 * Example — "sum of carbs for fast-tagged events":
 *   { quantityKey: "carbs", filterTags: ["fast"], aggregation: "sum" }
 */
export interface AggregationSpec {
  /** Key in TemporalEvent.quantities to aggregate. */
  quantityKey: string;
  /** ALL listed tags must be present in event.tags. Optional — if empty, all events qualify. */
  filterTags?: string[];
  /** Aggregation function to apply over matching event quantities. */
  aggregation: "sum" | "count" | "max" | "min";
}

/**
 * A complete temporal constraint — window + aggregation + threshold comparison.
 *
 * Example — "at least 60g of fast carbs within 90 min before lifting":
 *   {
 *     constraintId: "fast_carb_min_90",
 *     label: "Fast carbs >= 60g within 90 min before lifting",
 *     window: { relation: "before", anchorId: "lifting", startOffsetMinutes: -90, endOffsetMinutes: 0 },
 *     aggregation: { quantityKey: "carbs", filterTags: ["fast"], aggregation: "sum" },
 *     operator: ">=",
 *     threshold: 60,
 *   }
 */
export interface TemporalConstraint {
  constraintId: string;
  label: string;
  window: TimeWindow;
  aggregation: AggregationSpec;
  operator: ">=" | "<=" | ">" | "<" | "==";
  threshold: number;
}

/**
 * Auditable result of evaluating one TemporalConstraint against a candidate's events.
 *
 * Every field needed to reconstruct the evaluation reasoning is present.
 */
export interface TemporalConstraintResult {
  constraintId: string;
  passed: boolean;
  observedValue: number;
  operator: string;
  threshold: number;
  /** IDs of TemporalEvents that fell inside the resolved window. */
  includedEventIds: string[];
  /** Human-readable proof trace, one line per evaluation step. */
  explanationLines: string[];
}

/**
 * Aggregated result across a set of TemporalConstraints for one candidate.
 */
export interface TemporalEvaluationSummary {
  candidateId: string;
  allPassed: boolean;
  constraintResults: TemporalConstraintResult[];
  /** Total fast carbs observed across all windows (debug). */
  debugFastCarbsGrams: number;
  /** Total slow carbs observed across all windows (debug). */
  debugSlowCarbsGrams: number;
}
