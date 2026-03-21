/**
 * policy_visibility_types.ts
 *
 * Canonical types for NOMOS prediction policy visibility.
 *
 * Policy visibility makes the full prediction chain inspectable end-to-end:
 *   history → calibration → bounded adjustment → current confidence
 *
 * This is read-only visibility — the snapshot describes the current state
 * without modifying any stored data, predictions, or calibration records.
 *
 * No LLM generation is used.
 */

/**
 * A complete snapshot of the prediction policy active at a given moment.
 *
 * policyVersion:      identifies the algorithm version producing this snapshot.
 *
 * basePredictionRule: describes what signal selection rule is used (static).
 * confidenceRule:     describes how confidence is derived and adjusted.
 * escalationRule:     describes how risk escalation is bounded or boosted.
 * uncertaintyRule:    describes when and why uncertainty is elevated.
 *
 * boundedAdjustmentState: the current bias values active for future predictions.
 *
 * calibrationState: summary of calibration metrics from the current window.
 *   tooAggressiveRate, tooWeakRate: null when no resolved predictions.
 *
 * currentPredictionContext: what NOMOS is currently predicting.
 *
 * explanationLines: human-readable sentences explaining why NOMOS is speaking
 *   with its current confidence and risk direction. Deterministically derived;
 *   no LLM generation is used.
 */
export interface PredictionPolicySnapshot {
  policyVersion: string;

  basePredictionRule: string;
  confidenceRule: string;
  escalationRule: string;
  uncertaintyRule: string;

  boundedAdjustmentState: {
    confidenceBias: number;
    escalationBias: number;
    uncertaintyBias: number;
    calibrationWindow: number;
  };

  calibrationState: {
    totalPredictions: number;
    resolvedPredictions: number;
    exactMatchRate: number | null;
    directionMatchRate: number | null;
    tooAggressiveRate: number | null;
    tooWeakRate: number | null;
  };

  currentPredictionContext: {
    predictedVariable: string | null;
    confidence: "low" | "moderate" | "high";
    riskDirection: "decreasing" | "stable" | "rising";
  };

  explanationLines: string[];
}
