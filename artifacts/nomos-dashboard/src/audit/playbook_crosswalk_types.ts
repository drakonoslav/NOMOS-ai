/**
 * playbook_crosswalk_types.ts
 *
 * Canonical types for NOMOS playbook-to-decision crosswalk.
 *
 * For any live governance decision, shows which extracted playbook heuristics
 * support the action, caution against it, are relevant but neutral, or do not
 * apply to the current domain or conditions.
 *
 * This layer is advisory only.
 * It must not auto-promote, auto-block, or self-modify policy.
 * No LLM generation is used.
 */

/**
 * The context of a live governance decision being evaluated against the playbook.
 *
 * domain:                      the governance domain affected by the decision.
 * currentPolicyVersionId:      policy active before the action (null = first promotion).
 * recommendedPolicyVersionId:  bench-recommended policy at decision time.
 * expectedGains:               improvement claims entered by the decision maker.
 * expectedTradeoffs:           tradeoffs acknowledged at decision time.
 * expectedRisks:               risks acknowledged at decision time.
 * recommendationStrength:      strength of the bench recommendation.
 * confidence:                  confidence level of the bench recommendation.
 */
export interface PlaybookDecisionContext {
  domain: "nutrition" | "training" | "schedule" | "generic";
  currentPolicyVersionId: string | null;
  recommendedPolicyVersionId: string | null;

  expectedGains: string[];
  expectedTradeoffs: string[];
  expectedRisks: string[];

  recommendationStrength: "weak" | "moderate" | "strong";
  confidence: "low" | "moderate" | "high";
}

/**
 * The crosswalk evaluation of one heuristic against a decision context.
 *
 * heuristicId:   matches GovernanceHeuristic.id.
 * title:         copied from the heuristic for display convenience.
 * rule:          copied from the heuristic for display.
 * domain:        domain of the heuristic.
 *
 * relevance:
 *   "supports"     — the heuristic aligns with current decision conditions or
 *                    expected gains, suggesting the action is consistent with
 *                    historical successful patterns.
 *   "cautions"     — the heuristic warns against conditions present in this
 *                    decision (e.g. shallow evidence, undeclared tradeoffs,
 *                    weak bench signal).
 *   "neutral"      — the heuristic is domain-relevant but does not strongly
 *                    apply for or against the current decision.
 *   "not_relevant" — the heuristic belongs to a different domain or conditions
 *                    that are not present in this decision.
 *
 * reasonLines:   deterministic explanation of why this relevance was assigned.
 */
export interface HeuristicCrosswalkEntry {
  heuristicId: string;
  title: string;
  rule: string;
  domain: "nutrition" | "training" | "schedule" | "generic" | "mixed";

  relevance: "supports" | "cautions" | "neutral" | "not_relevant";
  reasonLines: string[];
}

/**
 * The full crosswalk for one live governance decision against the playbook.
 *
 * domain:                the decision domain.
 * supportingHeuristics:  doctrines that support the current action.
 * cautioningHeuristics:  doctrines that caution against it.
 * neutralHeuristics:     doctrines that are relevant but not strongly implicated.
 * summaryLines:          concise human-readable summary of the crosswalk result.
 *
 * Note: not_relevant heuristics are excluded from all three lists.
 */
export interface PlaybookDecisionCrosswalk {
  domain: "nutrition" | "training" | "schedule" | "generic";

  supportingHeuristics: HeuristicCrosswalkEntry[];
  cautioningHeuristics: HeuristicCrosswalkEntry[];
  neutralHeuristics: HeuristicCrosswalkEntry[];

  summaryLines: string[];
}
