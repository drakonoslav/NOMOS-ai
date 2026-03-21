/**
 * bounded_rule_adjustment_test.ts
 *
 * Regression tests for bounded_rule_adjustment.ts — deterministic bounded
 * adaptation of NOMOS prediction confidence and escalation.
 *
 * Scenarios:
 *   1.  buildRuleAdjustmentSignal — empty calibration report → all null, shallowHistory=true
 *   2.  buildRuleAdjustmentSignal — resolvedPredictions < 3 → shallowHistory=true
 *   3.  buildRuleAdjustmentSignal — tooAggressiveRate computed correctly
 *   4.  buildRuleAdjustmentSignal — tooWeakRate computed correctly
 *   5.  buildRuleAdjustmentSignal — noisyHistory: >= 3 distinct vars in window
 *   6.  buildRuleAdjustmentSignal — noisyHistory: false when < 3 distinct vars
 *   7.  buildRuleAdjustmentSignal — noisyHistory: false when shallowHistory=true
 *   8.  computeBoundedRuleAdjustment — no signal → "No bounded adjustment applied"
 *   9.  computeBoundedRuleAdjustment — shallow history → uncertaintyBias raised
 *  10.  computeBoundedRuleAdjustment — shallow history blocks confidence boost
 *  11.  computeBoundedRuleAdjustment — exactMatchRate < 0.4 → large confidence reduction
 *  12.  computeBoundedRuleAdjustment — exactMatchRate 0.4–0.6 → moderate confidence reduction
 *  13.  computeBoundedRuleAdjustment — strong calibration → small confidence boost
 *  14.  computeBoundedRuleAdjustment — directionMatchRate < 0.5 → additional confidence reduction
 *  15.  computeBoundedRuleAdjustment — high tooAggressiveRate → escalation reduction
 *  16.  computeBoundedRuleAdjustment — moderate tooAggressiveRate → milder escalation reduction
 *  17.  computeBoundedRuleAdjustment — tooWeakRate dominates → uncertainty increase, no escalation raise
 *  18.  computeBoundedRuleAdjustment — mixed calibration → no escalation change
 *  19.  computeBoundedRuleAdjustment — hard limits: confidenceBias clamped to [-1.0, +0.5]
 *  20.  computeBoundedRuleAdjustment — hard limits: escalationBias clamped to [-1.0, +0.5]
 *  21.  computeBoundedRuleAdjustment — hard limits: uncertaintyBias clamped to [0.0, +1.5]
 *  22.  computeBoundedRuleAdjustment — changes list correct for applied rules
 *  23.  computeBoundedRuleAdjustment — noisy history → uncertainty raised
 *  24.  computeBoundedRuleAdjustment — summaryLines mention escalation softened
 *  25.  applyRuleAdjustmentToPrediction — no bias → prediction unchanged
 *  26.  applyRuleAdjustmentToPrediction — confidenceBias <= -0.5 downgrades "high" → "moderate"
 *  27.  applyRuleAdjustmentToPrediction — confidenceBias <= -0.5 downgrades "moderate" → "low"
 *  28.  applyRuleAdjustmentToPrediction — escalationBias <= -0.5 softens "rising" → "stable"
 *  29.  applyRuleAdjustmentToPrediction — uncertaintyBias >= 0.5 downgrades "high" → "moderate"
 *  30.  applyRuleAdjustmentToPrediction — does not mutate input prediction
 */

import { describe, it, expect } from "vitest";
import {
  buildRuleAdjustmentSignal,
  computeBoundedRuleAdjustment,
  applyRuleAdjustmentToPrediction,
} from "../audit/bounded_rule_adjustment";
import type { AuditRecord } from "../audit/audit_types";
import type { PredictionCalibrationReport } from "../audit/calibration_types";
import type { FailurePrediction } from "../audit/prediction_types";
import type { RuleAdjustmentState, RuleAdjustmentSignal } from "../audit/rule_adjustment_types";
import { DEFAULT_ADJUSTMENT_STATE } from "../audit/rule_adjustment_types";

