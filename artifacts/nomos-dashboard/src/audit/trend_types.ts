/**
 * trend_types.ts
 *
 * Canonical types for NOMOS decisive-variable trend tracking.
 *
 * Trend tracking operates across many saved audit runs to identify:
 *   - recurring degradation drivers
 *   - violation frequency and streaks
 *   - stabilization vs drift over time
 *
 * All data is derived deterministically from AuditRecord history.
 * No LLM generation is used.
 */

/**
 * One entry in the decisive-variable occurrence timeline.
 *
 * decisiveVariable: the variable that caused degradation in this run,
 *   or null when the run was LAWFUL (no decisive variable).
 *
 * Records are ordered chronologically (ASC) in the timeline.
 */
export interface DecisiveVariableOccurrence {
  versionId: string;
  timestamp: string;
  candidateId?: string | null;
  overallStatus: string | null;
  decisiveVariable: string | null;
}

/**
 * Aggregated trend for a single decisive variable across all runs.
 *
 * currentStreak: consecutive runs at the end of the timeline where
 *   this variable was the decisive variable.
 * longestStreak: longest consecutive run ever observed.
 * statuses: how many times each overallStatus appeared alongside this variable.
 */
export interface DecisiveVariableTrend {
  variable: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  currentStreak: number;
  longestStreak: number;
  statuses: Record<string, number>;
}

/**
 * High-level assessment of the system's trajectory.
 *
 * stabilizing: recent runs show increasing lawful outcomes or
 *   decreasing violation frequency.
 * drifting: recent runs show the same violation repeating, or
 *   worsening outcomes.
 *
 * Both can be false (inconclusive or insufficient data).
 * Only one of stabilizing / drifting can be true at a time.
 *
 * summaryLines: human-readable sentences derived from trends.
 *   Examples:
 *     "Protein placement violation has recurred in 3 consecutive runs."
 *     "Calorie delta is the most frequent recent degradation driver."
 *     "Recent runs suggest stabilization toward lawful status."
 */
export interface DriftSummary {
  mostFrequentVariable: string | null;
  mostRecentVariable: string | null;
  recurringViolations: string[];
  stabilizing: boolean;
  drifting: boolean;
  summaryLines: string[];
}

/**
 * Full trend report for all runs in the audit history.
 *
 * variables: sorted by count descending (most frequent first).
 * occurrenceTimeline: chronological order (oldest first).
 */
export interface DecisiveVariableTrendReport {
  totalRuns: number;
  variables: DecisiveVariableTrend[];
  driftSummary: DriftSummary;
  occurrenceTimeline: DecisiveVariableOccurrence[];
}
