/**
 * failure_prediction.ts
 *
 * Deterministic constrained failure prediction for NOMOS.
 *
 * Projects the next likely degradation mode from audit history using
 * decisive-variable recurrence, streak structure, and verdict trajectory.
 *
 * Functions:
 *   buildFailureSignals(auditRecords)       — raw signals from history
 *   scoreFailureSignals(signals)            — sort by weightedRiskScore desc
 *   pickPredictedVariable(signals)          — top signal, or null if ambiguous
 *   classifyPredictionConfidence(signals, totalRuns)
 *   classifyRiskDirection(occurrences, driftSummary)
 *   buildFailurePrediction(auditRecords)    — orchestrates everything
 *
 * Hard guards (always enforced):
 *   - If totalRuns < 3, confidence is "low".
 *   - If no clear dominant signal, predictedVariable is null.
 *
 * Scoring formula:
 *   weightedRiskScore =
 *     frequency    * 1.0
 *     + recentShare  * 3.0
 *     + currentStreak * 2.0
 *     + degradedCount * 0.5
 *     + invalidCount  * 1.0
 *
 * No LLM generation is used anywhere in this module.
 */

import type { AuditRecord } from "./audit_types";
import type { DecisiveVariableOccurrence, DriftSummary } from "./trend_types";
import type { FailurePrediction, FailurePredictionSignal } from "./prediction_types";
import {
  extractDecisiveVariableOccurrences,
  buildDecisiveVariableTrends,
  buildDriftSummary,
} from "./decisive_variable_trends";

/* =========================================================
   Constants
   ========================================================= */

const RECENT_WINDOW_SIZE = 5;

/**
 * Two signals are "too close" if the second scores at or above this
 * fraction of the first. When too close, no dominant signal exists.
 */
const AMBIGUITY_THRESHOLD = 0.8;

/**
 * Minimum number of audit runs before a non-low confidence is possible.
 */
const SHALLOW_HISTORY_THRESHOLD = 3;

/**
 * Minimum number of runs for a "high" confidence assessment.
 */
const DEEP_HISTORY_THRESHOLD = 8;

/* =========================================================
   buildFailureSignals
   ========================================================= */

/**
 * Extracts and scores FailurePredictionSignal records from audit history.
 *
 * For each decisive variable in the trend data:
 *   - frequency:     total count in all runs
 *   - currentStreak: consecutive tail occurrences
 *   - longestStreak: maximum consecutive run
 *   - recentShare:   share of last 5 runs (0.0–1.0)
 *   - weightedRiskScore: composite score (see formula in module docstring)
 *
 * Returns signals sorted by weightedRiskScore descending (highest risk first).
 * LAWFUL runs are not signals — null decisive variables are excluded.
 */
export function buildFailureSignals(records: AuditRecord[]): FailurePredictionSignal[] {
  const occurrences = extractDecisiveVariableOccurrences(records);
  const trends = buildDecisiveVariableTrends(occurrences);
  const recentWindow = occurrences.slice(-RECENT_WINDOW_SIZE);
  const windowSize = Math.max(recentWindow.length, 1);

  const signals: FailurePredictionSignal[] = trends.map((trend) => {
    const recentCount = recentWindow.filter(
      (o) => o.decisiveVariable === trend.variable
    ).length;
    const recentShare = recentCount / windowSize;

    const degradedCount = trend.statuses["DEGRADED"] ?? 0;
    const invalidCount = trend.statuses["INVALID"] ?? 0;

    const weightedRiskScore =
      trend.count * 1.0 +
      recentShare * 3.0 +
      trend.currentStreak * 2.0 +
      degradedCount * 0.5 +
      invalidCount * 1.0;

    return {
      variable: trend.variable,
      frequency: trend.count,
      currentStreak: trend.currentStreak,
      longestStreak: trend.longestStreak,
      recentShare,
      weightedRiskScore,
    };
  });

  return scoreFailureSignals(signals);
}