/* =========================================================
   Fixtures
   ========================================================= */

let _seq = 0;
function makeRecord(
  timestamp: string,
  overallStatus: string | null,
  decisiveVariable: string | null
): AuditRecord {
  _seq++;
  return {
    id: `audit_adj_${_seq}`,
    versionId: `ver_adj_${_seq}`,
    parentVersionId: null,
    timestamp,
    intent: "test",
    title: `Adjustment Run ${_seq}`,
    isEvaluable: true,
    isConfirmed: true,
    canonicalDeclaration: "",
    compileResult: null,
    patchedDraft: null,
    evaluationResult:
      overallStatus === null
        ? null
        : {
            status: overallStatus,
            payload: {
              overallStatus,
              decisiveVariable,
              candidateEvaluations: [],
            },
          },
  };
}

function makeCalibrationReport(
  overrides?: Partial<PredictionCalibrationReport>
): PredictionCalibrationReport {
  return {
    totalPredictions: 0,
    resolvedPredictions: 0,
    unresolvedPredictions: 0,
    exactMatchRate: null,
    directionMatchRate: null,
    calibrationCounts: {
      well_calibrated: 0,
      too_aggressive: 0,
      too_weak: 0,
      unresolved: 0,
    },
    outcomes: [],
    summaryLines: [],
    ...overrides,
  };
}

function makeSignal(overrides?: Partial<RuleAdjustmentSignal>): RuleAdjustmentSignal {
  return {
    exactMatchRate: null,
    directionMatchRate: null,
    tooAggressiveRate: null,
    tooWeakRate: null,
    shallowHistory: false,
    noisyHistory: false,
    ...overrides,
  };
}

function makeState(overrides?: Partial<RuleAdjustmentState>): RuleAdjustmentState {
  return { ...DEFAULT_ADJUSTMENT_STATE, ...overrides };
}

function makePrediction(
  overrides?: Partial<FailurePrediction>
): FailurePrediction {
  return {
    predictedVariable: "calorie delta violation",
    confidence: "moderate",
    riskDirection: "rising",
    explanationLines: ["Test line."],
    signals: [],
    ...overrides,
  };
}

/* =========================================================
   Scenario 1: buildRuleAdjustmentSignal — empty report → shallowHistory=true
   ========================================================= */

describe("buildRuleAdjustmentSignal — empty calibration report", () => {
  const report = makeCalibrationReport();
  const signal = buildRuleAdjustmentSignal(report, []);

  it("exactMatchRate is null", () => {
    expect(signal.exactMatchRate).toBeNull();
  });

  it("tooAggressiveRate is null", () => {
    expect(signal.tooAggressiveRate).toBeNull();
  });

  it("shallowHistory is true (0 resolved < 3)", () => {
    expect(signal.shallowHistory).toBe(true);
  });
});

/* =========================================================
   Scenario 2: buildRuleAdjustmentSignal — resolvedPredictions < 3 → shallowHistory
   ========================================================= */

describe("buildRuleAdjustmentSignal — resolvedPredictions = 2 → shallowHistory=true", () => {
  const report = makeCalibrationReport({ resolvedPredictions: 2 });
  const signal = buildRuleAdjustmentSignal(report, []);

  it("shallowHistory is true", () => {
    expect(signal.shallowHistory).toBe(true);
  });
});

/* =========================================================
   Scenario 3: buildRuleAdjustmentSignal — tooAggressiveRate
   ========================================================= */

describe("buildRuleAdjustmentSignal — tooAggressiveRate computed correctly", () => {
  const report = makeCalibrationReport({
    resolvedPredictions: 10,
    calibrationCounts: { well_calibrated: 5, too_aggressive: 4, too_weak: 1, unresolved: 0 },
  });
  const signal = buildRuleAdjustmentSignal(report, []);

  it("tooAggressiveRate is 4/10 = 0.4", () => {
    expect(signal.tooAggressiveRate).toBeCloseTo(0.4, 5);
  });
});

