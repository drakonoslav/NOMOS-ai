/**
 * governance_deliberation_types.ts
 *
 * Canonical types for the NOMOS governance deliberation summary.
 *
 * The deliberation summary is the final advisory brief produced before a human
 * executes a governance action. It synthesises bench evidence, the recommendation
 * layer, expected gains/tradeoffs/risks, and the playbook crosswalk into one
 * concise, reviewable document.
 *
 * This layer is advisory only.
 * It must not auto-promote, auto-rollback, or self-modify policy.
 * No LLM generation is used.
 */

/**
 * The full governance deliberation summary for one pending governance decision.
 *
 * domain:
 *   Evaluation domain covered by the deliberation.
 *
 * currentPolicyVersionId:
 *   Policy active before the action (null = no policy assigned yet).
 *
 * recommendedPolicyVersionId:
 *   Bench-recommended candidate. Null when no bench signal is available.
 *
 * recommendation:
 *   The advisory action inferred from the upstream decision-support layer.
 *   "promote"  — evidence supports promoting the recommended policy.
 *   "rollback" — current policy shows poor outcomes; bench supports moving away.
 *   "hold"     — insufficient evidence or no clear recommendation.
 *   This value is reflected, not recomputed here.
 *
 * recommendationStrength:
 *   Strength of the bench recommendation (weak / moderate / strong).
 *
 * confidence:
 *   Overall evidence confidence (low / moderate / high).
 *
 * keyEvidenceLines:
 *   Concise bench metric comparisons — exact-match, direction-match,
 *   aggressiveness, unresolved-rate — between the current and recommended policy.
 *
 * gainsLines:
 *   Improvements expected if the recommendation is followed.
 *
 * tradeoffLines:
 *   Measurable regressions or compromises acknowledged at decision time.
 *
 * riskLines:
 *   Forward-looking uncertainties, known fragility, or shallow evidence.
 *
 * supportingHeuristics:
 *   Titles of playbook heuristics that support the current action.
 *
 * cautioningHeuristics:
 *   Titles of playbook heuristics that caution against the current action.
 *
 * synthesisLines:
 *   2–4 lines that combine evidence, recommendation, and doctrine alignment
 *   into one coherent paragraph-like conclusion.
 *
 * finalDecisionPrompt:
 *   A single neutral, structured question the human can answer yes/no/defer.
 *   Example: "Promote policy v3 over v2 given improved exact-match performance
 *   and acceptable tradeoffs?"
 */
export interface GovernanceDeliberationSummary {
  domain: "nutrition" | "training" | "schedule" | "generic";

  currentPolicyVersionId: string | null;
  recommendedPolicyVersionId: string | null;

  recommendation: "promote" | "rollback" | "hold";
  recommendationStrength: "weak" | "moderate" | "strong";
  confidence: "low" | "moderate" | "high";

  keyEvidenceLines: string[];
  gainsLines: string[];
  tradeoffLines: string[];
  riskLines: string[];

  supportingHeuristics: string[];
  cautioningHeuristics: string[];

  synthesisLines: string[];

  finalDecisionPrompt: string;
}
