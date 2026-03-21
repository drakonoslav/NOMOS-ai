/**
 * windowed_aggregator.ts
 *
 * Generic windowed aggregation layer over CandidateEvent arrays.
 *
 * Constitutional role:
 * - Given structured CandidateEvent objects, computes reusable derived variables
 *   by filtering on domain/type/tags and time window, then aggregating quantities.
 * - No admissibility evaluation, no LAWFUL/DEGRADED/INVALID assignments.
 * - All functions are deterministic and reusable across domains.
 *
 * Layer contract:
 *   CandidateEvent[] → AggregationResult[]   (derived variable values)
 * The next layer (atomic constraint evaluator) then compares those values
 * against thresholds from AtomicConstraint.
 */

import { CandidateEvent } from "./event_types.js";

/* =========================================================
   Types
   ========================================================= */

/**
 * Describes a time window relative to a named reference event.
 * All offsets are in minutes; pre-event offsets are negative.
 *
 * Example — "within 90 minutes before lifting":
 *   { referenceEvent: "lifting", minOffsetMinutes: -90, maxOffsetMinutes: 0 }
 */
export interface EventWindowFilter {
  /**
   * Reference anchor event name.
   * Example: "lifting", "bedtime", "frost"
   */
  referenceEvent?: string;

  /**
   * Inclusive lower bound in minutes (most negative = furthest before).
   * Example: -90 means events 90 min before the reference or later are included.
   */
  minOffsetMinutes?: number;

  /**
   * Inclusive upper bound in minutes.
   * Example: 0 means up to and including the reference moment.
   */
  maxOffsetMinutes?: number;
}

/**
 * Filters for selecting a subset of events before aggregating.
 *
 * All specified fields are AND-ed together.
 */
export interface EventSelector {
  /** Match events with this exact domain (case-sensitive). */
  domain?: string;
  /** Match events with this action verb (case-insensitive). */
  action?: string;
  /** Match events with this subject substance (case-insensitive). */
  subject?: string;
  /** Match events with this nutrient speed. */
  nutrientSpeed?: "FAST" | "SLOW" | "UNKNOWN";
  /** ALL listed tags must be present in event.tags. */
  requiredTags?: string[];
}

/**
 * Result of a single aggregation operation.
 */
export interface AggregationResult {
  /** Stable key for this derived variable. Example: fast_carbs_grams_within_90min */
  key: string;
  /** Human-readable label. Example: "Fast Carbs Within 90 Min" */
  label: string;
  /** Aggregated numeric value. */
  value: number;
  /** Units of the value. Example: "g", "minutes" */
  units: string;
  /** IDs of the events that contributed to this result. */
  matchedEventIds: string[];
  /** Notes about the aggregation (e.g. empty match). */
  notes: string[];
}

/* =========================================================
   Core generic helpers
   ========================================================= */

/**
 * filterEventsByWindow — returns only events whose timeOffsetMinutes falls
 * within the specified window bounds (inclusive).
 *
 * - If referenceEvent is specified, only events with a matching referenceEvent
 *   (case-insensitive) are included.
 * - Events with undefined timeOffsetMinutes are always excluded.
 */
export function filterEventsByWindow(
  events: CandidateEvent[],
  window: EventWindowFilter
): CandidateEvent[] {
  return events.filter(event => {
    if (event.timeOffsetMinutes === undefined) return false;

    if (window.referenceEvent !== undefined) {
      if (
        event.referenceEvent === undefined ||
        event.referenceEvent.toLowerCase() !== window.referenceEvent.toLowerCase()
      ) {
        return false;
      }
    }

    if (window.minOffsetMinutes !== undefined && event.timeOffsetMinutes < window.minOffsetMinutes) {
      return false;
    }

    if (window.maxOffsetMinutes !== undefined && event.timeOffsetMinutes > window.maxOffsetMinutes) {
      return false;
    }

    return true;
  });
}

/**
 * filterEventsBySelector — returns events matching all specified selector fields.
 *
 * Field matching:
 *   domain        — exact string match
 *   action        — case-insensitive
 *   subject       — case-insensitive
 *   nutrientSpeed — exact match
 *   requiredTags  — every listed tag must appear in event.tags
 */
export function filterEventsBySelector(
  events: CandidateEvent[],
  selector: EventSelector
): CandidateEvent[] {
  return events.filter(event => {
    if (selector.domain !== undefined && event.domain !== selector.domain) return false;

    if (selector.action !== undefined) {
      if (event.action === undefined) return false;
      if (event.action.toLowerCase() !== selector.action.toLowerCase()) return false;
    }

    if (selector.subject !== undefined) {
      if (event.subject === undefined) return false;
      if (event.subject.toLowerCase() !== selector.subject.toLowerCase()) return false;
    }

    if (selector.nutrientSpeed !== undefined && event.nutrientSpeed !== selector.nutrientSpeed) {
      return false;
    }

    if (selector.requiredTags !== undefined) {
      for (const tag of selector.requiredTags) {
        if (!event.tags.includes(tag)) return false;
      }
    }

    return true;
  });
}

