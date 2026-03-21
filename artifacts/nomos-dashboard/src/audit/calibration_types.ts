/**
 * calibration_types.ts
 *
 * Canonical types for NOMOS prediction calibration.
 *
 * Calibration lets NOMOS compare prior failure predictions against what
 * actually happened in the next audit run, measuring whether its projection
 * rules are accurate, too aggressive, too weak, or pending resolution.
 *
 * This pass is measurement only — prediction rules are not auto-adjusted here.
 * All computation is deterministic; no LLM generation is used.
 */

/**
 * A snapshot of a failure prediction at the moment it was generated.
 *
 * Stored alongside the audit record that triggered it so we can later
 * compare it against what actually happened in the next run.
 *
 * sourceVersionId: the versionId of the audit run that produced this prediction.
 * sourceTimestamp: ISO-8601 timestamp of that run.
 */
export interface StoredPredictionRecord {
  sourceVersionId: string;
  sourceTimestamp: string;

  predictedVariable: string | null;
  confidence: "low" | "moderate" | "high";
  riskDirection: "decreasing" | "stable" | "rising";

  explanationLines: string[];
}

/**
 * The resolved outcome of a single prediction once the next run is known.
 *
 * sourceVersionId:   the run that generated the prediction.
 * resolvedVersionId: the next run used to evaluate the prediction.
 *                    null if no later run exists (unresolved).
 *
 * predictedVariable:  what NOMOS predicted as the next degradation mode.
 * actualNextVariable: the decisive variable in the resolving run (null = LAWFUL).
 *
 * predictedRiskDirection: the direction NOMOS predicted.
 * actualRiskDirection:    the direction observed in the resolving run.
 *                         null when unresolved.
 *
 * exactMatch:     predictedVariable === actualNextVariable (both null counts as match).
 * directionMatch: predictedRiskDirection === actualRiskDirection.
 *
 * calibrationClass:
 *   "well_calibrated" — exactMatch, or directionally correct.
 *   "too_aggressive"  — predicted rising/violation, but outcome stabilized or was lawful.
 *   "too_weak"        — predicted stable/decreasing, but next run worsened or violated.
 *   "unresolved"      — no later run available for comparison.
 *
 * summary: one human-readable sentence describing the outcome.
 */
export interface PredictionOutcomeRecord {
  sourceVersionId: string;
  resolvedVersionId: string | null;

  predictedVariable: string | null;
  actualNextVariable: string | null;

  predictedRiskDirection: "decreasing" | "stable" | "rising";
  actualRiskDirection: "decreasing" | "stable" | "rising" | null;

  exactMatch: boolean;
  directionMatch: boolean;
  confidence: "low" | "moderate" | "high";

  calibrationClass:
    | "well_calibrated"
    | "too_aggressive"
    | "too_weak"
    | "unresolved";

  summary: string;
}

/**
 * Aggregate report across all resolved and unresolved predictions.
 *
 * exactMatchRate:     fraction of resolved predictions where the exact variable matched.
 *                     null if no resolved predictions.
 * directionMatchRate: fraction of resolved predictions where direction matched.
 *                     null if no resolved predictions.
 *
 * calibrationCounts: count per calibration class.
 * outcomes:          all PredictionOutcomeRecord entries (newest-first order).
 * summaryLines:      human-readable aggregate sentences.
 */
export interface PredictionCalibrationReport {
  totalPredictions: number;
  resolvedPredictions: number;
  unresolvedPredictions: number;

  exactMatchRate: number | null;
  directionMatchRate: number | null;

  calibrationCounts: Record<
    "well_calibrated" | "too_aggressive" | "too_weak" | "unresolved",
    number
  >;

  outcomes: PredictionOutcomeRecord[];
  summaryLines: string[];
}
