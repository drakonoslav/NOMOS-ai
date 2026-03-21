/**
 * time_window_algebra.ts
 *
 * Deterministic time-window resolution and event filtering.
 *
 * Constitutional role:
 * - Converts window specifications (relative to an anchor) into absolute bounds.
 * - Filters events by those bounds.
 * - Pure functions — no side effects, no LLM dependency.
 */

import { TemporalAnchor, TemporalEvent, TimeWindow, ResolvedWindow } from "./temporal_types.js";

/**
 * resolveWindow — converts a TimeWindow (anchor-relative) into a ResolvedWindow
 * with absolute minute bounds.
 *
 * Example:
 *   anchor:  { anchorId: "lifting", timeMinutes: 0 }
 *   window:  { anchorId: "lifting", startOffsetMinutes: -90, endOffsetMinutes: 0 }
 *   result:  { absoluteStartMinutes: -90, absoluteEndMinutes: 0 }
 */
export function resolveWindow(anchor: TemporalAnchor, window: TimeWindow): ResolvedWindow {
  return {
    anchorId: anchor.anchorId,
    absoluteStartMinutes: anchor.timeMinutes + window.startOffsetMinutes,
    absoluteEndMinutes: anchor.timeMinutes + window.endOffsetMinutes,
  };
}

/**
 * eventFallsInWindow — returns true when an event's absolute time falls
 * within the inclusive [absoluteStartMinutes, absoluteEndMinutes] range.
 */
export function eventFallsInWindow(event: TemporalEvent, resolved: ResolvedWindow): boolean {
  return (
    event.timeMinutes >= resolved.absoluteStartMinutes &&
    event.timeMinutes <= resolved.absoluteEndMinutes
  );
}

/**
 * collectEventsInWindow — filters the event list to those that fall inside
 * the resolved window bounds.
 *
 * Returns events in their original order.
 */
export function collectEventsInWindow(
  events: TemporalEvent[],
  resolved: ResolvedWindow
): TemporalEvent[] {
  return events.filter((e) => eventFallsInWindow(e, resolved));
}

/**
 * findAnchor — looks up a TemporalAnchor by anchorId.
 * Throws a descriptive error if the anchor is not found so callers
 * never silently proceed with a missing reference point.
 */
export function findAnchor(anchors: TemporalAnchor[], anchorId: string): TemporalAnchor {
  const anchor = anchors.find((a) => a.anchorId === anchorId);
  if (!anchor) {
    throw new Error(
      `[NOMOS temporal] Anchor "${anchorId}" not found. ` +
      `Available anchors: [${anchors.map((a) => a.anchorId).join(", ")}].`
    );
  }
  return anchor;
}
