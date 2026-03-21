/**
 * governance_audit_types.ts
 *
 * Canonical types for the NOMOS governance audit trail.
 *
 * Every policy promotion or rollback must produce a GovernanceAuditRecord
 * capturing the full decision context — not just the outcome — so that
 * governance actions remain historically explainable and auditable.
 *
 * A GovernanceAuditRecord answers:
 *   - What policy was active at decision time?
 *   - What policy was recommended by the bench?
 *   - What policy was chosen?
 *   - What improvements were expected?
 *   - What tradeoffs were accepted?
 *   - What risks were acknowledged?
 *   - How strong was the evidence?
 *   - What was the human's stated reason?
 *
 * Records are immutable once written. Historical records must never be
 * modified, redacted, or overwritten.
 *
 * No LLM generation is used.
 */

/**
 * A single immutable governance audit record.
 *
 * actionId:
 *   Deterministic identifier for this governance action.
 *   Format: "aud-XXXXXXXX" (8 hex chars from djb2 of key fields).
 *
 * timestamp:
 *   ISO-8601 timestamp of the action.
 *
 * domain:
 *   The governance domain affected.
 *
 * action:
 *   "promote" — advancing to a new policy version.
 *   "rollback" — reverting to a previous policy version.
 *
 * currentPolicyVersionId:
 *   The policy that was active before this action. Null when no policy
 *   was active (first promotion for this domain).
 *
 * recommendedPolicyVersionId:
 *   The bench-recommended policy at decision time. Null when no
 *   recommendation was available or consulted.
 *
 * chosenPolicyVersionId:
 *   The policy made active by this action.
 *
 * expectedGains:
 *   Improvements anticipated from this action (as listed in decision support).
 *   Empty array when no decision support was consulted.
 *
 * expectedTradeoffs:
 *   Costs accepted alongside the expected gains. Empty when not consulted.
 *
 * expectedRisks:
 *   Uncertainties or limitations flagged before acting. Empty when not consulted.
 *
 * recommendationStrength:
 *   Strength of the bench recommendation at decision time.
 *   "weak" when no recommendation was consulted.
 *
 * recommendationConfidence:
 *   Confidence of the bench recommendation at decision time.
 *   "low" when no recommendation was consulted.
 *
 * humanReason:
 *   The human-stated reason for this governance action.
 *   Required — governance actions without a stated reason are invalid.
 *
 * benchEvidenceSummary:
 *   Summary lines from the PolicyBenchReport at decision time.
 *   Empty when not consulted.
 *
 * recommendationSummary:
 *   Summary lines from the PolicyRecommendationReport at decision time.
 *   Empty when not consulted.
 */
export interface GovernanceAuditRecord {
  actionId: string;
  timestamp: string;

  domain: "nutrition" | "training" | "schedule" | "generic";
  action: "promote" | "rollback";

  currentPolicyVersionId: string | null;
  recommendedPolicyVersionId: string | null;
  chosenPolicyVersionId: string;

  expectedGains: string[];
  expectedTradeoffs: string[];
  expectedRisks: string[];

  recommendationStrength: "weak" | "moderate" | "strong";
  recommendationConfidence: "low" | "moderate" | "high";

  humanReason: string;

  benchEvidenceSummary: string[];
  recommendationSummary: string[];
}

/** Input to buildGovernanceAuditRecord — all required fields except actionId. */
export interface GovernanceAuditRecordInput {
  timestamp: string;
  domain: GovernanceAuditRecord["domain"];
  action: GovernanceAuditRecord["action"];
  currentPolicyVersionId: string | null;
  recommendedPolicyVersionId: string | null;
  chosenPolicyVersionId: string;
  expectedGains: string[];
  expectedTradeoffs: string[];
  expectedRisks: string[];
  recommendationStrength: GovernanceAuditRecord["recommendationStrength"];
  recommendationConfidence: GovernanceAuditRecord["recommendationConfidence"];
  humanReason: string;
  benchEvidenceSummary: string[];
  recommendationSummary: string[];
}
