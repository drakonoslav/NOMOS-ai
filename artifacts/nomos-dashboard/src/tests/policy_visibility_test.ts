/**
 * policy_visibility_test.ts
 *
 * Regression tests for policy_visibility.ts — deterministic policy snapshot
 * and explanation line generation for the NOMOS prediction layer.
 *
 * Scenarios:
 *   1.  buildPolicyExplanationLines — always contains base rule statement
 *   2.  buildPolicyExplanationLines — contains current prediction context
 *   3.  buildPolicyExplanationLines — confidence reduced mention when bias <= -0.5
 *   4.  buildPolicyExplanationLines — confidence at baseline when bias is 0
 *   5.  buildPolicyExplanationLines — confidence boosted mention when bias >= 0.2
 *   6.  buildPolicyExplanationLines — escalation softened when escalationBias <= -0.5
 *   7.  buildPolicyExplanationLines — no escalation mention when bias is 0
 *   8.  buildPolicyExplanationLines — uncertainty elevated when uncertaintyBias >= 0.5
 *   9.  buildPolicyExplanationLines — uncertainty significantly elevated >= 1.0
 *  10.  buildPolicyExplanationLines — calibration insufficient when resolvedPredictions < 3
 *  11.  buildPolicyExplanationLines — calibration strong mention
 *  12.  buildPolicyExplanationLines — calibration weak mention
 *  13.  buildPolicyExplanationLines — calibration moderate mention
 *  14.  buildPolicyExplanationLines — too-aggressive rate >= 0.4 mentioned
 *  15.  buildPolicyExplanationLines — too-weak rate >= 0.4 mentioned
 *  16.  buildPredictionPolicySnapshot — policyVersion is NOMOS_POLICY_VERSION
 *  17.  buildPredictionPolicySnapshot — basePredictionRule is a non-empty string
 *  18.  buildPredictionPolicySnapshot — confidenceRule reflects bias <= -0.5
 *  19.  buildPredictionPolicySnapshot — confidenceRule is baseline when bias is 0
 *  20.  buildPredictionPolicySnapshot — escalationRule reflects bias <= -0.5
 *  21.  buildPredictionPolicySnapshot — uncertaintyRule reflects bias >= 0.5
 *  22.  buildPredictionPolicySnapshot — boundedAdjustmentState matches input
 *  23.  buildPredictionPolicySnapshot — calibrationState.tooAggressiveRate computed
 *  24.  buildPredictionPolicySnapshot — calibrationState.tooWeakRate computed
 *  25.  buildPredictionPolicySnapshot — currentPredictionContext matches prediction
 *  26.  buildPredictionPolicySnapshot — explanationLines is non-empty
 *  27.  buildPredictionPolicySnapshot — does not mutate inputs
 *  28.  buildPredictionPolicySnapshot — empty records → policy still produces snapshot
 *  29.  buildPredictionPolicySnapshot — null predictedVariable reflected in context
 *  30.  buildPredictionPolicySnapshot — tooAggressiveRate null when no resolved
 */

import { describe, it, expect } from "vitest";
import {
  buildPredictionPolicySnapshot,
  buildPolicyExplanationLines,
  NOMOS_POLICY_VERSION,
} from "../audit/policy_visibility";
import type { AuditRecord } from "../audit/audit_types";
import type { FailurePrediction } from "../audit/prediction_types";
import type { RuleAdjustmentState } from "../audit/rule_adjustment_types";
import type { PredictionCalibrationReport } from "../audit/calibration_types";
import type { PredictionPolicySnapshot } from "../audit/policy_visibility_types";
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
    id: `audit_pol_${_seq}`,
    versionId: `ver_pol_${_seq}`,
    parentVersionId: null,
    timestamp,
    intent: "test",
    title: `Policy Run ${_seq}`,
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

