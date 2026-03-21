/**
 * governance_learning_types.ts
 *
 * Canonical types for NOMOS governance learning summary.
 *
 * Summarises recurring patterns across many reviewed governance decisions
 * so NOMOS can reason about what kinds of governance actions tend to work,
 * what tradeoffs are repeatedly underestimated, and what mistakes recur.
 *
 * This layer is observational and advisory only.
 * It must not auto-promote, auto-rollback, or self-modify policy.
 * No LLM generation is used.
 */

/**
 * A single observed pattern extracted from the governance outcome review history.
 *
 * label:                   Short name for this pattern (e.g. "Nutrition promotions
 *                          that met expectations").
 *
 * domain:                  The governance domain this pattern applies to.
 *                          "mixed" when the pattern spans multiple domains clearly.
 *
 * supportingActionCount:   Number of governance actions that contributed evidence
 *                          for this pattern.
 *
 * summary:                 Human-readable description of what the pattern says and
 *                          why it matters.
 */
export interface GovernanceLearningPattern {
  label: string;
  domain: "nutrition" | "training" | "schedule" | "generic" | "mixed";

  supportingActionCount: number;
  summary: string;
}

/**
 * Aggregate learning summary computed across all reviewed governance actions.
 *
 * totalGovernanceActions:          total reviews passed in (including
 *                                  insufficient-followup entries).
 *
 * reviewableActions:               actions with sufficient follow-up data to
 *                                  classify (outcomeClass !== "insufficient_followup").
 *
 * successfulPromotionPatterns:     patterns where promotions repeatedly met
 *                                  expectations under similar conditions.
 *
 * recurringTradeoffPatterns:       patterns where one metric improved but another
 *                                  worsened — tradeoffs that were underestimated.
 *
 * recurringRiskPatterns:           patterns where shallow history, unresolved
 *                                  outcomes, or aggressiveness caused problems.
 *
 * recurringGovernanceMistakes:     patterns where expected gains did not materialise
 *                                  or tradeoffs were not declared at decision time.
 *
 * summaryLines:                    human-readable lines summarising the whole
 *                                  learning picture.
 */
export interface GovernanceLearningSummary {
  totalGovernanceActions: number;
  reviewableActions: number;

  successfulPromotionPatterns: GovernanceLearningPattern[];
  recurringTradeoffPatterns: GovernanceLearningPattern[];
  recurringRiskPatterns: GovernanceLearningPattern[];
  recurringGovernanceMistakes: GovernanceLearningPattern[];

  summaryLines: string[];
}
