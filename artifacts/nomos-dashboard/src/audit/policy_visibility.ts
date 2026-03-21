/**
 * policy_visibility.ts
 *
 * Deterministic policy visibility for NOMOS.
 *
 * Assembles a PredictionPolicySnapshot from audit records, the current
 * prediction, the active adjustment state, and the calibration report.
 * All output is derived deterministically — no LLM generation is used.
 *
 * Functions:
 *   buildPredictionPolicySnapshot(auditRecords, currentPrediction, adjustmentState, calibrationReport)
 *   buildPolicyExplanationLines(snapshot)
 *
 * The snapshot is read-only. It does not modify stored predictions,
 * calibration records, or the adjustment state.
 */

import type { AuditRecord } from "./audit_types";
import type { FailurePrediction } from "./prediction_types";
import type { RuleAdjustmentState } from "./rule_adjustment_types";
import type { PredictionCalibrationReport } from "./calibration_types";
import type { PredictionPolicySnapshot } from "./policy_visibility_types";
import { buildRuleAdjustmentSignal } from "./bounded_rule_adjustment";

/* =========================================================
   Policy version
   ========================================================= */

/**
 * Identifies the current NOMOS prediction policy algorithm.
 *
 * Incremented when any of the following change:
 *   - signal selection formula
 *   - confidence classification rules
 *   - escalation thresholds
 *   - uncertainty guard conditions
 */
export const NOMOS_POLICY_VERSION = "NOMOS-POLICY-v1.0";

/* =========================================================
   Rule description builders (deterministic, static-ish)
   ========================================================= */

function buildConfidenceRule(adjustmentState: RuleAdjustmentState): string {
  const { confidenceBias } = adjustmentState;
  if (confidenceBias <= -0.5) {
    return "Calibration-adjusted: confidence is reduced due to weak exact-match rate over the recent window.";
  }
  if (confidenceBias <= -0.2) {
    return "Calibration-adjusted: confidence is moderately reduced due to below-target calibration accuracy.";
  }
  if (confidenceBias >= 0.2) {
    return "Calibration-adjusted: confidence is marginally boosted — calibration has been consistently strong.";
  }
  return "Baseline: confidence is derived from signal dominance (frequency) and current streak length.";
}

function buildEscalationRule(adjustmentState: RuleAdjustmentState): string {
  const { escalationBias } = adjustmentState;
  if (escalationBias <= -0.5) {
    return "Bounded: risk escalation is softened — recent forecasts were too aggressive relative to actual outcomes.";
  }
  if (escalationBias <= -0.2) {
    return "Bounded: risk escalation is moderately softened due to above-baseline too-aggressive rate.";
  }
  if (escalationBias >= 0.2) {
    return "Bounded: risk escalation is slightly strengthened — calibration supports confident rising calls.";
  }
  return "Baseline: escalation is derived from drift analysis and decisive-variable streak.";
}

function buildUncertaintyRule(adjustmentState: RuleAdjustmentState): string {
  const { uncertaintyBias } = adjustmentState;
  if (uncertaintyBias >= 1.0) {
    return "Elevated (high): both shallow history and noisy variable pattern raise the uncertainty threshold significantly.";
  }
  if (uncertaintyBias >= 0.5) {
    return "Elevated: shallow resolved-prediction history or inconsistent decisive variables raise the uncertainty threshold.";
  }
  if (uncertaintyBias > 0) {
    return "Slightly elevated: minor uncertainty increase from calibration signals.";
  }
  return "Baseline: uncertainty follows calibration depth — no elevation active.";
}

/* =========================================================
   Calibration quality assessment (internal)
   ========================================================= */

type CalibrationQuality = "strong" | "moderate" | "weak" | "insufficient";

function assessCalibrationQuality(
  exactMatchRate: number | null,
  directionMatchRate: number | null,
  resolvedPredictions: number
): CalibrationQuality {
  if (resolvedPredictions < 3) return "insufficient";
  if (exactMatchRate === null) return "insufficient";
  if (exactMatchRate >= 0.7 && (directionMatchRate ?? 0) >= 0.7) return "strong";
  if (exactMatchRate >= 0.4 || (directionMatchRate ?? 0) >= 0.5) return "moderate";
  return "weak";
}

/* =========================================================
   buildPolicyExplanationLines
   ========================================================= */

/**
 * Derives human-readable explanation lines from the snapshot.
 *
 * Covers:
 *   1. Base rule statement
 *   2. Current prediction context (variable, confidence, direction)
 *   3. Whether confidence was adjusted (and why)
 *   4. Whether escalation was softened
 *   5. Whether uncertainty was raised (shallow/noisy)
 *   6. Calibration quality assessment
 */
