/**
 * window_aggregator.ts
 *
 * Quantity aggregation over filtered TemporalEvent arrays.
 *
 * Constitutional role:
 * - Given a set of events (already filtered to a time window), applies
 *   tag filtering and aggregates the named quantity key.
 * - No admissibility logic — pure numeric derivation.
 * - Deterministic; no LLM dependency.
 */

import { TemporalEvent, AggregationSpec } from "./temporal_types.js";

/**
 * filterByTags — returns only events whose tags superset contains ALL
 * specified filterTags.
 *
 * If filterTags is undefined or empty, all events pass.
 */
export function filterByTags(events: TemporalEvent[], filterTags?: string[]): TemporalEvent[] {
  if (!filterTags || filterTags.length === 0) return events;
  return events.filter((e) => filterTags.every((tag) => e.tags.includes(tag)));
}

/**
 * aggregateWindow — applies AggregationSpec to a list of events and returns
 * the single numeric result.
 *
 * Aggregation rules:
 *   sum   — sum of quantities[key] across all matching events (0 when none match)
 *   count — number of matching events (regardless of quantity)
 *   max   — maximum quantities[key] across matching events (0 when none match)
 *   min   — minimum quantities[key] across matching events (0 when none match)
 *
 * Events with missing quantityKey contribute 0 to sum/max/min, and are still
 * counted in "count" aggregation.
 */
export function aggregateWindow(events: TemporalEvent[], spec: AggregationSpec): number {
  const filtered = filterByTags(events, spec.filterTags);

  if (spec.aggregation === "count") return filtered.length;

  const values = filtered.map((e) => e.quantities[spec.quantityKey] ?? 0);

  if (values.length === 0) return 0;

  switch (spec.aggregation) {
    case "sum": return values.reduce((a, b) => a + b, 0);
    case "max": return Math.max(...values);
    case "min": return Math.min(...values);
  }
}
