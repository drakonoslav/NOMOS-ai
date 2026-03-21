/**
 * prediction_types.ts
 *
 * Canonical types for NOMOS constrained failure prediction.
 *
 * Failure prediction is not open-ended AI guessing.
 * It is deterministic, history-based projection from:
 *   - decisive variable recurrence and streak data
 *   - recent verdict severity
 *   - drift / stabilization trajectory
 *
 * All prediction logic is in failure_prediction.ts.
 * No LLM generation is used.
 */

/**
 * Evidence record for one decisive variable contributing to the prediction.
 *
 * frequency:       total count of this variable across all runs.
 * currentStreak:   consecutive runs at the tail of history where this
 *                  variable was decisive.
 * longestStreak:   maximum consecutive run ever observed.
 * recentShare:     fraction of the last 5 runs where this variable appeared
 *                  (0.0 – 1.0). LAWFUL runs count toward the denominator.
 * weightedRiskScore: deterministic composite score used for ranking.
 *   Formula:
 *     frequency * 1.0
 *     + recentShare * 3.0
 *     + currentStreak * 2.0
 *     + degradedCount * 0.5
 *     + invalidCount * 1.0
 */
export interface FailurePredictionSignal {
  variable: string;
  frequency: number;
  currentStreak: number;
  longestStreak: number;
  recentShare: number;
  weightedRiskScore: number;
}

/**
 * The result of failure prediction for the current audit history.
 *
 * predictedVariable: the next most likely degradation mode, or null if
 *   history is too shallow or no clear dominant signal exists.
 *
 * confidence:
 *   "low"      — totalRuns < 3 (hard guard), or top two signals too close.
 *   "moderate" — clear leader, but history is shallow (3–7 runs).
 *   "high"     — one variable dominates by both frequency and streak.
 *
 * riskDirection:
 *   "rising"     — same variable recurs in recent runs (drift), or verdicts worsen.
 *   "decreasing" — lawful outcomes increasing (stabilizing), or dominant variable retreating.
 *   "stable"     — neither rising nor decreasing.
 *
 * explanationLines: human-readable sentences derived from signals and trends.
 *   Examples:
 *     "Protein placement violation has recurred in 3 consecutive runs."
 *     "Calorie delta remains the most frequent recent degradation driver."
 *     "Recent lawful outcomes suggest decreasing risk."
 *     "Prediction confidence is low because audit history is too shallow."
 *
 * signals: all decisive variables ranked by weightedRiskScore descending.
 *   Empty when no degradation has been observed.
 */
export interface FailurePrediction {
  predictedVariable: string | null;
  confidence: "low" | "moderate" | "high";
  riskDirection: "decreasing" | "stable" | "rising";
  explanationLines: string[];
  signals: FailurePredictionSignal[];
}
