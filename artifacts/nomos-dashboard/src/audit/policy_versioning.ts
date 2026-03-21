/**
 * policy_versioning.ts
 *
 * Deterministic policy freeze + versioning for NOMOS.
 *
 * Functions:
 *   buildPolicyVersionId(snapshot)
 *     Derives a deterministic ID from the policy-defining fields.
 *     Identical regimes → same ID; any change → different ID.
 *
 *   buildFrozenPolicySnapshot(policySnapshot, createdAt)
 *     Freezes a PredictionPolicySnapshot into an immutable FrozenPolicySnapshot.
 *
 *   freezePredictionWithPolicy(prediction, frozenSnapshot, sourceVersionId, predictionTimestamp)
 *     Attaches a frozen policy snapshot to a prediction, producing a
 *     FrozenPredictionRecord that carries full policy provenance.
 *
 *   compareFrozenPolicies(before, after)
 *     Reports which fields differ between two frozen snapshots.
 *
 * All functions are deterministic and non-mutating.
 * No LLM generation is used.
 * Frozen snapshots must not be modified after storage.
 */

import type { PredictionPolicySnapshot } from "./policy_visibility_types";
import type { FailurePrediction } from "./prediction_types";
import type {
  FrozenPolicySnapshot,
  FrozenPredictionRecord,
  PolicyComparisonResult,
} from "./policy_versioning_types";

/* =========================================================
   djb2 hash — deterministic, no crypto dependency
   ========================================================= */

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep as unsigned 32-bit
  }
  return hash;
}

/**
 * Builds a deterministic canonical fingerprint string from the
 * policy-defining fields. Calibration metrics are intentionally excluded —
 * the policy regime is defined by the rule texts, calibration window, and
 * bounded biases, not by the current calibration stats (which shift each run).
 */
function buildPolicyFingerprint(
  basePredictionRule: string,
  confidenceRule: string,
  escalationRule: string,
  uncertaintyRule: string,
  calibrationWindow: number,
  confidenceBias: number,
  escalationBias: number,
  uncertaintyBias: number
): string {
  // Serialize bias values to 6 decimal places to avoid floating-point drift.
  const biasStr = [confidenceBias, escalationBias, uncertaintyBias]
    .map((b) => b.toFixed(6))
    .join(",");
  return [
    basePredictionRule,
    confidenceRule,
    escalationRule,
    uncertaintyRule,
    String(calibrationWindow),
    biasStr,
  ].join("|");
}

/* =========================================================
   buildPolicyVersionId
   ========================================================= */

/**
 * Derives a deterministic policy version ID from the policy-defining fields.
 *
 * Fields that drive the ID:
 *   - basePredictionRule, confidenceRule, escalationRule, uncertaintyRule
 *   - calibrationWindow
 *   - confidenceBias, escalationBias, uncertaintyBias
 *
 * Calibration state (exactMatchRate, etc.) is intentionally excluded — those
 * are observations about history, not the policy regime itself.
 *
 * Format: "pol-XXXXXXXX" (8 hex chars from a 32-bit djb2 hash).
 */
export function buildPolicyVersionId(
  snapshot: Pick<
    FrozenPolicySnapshot,
    | "basePredictionRule"
    | "confidenceRule"
    | "escalationRule"
    | "uncertaintyRule"
    | "calibrationWindow"
    | "boundedAdjustmentState"
  >
): string {
  const fingerprint = buildPolicyFingerprint(
    snapshot.basePredictionRule,
    snapshot.confidenceRule,
    snapshot.escalationRule,
    snapshot.uncertaintyRule,
    snapshot.calibrationWindow,
    snapshot.boundedAdjustmentState.confidenceBias,
    snapshot.boundedAdjustmentState.escalationBias,
    snapshot.boundedAdjustmentState.uncertaintyBias
  );
  const hash = djb2(fingerprint);
  return `pol-${hash.toString(16).padStart(8, "0")}`;
}

/* =========================================================
   buildFrozenPolicySnapshot
   ========================================================= */

/**
 * Freezes a live PredictionPolicySnapshot into an immutable
 * FrozenPolicySnapshot.
 *
 * The policyVersionId is derived deterministically from the policy-defining
 * fields. Identical policy regimes produce the same ID.
 *
 * createdAt must be an ISO-8601 string (e.g. new Date().toISOString()).
 *
 * Does not mutate the input snapshot.
 */