/* =========================================================
   Scenario 4: buildRuleAdjustmentSignal — tooWeakRate
   ========================================================= */

describe("buildRuleAdjustmentSignal — tooWeakRate computed correctly", () => {
  const report = makeCalibrationReport({
    resolvedPredictions: 8,
    calibrationCounts: { well_calibrated: 4, too_aggressive: 1, too_weak: 3, unresolved: 0 },
  });
  const signal = buildRuleAdjustmentSignal(report, []);

  it("tooWeakRate is 3/8 = 0.375", () => {
    expect(signal.tooWeakRate).toBeCloseTo(0.375, 5);
  });
});

/* =========================================================
   Scenario 5: buildRuleAdjustmentSignal — noisyHistory: >= 3 distinct vars
   ========================================================= */

describe("buildRuleAdjustmentSignal — noisyHistory: >= 3 distinct vars in window", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "protein placement violation"),
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "hydration volume violation"),
    makeRecord("2026-01-04T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-05T00:00:00Z", "LAWFUL", null),
  ];
  const report = makeCalibrationReport({ resolvedPredictions: 5 });
  const signal = buildRuleAdjustmentSignal(report, records);

  it("noisyHistory is true (3 distinct vars: calorie, protein, hydration)", () => {
    expect(signal.noisyHistory).toBe(true);
  });
});

/* =========================================================
   Scenario 6: buildRuleAdjustmentSignal — noisyHistory: false with < 3 distinct
   ========================================================= */

describe("buildRuleAdjustmentSignal — noisyHistory: false when < 3 distinct vars", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-03T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-04T00:00:00Z", "DEGRADED", "calorie delta violation"),
  ];
  const report = makeCalibrationReport({ resolvedPredictions: 4 });
  const signal = buildRuleAdjustmentSignal(report, records);

  it("noisyHistory is false (only calorie delta, 1 distinct variable)", () => {
    expect(signal.noisyHistory).toBe(false);
  });
});

/* =========================================================
   Scenario 7: buildRuleAdjustmentSignal — noisyHistory: false when shallow
   ========================================================= */

describe("buildRuleAdjustmentSignal — noisyHistory false when shallowHistory=true", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "protein placement violation"),
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "hydration volume violation"),
  ];
  const report = makeCalibrationReport({ resolvedPredictions: 2 }); // shallow
  const signal = buildRuleAdjustmentSignal(report, records);

  it("shallowHistory is true", () => {
    expect(signal.shallowHistory).toBe(true);
  });

  it("noisyHistory is false (overridden by shallowHistory guard)", () => {
    expect(signal.noisyHistory).toBe(false);
  });
});

/* =========================================================
   Scenario 8: computeBoundedRuleAdjustment — no signal → no adjustment
   ========================================================= */

describe("computeBoundedRuleAdjustment — all null signal → no adjustment", () => {
  const signal = makeSignal({ shallowHistory: false });
  const decision = computeBoundedRuleAdjustment(makeState(), signal);

  it("changes is empty", () => {
    expect(decision.changes).toHaveLength(0);
  });

  it("nextState confidenceBias is 0", () => {
    expect(decision.nextState.confidenceBias).toBe(0);
  });

  it("summaryLines say 'No bounded adjustment applied'", () => {
    expect(decision.summaryLines[0]).toBe("No bounded adjustment applied.");
  });
});

/* =========================================================
   Scenario 9: computeBoundedRuleAdjustment — shallow history → uncertaintyBias raised
   ========================================================= */

describe("computeBoundedRuleAdjustment — shallow history → uncertaintyBias += 0.5", () => {
  const signal = makeSignal({ shallowHistory: true });
  const decision = computeBoundedRuleAdjustment(makeState(), signal);

  it("uncertaintyBias is 0.5", () => {
    expect(decision.nextState.uncertaintyBias).toBeCloseTo(0.5, 5);
  });

  it("changes includes 'shallow_history_uncertainty'", () => {
    expect(decision.changes).toContain("shallow_history_uncertainty");
  });
});

