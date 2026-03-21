/**
 * policy_recommendation_types.ts
 *
 * Canonical types for the NOMOS policy recommendation layer.
 *
 * Recommendations are derived from counterfactual policy bench evidence.
 * They are advisory only — no active policy assignment is changed automatically.
 *
 * The recommendation chain:
 *   policy history → bench evidence → recommendation → manual governance decision
 *
 * Recommendation rules:
 *   - Weighted composite score across all key metrics.
 *   - Recommendation strength reflects how clear the winner is.
 *   - Confidence is bounded by history depth and resolution rate.
 *   - Tradeoff lines articulate what the runner-up does better/worse.
 *
 * No LLM generation is used.
 */

/**
 * A single policy recommendation for a domain.
 *
 * domain:                     the evaluation domain this recommendation covers.
 * recommendedPolicyVersionId: the top-scoring policy. Null when no candidates
 *   have resolved runs to compare.
 * candidatePolicyVersionIds:  all policies that were evaluated, in rank order.
 *
 * basis:                      the metrics of the recommended policy used to
 *   justify the recommendation. Null metrics when no resolved runs.
 *
 * rationaleLines:             why the recommended policy was chosen.
 * tradeoffLines:              what trade-offs exist vs runner-up candidates.
 *
 * confidence:
 *   "low"      — fewer than 3 resolved runs, or unresolved rate > 50%.
 *   "moderate" — 3–7 resolved runs with meaningful signals.
 *   "high"     — 8+ resolved runs with low unresolved rate.
 *
 * recommendationStrength:
 *   "strong"   — composite score gap between top and second > 0.15.
 *   "moderate" — gap > 0.05 and ≤ 0.15.
 *   "weak"     — gap ≤ 0.05, or only one candidate, or no resolved runs.
 */
export interface PolicyRecommendation {
  domain: "nutrition" | "training" | "schedule" | "generic";

  recommendedPolicyVersionId: string | null;
  candidatePolicyVersionIds: string[];

  basis: {
    exactMatchRate: number | null;
    directionMatchRate: number | null;
    tooAggressiveRate: number | null;
    tooWeakRate: number | null;
    unresolvedRate: number | null;
  };

  rationaleLines: string[];
  tradeoffLines: string[];

  confidence: "low" | "moderate" | "high";
  recommendationStrength: "weak" | "moderate" | "strong";
}

/**
 * The full recommendation report for a domain from one bench run.
 *
 * domain:          the evaluation domain.
 * recommendations: one PolicyRecommendation per ranked candidate (top first).
 *   Empty when no policies were evaluated.
 * summaryLines:    deterministic high-level narrative.
 */
export interface PolicyRecommendationReport {
  domain: "nutrition" | "training" | "schedule" | "generic";
  recommendations: PolicyRecommendation[];
  summaryLines: string[];
}