function makePrediction(
  overrides?: Partial<FailurePrediction>
): FailurePrediction {
  return {
    predictedVariable: "calorie delta violation",
    confidence: "moderate",
    riskDirection: "rising",
    explanationLines: [],
    signals: [],
    ...overrides,
  };
}

function makeState(
  overrides?: Partial<RuleAdjustmentState>
): RuleAdjustmentState {
  return { ...DEFAULT_ADJUSTMENT_STATE, ...overrides };
}

function makeSnapshot(overrides?: Partial<PredictionPolicySnapshot>): PredictionPolicySnapshot {
  return {
    policyVersion: NOMOS_POLICY_VERSION,
    basePredictionRule: "Selects the highest weighted recurring decisive variable from audit history.",
    confidenceRule: "Baseline: confidence is derived from signal dominance (frequency) and current streak length.",
    escalationRule: "Baseline: escalation is derived from drift analysis and decisive-variable streak.",
    uncertaintyRule: "Baseline: uncertainty follows calibration depth — no elevation active.",
    boundedAdjustmentState: { confidenceBias: 0, escalationBias: 0, uncertaintyBias: 0, calibrationWindow: 5 },
    calibrationState: {
      totalPredictions: 0,
      resolvedPredictions: 0,
      exactMatchRate: null,
      directionMatchRate: null,
      tooAggressiveRate: null,
      tooWeakRate: null,
    },
    currentPredictionContext: {
      predictedVariable: "calorie delta violation",
      confidence: "moderate",
      riskDirection: "rising",
    },
    explanationLines: [],
    ...overrides,
  };
}

/* =========================================================
   Scenario 1: base rule statement always present
   ========================================================= */

describe("buildPolicyExplanationLines — always contains base rule statement", () => {
  const lines = buildPolicyExplanationLines(makeSnapshot());

  it("first line mentions 'highest weighted'", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined).toContain("highest weighted");
  });
});

/* =========================================================
   Scenario 2: current prediction context mentioned
   ========================================================= */

describe("buildPolicyExplanationLines — contains current prediction context", () => {
  const lines = buildPolicyExplanationLines(
    makeSnapshot({
      currentPredictionContext: {
        predictedVariable: "protein placement violation",
        confidence: "high",
        riskDirection: "rising",
      },
    })
  );
  const combined = lines.join(" ");

  it("mentions the predicted variable", () => {
    expect(combined).toContain("protein placement violation");
  });

  it("mentions the confidence level", () => {
    expect(combined.toLowerCase()).toContain("high");
  });
});

/* =========================================================
   Scenario 3: confidence reduced when bias <= -0.5
   ========================================================= */

describe("buildPolicyExplanationLines — confidence reduced mention when bias <= -0.5", () => {
  const lines = buildPolicyExplanationLines(
    makeSnapshot({
      boundedAdjustmentState: { confidenceBias: -0.6, escalationBias: 0, uncertaintyBias: 0, calibrationWindow: 5 },
    })
  );

  it("mentions confidence reduced", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined).toContain("confidence is reduced");
  });
});

/* =========================================================
   Scenario 4: confidence at baseline when bias is 0
   ========================================================= */

describe("buildPolicyExplanationLines — confidence at baseline when bias is 0", () => {
  const lines = buildPolicyExplanationLines(makeSnapshot());

  it("mentions 'baseline'", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined).toContain("baseline");
  });

  it("does not mention 'confidence is reduced'", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined).not.toContain("confidence is reduced");
  });
});

/* =========================================================
   Scenario 5: confidence boosted when bias >= 0.2
   ========================================================= */

describe("buildPolicyExplanationLines — confidence boosted mention when bias >= 0.2", () => {
  const lines = buildPolicyExplanationLines(
    makeSnapshot({
      boundedAdjustmentState: { confidenceBias: 0.3, escalationBias: 0, uncertaintyBias: 0, calibrationWindow: 5 },
    })
  );

  it("mentions confidence boosted", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined).toContain("confidence is marginally boosted");
  });
});