/* =========================================================
   Scenario 10: computeBoundedRuleAdjustment — shallow history blocks confidence boost
   ========================================================= */

describe("computeBoundedRuleAdjustment — shallow history blocks confidence boost", () => {
  const signal = makeSignal({
    shallowHistory: true,
    exactMatchRate: 0.9,
    directionMatchRate: 0.9,
  });
  const decision = computeBoundedRuleAdjustment(makeState(), signal);

  it("confidenceBias is NOT positive (boost blocked)", () => {
    expect(decision.nextState.confidenceBias).toBeLessThanOrEqual(0);
  });

  it("does not include 'strong_calibration_confidence_boost'", () => {
    expect(decision.changes).not.toContain("strong_calibration_confidence_boost");
  });
});

/* =========================================================
   Scenario 11: computeBoundedRuleAdjustment — exactMatchRate < 0.4 → large confidence reduction
   ========================================================= */

describe("computeBoundedRuleAdjustment — exactMatchRate < 0.4 → large confidence reduction", () => {
  const signal = makeSignal({ exactMatchRate: 0.3 });
  const decision = computeBoundedRuleAdjustment(makeState(), signal);

  it("confidenceBias decreases by 0.3", () => {
    expect(decision.nextState.confidenceBias).toBeCloseTo(-0.3, 5);
  });

  it("changes includes 'low_exact_match_confidence_reduction'", () => {
    expect(decision.changes).toContain("low_exact_match_confidence_reduction");
  });
});

/* =========================================================
   Scenario 12: computeBoundedRuleAdjustment — exactMatchRate 0.4–0.6 → moderate reduction
   ========================================================= */

describe("computeBoundedRuleAdjustment — exactMatchRate 0.4–0.6 → moderate confidence reduction", () => {
  const signal = makeSignal({ exactMatchRate: 0.5 });
  const decision = computeBoundedRuleAdjustment(makeState(), signal);

  it("confidenceBias decreases by 0.15", () => {
    expect(decision.nextState.confidenceBias).toBeCloseTo(-0.15, 5);
  });

  it("changes includes 'moderate_exact_match_confidence_reduction'", () => {
    expect(decision.changes).toContain("moderate_exact_match_confidence_reduction");
  });
});

/* =========================================================
   Scenario 13: computeBoundedRuleAdjustment — strong calibration → confidence boost
   ========================================================= */

describe("computeBoundedRuleAdjustment — strong calibration (>= 0.8 both rates) → small boost", () => {
  const signal = makeSignal({
    exactMatchRate: 0.85,
    directionMatchRate: 0.9,
    shallowHistory: false,
  });
  const decision = computeBoundedRuleAdjustment(makeState(), signal);

  it("confidenceBias increases by 0.1", () => {
    expect(decision.nextState.confidenceBias).toBeCloseTo(0.1, 5);
  });

  it("changes includes 'strong_calibration_confidence_boost'", () => {
    expect(decision.changes).toContain("strong_calibration_confidence_boost");
  });
});

/* =========================================================
   Scenario 14: computeBoundedRuleAdjustment — weak direction match → additional reduction
   ========================================================= */

describe("computeBoundedRuleAdjustment — directionMatchRate < 0.5 → additional -0.15", () => {
  const signal = makeSignal({ directionMatchRate: 0.4 });
  const decision = computeBoundedRuleAdjustment(makeState(), signal);

  it("confidenceBias includes the -0.15 direction penalty", () => {
    expect(decision.nextState.confidenceBias).toBeCloseTo(-0.15, 5);
  });

  it("changes includes 'weak_direction_match_confidence_reduction'", () => {
    expect(decision.changes).toContain("weak_direction_match_confidence_reduction");
  });
});

