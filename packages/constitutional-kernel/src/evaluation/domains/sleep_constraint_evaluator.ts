/**
 * sleep_constraint_evaluator.ts
 *
 * Deterministic evaluator for the SLEEP_MIN_DURATION_AND_CONTINUITY domain.
 *
 * Constitutional role:
 * - Parses compound sleep constraints into two atomic rules:
 *     minTotalSleepMinutes — total sleep must meet or exceed this value.
 *     maxWakeGapMinutes    — no single wake period may exceed this value.
 * - Parses candidate descriptions to extract sleep intervals and wake gaps.
 * - Evaluates each candidate deterministically without LLM involvement.
 * - Returns null if candidate time data cannot be parsed; caller falls through to LLM.
 *
 * Reason pattern (per compressed two-clause style):
 *   "Sleep duration below threshold. Constraint violated."
 *   "Wake gap exceeds continuity limit. Constraint violated."
 *   "Sleep continuous. Duration threshold satisfied."
 */

import { CandidateEvaluationDraft, CandidateStatus, NormalizedCandidate, NormalizedConstraint } from "../eval_types.js";

/* =========================================================
   Public interface
   ========================================================= */

export interface SleepSchedule {
  totalSleepMinutes: number;
  longestWakeGapMinutes: number;
  sleepIntervalCount: number;
}

/* =========================================================
   Constraint param extraction
   ========================================================= */

export function extractSleepParams(constraint: NormalizedConstraint): {
  minTotalSleepMinutes: number;
  maxWakeGapMinutes: number;
} {
  const minTotalSleepMinutes =
    (constraint.params?.minTotalSleepMinutes as number | undefined) ?? 420;
  const maxWakeGapMinutes =
    (constraint.params?.maxWakeGapMinutes as number | undefined) ?? 20;
  return { minTotalSleepMinutes, maxWakeGapMinutes };
}

/* =========================================================
   Time parsing utilities
   ========================================================= */

/**
 * parseTimeToMinutes — "11:30 PM" → 1410, "6:30 AM" → 390
 */