/**
 * sumEventQuantities — sums quantity across all provided events.
 *
 * Events with undefined quantity are ignored.
 */
export function sumEventQuantities(
  events: CandidateEvent[],
  units = "g"
): AggregationResult {
  const withQuantity = events.filter(e => e.quantity !== undefined);
  const value = withQuantity.reduce((sum, e) => sum + (e.quantity ?? 0), 0);

  return {
    key: "quantity_sum",
    label: "Quantity Sum",
    value,
    units,
    matchedEventIds: withQuantity.map(e => e.id),
    notes: withQuantity.length === 0 ? ["No events with defined quantity."] : [],
  };
}

/**
 * maxEventOffsetMagnitude — returns the maximum absolute time offset
 * across all provided events (useful for deadline / window diagnostics).
 */
export function maxEventOffsetMagnitude(
  events: CandidateEvent[],
  units = "minutes"
): AggregationResult {
  const withOffset = events.filter(e => e.timeOffsetMinutes !== undefined);
  const value = withOffset.length > 0
    ? Math.max(...withOffset.map(e => Math.abs(e.timeOffsetMinutes!)))
    : 0;

  return {
    key: "max_offset_magnitude",
    label: "Max Offset Magnitude",
    value,
    units,
    matchedEventIds: withOffset.map(e => e.id),
    notes: withOffset.length === 0 ? ["No events with defined time offset."] : [],
  };
}

/* =========================================================
   Domain-specific derived variable builders
   ========================================================= */

/**
 * computeFastCarbsWithinWindow — total grams of fast-digesting carbohydrates
 * consumed within the specified window before a reference event.
 *
 * Window: [-windowMinutes, 0] relative to referenceEvent.
 *
 * Example:
 *   computeFastCarbsWithinWindow(events, "lifting", 90)
 *   → { key: "fast_carbs_grams_within_90min", value: 60, ... }
 */
export function computeFastCarbsWithinWindow(
  events: CandidateEvent[],
  referenceEvent: string,
  windowMinutes: number
): AggregationResult {
  const inWindow = filterEventsByWindow(events, {
    referenceEvent,
    minOffsetMinutes: -windowMinutes,
    maxOffsetMinutes: 0,
  });

  const fast = filterEventsBySelector(inWindow, { nutrientSpeed: "FAST" });
  const sum  = sumEventQuantities(fast, "g");

  return {
    key: `fast_carbs_grams_within_${windowMinutes}min`,
    label: `Fast Carbs Within ${windowMinutes} Min`,
    value: sum.value,
    units: "g",
    matchedEventIds: sum.matchedEventIds,
    notes: sum.notes,
  };
}

/**
 * computeSlowCarbsWithinWindow — total grams of slow-digesting carbohydrates
 * consumed within the specified window before a reference event.
 *
 * Window: [-windowMinutes, 0] relative to referenceEvent.
 *
 * Example:
 *   computeSlowCarbsWithinWindow(events, "lifting", 60)
 *   → { key: "slow_carbs_grams_within_60min", value: 30, ... }
 */
export function computeSlowCarbsWithinWindow(
  events: CandidateEvent[],
  referenceEvent: string,
  windowMinutes: number
): AggregationResult {
  const inWindow = filterEventsByWindow(events, {
    referenceEvent,
    minOffsetMinutes: -windowMinutes,
    maxOffsetMinutes: 0,
  });

  const slow = filterEventsBySelector(inWindow, { nutrientSpeed: "SLOW" });
  const sum  = sumEventQuantities(slow, "g");

  return {
    key: `slow_carbs_grams_within_${windowMinutes}min`,
    label: `Slow Carbs Within ${windowMinutes} Min`,
    value: sum.value,
    units: "g",
    matchedEventIds: sum.matchedEventIds,
    notes: sum.notes,
  };
}

/**
 * deriveNutritionWindowVariables — computes the standard nutrition pre-lift
 * derived variables for one candidate's events.
 *
 * Returns at minimum:
 *   - fast_carbs_grams_within_90min
 *   - slow_carbs_grams_within_60min
 *
 * These feed directly into atomic constraint evaluation.
 */
export function deriveNutritionWindowVariables(
  _candidateId: string,
  events: CandidateEvent[]
): AggregationResult[] {
  return [
    computeFastCarbsWithinWindow(events, "lifting", 90),
    computeSlowCarbsWithinWindow(events, "lifting", 60),
  ];
}
