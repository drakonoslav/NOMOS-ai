/**
 * decisive_variable_trends.ts
 *
 * Deterministic trend analysis for NOMOS decisive variables across audit runs.
 *
 * Functions:
 *   extractDecisiveVariableOccurrences(records)
 *   buildDecisiveVariableTrends(occurrences)
 *   computeCurrentStreak(variable, occurrences)
 *   computeLongestStreak(variable, occurrences)
 *   buildDriftSummary(trends, occurrences)
 *   buildDecisiveVariableTrendReport(records)
 *
 * All analysis is deterministic. No LLM generation is used.
 *
 * Data flow:
 *   AuditRecord[] → occurrences (chronological) → trends (per-variable)
 *                → DriftSummary → DecisiveVariableTrendReport
 *
 * Streak definition:
 *   currentStreak: consecutive runs at the tail of the timeline where
 *     decisiveVariable === variable.
 *   longestStreak: maximum consecutive run anywhere in the timeline.
 *
 * Drift / stabilization rules (applied to last 5 runs):
 *   drifting:     last 3+ non-null decisive variables are the same value.
 *   stabilizing:  last 3+ runs are LAWFUL (null decisive variable).
 *   If data is insufficient (<3 runs), both are false.
 */

import type { AuditRecord } from "./audit_types";
import type {
  DecisiveVariableOccurrence,
  DecisiveVariableTrend,
  DriftSummary,
  DecisiveVariableTrendReport,
} from "./trend_types";

/* =========================================================
   Internal EvaluationResult snapshot
   ========================================================= */

interface EvalSnapshot {
  overallStatus?: string | null;
  decisiveVariable?: string | null;
  candidateEvaluations?: Array<{
    id?: string;
    decisiveVariable?: string | null;
  }>;
}

function isEvalSnapshot(x: unknown): x is EvalSnapshot {
  return typeof x === "object" && x !== null;
}

/* =========================================================
   extractDecisiveVariableOccurrences
   ========================================================= */

/**
 * Extracts one DecisiveVariableOccurrence per audit record, sorted
 * chronologically by timestamp ascending (oldest first).
 *
 * Uses the run-level decisiveVariable from the evaluation payload.
 * When no payload is available, overallStatus and decisiveVariable are null.
 *
 * "none" is normalised to null (treated as LAWFUL / no decisive variable).
 */