/* =========================================================
   Scenario 6: escalation softened when escalationBias <= -0.5
   ========================================================= */

describe("buildPolicyExplanationLines — escalation softened when bias <= -0.5", () => {
  const lines = buildPolicyExplanationLines(
    makeSnapshot({
      boundedAdjustmentState: { confidenceBias: 0, escalationBias: -0.6, uncertaintyBias: 0, calibrationWindow: 5 },
    })
  );

  it("mentions risk escalation softened", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined).toContain("escalation is softened");
  });
});

/* =========================================================
   Scenario 7: no escalation mention when bias is 0
   ========================================================= */

describe("buildPolicyExplanationLines — no escalation mention when bias is 0", () => {
  const lines = buildPolicyExplanationLines(makeSnapshot());

  it("does not mention escalation softened", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined).not.toContain("escalation is softened");
  });
});

/* =========================================================
   Scenario 8: uncertainty elevated when bias >= 0.5
   ========================================================= */

describe("buildPolicyExplanationLines — uncertainty elevated when bias >= 0.5", () => {
  const lines = buildPolicyExplanationLines(
    makeSnapshot({
      boundedAdjustmentState: { confidenceBias: 0, escalationBias: 0, uncertaintyBias: 0.6, calibrationWindow: 5 },
    })
  );

  it("mentions uncertainty elevated", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined).toContain("uncertainty is elevated");
  });
});

/* =========================================================
   Scenario 9: uncertainty significantly elevated when bias >= 1.0
   ========================================================= */

describe("buildPolicyExplanationLines — uncertainty significantly elevated >= 1.0", () => {
  const lines = buildPolicyExplanationLines(
    makeSnapshot({
      boundedAdjustmentState: { confidenceBias: 0, escalationBias: 0, uncertaintyBias: 1.1, calibrationWindow: 5 },
    })
  );

  it("mentions 'significantly elevated' or 'both shallow'", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined.includes("significantly elevated") || combined.includes("both shallow")).toBe(true);
  });
});

/* =========================================================
   Scenario 10: calibration insufficient when resolvedPredictions < 3
   ========================================================= */

describe("buildPolicyExplanationLines — calibration insufficient when < 3 resolved", () => {
  const lines = buildPolicyExplanationLines(
    makeSnapshot({
      calibrationState: {
        totalPredictions: 2,
        resolvedPredictions: 2,
        exactMatchRate: null,
        directionMatchRate: null,
        tooAggressiveRate: null,
        tooWeakRate: null,
      },
    })
  );

  it("mentions insufficient or exploratory", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined.includes("insufficient") || combined.includes("exploratory")).toBe(true);
  });
});

/* =========================================================
   Scenario 11: calibration strong
   ========================================================= */

describe("buildPolicyExplanationLines — calibration strong mention", () => {
  const lines = buildPolicyExplanationLines(
    makeSnapshot({
      calibrationState: {
        totalPredictions: 10,
        resolvedPredictions: 8,
        exactMatchRate: 0.8,
        directionMatchRate: 0.85,
        tooAggressiveRate: 0.05,
        tooWeakRate: 0.05,
      },
    })
  );

  it("mentions 'strong'", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined).toContain("strong");
  });
});

/* =========================================================
   Scenario 12: calibration weak
   ========================================================= */

describe("buildPolicyExplanationLines — calibration weak mention", () => {
  const lines = buildPolicyExplanationLines(
    makeSnapshot({
      calibrationState: {
        totalPredictions: 10,
        resolvedPredictions: 8,
        exactMatchRate: 0.25,
        directionMatchRate: 0.3,
        tooAggressiveRate: 0.2,
        tooWeakRate: 0.1,
      },
    })
  );

  it("mentions 'weak'", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined).toContain("weak");
  });
});

/* =========================================================
   Scenario 13: calibration moderate
   ========================================================= */