/* =========================================================
   Scenario 15: computeBoundedRuleAdjustment — high tooAggressiveRate → large escalation reduction
   ========================================================= */

describe("computeBoundedRuleAdjustment — tooAggressiveRate >= 0.4 dominates → escalationBias -= 0.3", () => {
  const signal = makeSignal({
    tooAggressiveRate: 0.5,
    tooWeakRate: 0.1,
  });
  const decision = computeBoundedRuleAdjustment(makeState(), signal);

  it("escalationBias is -0.3", () => {
    expect(decision.nextState.escalationBias).toBeCloseTo(-0.3, 5);
  });

  it("changes includes 'high_aggressive_rate_escalation_reduction'", () => {
    expect(decision.changes).toContain("high_aggressive_rate_escalation_reduction");
  });
});

/* =========================================================
   Scenario 16: computeBoundedRuleAdjustment — moderate tooAggressiveRate → milder reduction
   ========================================================= */

describe("computeBoundedRuleAdjustment — tooAggressiveRate >= 0.2 but < 0.4 → escalationBias -= 0.15", () => {
  const signal = makeSignal({
    tooAggressiveRate: 0.25,
    tooWeakRate: 0.05,
  });
  const decision = computeBoundedRuleAdjustment(makeState(), signal);

  it("escalationBias is -0.15", () => {
    expect(decision.nextState.escalationBias).toBeCloseTo(-0.15, 5);
  });

  it("changes includes 'moderate_aggressive_rate_escalation_reduction'", () => {
    expect(decision.changes).toContain("moderate_aggressive_rate_escalation_reduction");
  });
});

/* =========================================================
   Scenario 17: computeBoundedRuleAdjustment — tooWeakRate dominates → uncertainty up, no escalation raise
   ========================================================= */

describe("computeBoundedRuleAdjustment — tooWeakRate > tooAggressiveRate → uncertainty up, NOT escalation", () => {
  const signal = makeSignal({
    tooAggressiveRate: 0.1,
    tooWeakRate: 0.4,
  });
  const decision = computeBoundedRuleAdjustment(makeState(), signal);

  it("uncertaintyBias increases", () => {
    expect(decision.nextState.uncertaintyBias).toBeGreaterThan(0);
  });

  it("escalationBias is NOT raised (stays 0)", () => {
    expect(decision.nextState.escalationBias).toBe(0);
  });

  it("changes includes 'too_weak_uncertainty_increase'", () => {
    expect(decision.changes).toContain("too_weak_uncertainty_increase");
  });
});

/* =========================================================
   Scenario 18: computeBoundedRuleAdjustment — mixed calibration → no escalation change
   ========================================================= */

describe("computeBoundedRuleAdjustment — mixed calibration (rates within 0.15) → no escalation change", () => {
  const signal = makeSignal({
    tooAggressiveRate: 0.3,
    tooWeakRate: 0.25, // difference = 0.05, within 0.15 threshold → mixed
  });
  const decision = computeBoundedRuleAdjustment(makeState(), signal);

  it("escalationBias stays at 0 (mixed → conservative)", () => {
    expect(decision.nextState.escalationBias).toBe(0);
  });
});

/* =========================================================
   Scenario 19: hard limits — confidenceBias clamped to [-1.0, +0.5]
   ========================================================= */

describe("computeBoundedRuleAdjustment — confidenceBias clamped to [-1.0, +0.5]", () => {
  const lowState = makeState({ confidenceBias: -0.95 });
  const signal = makeSignal({ exactMatchRate: 0.2 }); // would subtract 0.3
  const decision = computeBoundedRuleAdjustment(lowState, signal);

  it("confidenceBias is clamped at -1.0", () => {
    expect(decision.nextState.confidenceBias).toBeGreaterThanOrEqual(-1.0);
  });

  const highState = makeState({ confidenceBias: 0.45 });
  const strongSignal = makeSignal({ exactMatchRate: 0.9, directionMatchRate: 0.95, shallowHistory: false });
  const highDecision = computeBoundedRuleAdjustment(highState, strongSignal);

  it("confidenceBias is clamped at +0.5", () => {
    expect(highDecision.nextState.confidenceBias).toBeLessThanOrEqual(0.5);
  });
});