export function extractDecisiveVariableOccurrences(
  records: AuditRecord[]
): DecisiveVariableOccurrence[] {
  const sorted = [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return sorted.map((record) => {
    const payload = record.evaluationResult?.payload;
    const snap = isEvalSnapshot(payload) ? payload : null;

    const overallStatus = snap?.overallStatus ?? null;
    const rawDv = snap?.decisiveVariable ?? null;
    const decisiveVariable = normaliseDecisiveVariable(rawDv);

    return {
      versionId: record.versionId,
      timestamp: record.timestamp,
      candidateId: null,
      overallStatus,
      decisiveVariable,
    };
  });
}

/**
 * Normalises the decisive variable value.
 * "none", "", undefined → null
 * Everything else preserved as-is.
 */
function normaliseDecisiveVariable(v: string | null | undefined): string | null {
  if (!v || v.toLowerCase() === "none") return null;
  return v;
}

/* =========================================================
   computeCurrentStreak
   ========================================================= */

/**
 * Counts consecutive occurrences of `variable` at the tail of the timeline.
 *
 * Walks backward from the most recent occurrence.
 * Stops at the first occurrence where decisiveVariable !== variable.
 * Null occurrences (LAWFUL runs) break the streak.
 */
export function computeCurrentStreak(
  variable: string,
  occurrences: DecisiveVariableOccurrence[]
): number {
  let count = 0;
  for (let i = occurrences.length - 1; i >= 0; i--) {
    if (occurrences[i]!.decisiveVariable === variable) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/* =========================================================
   computeLongestStreak
   ========================================================= */

/**
 * Finds the maximum length consecutive run of `variable` anywhere in the timeline.
 *
 * Walks forward through all occurrences.
 * Null occurrences (LAWFUL runs) break runs of non-null variables.
 */
export function computeLongestStreak(
  variable: string,
  occurrences: DecisiveVariableOccurrence[]
): number {
  let max = 0;
  let current = 0;
  for (const occ of occurrences) {
    if (occ.decisiveVariable === variable) {
      current++;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }
  return max;
}

/* =========================================================
   buildDecisiveVariableTrends
   ========================================================= */

/**
 * Aggregates occurrence data into one DecisiveVariableTrend per unique
 * non-null decisive variable.
 *
 * Returns trends sorted by count descending (most frequent first).
 * Ties broken by variable name lexicographically.
 */
export function buildDecisiveVariableTrends(
  occurrences: DecisiveVariableOccurrence[]
): DecisiveVariableTrend[] {
  const map = new Map<
    string,
    {
      count: number;
      firstSeen: string;
      lastSeen: string;
      statuses: Record<string, number>;
    }
  >();

  for (const occ of occurrences) {
    const v = occ.decisiveVariable;
    if (v === null) continue;

    if (!map.has(v)) {
      map.set(v, {
        count: 0,
        firstSeen: occ.timestamp,
        lastSeen: occ.timestamp,
        statuses: {},
      });
    }
    const entry = map.get(v)!;
    entry.count++;
    // firstSeen stays as the earliest (timeline is ascending)
    entry.lastSeen = occ.timestamp;
    const status = occ.overallStatus ?? "unknown";
    entry.statuses[status] = (entry.statuses[status] ?? 0) + 1;
  }

  const trends: DecisiveVariableTrend[] = [];
  for (const [variable, data] of map.entries()) {
    trends.push({
      variable,
      count: data.count,
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
      currentStreak: computeCurrentStreak(variable, occurrences),
      longestStreak: computeLongestStreak(variable, occurrences),
      statuses: data.statuses,
    });
  }

  trends.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.variable.localeCompare(b.variable);
  });

  return trends;
}

/* =========================================================
   buildDriftSummary
   ========================================================= */

/**
 * Produces a DriftSummary from trend data and the occurrence timeline.
 *
 * Drift analysis uses the last 5 occurrences (or all if fewer exist).
 *
 * drifting:    last 3+ non-null decisive variables are the same value.
 * stabilizing: last 3+ runs all have null decisive variable (LAWFUL).
 *
 * Only one of drifting / stabilizing can be true at a time.
 * If both conditions would hold (impossible given the rules), stabilizing wins.
 *
 * recurringViolations: variables with count >= 2 in all occurrences.
 * summaryLines: human-readable sentences, deterministically generated.
 */
export function buildDriftSummary(
  trends: DecisiveVariableTrend[],
  occurrences: DecisiveVariableOccurrence[]
): DriftSummary {
  const mostFrequent = trends[0]?.variable ?? null;
  const mostRecent = findMostRecentVariable(occurrences);
  const recurringViolations = trends
    .filter((t) => t.count >= 2)
    .map((t) => t.variable);

  const window = occurrences.slice(-5);
  const drifting = checkDrifting(window);
  const stabilizing = !drifting && checkStabilizing(window);

  const summaryLines = buildSummaryLines(
    trends,
    mostFrequent,
    mostRecent,
    recurringViolations,
    drifting,
    stabilizing,
    occurrences
  );

  return {
    mostFrequentVariable: mostFrequent,
    mostRecentVariable: mostRecent,
    recurringViolations,
    stabilizing,
    drifting,
    summaryLines,
  };
}

function findMostRecentVariable(
  occurrences: DecisiveVariableOccurrence[]
): string | null {
  for (let i = occurrences.length - 1; i >= 0; i--) {
    const v = occurrences[i]!.decisiveVariable;
    if (v !== null) return v;
  }
  return null;
}

/**
 * drifting: last 3+ consecutive occurrences share the same non-null decisive variable.
 */
function checkDrifting(window: DecisiveVariableOccurrence[]): boolean {
  if (window.length < 3) return false;
  const tail = window.slice(-3);
  const first = tail[0]!.decisiveVariable;
  if (first === null) return false;
  return tail.every((o) => o.decisiveVariable === first);
}

/**
 * stabilizing: last 3+ consecutive occurrences all have null decisive variable (LAWFUL).
 */
function checkStabilizing(window: DecisiveVariableOccurrence[]): boolean {
  if (window.length < 3) return false;
  const tail = window.slice(-3);
  return tail.every((o) => o.decisiveVariable === null);
}

function buildSummaryLines(
  trends: DecisiveVariableTrend[],
  mostFrequent: string | null,
  mostRecent: string | null,
  recurringViolations: string[],
  drifting: boolean,
  stabilizing: boolean,
  occurrences: DecisiveVariableOccurrence[]
): string[] {
  const lines: string[] = [];

  // Streaks for recurring violations
  for (const variable of recurringViolations) {
    const trend = trends.find((t) => t.variable === variable);
    if (!trend) continue;
    if (trend.currentStreak >= 2) {
      lines.push(
        `${capitalise(variable)} has recurred in ${trend.currentStreak} consecutive runs.`
      );
    }
  }

  // Most frequent variable
  if (mostFrequent !== null && (trends[0]?.count ?? 0) > 1) {
    lines.push(`${capitalise(mostFrequent)} is the most frequent recent degradation driver.`);
  }

  // Drift / stabilization
  if (drifting && mostRecent !== null) {
    const trend = trends.find((t) => t.variable === mostRecent);
    const streak = trend?.currentStreak ?? 3;
    lines.push(
      `Recent history suggests drift: ${mostRecent} has recurred across ${streak} runs.`
    );
  } else if (stabilizing) {
    lines.push("Recent runs suggest stabilization toward lawful status.");
  }

  // If no decisive variable has ever appeared
  if (trends.length === 0 && occurrences.length > 0) {
    lines.push("All recorded runs have been lawful. No degradation detected.");
  }

  return lines;
}

function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* =========================================================
   buildDecisiveVariableTrendReport
   ========================================================= */

/**
 * Orchestrates all trend functions into a single DecisiveVariableTrendReport.
 *
 * Records may be in any order — the function sorts them chronologically.
 * Returns a report with totalRuns, variables, driftSummary, and occurrenceTimeline.
 */
export function buildDecisiveVariableTrendReport(
  records: AuditRecord[]
): DecisiveVariableTrendReport {
  const occurrences = extractDecisiveVariableOccurrences(records);
  const trends = buildDecisiveVariableTrends(occurrences);
  const driftSummary = buildDriftSummary(trends, occurrences);

  return {
    totalRuns: records.length,
    variables: trends,
    driftSummary,
    occurrenceTimeline: occurrences,
  };
}
