/**
 * bounded_rule_adjustment.ts
 *
 * Deterministic bounded rule adjustment for NOMOS.
 *
 * Conservatively tunes prediction confidence and escalation based on
 * calibration history. Does not modify core constraint evaluation logic,
 * stored audit records, or historical prediction results.
 *
 * Functions:
 *   buildRuleAdjustmentSignal(calibrationReport, auditRecords)
 *   computeBoundedRuleAdjustment(currentState, signal)
 *   applyRuleAdjustmentToPrediction(prediction, adjustmentState)
 *
 * Hard limits enforced on all biases:
 *   confidenceBias:  [-1.0, +0.5]
 *   escalationBias:  [-1.0, +0.5]
 *   uncertaintyBias: [ 0.0, +1.5]
 *
 * Guards (always enforced):
 *   - resolvedPredictions < 3 → only raise uncertaintyBias; never boost confidence.
 *   - Mixed calibration (neither aggressive nor weak clearly dominates) → conservatism.
 *   - tooAggressiveRate > tooWeakRate → lower escalationBias.
 *   - tooWeakRate > tooAggressiveRate → raise uncertaintyBias BEFORE escalationBias.
 *
 * No LLM generation is used.
 */

import type { AuditRecord } from "./audit_types";
import type { PredictionCalibrationReport } from "./calibration_types";
import type { FailurePrediction } from "./prediction_types";
import type {
  RuleAdjustmentState,
  RuleAdjustmentSignal,
  RuleAdjustmentDecision,
} from "./rule_adjustment_types";
import { ADJUSTMENT_BOUNDS } from "./rule_adjustment_types";

/* =========================================================
   Internal helpers
   ========================================================= */

interface EvalSnap {
  decisiveVariable?: string | null;
}

function isEvalSnap(x: unknown): x is EvalSnap {
  return typeof x === "object" && x !== null;
}

function extractDecisiveVar(record: AuditRecord): string | null {
  const raw = record.evaluationResult?.payload;
  const snap = isEvalSnap(raw) ? raw : null;
  if (!snap) return null;
  const dv = snap.decisiveVariable;
  if (!dv || dv === "none") return null;
  return dv;
}