/* =========================================================
   Scenario 20: hard limits — escalationBias clamped
   ========================================================= */

describe("computeBoundedRuleAdjustment — escalationBias clamped to [-1.0, +0.5]", () => {
  const lowState = makeState({ escalationBias: -0.9 });
  const signal = makeSignal({ tooAggressiveRate: 0.6, tooWeakRate: 0.05 });
  const decision = computeBoundedRuleAdjustment(lowState, signal);

  it("escalationBias is >= -1.0", () => {
    expect(decision.nextState.escalationBias).toBeGreaterThanOrEqual(-1.0);
  });
});

/* =========================================================
   Scenario 21: hard limits — uncertaintyBias clamped to [0.0, +1.5]
   ========================================================= */

describe("computeBoundedRuleAdjustment — uncertaintyBias clamped to [0.0, +1.5]", () => {
  const highState = makeState({ uncertaintyBias: 1.45 });
  const signal = makeSignal({ shallowHistory: true, noisyHistory: true, tooWeakRate: 0.5, tooAggressiveRate: 0.1 });
  const decision = computeBoundedRuleAdjustment(highState, signal);

  it("uncertaintyBias is <= 1.5", () => {
    expect(decision.nextState.uncertaintyBias).toBeLessThanOrEqual(1.5);
  });

  it("uncertaintyBias is >= 0", () => {
    expect(decision.nextState.uncertaintyBias).toBeGreaterThanOrEqual(0);
  });
});

/* =========================================================
   Scenario 22: changes list correct
   ========================================================= */

describe("computeBoundedRuleAdjustment — changes list reflects applied rules", () => {
  const signal = makeSignal({
    shallowHistory: true,
    exactMatchRate: 0.35,
  });
  const decision = computeBoundedRuleAdjustment(makeState(), signal);

  it("contains 'shallow_history_uncertainty'", () => {
    expect(decision.changes).toContain("shallow_history_uncertainty");
  });

  it("contains 'low_exact_match_confidence_reduction'", () => {
    expect(decision.changes).toContain("low_exact_match_confidence_reduction");
  });
});

/* =========================================================
   Scenario 23: noisy history → uncertainty raised
   ========================================================= */

describe("computeBoundedRuleAdjustment — noisy history → uncertainty raised", () => {
  const signal = makeSignal({ noisyHistory: true });
  const decision = computeBoundedRuleAdjustment(makeState(), signal);

  it("uncertaintyBias is 0.3", () => {
    expect(decision.nextState.uncertaintyBias).toBeCloseTo(0.3, 5);
  });

  it("changes includes 'noisy_history_uncertainty'", () => {
    expect(decision.changes).toContain("noisy_history_uncertainty");
  });
});

/* =========================================================
   Scenario 24: summaryLines mention escalation softened
   ========================================================= */

describe("computeBoundedRuleAdjustment — summaryLines mention escalation when softened", () => {
  const signal = makeSignal({ tooAggressiveRate: 0.5, tooWeakRate: 0.05 });
  const decision = computeBoundedRuleAdjustment(makeState(), signal);

  it("summaryLines contain 'escalation softened'", () => {
    const combined = decision.summaryLines.join(" ").toLowerCase();
    expect(combined).toContain("escalation softened");
  });
});

/* =========================================================
   Scenario 25: applyRuleAdjustmentToPrediction — no bias → unchanged
   ========================================================= */

describe("applyRuleAdjustmentToPrediction — zero bias state → prediction unchanged", () => {
  const pred = makePrediction({ confidence: "high", riskDirection: "rising" });
  const result = applyRuleAdjustmentToPrediction(pred, DEFAULT_ADJUSTMENT_STATE);

  it("confidence is still 'high'", () => {
    expect(result.confidence).toBe("high");
  });

  it("riskDirection is still 'rising'", () => {
    expect(result.riskDirection).toBe("rising");
  });

  it("explanationLines unchanged", () => {
    expect(result.explanationLines).toEqual(pred.explanationLines);
  });
});