/* =========================================================
   scoreFailureSignals
   ========================================================= */

/**
 * Sorts signals by weightedRiskScore descending and returns the sorted array.
 *
 * Ties are broken by variable name (lexicographic, ascending) for determinism.
 * Does not mutate the input array.
 */
export function scoreFailureSignals(
  signals: FailurePredictionSignal[]
): FailurePredictionSignal[] {
  return [...signals].sort((a, b) => {
    if (b.weightedRiskScore !== a.weightedRiskScore) {
      return b.weightedRiskScore - a.weightedRiskScore;
    }
    return a.variable.localeCompare(b.variable);
  });
}

/* =========================================================
   pickPredictedVariable
   ========================================================= */

/**
 * Returns the predicted variable from the top-ranked signal, or null.
 *
 * Returns null when:
 *   - signals is empty (no degradation history)
 *   - only one unique score exists but it is zero
 *   - the top two signals are too close (second >= AMBIGUITY_THRESHOLD * first)
 *
 * When signals has exactly one entry, that variable is always returned.
 */
export function pickPredictedVariable(
  signals: FailurePredictionSignal[]
): string | null {
  if (signals.length === 0) return null;

  const top = signals[0]!;
  if (top.weightedRiskScore === 0) return null;

  if (signals.length === 1) return top.variable;

  const second = signals[1]!;
  if (second.weightedRiskScore >= top.weightedRiskScore * AMBIGUITY_THRESHOLD) {
    return null;
  }

  return top.variable;
}

/* =========================================================
   classifyPredictionConfidence
   ========================================================= */

/**
 * Classifies prediction confidence from signals and total run count.
 *
 * Rules (in priority order):
 *   1. "low"      — totalRuns < SHALLOW_HISTORY_THRESHOLD (hard guard).
 *   2. "low"      — no signals or predictedVariable is null.
 *   3. "high"     — top variable accounts for > 50% of all runs AND
 *                   its currentStreak >= 2 AND totalRuns >= DEEP_HISTORY_THRESHOLD.
 *   4. "moderate" — clear dominant signal exists (predictedVariable is non-null).
 */
export function classifyPredictionConfidence(
  signals: FailurePredictionSignal[],
  totalRuns: number
): "low" | "moderate" | "high" {
  if (totalRuns < SHALLOW_HISTORY_THRESHOLD) return "low";

  const predicted = pickPredictedVariable(signals);
  if (predicted === null) return "low";

  const top = signals[0]!;
  const dominatesByFrequency = top.frequency > totalRuns / 2;
  const hasStreak = top.currentStreak >= 2;
  const deepHistory = totalRuns >= DEEP_HISTORY_THRESHOLD;

  if (dominatesByFrequency && hasStreak && deepHistory) return "high";

  return "moderate";
}

/* =========================================================
   classifyRiskDirection
   ========================================================= */

/**
 * Classifies the current risk direction from occurrence history and drift summary.
 *
 * Rules:
 *   "rising"     — driftSummary.drifting is true (same violation repeating).
 *   "decreasing" — driftSummary.stabilizing is true (lawful runs increasing).
 *   Also "decreasing" if last 3 occurrences are all null (LAWFUL).
 *   Also "rising" if last 3 non-null occurrences share the same variable.
 *   "stable"     — neither condition holds.
 */
export function classifyRiskDirection(
  occurrences: DecisiveVariableOccurrence[],
  driftSummary: DriftSummary
): "decreasing" | "stable" | "rising" {
  if (driftSummary.drifting) return "rising";
  if (driftSummary.stabilizing) return "decreasing";

  const recent = occurrences.slice(-3);

  // All recent runs are LAWFUL → decreasing risk
  if (recent.length >= 3 && recent.every((o) => o.decisiveVariable === null)) {
    return "decreasing";
  }

  // Last 3 non-null decisive variables all the same → rising risk
  const recentNonNull = occurrences
    .filter((o) => o.decisiveVariable !== null)
    .slice(-3);
  if (
    recentNonNull.length >= 3 &&
    recentNonNull.every((o) => o.decisiveVariable === recentNonNull[0]!.decisiveVariable)
  ) {
    return "rising";
  }

  return "stable";
}

