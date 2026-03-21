/**
 * post_governance_review_types.ts
 *
 * Canonical types for NOMOS post-governance outcome review.
 *
 * After a policy governance action (promotion or rollback), subsequent
 * evaluation runs accumulate. This layer compares actual post-action outcomes
 * against what was expected at decision time — measuring whether expected gains
 * materialised, whether tradeoffs were worth it, and whether risks were realised.
 *
 * This layer is measurement and review only.
 * It never promotes, rolls back, or otherwise modifies policy assignments.
 * No LLM generation is used.
 */

/**
 * The expected outcomes that were documented when a governance action was taken.
 * Copied from the GovernanceAuditRecord at review time so the review is
 * self-contained — it does not depend on the original audit record remaining
 * available.
 */
export interface GovernanceOutcomeExpectation {
  expectedGains: string[];
  expectedTradeoffs: string[];
  expectedRisks: string[];
}

/**
 * The observed post-action metrics used to evaluate whether expectations were met.
 *
 * All delta fields are (post − pre) so a positive value means the metric
 * increased after the governance action.  Null means insufficient data to
 * compute a delta (e.g. no pre-action records exist for this domain).
 *
 * Metric proxies derived from EvalSnapshot.overallStatus:
 *   exactMatchDelta      — change in LAWFUL-outcome rate.
 *   directionMatchDelta  — change in DEGRADED-outcome rate.
 *   tooAggressiveDelta   — null; not determinable from EvalSnapshot alone.
 *   tooWeakDelta         — null; not determinable from EvalSnapshot alone.
 *   unresolvedDelta      — change in INVALID-outcome rate.
 */
export interface GovernanceOutcomeObserved {
  postActionRuns: number;

  exactMatchDelta: number | null;
  directionMatchDelta: number | null;
  tooAggressiveDelta: number | null;
  tooWeakDelta: number | null;
  unresolvedDelta: number | null;

  summaryLines: string[];
}

/**
 * A single governance outcome review — one entry per governance action.
 *
 * actionId:              matches the GovernanceAuditRecord.actionId being reviewed.
 * fromPolicyVersionId:   the policy active before the action (null = first promotion).
 * toPolicyVersionId:     the policy made active by the action.
 * expectation:           expected gains/tradeoffs/risks copied from the audit record.
 * observed:              post-action metric deltas computed from evaluation runs.
 * outcomeClass:          verdict on whether the action delivered its expected value.
 * reviewLines:           human-readable lines explaining the verdict.
 */
export interface GovernanceOutcomeReview {
  actionId: string;
  domain: "nutrition" | "training" | "schedule" | "generic";

  action: "promote" | "rollback";
  fromPolicyVersionId: string | null;
  toPolicyVersionId: string;

  expectation: GovernanceOutcomeExpectation;
  observed: GovernanceOutcomeObserved;

  outcomeClass:
    | "met_expectations"
    | "partially_met"
    | "did_not_meet"
    | "insufficient_followup";

  reviewLines: string[];
}

/**
 * Aggregate report across all governance actions in the audit trail.
 *
 * totalGovernanceActions:  total audit records reviewed.
 * reviewableActions:       actions with enough follow-up to classify (not
 *                          insufficient_followup).
 * outcomeCounts:           distribution of outcome classes.
 * reviews:                 one GovernanceOutcomeReview per audit record.
 * summaryLines:            human-readable aggregate summary.
 */
export interface GovernanceOutcomeReviewReport {
  totalGovernanceActions: number;
  reviewableActions: number;
  outcomeCounts: Record<
    "met_expectations" | "partially_met" | "did_not_meet" | "insufficient_followup",
    number
  >;

  reviews: GovernanceOutcomeReview[];
  summaryLines: string[];
}