/* =========================================================
   Scenario 26: applyRuleAdjustmentToPrediction — confidenceBias <= -0.5 → "high" → "moderate"
   ========================================================= */

describe("applyRuleAdjustmentToPrediction — confidenceBias <= -0.5 downgrades 'high' → 'moderate'", () => {
  const pred = makePrediction({ confidence: "high" });
  const state = makeState({ confidenceBias: -0.5 });
  const result = applyRuleAdjustmentToPrediction(pred, state);

  it("confidence is 'moderate'", () => {
    expect(result.confidence).toBe("moderate");
  });

  it("explanationLines has a reduction note", () => {
    const combined = result.explanationLines.join(" ").toLowerCase();
    expect(combined).toContain("confidence reduced");
  });
});

/* =========================================================
   Scenario 27: applyRuleAdjustmentToPrediction — "moderate" → "low"
   ========================================================= */

describe("applyRuleAdjustmentToPrediction — confidenceBias <= -0.5 downgrades 'moderate' → 'low'", () => {
  const pred = makePrediction({ confidence: "moderate" });
  const state = makeState({ confidenceBias: -0.7 });
  const result = applyRuleAdjustmentToPrediction(pred, state);

  it("confidence is 'low'", () => {
    expect(result.confidence).toBe("low");
  });
});

/* =========================================================
   Scenario 28: applyRuleAdjustmentToPrediction — escalationBias <= -0.5 softens "rising" → "stable"
   ========================================================= */

describe("applyRuleAdjustmentToPrediction — escalationBias <= -0.5 softens 'rising' → 'stable'", () => {
  const pred = makePrediction({ riskDirection: "rising" });
  const state = makeState({ escalationBias: -0.6 });
  const result = applyRuleAdjustmentToPrediction(pred, state);

  it("riskDirection is 'stable'", () => {
    expect(result.riskDirection).toBe("stable");
  });

  it("escalationBias does not affect 'stable' or 'decreasing'", () => {
    const stable = makePrediction({ riskDirection: "stable" });
    const stableResult = applyRuleAdjustmentToPrediction(stable, state);
    expect(stableResult.riskDirection).toBe("stable");
  });
});

/* =========================================================
   Scenario 29: applyRuleAdjustmentToPrediction — uncertaintyBias >= 0.5 → "high" → "moderate"
   ========================================================= */

describe("applyRuleAdjustmentToPrediction — uncertaintyBias >= 0.5 downgrades 'high' → 'moderate'", () => {
  const pred = makePrediction({ confidence: "high" });
  const state = makeState({ uncertaintyBias: 0.5 });
  const result = applyRuleAdjustmentToPrediction(pred, state);

  it("confidence is 'moderate'", () => {
    expect(result.confidence).toBe("moderate");
  });

  it("explanationLines mention uncertainty", () => {
    const combined = result.explanationLines.join(" ").toLowerCase();
    expect(combined).toContain("uncertainty");
  });
});

/* =========================================================
   Scenario 30: applyRuleAdjustmentToPrediction — does not mutate input
   ========================================================= */

describe("applyRuleAdjustmentToPrediction — does not mutate input prediction", () => {
  const pred = makePrediction({ confidence: "high", riskDirection: "rising" });
  const state = makeState({ confidenceBias: -0.7, escalationBias: -0.7 });
  applyRuleAdjustmentToPrediction(pred, state);

  it("original confidence is still 'high'", () => {
    expect(pred.confidence).toBe("high");
  });

  it("original riskDirection is still 'rising'", () => {
    expect(pred.riskDirection).toBe("rising");
  });

  it("original explanationLines are unchanged", () => {
    expect(pred.explanationLines).toHaveLength(1);
  });
});