describe("buildPolicyExplanationLines — calibration moderate mention", () => {
  const lines = buildPolicyExplanationLines(
    makeSnapshot({
      calibrationState: {
        totalPredictions: 10,
        resolvedPredictions: 8,
        exactMatchRate: 0.5,
        directionMatchRate: 0.6,
        tooAggressiveRate: 0.1,
        tooWeakRate: 0.1,
      },
    })
  );

  it("mentions 'moderate'", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined).toContain("moderate");
  });
});

/* =========================================================
   Scenario 14: too-aggressive rate >= 0.4 mentioned
   ========================================================= */

describe("buildPolicyExplanationLines — too-aggressive rate >= 0.4 mentioned", () => {
  const lines = buildPolicyExplanationLines(
    makeSnapshot({
      calibrationState: {
        totalPredictions: 10,
        resolvedPredictions: 10,
        exactMatchRate: 0.4,
        directionMatchRate: 0.5,
        tooAggressiveRate: 0.5,
        tooWeakRate: 0.1,
      },
    })
  );

  it("mentions 'too aggressive' or 'escalation bias'", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined.includes("too aggressive") || combined.includes("escalation bias")).toBe(true);
  });
});

/* =========================================================
   Scenario 15: too-weak rate >= 0.4 mentioned
   ========================================================= */

describe("buildPolicyExplanationLines — too-weak rate >= 0.4 mentioned", () => {
  const lines = buildPolicyExplanationLines(
    makeSnapshot({
      calibrationState: {
        totalPredictions: 10,
        resolvedPredictions: 10,
        exactMatchRate: 0.4,
        directionMatchRate: 0.5,
        tooAggressiveRate: 0.05,
        tooWeakRate: 0.45,
      },
    })
  );

  it("mentions 'too weak' or 'uncertainty'", () => {
    const combined = lines.join(" ").toLowerCase();
    expect(combined.includes("too weak") || combined.includes("uncertainty")).toBe(true);
  });
});

/* =========================================================
   Scenario 16: buildPredictionPolicySnapshot — policyVersion
   ========================================================= */