export function buildPolicyExplanationLines(
  snapshot: PredictionPolicySnapshot
): string[] {
  const lines: string[] = [];

  const {
    currentPredictionContext: ctx,
    boundedAdjustmentState: adj,
    calibrationState: cal,
  } = snapshot;

  const quality = assessCalibrationQuality(
    cal.exactMatchRate,
    cal.directionMatchRate,
    cal.resolvedPredictions
  );

  // 1. Base rule
  lines.push("Base prediction rule selects the highest weighted recurring decisive variable.");

  // 2. Current prediction context
  if (ctx.predictedVariable) {
    lines.push(
      `Currently predicting: ${ctx.predictedVariable} (confidence: ${ctx.confidence}, direction: ${ctx.riskDirection}).`
    );
  } else {
    lines.push(
      `No dominant signal — prediction is null (confidence: ${ctx.confidence}, direction: ${ctx.riskDirection}).`
    );
  }

  // 3. Confidence adjustment reason
  if (adj.confidenceBias <= -0.5) {
    lines.push(
      "Confidence is reduced because exact-match calibration weakened over the recent window."
    );
  } else if (adj.confidenceBias <= -0.2) {
    lines.push(
      "Confidence is moderately reduced due to below-target calibration accuracy."
    );
  } else if (adj.confidenceBias >= 0.2) {
    lines.push(
      "Confidence is marginally boosted because calibration has been consistently strong."
    );
  } else {
    lines.push("Confidence is at baseline — no adjustment is active.");
  }

  // 4. Escalation adjustment
  if (adj.escalationBias <= -0.5) {
    lines.push(
      "Risk escalation is softened because recent forecasts were too aggressive."
    );
  } else if (adj.escalationBias >= 0.2) {
    lines.push(
      "Risk escalation is slightly strengthened — calibration supports confident rising calls."
    );
  }

  // 5. Uncertainty reason
  if (adj.uncertaintyBias >= 1.0) {
    lines.push(
      "Uncertainty is significantly elevated due to both shallow history and noisy decisive-variable patterns."
    );
  } else if (adj.uncertaintyBias >= 0.5) {
    lines.push(
      "Uncertainty is elevated because resolved prediction history is still shallow."
    );
  } else if (adj.uncertaintyBias > 0) {
    lines.push("Uncertainty is slightly elevated from minor calibration signals.");
  }

  // 6. Calibration quality
  if (quality === "insufficient") {
    lines.push(
      `Calibration is insufficient — only ${cal.resolvedPredictions} resolved prediction${cal.resolvedPredictions !== 1 ? "s" : ""} available. Predictions should be treated as exploratory.`
    );
  } else if (quality === "strong") {
    const pct = Math.round((cal.exactMatchRate ?? 0) * 100);
    lines.push(`Calibration is strong — exact-match rate is ${pct}% across ${cal.resolvedPredictions} resolved runs.`);
  } else if (quality === "moderate") {
    lines.push("Calibration is moderate — predictions are directionally accurate but may miss the exact decisive variable.");
  } else {
    lines.push("Calibration is weak — recent predictions have been off-target. Confidence adjustments are active.");
  }

  // 7. Too-aggressive / too-weak note
  if (cal.tooAggressiveRate !== null && cal.tooAggressiveRate >= 0.4) {
    lines.push(`${Math.round(cal.tooAggressiveRate * 100)}% of resolved predictions were too aggressive — escalation bias is reduced.`);
  } else if (cal.tooWeakRate !== null && cal.tooWeakRate >= 0.4) {
    lines.push(`${Math.round(cal.tooWeakRate * 100)}% of resolved predictions were too weak — uncertainty is elevated.`);
  }

  return lines;
}

/* =========================================================
   buildPredictionPolicySnapshot
   ========================================================= */

/**
 * Assembles a complete PredictionPolicySnapshot.
 *
 * Inputs:
 *   auditRecords:      full audit history (used to check noise for the signal).
 *   currentPrediction: the FailurePrediction active right now.
 *   adjustmentState:   the bounded adjustment state currently in effect.
 *   calibrationReport: the full calibration report for the current history.
 *
 * This function does not modify any input or stored record.
 */
export function buildPredictionPolicySnapshot(
  auditRecords: AuditRecord[],
  currentPrediction: FailurePrediction,
  adjustmentState: RuleAdjustmentState,
  calibrationReport: PredictionCalibrationReport
): PredictionPolicySnapshot {
  const signal = buildRuleAdjustmentSignal(calibrationReport, auditRecords);

  const {
    resolvedPredictions,
    totalPredictions,
    exactMatchRate,
    directionMatchRate,
    calibrationCounts,
  } = calibrationReport;

  const tooAggressiveRate =
    resolvedPredictions > 0
      ? calibrationCounts.too_aggressive / resolvedPredictions
      : null;

  const tooWeakRate =
    resolvedPredictions > 0
      ? calibrationCounts.too_weak / resolvedPredictions
      : null;

  const snapshot: Omit<PredictionPolicySnapshot, "explanationLines"> = {
    policyVersion: NOMOS_POLICY_VERSION,

    basePredictionRule:
      "Selects the highest weighted recurring decisive variable from audit history.",
    confidenceRule: buildConfidenceRule(adjustmentState),
    escalationRule: buildEscalationRule(adjustmentState),
    uncertaintyRule: buildUncertaintyRule(adjustmentState),

    boundedAdjustmentState: {
      confidenceBias: adjustmentState.confidenceBias,
      escalationBias: adjustmentState.escalationBias,
      uncertaintyBias: adjustmentState.uncertaintyBias,
      calibrationWindow: adjustmentState.calibrationWindow,
    },

    calibrationState: {
      totalPredictions,
      resolvedPredictions,
      exactMatchRate,
      directionMatchRate,
      tooAggressiveRate,
      tooWeakRate,
    },

    currentPredictionContext: {
      predictedVariable: currentPrediction.predictedVariable,
      confidence: currentPrediction.confidence,
      riskDirection: currentPrediction.riskDirection,
    },
  };

  const full: PredictionPolicySnapshot = {
    ...snapshot,
    explanationLines: buildPolicyExplanationLines({
      ...snapshot,
      explanationLines: [],
    }),
  };

  // Suppress unused-variable warning for signal (computed for side-effect validation)
  void signal;

  return full;
}