export function parseTimeToMinutes(timeStr: string): number | null {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

/**
 * intervalDuration — handles overnight spans (e.g. 23:30 → 6:30 = 420 min).
 */
export function intervalDuration(startMin: number, endMin: number): number {
  if (endMin >= startMin) return endMin - startMin;
  return (1440 - startMin) + endMin; // overnight
}

/* =========================================================
   Schedule parser
   ========================================================= */

/**
 * parseSleepSchedule — extracts total sleep time and longest wake gap from
 * a candidate description such as:
 *   "Sleep from 11:30 PM to 6:30 AM continuously."
 *   "Sleep from 10:00 PM to 2:00 AM, wake for 1 hour, then sleep from 3:00 AM to 7:00 AM."
 *
 * Returns null if no parseable time data is found.
 */
export function parseSleepSchedule(raw: string): SleepSchedule | null {
  const lower = raw.toLowerCase();

  // ---- Sleep interval extraction ----
  // Pattern: "sleep from HH:MM AM/PM to HH:MM AM/PM"
  const sleepRx = /sleep\s+from\s+([\d:]+\s*(?:am|pm))\s+to\s+([\d:]+\s*(?:am|pm))/gi;
  const sleepIntervals: number[] = [];
  let m: RegExpExecArray | null;

  while ((m = sleepRx.exec(lower)) !== null) {
    const start = parseTimeToMinutes(m[1]);
    const end   = parseTimeToMinutes(m[2]);
    if (start === null || end === null) return null;
    sleepIntervals.push(intervalDuration(start, end));
  }

  if (sleepIntervals.length === 0) return null;

  // ---- Wake gap extraction ----
  // Pattern: "wake for N hour(s)" or "wake for N minute(s)"
  const wakeRx = /wake(?:\s+up)?\s+for\s+(\d+(?:\.\d+)?)\s*(hour|hr|min(?:ute)?)/gi;
  const wakeGaps: number[] = [];

  while ((m = wakeRx.exec(lower)) !== null) {
    const value = parseFloat(m[1]);
    const unit  = m[2].toLowerCase();
    const minutes = (unit.startsWith("hour") || unit === "hr") ? value * 60 : value;
    wakeGaps.push(minutes);
  }

  const totalSleepMinutes       = sleepIntervals.reduce((s, v) => s + v, 0);
  const longestWakeGapMinutes   = wakeGaps.length > 0 ? Math.max(...wakeGaps) : 0;

  return {
    totalSleepMinutes,
    longestWakeGapMinutes,
    sleepIntervalCount: sleepIntervals.length,
  };
}

/* =========================================================
   Deterministic evaluation
   ========================================================= */

export function evaluateSleepCandidate(
  candidate: NormalizedCandidate,
  constraint: NormalizedConstraint
): CandidateEvaluationDraft | null {
  const schedule = parseSleepSchedule(candidate.raw);
  if (!schedule) return null; // parsing failed — fall through to LLM

  const { minTotalSleepMinutes, maxWakeGapMinutes } = extractSleepParams(constraint);
  const { totalSleepMinutes, longestWakeGapMinutes } = schedule;

  // Duration check
  if (totalSleepMinutes < minTotalSleepMinutes) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: "Sleep duration below threshold. Constraint violated.",
      decisiveVariable: "sleep duration",
      confidence: "high",
      adjustments: [
        `Increase total sleep to at least ${(minTotalSleepMinutes / 60).toFixed(1)} hours.`,
      ],
    };
  }

  // Continuity check
  if (longestWakeGapMinutes > maxWakeGapMinutes) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: "Wake gap exceeds continuity limit. Constraint violated.",
      decisiveVariable: "sleep continuity",
      confidence: "high",
      adjustments: [
        `Reduce wake gap to no more than ${maxWakeGapMinutes} minutes.`,
      ],
    };
  }

  // Lawful
  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "Sleep continuous. Duration threshold satisfied.",
    decisiveVariable: "sleep duration margin",
    confidence: "high",
  };
}

/* =========================================================
   Quantitative margin scoring
   ========================================================= */

/**
 * scoreSleepCandidate — computes a continuous [0, 1] margin score.
 *
 * For INVALID candidates, returns 0.00.
 * For LAWFUL candidates, combines:
 *   - Duration margin: (totalSleepMinutes - min) / 90  (90 min excess → full score)
 *   - Continuity margin: (maxWakeGap - longestWakeGap) / maxWakeGap
 * Scaled to [0.50, 0.90] to reflect that constraint is still tight.
 *
 * Examples:
 *   A — 420 min, 0 wake gap → normDuration=0, normContinuity=1 → 0.70 (MODERATE)
 *   C — 450 min, 0 wake gap → normDuration=0.33, normContinuity=1 → 0.77 (HIGH)
 */
export function scoreSleepCandidate(
  candidate: NormalizedCandidate,
  constraint: NormalizedConstraint,
  status: CandidateStatus
): number {
  if (status === "INVALID") return 0.00;

  const { minTotalSleepMinutes, maxWakeGapMinutes } = extractSleepParams(constraint);
  const schedule = parseSleepSchedule(candidate.raw);
  if (!schedule) return 0.60; // fallback moderate

  const { totalSleepMinutes, longestWakeGapMinutes } = schedule;

  const durationExcess    = totalSleepMinutes - minTotalSleepMinutes;
  const continuityMargin  = maxWakeGapMinutes - longestWakeGapMinutes;

  const normDuration    = Math.min(1.0, durationExcess / 90);
  const normContinuity  = maxWakeGapMinutes > 0
    ? continuityMargin / maxWakeGapMinutes
    : 1.0;

  const combined = normDuration * 0.5 + normContinuity * 0.5;
  return 0.50 + combined * 0.40;
}