describe("buildPredictionPolicySnapshot — policyVersion is NOMOS_POLICY_VERSION", () => {
  const records = [makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation")];
  const pred = makePrediction();
  const cal = makeCalibrationReport();
  const snapshot = buildPredictionPolicySnapshot(records, pred, DEFAULT_ADJUSTMENT_STATE, cal);

  it("policyVersion matches NOMOS_POLICY_VERSION", () => {
    expect(snapshot.policyVersion).toBe(NOMOS_POLICY_VERSION);
  });
});

/* =========================================================
   Scenario 17: buildPredictionPolicySnapshot — basePredictionRule non-empty
   ========================================================= */

describe("buildPredictionPolicySnapshot — basePredictionRule is a non-empty string", () => {
  const records = [makeRecord("2026-01-01T00:00:00Z", "LAWFUL", null)];
  const snapshot = buildPredictionPolicySnapshot(
    records, makePrediction(), DEFAULT_ADJUSTMENT_STATE, makeCalibrationReport()
  );

  it("basePredictionRule is non-empty", () => {
    expect(snapshot.basePredictionRule.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 18: confidenceRule reflects bias <= -0.5
   ========================================================= */

describe("buildPredictionPolicySnapshot — confidenceRule reflects bias <= -0.5", () => {
  const state = makeState({ confidenceBias: -0.7 });
  const snapshot = buildPredictionPolicySnapshot(
    [], makePrediction(), state, makeCalibrationReport()
  );

  it("confidenceRule mentions 'reduced'", () => {
    expect(snapshot.confidenceRule.toLowerCase()).toContain("reduced");
  });
});

/* =========================================================
   Scenario 19: confidenceRule baseline when bias is 0
   ========================================================= */

describe("buildPredictionPolicySnapshot — confidenceRule is baseline when bias is 0", () => {
  const snapshot = buildPredictionPolicySnapshot(
    [], makePrediction(), DEFAULT_ADJUSTMENT_STATE, makeCalibrationReport()
  );

  it("confidenceRule mentions 'baseline'", () => {
    expect(snapshot.confidenceRule.toLowerCase()).toContain("baseline");
  });
});

/* =========================================================
   Scenario 20: escalationRule reflects bias <= -0.5
   ========================================================= */

describe("buildPredictionPolicySnapshot — escalationRule reflects bias <= -0.5", () => {
  const state = makeState({ escalationBias: -0.6 });
  const snapshot = buildPredictionPolicySnapshot(
    [], makePrediction(), state, makeCalibrationReport()
  );

  it("escalationRule mentions 'softened'", () => {
    expect(snapshot.escalationRule.toLowerCase()).toContain("softened");
  });
});

/* =========================================================
   Scenario 21: uncertaintyRule reflects bias >= 0.5
   ========================================================= */

describe("buildPredictionPolicySnapshot — uncertaintyRule reflects bias >= 0.5", () => {
  const state = makeState({ uncertaintyBias: 0.7 });
  const snapshot = buildPredictionPolicySnapshot(
    [], makePrediction(), state, makeCalibrationReport()
  );

  it("uncertaintyRule mentions 'elevated'", () => {
    expect(snapshot.uncertaintyRule.toLowerCase()).toContain("elevated");
  });
});

/* =========================================================
   Scenario 22: boundedAdjustmentState matches input
   ========================================================= */

describe("buildPredictionPolicySnapshot — boundedAdjustmentState matches input", () => {
  const state = makeState({ confidenceBias: -0.3, escalationBias: -0.15, uncertaintyBias: 0.5 });
  const snapshot = buildPredictionPolicySnapshot(
    [], makePrediction(), state, makeCalibrationReport()
  );

  it("confidenceBias matches", () => {
    expect(snapshot.boundedAdjustmentState.confidenceBias).toBe(-0.3);
  });

  it("escalationBias matches", () => {
    expect(snapshot.boundedAdjustmentState.escalationBias).toBe(-0.15);
  });

  it("uncertaintyBias matches", () => {
    expect(snapshot.boundedAdjustmentState.uncertaintyBias).toBe(0.5);
  });
});

/* =========================================================
   Scenario 23: calibrationState.tooAggressiveRate computed
   ========================================================= */

describe("buildPredictionPolicySnapshot — calibrationState.tooAggressiveRate computed", () => {
  const cal = makeCalibrationReport({
    resolvedPredictions: 10,
    calibrationCounts: { well_calibrated: 5, too_aggressive: 4, too_weak: 1, unresolved: 0 },
  });
  const snapshot = buildPredictionPolicySnapshot([], makePrediction(), DEFAULT_ADJUSTMENT_STATE, cal);

  it("tooAggressiveRate is 0.4", () => {
    expect(snapshot.calibrationState.tooAggressiveRate).toBeCloseTo(0.4, 5);
  });
});

/* =========================================================
   Scenario 24: calibrationState.tooWeakRate computed
   ========================================================= */

describe("buildPredictionPolicySnapshot — calibrationState.tooWeakRate computed", () => {
  const cal = makeCalibrationReport({
    resolvedPredictions: 8,
    calibrationCounts: { well_calibrated: 4, too_aggressive: 1, too_weak: 3, unresolved: 0 },
  });
  const snapshot = buildPredictionPolicySnapshot([], makePrediction(), DEFAULT_ADJUSTMENT_STATE, cal);

  it("tooWeakRate is 3/8 = 0.375", () => {
    expect(snapshot.calibrationState.tooWeakRate).toBeCloseTo(0.375, 5);
  });
});

/* =========================================================
   Scenario 25: currentPredictionContext matches prediction
   ========================================================= */

describe("buildPredictionPolicySnapshot — currentPredictionContext matches prediction", () => {
  const pred = makePrediction({
    predictedVariable: "protein placement violation",
    confidence: "high",
    riskDirection: "decreasing",
  });
  const snapshot = buildPredictionPolicySnapshot([], pred, DEFAULT_ADJUSTMENT_STATE, makeCalibrationReport());

  it("predictedVariable matches", () => {
    expect(snapshot.currentPredictionContext.predictedVariable).toBe("protein placement violation");
  });

  it("confidence matches", () => {
    expect(snapshot.currentPredictionContext.confidence).toBe("high");
  });

  it("riskDirection matches", () => {
    expect(snapshot.currentPredictionContext.riskDirection).toBe("decreasing");
  });
});

/* =========================================================
   Scenario 26: explanationLines is non-empty
   ========================================================= */

describe("buildPredictionPolicySnapshot — explanationLines is non-empty", () => {
  const snapshot = buildPredictionPolicySnapshot(
    [], makePrediction(), DEFAULT_ADJUSTMENT_STATE, makeCalibrationReport()
  );

  it("explanationLines has at least 2 entries", () => {
    expect(snapshot.explanationLines.length).toBeGreaterThanOrEqual(2);
  });
});

/* =========================================================
   Scenario 27: does not mutate inputs
   ========================================================= */

describe("buildPredictionPolicySnapshot — does not mutate inputs", () => {
  const pred = makePrediction({ confidence: "high", riskDirection: "rising" });
  const state = makeState({ confidenceBias: -0.3 });
  const cal = makeCalibrationReport({ resolvedPredictions: 5 });
  buildPredictionPolicySnapshot([], pred, state, cal);

  it("prediction.confidence is still 'high'", () => {
    expect(pred.confidence).toBe("high");
  });

  it("state.confidenceBias is still -0.3", () => {
    expect(state.confidenceBias).toBe(-0.3);
  });

  it("calibrationReport.resolvedPredictions is still 5", () => {
    expect(cal.resolvedPredictions).toBe(5);
  });
});

/* =========================================================
   Scenario 28: empty records → still produces valid snapshot
   ========================================================= */

describe("buildPredictionPolicySnapshot — empty records → valid snapshot", () => {
  const snapshot = buildPredictionPolicySnapshot(
    [], makePrediction(), DEFAULT_ADJUSTMENT_STATE, makeCalibrationReport()
  );

  it("policyVersion is set", () => {
    expect(snapshot.policyVersion).toBe(NOMOS_POLICY_VERSION);
  });

  it("explanationLines is non-empty", () => {
    expect(snapshot.explanationLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 29: null predictedVariable reflected in context
   ========================================================= */

describe("buildPredictionPolicySnapshot — null predictedVariable reflected", () => {
  const pred = makePrediction({ predictedVariable: null, confidence: "low" });
  const snapshot = buildPredictionPolicySnapshot(
    [], pred, DEFAULT_ADJUSTMENT_STATE, makeCalibrationReport()
  );

  it("currentPredictionContext.predictedVariable is null", () => {
    expect(snapshot.currentPredictionContext.predictedVariable).toBeNull();
  });

  it("explanationLines mention 'no dominant signal'", () => {
    const combined = snapshot.explanationLines.join(" ").toLowerCase();
    expect(combined).toContain("no dominant signal");
  });
});

/* =========================================================
   Scenario 30: tooAggressiveRate null when no resolved
   ========================================================= */

describe("buildPredictionPolicySnapshot — tooAggressiveRate null when resolvedPredictions = 0", () => {
  const cal = makeCalibrationReport({ resolvedPredictions: 0 });
  const snapshot = buildPredictionPolicySnapshot([], makePrediction(), DEFAULT_ADJUSTMENT_STATE, cal);

  it("tooAggressiveRate is null", () => {
    expect(snapshot.calibrationState.tooAggressiveRate).toBeNull();
  });

  it("tooWeakRate is null", () => {
    expect(snapshot.calibrationState.tooWeakRate).toBeNull();
  });
});
