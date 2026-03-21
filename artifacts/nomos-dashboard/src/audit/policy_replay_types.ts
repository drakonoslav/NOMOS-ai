/**
 * policy_replay_types.ts
 *
 * Canonical types for NOMOS run replay under alternate policy.
 *
 * Replay allows the same canonical declaration and audit context to be
 * re-evaluated under multiple frozen policy snapshots, so the effect of
 * policy change on predictions can be measured on identical inputs.
 *
 * Replay rules:
 *   - Same canonical declaration for every replay in a comparison.
 *   - Same intent for every replay.
 *   - Same audit history/calibration context.
 *   - Only the frozen policy snapshot changes.
 *
 * Replay is experimental analysis only.
 * Historical audit records are never mutated.
 * No LLM generation is used.
 */

/**
 * Input specification for a replay run.
 *
 * canonicalDeclaration:     the raw declaration text to replay.
 * intent:                   the evaluation domain intent.
 * baselineAuditRecordId:    optional — identifies the original audit run
 *   being replayed (for provenance only, not used in computation).
 * replayPolicyVersionIds:   the frozen policy version IDs to replay under.
 *   Order is preserved in results and comparisons.
 */
export interface PolicyReplayRequest {
  canonicalDeclaration: string;
  intent:
    | "NUTRITION_AUDIT"
    | "NUTRITION_TEMPORAL_FUELING"
    | "NUTRITION_LABEL_AUDIT"
    | "NUTRITION_MEAL_AUDIT"
    | "NUTRITION_LABEL_TRUTH"
    | "TRAINING_AUDIT"
    | "SCHEDULE_AUDIT"
    | "GENERIC_CONSTRAINT_TASK";
  baselineAuditRecordId?: string | null;
  replayPolicyVersionIds: string[];
}

/**
 * The prediction produced by replaying a single frozen policy snapshot
 * over the canonical declaration and audit context.
 *
 * policyVersionId:   which frozen policy produced this result.
 * predictedVariable: the predicted decisive variable (null = no clear signal).
 * confidence:        low / moderate / high — base prediction + policy bias.
 * riskDirection:     decreasing / stable / rising — base + escalation bias.
 * explanationLines:  policy explanation lines + replay-specific context.
 */
export interface PolicyReplayResult {
  policyVersionId: string;
  predictedVariable: string | null;
  confidence: "low" | "moderate" | "high";
  riskDirection: "decreasing" | "stable" | "rising";
  explanationLines: string[];
}

/**
 * Cross-policy comparison for a single canonical declaration.
 *
 * canonicalDeclarationHash:   djb2 hash of the canonical declaration.
 *   Identifies the input without storing the full text.
 * results:                    one PolicyReplayResult per replayed policy,
 *   in the order specified by PolicyReplayRequest.replayPolicyVersionIds.
 * differingFields:             field names where replay outputs differ across
 *   policies. Subset of: ["predictedVariable", "confidence", "riskDirection",
 *   "explanationLines"]. Empty when all policies produce identical outputs.
 * summaryLines:                deterministic human-readable description of
 *   what changed across replayed policies.
 */
export interface PolicyReplayComparison {
  canonicalDeclarationHash: string;
  results: PolicyReplayResult[];
  differingFields: string[];
  summaryLines: string[];
}
