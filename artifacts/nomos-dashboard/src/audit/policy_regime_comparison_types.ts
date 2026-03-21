/**
 * policy_regime_comparison_types.ts
 *
 * Canonical types for NOMOS policy regime comparison.
 *
 * Policy regime comparison allows NOMOS to evaluate how different frozen
 * policy versions performed over time — comparing prediction accuracy,
 * calibration quality, and bias profiles across regimes.
 *
 * This is comparison only, not automatic regime selection. No policy is
 * promoted or rolled back by these types or the functions that produce them.
 *
 * No LLM generation is used.
 */

/**
 * Aggregated performance metrics for a single policy version (regime).
 *
 * policyVersionId:          identifies the regime (from FrozenPolicySnapshot).
 *
 * totalPredictions:         number of frozen predictions produced under this regime.
 * resolvedPredictions:      predictions where an actual outcome could be compared.
 *
 * exactMatchRate:           fraction of resolved predictions whose predictedVariable
 *   matched the actual decisive variable. Null if no resolved predictions.
 * directionMatchRate:       fraction of resolved predictions whose riskDirection
 *   was correct. Null if no resolved predictions.
 * tooAggressiveRate:        fraction classified as too aggressive. Null if no resolved.
 * tooWeakRate:              fraction classified as too weak. Null if no resolved.
 *
 * averageConfidenceScore:   mean confidence mapped to {low:0, moderate:0.5, high:1.0}.
 *   Null if no predictions.
 * averageEscalationBias:    mean escalationBias from frozen adjustment states.
 *   Null if no predictions.
 * averageUncertaintyBias:   mean uncertaintyBias from frozen adjustment states.
 *   Null if no predictions.
 *
 * nutritionPredictionCount: predictions whose predictedVariable contains nutrition
 *   domain keywords (calorie, protein, hydration, fat, macro, etc.).
 * trainingPredictionCount:  predictions with training domain keywords.
 * schedulePredictionCount:  predictions with schedule domain keywords.
 */
export interface PolicyRegimeMetrics {
  policyVersionId: string;

  totalPredictions: number;
  resolvedPredictions: number;

  exactMatchRate: number | null;
  directionMatchRate: number | null;

  tooAggressiveRate: number | null;
  tooWeakRate: number | null;

  averageConfidenceScore: number | null;
  averageEscalationBias: number | null;
  averageUncertaintyBias: number | null;

  nutritionPredictionCount: number;
  trainingPredictionCount: number;
  schedulePredictionCount: number;
}

/**
 * Pairwise comparison between two policy regimes.
 *
 * Deltas are computed as: after - before.
 *   Positive delta: improvement in the "after" regime.
 *   Negative delta: degradation in the "after" regime.
 *   Exception: tooAggressiveDelta and tooWeakDelta — positive means worse.
 *
 * Null delta means at least one of the rates is unavailable.
 *
 * changed:      always true when beforePolicyVersionId !== afterPolicyVersionId.
 * summaryLines: deterministic description of what changed and by how much.
 */
export interface PolicyRegimeComparison {
  beforePolicyVersionId: string;
  afterPolicyVersionId: string;

  exactMatchDelta: number | null;
  directionMatchDelta: number | null;
  tooAggressiveDelta: number | null;
  tooWeakDelta: number | null;

  summaryLines: string[];
  changed: boolean;
}

/**
 * Full cross-regime comparison report.
 *
 * regimes:              all regime metrics, in chronological order of first seen.
 * pairwiseComparisons:  consecutive regime pair comparisons (regimes[i] → regimes[i+1]).
 *
 * bestByExactMatch:     policyVersionId of the regime with the highest exactMatchRate.
 *   Null if no rates are available.
 * bestByDirectionMatch: policyVersionId with the highest directionMatchRate.
 * lowestAggressiveRate: policyVersionId with the lowest tooAggressiveRate.
 *
 * summaryLines:         deterministic overall assessment across all regimes.
 */
export interface PolicyRegimeComparisonReport {
  regimes: PolicyRegimeMetrics[];
  pairwiseComparisons: PolicyRegimeComparison[];
  bestByExactMatch: string | null;
  bestByDirectionMatch: string | null;
  lowestAggressiveRate: string | null;
  summaryLines: string[];
}