function sortChronologically(records: AuditRecord[]): AuditRecord[] {
  return [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampState(state: RuleAdjustmentState): RuleAdjustmentState {
  return {
    confidenceBias: clamp(
      state.confidenceBias,
      ADJUSTMENT_BOUNDS.confidenceBias.min,
      ADJUSTMENT_BOUNDS.confidenceBias.max
    ),
    escalationBias: clamp(
      state.escalationBias,
      ADJUSTMENT_BOUNDS.escalationBias.min,
      ADJUSTMENT_BOUNDS.escalationBias.max
    ),
    uncertaintyBias: clamp(
      state.uncertaintyBias,
      ADJUSTMENT_BOUNDS.uncertaintyBias.min,
      ADJUSTMENT_BOUNDS.uncertaintyBias.max
    ),
    calibrationWindow: state.calibrationWindow,
  };
}

/* =========================================================
   buildRuleAdjustmentSignal
   ========================================================= */

/**
 * Derives RuleAdjustmentSignal from the calibration report and audit history.
 *
 * tooAggressiveRate, tooWeakRate: fraction of resolved predictions (null if none).
 * shallowHistory:  resolvedPredictions < 3.
 * noisyHistory:    last calibrationWindow records contain >= 3 distinct decisive
 *                  variables (excluding null), AND resolvedPredictions >= 3.
 */
export function buildRuleAdjustmentSignal(
  calibrationReport: PredictionCalibrationReport,
  auditRecords: AuditRecord[]
): RuleAdjustmentSignal {
  const { resolvedPredictions, exactMatchRate, directionMatchRate, calibrationCounts } =
    calibrationReport;

  const window = Math.max(
    calibrationReport.outcomes.length > 0 ? 5 : 0,
    0
  );

  const tooAggressiveRate =
    resolvedPredictions > 0
      ? calibrationCounts.too_aggressive / resolvedPredictions
      : null;

  const tooWeakRate =
    resolvedPredictions > 0
      ? calibrationCounts.too_weak / resolvedPredictions
      : null;

  const shallowHistory = resolvedPredictions < 3;

  // Noise: recent window has >= 3 distinct non-null decisive variables
  let noisyHistory = false;
  if (!shallowHistory && auditRecords.length > 0) {
    const sorted = sortChronologically(auditRecords);
    const recent = sorted.slice(-window || -5);
    const distinctVars = new Set(
      recent.map(extractDecisiveVar).filter((v) => v !== null)
    );
    noisyHistory = distinctVars.size >= 3;
  }

  return {
    exactMatchRate,
    directionMatchRate,
    tooAggressiveRate,
    tooWeakRate,
    shallowHistory,
    noisyHistory,
  };
}

/* =========================================================
   computeBoundedRuleAdjustment
   ========================================================= */

/**
 * Computes a new RuleAdjustmentState from the current state and signal.
 *
 * All changes are deltas applied to the current state and then clamped
 * within the hard limits.
 *
 * Rules applied in priority order:
 *
 * 1. shallowHistory → uncertaintyBias += 0.5; block confidence boost.
 * 2. noisyHistory   → uncertaintyBias += 0.3.
 * 3. exactMatchRate < 0.4  → confidenceBias -= 0.3.
 *    exactMatchRate < 0.6  → confidenceBias -= 0.15 (milder).
 *    exactMatchRate >= 0.8 AND directionMatchRate >= 0.8 AND !shallowHistory
 *                          → confidenceBias += 0.1 (small positive; guard: not shallow).
 * 4. directionMatchRate < 0.5 → confidenceBias -= 0.15 (stacks with exact-match rule).
 * 5. tooAggressiveRate > tooWeakRate AND tooAggressiveRate >= 0.4 → escalationBias -= 0.3.
 *    tooAggressiveRate > tooWeakRate AND tooAggressiveRate >= 0.2 → escalationBias -= 0.15.
 * 6. tooWeakRate > tooAggressiveRate → uncertaintyBias += 0.3 first (before escalation).
 *    (escalationBias is NOT raised automatically — conservatism).
 * 7. Mixed calibration (neither >0.15 difference between aggressiveRate/weakRate):
 *    do not raise escalationBias or confidenceBias.
 */
export function computeBoundedRuleAdjustment(
  currentState: RuleAdjustmentState,
  signal: RuleAdjustmentSignal
): RuleAdjustmentDecision {
  let confidenceDelta = 0;
  let escalationDelta = 0;
  let uncertaintyDelta = 0;
  const changes: string[] = [];

  // Rule 1: shallow history
  if (signal.shallowHistory) {
    uncertaintyDelta += 0.5;
    changes.push("shallow_history_uncertainty");
  }

  // Rule 2: noisy history
  if (signal.noisyHistory) {
    uncertaintyDelta += 0.3;
    changes.push("noisy_history_uncertainty");
  }

  // Rules 3: exact match rate
  if (signal.exactMatchRate !== null) {
    if (signal.exactMatchRate < 0.4) {
      confidenceDelta -= 0.3;
      changes.push("low_exact_match_confidence_reduction");
    } else if (signal.exactMatchRate < 0.6) {
      confidenceDelta -= 0.15;
      changes.push("moderate_exact_match_confidence_reduction");
    } else if (
      signal.exactMatchRate >= 0.8 &&
      signal.directionMatchRate !== null &&
      signal.directionMatchRate >= 0.8 &&
      !signal.shallowHistory
    ) {
      confidenceDelta += 0.1;
      changes.push("strong_calibration_confidence_boost");
    }
  }

  // Rule 4: direction match rate
  if (signal.directionMatchRate !== null && signal.directionMatchRate < 0.5) {
    confidenceDelta -= 0.15;
    changes.push("weak_direction_match_confidence_reduction");
  }

  // Rules 5-7: aggressive vs weak rates
  const aggrRate = signal.tooAggressiveRate ?? 0;
  const weakRate = signal.tooWeakRate ?? 0;

  if (signal.tooAggressiveRate !== null || signal.tooWeakRate !== null) {
    const isMixed = Math.abs(aggrRate - weakRate) <= 0.15;

    if (!isMixed) {
      if (aggrRate > weakRate) {
        // too_aggressive dominates → lower escalation
        if (aggrRate >= 0.4) {
          escalationDelta -= 0.3;
          changes.push("high_aggressive_rate_escalation_reduction");
        } else if (aggrRate >= 0.2) {
          escalationDelta -= 0.15;
          changes.push("moderate_aggressive_rate_escalation_reduction");
        }
      } else {
        // too_weak dominates → raise uncertainty first (conservative)
        uncertaintyDelta += 0.3;
        changes.push("too_weak_uncertainty_increase");
        // Do NOT raise escalationBias automatically
      }
    }
    // Mixed → no escalation or confidence change from this rule
  }

  // Guard: shallow history blocks confidence boost
  if (signal.shallowHistory && confidenceDelta > 0) {
    confidenceDelta = 0;
    // Remove boost change if it was added
    const boostIdx = changes.indexOf("strong_calibration_confidence_boost");
    if (boostIdx >= 0) changes.splice(boostIdx, 1);
  }

  // Apply deltas
  const nextRaw: RuleAdjustmentState = {
    confidenceBias: currentState.confidenceBias + confidenceDelta,
    escalationBias: currentState.escalationBias + escalationDelta,
    uncertaintyBias: currentState.uncertaintyBias + uncertaintyDelta,
    calibrationWindow: currentState.calibrationWindow,
  };
  const nextState = clampState(nextRaw);

  const summaryLines = buildAdjustmentSummaryLines(nextState, changes, signal);

  return { nextState, changes, summaryLines };
}

/* =========================================================
   applyRuleAdjustmentToPrediction
   ========================================================= */

/**
 * Applies adjustment biases to a FailurePrediction, producing a modified copy.
 *
 * The original prediction object is not mutated.
 * Stored historical predictions are never affected by this function.
 *
 * Effects:
 *   confidenceBias <= -0.5:  downgrade confidence one level (high→moderate, moderate→low).
 *   escalationBias <= -0.5:  soften "rising" to "stable"; note added to explanationLines.
 *   uncertaintyBias >= 0.5:  downgrade "high" confidence to "moderate" (uncertainty guard).
 *   Any downgrade → add an explanation note.
 */
export function applyRuleAdjustmentToPrediction(
  prediction: FailurePrediction,
  adjustmentState: RuleAdjustmentState
): FailurePrediction {
  let { predictedVariable, confidence, riskDirection, explanationLines, signals } =
    prediction;

  const notes: string[] = [];

  // Confidence reduction from bias
  if (adjustmentState.confidenceBias <= -0.5) {
    if (confidence === "high") {
      confidence = "moderate";
      notes.push("Prediction confidence reduced due to weak recent calibration.");
    } else if (confidence === "moderate") {
      confidence = "low";
      notes.push("Prediction confidence reduced due to falling exact-match rate.");
    }
  }

  // Escalation softening
  if (adjustmentState.escalationBias <= -0.5 && riskDirection === "rising") {
    riskDirection = "stable";
    notes.push(
      "Risk direction remains elevated, but escalation is softened because recent forecasts overstated failure."
    );
  }

  // Uncertainty guard: high confidence with elevated uncertainty bias → moderate
  if (adjustmentState.uncertaintyBias >= 0.5 && confidence === "high") {
    confidence = "moderate";
    notes.push("Uncertainty elevated because audit history remains shallow or noisy.");
  }

  return {
    predictedVariable,
    confidence,
    riskDirection,
    explanationLines: notes.length > 0 ? [...explanationLines, ...notes] : explanationLines,
    signals,
  };
}

/* =========================================================
   Summary lines (internal)
   ========================================================= */

function buildAdjustmentSummaryLines(
  nextState: RuleAdjustmentState,
  changes: string[],
  signal: RuleAdjustmentSignal
): string[] {
  if (changes.length === 0) {
    return ["No bounded adjustment applied."];
  }

  const lines: string[] = [];

  if (changes.includes("low_exact_match_confidence_reduction") ||
      changes.includes("moderate_exact_match_confidence_reduction")) {
    lines.push("Prediction confidence reduced due to falling exact-match rate.");
  }

  if (changes.includes("weak_direction_match_confidence_reduction")) {
    lines.push("Prediction confidence further reduced due to weak directional accuracy.");
  }

  if (changes.includes("high_aggressive_rate_escalation_reduction") ||
      changes.includes("moderate_aggressive_rate_escalation_reduction")) {
    lines.push("Risk escalation softened because recent forecasts were too aggressive.");
  }

  if (changes.includes("strong_calibration_confidence_boost")) {
    lines.push("Prediction confidence marginally increased — calibration is consistently strong.");
  }

  if (changes.includes("shallow_history_uncertainty")) {
    lines.push("Uncertainty increased because audit history remains shallow.");
  }

  if (changes.includes("noisy_history_uncertainty")) {
    lines.push("Uncertainty increased because recent decisive variables are inconsistent.");
  }

  if (changes.includes("too_weak_uncertainty_increase")) {
    lines.push(
      "Uncertainty raised because predictions have been too weak; escalation is not yet strengthened."
    );
  }

  // State summary
  if (nextState.confidenceBias < -0.4) {
    lines.push("Current bias: confidence is significantly reduced.");
  }
  if (nextState.escalationBias < -0.4) {
    lines.push("Current bias: escalation is significantly softened.");
  }
  if (nextState.uncertaintyBias > 0.7) {
    lines.push("Current bias: uncertainty is elevated.");
  }

  return lines;
}