export function buildFrozenPolicySnapshot(
  policySnapshot: PredictionPolicySnapshot,
  createdAt: string
): FrozenPolicySnapshot {
  const {
    basePredictionRule,
    confidenceRule,
    escalationRule,
    uncertaintyRule,
    boundedAdjustmentState,
    calibrationState,
    explanationLines,
  } = policySnapshot;

  const calibrationWindow = boundedAdjustmentState.calibrationWindow;

  const frozen: Omit<FrozenPolicySnapshot, "policyVersionId"> = {
    createdAt,
    basePredictionRule,
    confidenceRule,
    escalationRule,
    uncertaintyRule,
    calibrationWindow,
    boundedAdjustmentState: {
      confidenceBias: boundedAdjustmentState.confidenceBias,
      escalationBias: boundedAdjustmentState.escalationBias,
      uncertaintyBias: boundedAdjustmentState.uncertaintyBias,
    },
    calibrationState: {
      totalPredictions: calibrationState.totalPredictions,
      resolvedPredictions: calibrationState.resolvedPredictions,
      exactMatchRate: calibrationState.exactMatchRate,
      directionMatchRate: calibrationState.directionMatchRate,
      tooAggressiveRate: calibrationState.tooAggressiveRate,
      tooWeakRate: calibrationState.tooWeakRate,
    },
    // Deep-copy explanation lines so the frozen snapshot is independent of
    // the live snapshot.
    explanationLines: [...explanationLines],
  };

  const policyVersionId = buildPolicyVersionId({
    basePredictionRule,
    confidenceRule,
    escalationRule,
    uncertaintyRule,
    calibrationWindow,
    boundedAdjustmentState: frozen.boundedAdjustmentState,
  });

  return { policyVersionId, ...frozen };
}

/* =========================================================
   freezePredictionWithPolicy
   ========================================================= */

/**
 * Attaches a frozen policy snapshot to a prediction, producing a
 * FrozenPredictionRecord with full policy provenance.
 *
 * Arguments:
 *   prediction:          the FailurePrediction to record.
 *   frozenSnapshot:      the FrozenPolicySnapshot active when this prediction
 *                        was produced (obtained from buildFrozenPolicySnapshot).
 *   sourceVersionId:     the AuditRecord versionId that triggered this prediction.
 *   predictionTimestamp: ISO-8601 timestamp of the prediction.
 *
 * Does not mutate prediction or frozenSnapshot.
 * The returned record is a value object — its frozenPolicySnapshot must not be
 * modified after storage.
 */
export function freezePredictionWithPolicy(
  prediction: FailurePrediction,
  frozenSnapshot: FrozenPolicySnapshot,
  sourceVersionId: string,
  predictionTimestamp: string
): FrozenPredictionRecord {
  return {
    sourceVersionId,
    predictionTimestamp,
    predictedVariable: prediction.predictedVariable,
    confidence: prediction.confidence,
    riskDirection: prediction.riskDirection,
    frozenPolicyVersionId: frozenSnapshot.policyVersionId,
    frozenPolicySnapshot: frozenSnapshot,
  };
}

/* =========================================================
   compareFrozenPolicies
   ========================================================= */

/**
 * Compares two FrozenPolicySnapshots and reports what changed.
 *
 * Fields compared:
 *   - basePredictionRule, confidenceRule, escalationRule, uncertaintyRule
 *   - calibrationWindow
 *   - confidenceBias, escalationBias, uncertaintyBias
 *
 * calibrationState is intentionally excluded from the comparison — metric
 * drift is expected across runs and does not constitute a policy change.
 *
 * Returns:
 *   changed:                 true if policyVersionId differs.
 *   changedFields:           human-readable names of differing fields.
 *   calibrationWindowChanged: true if calibrationWindow differs.
 *   biasesChanged:           true if any bias value differs.
 *   ruleTextChanged:         true if any rule string differs.
 */
export function compareFrozenPolicies(
  before: FrozenPolicySnapshot,
  after: FrozenPolicySnapshot
): PolicyComparisonResult {
  const changedFields: string[] = [];

  // Rule text
  if (before.basePredictionRule !== after.basePredictionRule) {
    changedFields.push("basePredictionRule");
  }
  if (before.confidenceRule !== after.confidenceRule) {
    changedFields.push("confidenceRule");
  }
  if (before.escalationRule !== after.escalationRule) {
    changedFields.push("escalationRule");
  }
  if (before.uncertaintyRule !== after.uncertaintyRule) {
    changedFields.push("uncertaintyRule");
  }

  // Calibration window
  const calibrationWindowChanged = before.calibrationWindow !== after.calibrationWindow;
  if (calibrationWindowChanged) changedFields.push("calibrationWindow");

  // Bounded biases (compare to 6 decimal places to match fingerprint)
  const biasFields: Array<keyof FrozenPolicySnapshot["boundedAdjustmentState"]> = [
    "confidenceBias",
    "escalationBias",
    "uncertaintyBias",
  ];

  let biasesChanged = false;
  for (const field of biasFields) {
    const bv = before.boundedAdjustmentState[field].toFixed(6);
    const av = after.boundedAdjustmentState[field].toFixed(6);
    if (bv !== av) {
      changedFields.push(field);
      biasesChanged = true;
    }
  }

  const ruleTextChanged = changedFields.some((f) =>
    ["basePredictionRule", "confidenceRule", "escalationRule", "uncertaintyRule"].includes(f)
  );

  const changed = before.policyVersionId !== after.policyVersionId;

  return {
    changed,
    changedFields,
    calibrationWindowChanged,
    biasesChanged,
    ruleTextChanged,
  };
}