/* =========================================================
   buildFailurePrediction
   ========================================================= */

/**
 * Produces a complete FailurePrediction from AuditRecord history.
 *
 * Data flow:
 *   AuditRecord[] → occurrences → trends + driftSummary
 *               → signals (scored) → predictedVariable + confidence + riskDirection
 *               → explanationLines → FailurePrediction
 */
export function buildFailurePrediction(records: AuditRecord[]): FailurePrediction {
  const occurrences = extractDecisiveVariableOccurrences(records);
  const trends = buildDecisiveVariableTrends(occurrences);
  const driftSummary = buildDriftSummary(trends, occurrences);

  const signals = buildFailureSignals(records);
  const predictedVariable = pickPredictedVariable(signals);
  const confidence = classifyPredictionConfidence(signals, records.length);
  const riskDirection = classifyRiskDirection(occurrences, driftSummary);
  const explanationLines = buildExplanationLines(
    signals,
    predictedVariable,
    confidence,
    riskDirection,
    records.length
  );

  return {
    predictedVariable,
    confidence,
    riskDirection,
    explanationLines,
    signals,
  };
}

/* =========================================================
   buildExplanationLines (internal)
   ========================================================= */

function buildExplanationLines(
  signals: FailurePredictionSignal[],
  predictedVariable: string | null,
  confidence: "low" | "moderate" | "high",
  riskDirection: "decreasing" | "stable" | "rising",
  totalRuns: number
): string[] {
  const lines: string[] = [];

  // Hard guard line
  if (totalRuns < SHALLOW_HISTORY_THRESHOLD) {
    lines.push(
      "Prediction confidence is low because audit history is too shallow."
    );
  }

  // No signal
  if (predictedVariable === null && signals.length === 0) {
    lines.push("No degradation history recorded. All observed runs have been lawful.");
    return lines;
  }

  if (predictedVariable === null && signals.length > 0) {
    lines.push("No dominant degradation signal detected. Multiple variables contribute equally.");
  }

  // Top signal details
  const top = signals[0];
  if (top && predictedVariable !== null) {
    // Consecutive streak
    if (top.currentStreak >= 2) {
      lines.push(
        `${capitalise(top.variable)} has recurred in ${top.currentStreak} consecutive runs.`
      );
    }

    // Most frequent
    if (signals.length === 1 || (signals[1] && top.frequency > signals[1].frequency)) {
      lines.push(
        `${capitalise(top.variable)} remains the most frequent recent degradation driver.`
      );
    }

    // Recent share
    if (top.recentShare >= 0.6) {
      const pct = Math.round(top.recentShare * 100);
      lines.push(
        `${capitalise(top.variable)} appeared in ${pct}% of the last ${Math.min(totalRuns, 5)} runs.`
      );
    }
  }

  // Risk direction
  if (riskDirection === "rising") {
    const streakNote =
      top && top.currentStreak >= 2
        ? ` due to a ${top.currentStreak}-run streak`
        : "";
    lines.push(
      `Projected risk is rising${streakNote}.`
    );
  } else if (riskDirection === "decreasing") {
    lines.push("Recent lawful outcomes suggest decreasing risk.");
  } else {
    lines.push("System trajectory appears stable.");
  }

  // Confidence note (only for non-shallow)
  if (totalRuns >= SHALLOW_HISTORY_THRESHOLD) {
    if (confidence === "high") {
      lines.push(
        "Prediction confidence is high — one variable dominates by both frequency and streak."
      );
    } else if (confidence === "low" && signals.length >= 2) {
      lines.push(
        "Prediction confidence is low — no single variable clearly dominates."
      );
    }
  }

  return lines;
}

function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
