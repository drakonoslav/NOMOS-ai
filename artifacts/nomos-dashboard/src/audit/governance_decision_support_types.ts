/**
 * governance_decision_support_types.ts
 *
 * Canonical types for the NOMOS governance decision support layer.
 *
 * Decision support is the final advisory buffer before a human executes
 * a governance action (promote or rollback). It compares the current active
 * policy against the bench-recommended policy and explains the expected
 * gains, tradeoffs, and risks in plain terms.
 *
 * This layer is advisory only.
 * No policy assignment is changed automatically.
 * Promotion and rollback remain exclusive manual governance actions.
 *
 * The full governance chain:
 *   bench → recommendation → decision support → human promotes / rolls back
 *
 * No LLM generation is used.
 */

/**
 * The full decision-support record for a single governance evaluation.
 *
 * domain:
 *   The evaluation domain this support record covers.
 *
 * currentActivePolicyVersionId:
 *   The currently active policy for this domain. Null when no active
 *   policy has been assigned via governance.
 *
 * recommendedPolicyVersionId:
 *   The bench-recommended policy. Null when no recommendation is available.
 *
 * expectedGains:
 *   Improvements likely to result from promoting the recommended policy.
 *   Based on bench metric deltas.
 *
 * expectedTradeoffs:
 *   Measurable costs or changes that may accompany the gains.
 *
 * expectedRisks:
 *   Uncertainties, shallow evidence, or mixed results that should
 *   temper confidence in the recommendation.
 *
 * recommendationStrength: inherited from the PolicyRecommendation.
 * confidence:             inherited from the PolicyRecommendation.
 *
 * promoteSuggested:
 *   True only when recommendation strength is "moderate" or "strong",
 *   confidence is "moderate" or "high", and the recommended policy
 *   differs from the current active policy. False when evidence is weak
 *   or policies are the same.
 *
 * rollbackSuggested:
 *   True when the current active policy shows clearly poor metrics
 *   (high aggressiveness or high unresolved rate) and the bench
 *   evidence supports moving away from it, even if promotion evidence
 *   is not yet strong enough.
 *
 * summaryLines:
 *   Deterministic narrative synthesising the decision context.
 */
export interface GovernanceDecisionSupport {
  domain: "nutrition" | "training" | "schedule" | "generic";

  currentActivePolicyVersionId: string | null;
  recommendedPolicyVersionId: string | null;

  expectedGains: string[];
  expectedTradeoffs: string[];
  expectedRisks: string[];

  recommendationStrength: "weak" | "moderate" | "strong";
  confidence: "low" | "moderate" | "high";

  promoteSuggested: boolean;
  rollbackSuggested: boolean;

  summaryLines: string[];
}
