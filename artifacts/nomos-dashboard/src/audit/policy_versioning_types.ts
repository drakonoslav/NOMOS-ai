/**
 * policy_versioning_types.ts
 *
 * Canonical types for NOMOS policy freeze and prediction versioning.
 *
 * Policy freeze makes every prediction historically reproducible:
 *   each prediction record carries the exact policy snapshot that produced it.
 *
 * Frozen snapshots are immutable after creation. Historical records must
 * not be modified after storage.
 *
 * No LLM generation is used. All values are deterministic.
 */

/**
 * An immutable snapshot of the prediction policy regime active at the moment
 * a prediction was produced.
 *
 * policyVersionId:  deterministic hash of policy-defining fields (rules,
 *   calibration window, bounded biases). Identical regimes produce the
 *   same ID; any change produces a different ID.
 * createdAt:        ISO-8601 timestamp when the snapshot was frozen.
 *
 * basePredictionRule / confidenceRule / escalationRule / uncertaintyRule:
 *   the exact description strings active at freeze time.
 *
 * calibrationWindow: number of runs used as the calibration sliding window.
 *
 * boundedAdjustmentState: the bias values active at freeze time.
 *   (calibrationWindow is stored separately for clarity.)
 *
 * calibrationState: the calibration metrics at freeze time.
 *
 * explanationLines: the full explanation chain at freeze time.
 */
export interface FrozenPolicySnapshot {
  policyVersionId: string;
  createdAt: string;

  basePredictionRule: string;
  confidenceRule: string;
  escalationRule: string;
  uncertaintyRule: string;

  calibrationWindow: number;

  boundedAdjustmentState: {
    confidenceBias: number;
    escalationBias: number;
    uncertaintyBias: number;
  };

  calibrationState: {
    totalPredictions: number;
    resolvedPredictions: number;
    exactMatchRate: number | null;
    directionMatchRate: number | null;
    tooAggressiveRate: number | null;
    tooWeakRate: number | null;
  };

  explanationLines: string[];
}

/**
 * A prediction record with full policy provenance.
 *
 * sourceVersionId:       the AuditRecord versionId that triggered the prediction.
 * predictionTimestamp:   ISO-8601 timestamp when the prediction was produced.
 *
 * predictedVariable / confidence / riskDirection: the prediction output.
 *
 * frozenPolicyVersionId: matches frozenPolicySnapshot.policyVersionId.
 *   Stored at the top level for fast lookup without deserializing the full
 *   snapshot.
 *
 * frozenPolicySnapshot:  the complete immutable policy record at prediction
 *   time. Never updated after initial storage.
 */
export interface FrozenPredictionRecord {
  sourceVersionId: string;
  predictionTimestamp: string;

  predictedVariable: string | null;
  confidence: "low" | "moderate" | "high";
  riskDirection: "decreasing" | "stable" | "rising";

  frozenPolicyVersionId: string;
  frozenPolicySnapshot: FrozenPolicySnapshot;
}

/**
 * Result of comparing two FrozenPolicySnapshots.
 *
 * changed:                 true if any policy-defining field differs.
 * changedFields:           names of fields that changed.
 * calibrationWindowChanged: true if calibrationWindow differs.
 * biasesChanged:           true if any bounded bias value differs.
 * ruleTextChanged:         true if any of the four rule strings differ.
 */
export interface PolicyComparisonResult {
  changed: boolean;
  changedFields: string[];
  calibrationWindowChanged: boolean;
  biasesChanged: boolean;
  ruleTextChanged: boolean;
}
