/**
 * decision_outcome_link_types.ts
 *
 * Canonical types for NOMOS decision → outcome linkage.
 *
 * This layer links each governance deliberation summary to the actual
 * governance action taken and then to the later observed outcomes, so the
 * full chain can be traced:
 *
 *   deliberation → decision → action → expected gains → actual outcomes
 *
 * All linking is done by stable IDs. No fuzzy matching is used.
 * This layer is measurement and traceability only.
 * It does not promote, rollback, or self-modify policy.
 * No LLM generation is used.
 */

/**
 * A record of what a human decided after reviewing a governance deliberation brief.
 *
 * decisionId:              stable ID for this decision record ("dec-XXXXXXXX").
 * timestamp:               ISO 8601 timestamp at decision time.
 * domain:                  domain the decision covers.
 *
 * deliberationSummaryId:   derived ID of the GovernanceDeliberationSummary that
 *                          was reviewed before this decision ("dls-XXXXXXXX").
 *
 * currentPolicyVersionId:  active policy at decision time (may be null).
 * recommendedPolicyVersionId: bench-recommended candidate at decision time.
 *
 * decision:                what the human chose — "promote", "rollback", or "hold".
 * chosenPolicyVersionId:   the policy the human committed to (null for "hold").
 *
 * expectedGains:           gains acknowledged when the decision was made.
 * expectedTradeoffs:       tradeoffs acknowledged at decision time.
 * expectedRisks:           risks acknowledged at decision time.
 *
 * humanReason:             free-text reason the human gave for their choice.
 */
export interface GovernanceDecisionRecord {
  decisionId: string;
  timestamp: string;

  domain: "nutrition" | "training" | "schedule" | "generic";

  deliberationSummaryId: string;
  currentPolicyVersionId: string | null;
  recommendedPolicyVersionId: string | null;

  decision: "promote" | "rollback" | "hold";
  chosenPolicyVersionId: string | null;

  expectedGains: string[];
  expectedTradeoffs: string[];
  expectedRisks: string[];

  humanReason: string;
}

/**
 * A fully resolved link between a governance decision, the resulting governance
 * action, and the later outcome review.
 *
 * decisionId:                matches GovernanceDecisionRecord.decisionId.
 * deliberationSummaryId:     matches the deliberation brief that preceded this.
 * governanceActionId:        the GovernanceAuditRecord.actionId this decision
 *                            produced. Null if no action was taken (hold) or
 *                            the audit record is not yet available.
 * governanceOutcomeReviewId: the GovernanceOutcomeReview.actionId that reviewed
 *                            the resulting action. Null if no outcome review
 *                            has been linked yet.
 *
 * decision:                  the human's chosen action.
 * chosenPolicyVersionId:     null for "hold" decisions.
 *
 * expectedGains / Tradeoffs / Risks: as declared at decision time.
 *
 * actualOutcomeClass:        the outcome verdict from the linked review.
 *                            Null when no review is linked yet.
 * actualOutcomeLines:        human-readable actual outcome lines from the review.
 *
 * linkageSummaryLines:       deterministic narrative connecting deliberation →
 *                            decision → action → outcome.
 */
export interface DecisionOutcomeLink {
  decisionId: string;
  deliberationSummaryId: string;
  governanceActionId: string | null;
  governanceOutcomeReviewId: string | null;

  decision: "promote" | "rollback" | "hold";
  chosenPolicyVersionId: string | null;

  expectedGains: string[];
  expectedTradeoffs: string[];
  expectedRisks: string[];

  actualOutcomeClass:
    | "met_expectations"
    | "partially_met"
    | "did_not_meet"
    | "insufficient_followup"
    | null;

  actualOutcomeLines: string[];

  linkageSummaryLines: string[];
}

/**
 * Aggregate report across all tracked governance decisions.
 *
 * totalLinkedDecisions: total GovernanceDecisionRecord entries processed.
 * links:                one DecisionOutcomeLink per decision record.
 * summaryLines:         high-level narrative of the outcome landscape.
 */
export interface DecisionOutcomeLinkReport {
  totalLinkedDecisions: number;
  links: DecisionOutcomeLink[];
  summaryLines: string[];
}
