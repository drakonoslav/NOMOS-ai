/**
 * policy_versioning_test.ts
 *
 * Regression tests for policy_versioning.ts — deterministic policy freeze,
 * version ID generation, prediction records, and policy comparison.
 *
 * Scenarios:
 *   1.  buildPolicyVersionId — identical inputs → same ID
 *   2.  buildPolicyVersionId — confidenceBias change → different ID
 *   3.  buildPolicyVersionId — escalationBias change → different ID
 *   4.  buildPolicyVersionId — uncertaintyBias change → different ID
 *   5.  buildPolicyVersionId — calibrationWindow change → different ID
 *   6.  buildPolicyVersionId — basePredictionRule change → different ID
 *   7.  buildPolicyVersionId — confidenceRule change → different ID
 *   8.  buildPolicyVersionId — escalationRule change → different ID
 *   9.  buildPolicyVersionId — uncertaintyRule change → different ID
 *  10.  buildPolicyVersionId — format is "pol-XXXXXXXX" (8 hex chars)
 *  11.  buildFrozenPolicySnapshot — policyVersionId is non-empty
 *  12.  buildFrozenPolicySnapshot — createdAt preserved
 *  13.  buildFrozenPolicySnapshot — rule strings match input
 *  14.  buildFrozenPolicySnapshot — calibrationWindow matches input
 *  15.  buildFrozenPolicySnapshot — boundedAdjustmentState matches input
 *  16.  buildFrozenPolicySnapshot — calibrationState matches input
 *  17.  buildFrozenPolicySnapshot — explanationLines is a deep copy (not the same reference)
 *  18.  buildFrozenPolicySnapshot — identical snapshots produce the same policyVersionId
 *  19.  buildFrozenPolicySnapshot — does not mutate the input policySnapshot
 *  20.  freezePredictionWithPolicy — frozenPolicyVersionId matches snapshot policyVersionId
 *  21.  freezePredictionWithPolicy — predictedVariable matches prediction
 *  22.  freezePredictionWithPolicy — confidence matches prediction
 *  23.  freezePredictionWithPolicy — riskDirection matches prediction
 *  24.  freezePredictionWithPolicy — sourceVersionId preserved
 *  25.  freezePredictionWithPolicy — predictionTimestamp preserved
 *  26.  freezePredictionWithPolicy — does not mutate prediction or snapshot
 *  27.  compareFrozenPolicies — identical → changed=false, changedFields=[]
 *  28.  compareFrozenPolicies — bias change → changed=true, biasesChanged=true
 *  29.  compareFrozenPolicies — calibrationWindow change → calibrationWindowChanged=true
 *  30.  compareFrozenPolicies — rule text change → ruleTextChanged=true, changedFields correct
 */

import { describe, it, expect } from "vitest";
import {
  buildPolicyVersionId,
  buildFrozenPolicySnapshot,
  freezePredictionWithPolicy,
  compareFrozenPolicies,
} from "../audit/policy_versioning";
import type { PredictionPolicySnapshot } from "../audit/policy_visibility_types";
import type { FrozenPolicySnapshot } from "../audit/policy_versioning_types";
import type { FailurePrediction } from "../audit/prediction_types";
import { NOMOS_POLICY_VERSION } from "../audit/policy_visibility";

/* =========================================================
   Fixtures
   ========================================================= */

const BASE_RULES = {
  basePredictionRule: "Selects the highest weighted recurring decisive variable from audit history.",
  confidenceRule: "Baseline: confidence is derived from signal dominance (frequency) and current streak length.",
  escalationRule: "Baseline: escalation is derived from drift analysis and decisive-variable streak.",
  uncertaintyRule: "Baseline: uncertainty follows calibration depth — no elevation active.",
};

const BASE_ADJ = {
  confidenceBias: 0,
  escalationBias: 0,
  uncertaintyBias: 0,
  calibrationWindow: 5,
};

function makeSnapshot(overrides?: Partial<PredictionPolicySnapshot>): PredictionPolicySnapshot {
  return {
    policyVersion: NOMOS_POLICY_VERSION,
    ...BASE_RULES,
    boundedAdjustmentState: { ...BASE_ADJ },
    calibrationState: {
      totalPredictions: 10,
      resolvedPredictions: 8,
      exactMatchRate: 0.75,
      directionMatchRate: 0.8,
      tooAggressiveRate: 0.1,
      tooWeakRate: 0.05,
    },
    currentPredictionContext: {
      predictedVariable: "calorie delta violation",
      confidence: "moderate",
      riskDirection: "rising",
    },
    explanationLines: [
      "Base prediction rule selects the highest weighted recurring decisive variable.",
      "Currently predicting: calorie delta violation (confidence: moderate, direction: rising).",
    ],
    ...overrides,
  };
}

function makeFrozen(overrides?: Partial<FrozenPolicySnapshot>): FrozenPolicySnapshot {
  const snap = makeSnapshot();
  const base = buildFrozenPolicySnapshot(snap, "2026-01-10T12:00:00.000Z");
  return { ...base, ...overrides };
}

function makePrediction(overrides?: Partial<FailurePrediction>): FailurePrediction {
  return {
    predictedVariable: "calorie delta violation",
    confidence: "moderate",
    riskDirection: "rising",
    explanationLines: [],
    signals: [],
    ...overrides,
  };
}

/* =========================================================
   Helper: build a snapshot-like object for buildPolicyVersionId
   ========================================================= */

function makeVersionIdInput(
  overrides?: Partial<{
    basePredictionRule: string;
    confidenceRule: string;
    escalationRule: string;
    uncertaintyRule: string;
    calibrationWindow: number;
    confidenceBias: number;
    escalationBias: number;
    uncertaintyBias: number;
  }>
) {
  const merged = {
    ...BASE_RULES,
    calibrationWindow: 5,
    confidenceBias: 0,
    escalationBias: 0,
    uncertaintyBias: 0,
    ...overrides,
  };
  return {
    basePredictionRule: merged.basePredictionRule,
    confidenceRule: merged.confidenceRule,
    escalationRule: merged.escalationRule,
    uncertaintyRule: merged.uncertaintyRule,
    calibrationWindow: merged.calibrationWindow,
    boundedAdjustmentState: {
      confidenceBias: merged.confidenceBias,
      escalationBias: merged.escalationBias,
      uncertaintyBias: merged.uncertaintyBias,
    },
  };
}

/* =========================================================
   Scenario 1: identical inputs → same ID
   ========================================================= */

describe("buildPolicyVersionId — identical inputs → same ID", () => {
  const id1 = buildPolicyVersionId(makeVersionIdInput());
  const id2 = buildPolicyVersionId(makeVersionIdInput());

  it("produces the same ID twice", () => {
    expect(id1).toBe(id2);
  });
});

/* =========================================================
   Scenario 2: confidenceBias change → different ID
   ========================================================= */

describe("buildPolicyVersionId — confidenceBias change → different ID", () => {
  const before = buildPolicyVersionId(makeVersionIdInput({ confidenceBias: 0 }));
  const after = buildPolicyVersionId(makeVersionIdInput({ confidenceBias: -0.3 }));

  it("IDs differ", () => {
    expect(before).not.toBe(after);
  });
});

/* =========================================================
   Scenario 3: escalationBias change → different ID
   ========================================================= */

describe("buildPolicyVersionId — escalationBias change → different ID", () => {
  const before = buildPolicyVersionId(makeVersionIdInput({ escalationBias: 0 }));
  const after = buildPolicyVersionId(makeVersionIdInput({ escalationBias: -0.15 }));

  it("IDs differ", () => {
    expect(before).not.toBe(after);
  });
});

/* =========================================================
   Scenario 4: uncertaintyBias change → different ID
   ========================================================= */

describe("buildPolicyVersionId — uncertaintyBias change → different ID", () => {
  const before = buildPolicyVersionId(makeVersionIdInput({ uncertaintyBias: 0 }));
  const after = buildPolicyVersionId(makeVersionIdInput({ uncertaintyBias: 0.5 }));

  it("IDs differ", () => {
    expect(before).not.toBe(after);
  });
});

/* =========================================================
   Scenario 5: calibrationWindow change → different ID
   ========================================================= */

describe("buildPolicyVersionId — calibrationWindow change → different ID", () => {
  const before = buildPolicyVersionId(makeVersionIdInput({ calibrationWindow: 5 }));
  const after = buildPolicyVersionId(makeVersionIdInput({ calibrationWindow: 10 }));

  it("IDs differ", () => {
    expect(before).not.toBe(after);
  });
});

/* =========================================================
   Scenario 6: basePredictionRule change → different ID
   ========================================================= */

describe("buildPolicyVersionId — basePredictionRule change → different ID", () => {
  const before = buildPolicyVersionId(makeVersionIdInput({ basePredictionRule: "Rule A." }));
  const after = buildPolicyVersionId(makeVersionIdInput({ basePredictionRule: "Rule B." }));

  it("IDs differ", () => {
    expect(before).not.toBe(after);
  });
});

/* =========================================================
   Scenario 7: confidenceRule change → different ID
   ========================================================= */

describe("buildPolicyVersionId — confidenceRule change → different ID", () => {
  const before = buildPolicyVersionId(makeVersionIdInput({ confidenceRule: "Baseline X." }));
  const after = buildPolicyVersionId(makeVersionIdInput({ confidenceRule: "Reduced Y." }));

  it("IDs differ", () => {
    expect(before).not.toBe(after);
  });
});

/* =========================================================
   Scenario 8: escalationRule change → different ID
   ========================================================= */

describe("buildPolicyVersionId — escalationRule change → different ID", () => {
  const before = buildPolicyVersionId(makeVersionIdInput({ escalationRule: "Escalation A." }));
  const after = buildPolicyVersionId(makeVersionIdInput({ escalationRule: "Softened B." }));

  it("IDs differ", () => {
    expect(before).not.toBe(after);
  });
});

/* =========================================================
   Scenario 9: uncertaintyRule change → different ID
   ========================================================= */

describe("buildPolicyVersionId — uncertaintyRule change → different ID", () => {
  const before = buildPolicyVersionId(makeVersionIdInput({ uncertaintyRule: "Baseline." }));
  const after = buildPolicyVersionId(makeVersionIdInput({ uncertaintyRule: "Elevated." }));

  it("IDs differ", () => {
    expect(before).not.toBe(after);
  });
});

/* =========================================================
   Scenario 10: format is "pol-XXXXXXXX"
   ========================================================= */

describe("buildPolicyVersionId — format is 'pol-XXXXXXXX'", () => {
  const id = buildPolicyVersionId(makeVersionIdInput());

  it("starts with 'pol-'", () => {
    expect(id.startsWith("pol-")).toBe(true);
  });

  it("has exactly 12 characters total", () => {
    expect(id.length).toBe(12); // "pol-" + 8 hex chars
  });

  it("remaining 8 chars are hex", () => {
    expect(id.slice(4)).toMatch(/^[0-9a-f]{8}$/);
  });
});

/* =========================================================
   Scenario 11: buildFrozenPolicySnapshot — policyVersionId non-empty
   ========================================================= */

describe("buildFrozenPolicySnapshot — policyVersionId is non-empty", () => {
  const frozen = buildFrozenPolicySnapshot(makeSnapshot(), "2026-01-01T00:00:00.000Z");

  it("policyVersionId is truthy", () => {
    expect(frozen.policyVersionId).toBeTruthy();
  });
});

/* =========================================================
   Scenario 12: buildFrozenPolicySnapshot — createdAt preserved
   ========================================================= */

describe("buildFrozenPolicySnapshot — createdAt preserved", () => {
  const ts = "2026-03-15T08:30:00.000Z";
  const frozen = buildFrozenPolicySnapshot(makeSnapshot(), ts);

  it("createdAt matches input", () => {
    expect(frozen.createdAt).toBe(ts);
  });
});

/* =========================================================
   Scenario 13: rule strings match input
   ========================================================= */

describe("buildFrozenPolicySnapshot — rule strings match input", () => {
  const snap = makeSnapshot();
  const frozen = buildFrozenPolicySnapshot(snap, "2026-01-01T00:00:00.000Z");

  it("basePredictionRule matches", () => {
    expect(frozen.basePredictionRule).toBe(snap.basePredictionRule);
  });

  it("confidenceRule matches", () => {
    expect(frozen.confidenceRule).toBe(snap.confidenceRule);
  });

  it("escalationRule matches", () => {
    expect(frozen.escalationRule).toBe(snap.escalationRule);
  });

  it("uncertaintyRule matches", () => {
    expect(frozen.uncertaintyRule).toBe(snap.uncertaintyRule);
  });
});

/* =========================================================
   Scenario 14: calibrationWindow matches input
   ========================================================= */

describe("buildFrozenPolicySnapshot — calibrationWindow matches input", () => {
  const snap = makeSnapshot({ boundedAdjustmentState: { ...BASE_ADJ, calibrationWindow: 10 } });
  const frozen = buildFrozenPolicySnapshot(snap, "2026-01-01T00:00:00.000Z");

  it("calibrationWindow is 10", () => {
    expect(frozen.calibrationWindow).toBe(10);
  });
});

/* =========================================================
   Scenario 15: boundedAdjustmentState matches input
   ========================================================= */

describe("buildFrozenPolicySnapshot — boundedAdjustmentState matches input", () => {
  const snap = makeSnapshot({
    boundedAdjustmentState: { confidenceBias: -0.3, escalationBias: -0.15, uncertaintyBias: 0.5, calibrationWindow: 5 },
  });
  const frozen = buildFrozenPolicySnapshot(snap, "2026-01-01T00:00:00.000Z");

  it("confidenceBias matches", () => {
    expect(frozen.boundedAdjustmentState.confidenceBias).toBe(-0.3);
  });

  it("escalationBias matches", () => {
    expect(frozen.boundedAdjustmentState.escalationBias).toBe(-0.15);
  });

  it("uncertaintyBias matches", () => {
    expect(frozen.boundedAdjustmentState.uncertaintyBias).toBe(0.5);
  });
});

/* =========================================================
   Scenario 16: calibrationState matches input
   ========================================================= */

describe("buildFrozenPolicySnapshot — calibrationState matches input", () => {
  const snap = makeSnapshot();
  const frozen = buildFrozenPolicySnapshot(snap, "2026-01-01T00:00:00.000Z");

  it("exactMatchRate matches", () => {
    expect(frozen.calibrationState.exactMatchRate).toBe(snap.calibrationState.exactMatchRate);
  });

  it("resolvedPredictions matches", () => {
    expect(frozen.calibrationState.resolvedPredictions).toBe(snap.calibrationState.resolvedPredictions);
  });
});

/* =========================================================
   Scenario 17: explanationLines is a deep copy (not same reference)
   ========================================================= */

describe("buildFrozenPolicySnapshot — explanationLines is a deep copy", () => {
  const snap = makeSnapshot();
  const frozen = buildFrozenPolicySnapshot(snap, "2026-01-01T00:00:00.000Z");

  it("not the same array reference", () => {
    expect(frozen.explanationLines).not.toBe(snap.explanationLines);
  });

  it("contents match", () => {
    expect(frozen.explanationLines).toEqual(snap.explanationLines);
  });

  it("mutating original does not affect frozen", () => {
    snap.explanationLines.push("EXTRA LINE");
    expect(frozen.explanationLines).not.toContain("EXTRA LINE");
  });
});

/* =========================================================
   Scenario 18: identical snapshots produce the same policyVersionId
   ========================================================= */

describe("buildFrozenPolicySnapshot — identical snapshots → same policyVersionId", () => {
  const snap1 = makeSnapshot();
  const snap2 = makeSnapshot();
  const frozen1 = buildFrozenPolicySnapshot(snap1, "2026-01-01T00:00:00.000Z");
  const frozen2 = buildFrozenPolicySnapshot(snap2, "2026-01-02T00:00:00.000Z"); // different createdAt, same policy

  it("policyVersionId is identical", () => {
    expect(frozen1.policyVersionId).toBe(frozen2.policyVersionId);
  });
});

/* =========================================================
   Scenario 19: does not mutate input policySnapshot
   ========================================================= */

describe("buildFrozenPolicySnapshot — does not mutate input", () => {
  const snap = makeSnapshot();
  const originalRule = snap.confidenceRule;
  buildFrozenPolicySnapshot(snap, "2026-01-01T00:00:00.000Z");

  it("confidenceRule unchanged", () => {
    expect(snap.confidenceRule).toBe(originalRule);
  });

  it("explanationLines unchanged", () => {
    expect(snap.explanationLines).toHaveLength(2);
  });
});

/* =========================================================
   Scenario 20: freezePredictionWithPolicy — frozenPolicyVersionId matches
   ========================================================= */

describe("freezePredictionWithPolicy — frozenPolicyVersionId matches snapshot", () => {
  const frozen = makeFrozen();
  const pred = makePrediction();
  const record = freezePredictionWithPolicy(pred, frozen, "ver_001", "2026-01-10T12:00:00.000Z");

  it("frozenPolicyVersionId matches snapshot policyVersionId", () => {
    expect(record.frozenPolicyVersionId).toBe(frozen.policyVersionId);
  });
});

/* =========================================================
   Scenario 21: predictedVariable matches prediction
   ========================================================= */

describe("freezePredictionWithPolicy — predictedVariable matches prediction", () => {
  const frozen = makeFrozen();
  const pred = makePrediction({ predictedVariable: "protein placement violation" });
  const record = freezePredictionWithPolicy(pred, frozen, "ver_001", "2026-01-10T12:00:00.000Z");

  it("predictedVariable matches", () => {
    expect(record.predictedVariable).toBe("protein placement violation");
  });
});

/* =========================================================
   Scenario 22: confidence matches prediction
   ========================================================= */

describe("freezePredictionWithPolicy — confidence matches prediction", () => {
  const frozen = makeFrozen();
  const pred = makePrediction({ confidence: "high" });
  const record = freezePredictionWithPolicy(pred, frozen, "ver_001", "2026-01-10T12:00:00.000Z");

  it("confidence is 'high'", () => {
    expect(record.confidence).toBe("high");
  });
});

/* =========================================================
   Scenario 23: riskDirection matches prediction
   ========================================================= */

describe("freezePredictionWithPolicy — riskDirection matches prediction", () => {
  const frozen = makeFrozen();
  const pred = makePrediction({ riskDirection: "decreasing" });
  const record = freezePredictionWithPolicy(pred, frozen, "ver_001", "2026-01-10T12:00:00.000Z");

  it("riskDirection is 'decreasing'", () => {
    expect(record.riskDirection).toBe("decreasing");
  });
});

/* =========================================================
   Scenario 24: sourceVersionId preserved
   ========================================================= */

describe("freezePredictionWithPolicy — sourceVersionId preserved", () => {
  const frozen = makeFrozen();
  const pred = makePrediction();
  const record = freezePredictionWithPolicy(pred, frozen, "ver_audit_999", "2026-01-10T12:00:00.000Z");

  it("sourceVersionId matches", () => {
    expect(record.sourceVersionId).toBe("ver_audit_999");
  });
});

/* =========================================================
   Scenario 25: predictionTimestamp preserved
   ========================================================= */

describe("freezePredictionWithPolicy — predictionTimestamp preserved", () => {
  const frozen = makeFrozen();
  const pred = makePrediction();
  const ts = "2026-03-21T09:45:00.000Z";
  const record = freezePredictionWithPolicy(pred, frozen, "ver_001", ts);

  it("predictionTimestamp matches", () => {
    expect(record.predictionTimestamp).toBe(ts);
  });
});

/* =========================================================
   Scenario 26: does not mutate prediction or snapshot
   ========================================================= */

describe("freezePredictionWithPolicy — does not mutate inputs", () => {
  const frozen = makeFrozen();
  const pred = makePrediction({ confidence: "moderate" });
  const origVersionId = frozen.policyVersionId;
  freezePredictionWithPolicy(pred, frozen, "ver_001", "2026-01-10T12:00:00.000Z");

  it("frozen.policyVersionId unchanged", () => {
    expect(frozen.policyVersionId).toBe(origVersionId);
  });

  it("pred.confidence unchanged", () => {
    expect(pred.confidence).toBe("moderate");
  });
});

/* =========================================================
   Scenario 27: compareFrozenPolicies — identical → changed=false
   ========================================================= */

describe("compareFrozenPolicies — identical snapshots → changed=false", () => {
  const f1 = makeFrozen();
  const f2 = makeFrozen();
  const result = compareFrozenPolicies(f1, f2);

  it("changed is false", () => {
    expect(result.changed).toBe(false);
  });

  it("changedFields is empty", () => {
    expect(result.changedFields).toHaveLength(0);
  });

  it("biasesChanged is false", () => {
    expect(result.biasesChanged).toBe(false);
  });

  it("calibrationWindowChanged is false", () => {
    expect(result.calibrationWindowChanged).toBe(false);
  });

  it("ruleTextChanged is false", () => {
    expect(result.ruleTextChanged).toBe(false);
  });
});

/* =========================================================
   Scenario 28: compareFrozenPolicies — bias change → biasesChanged=true
   ========================================================= */

describe("compareFrozenPolicies — bias change → biasesChanged=true", () => {
  const before = makeFrozen();
  const after = makeFrozen({ boundedAdjustmentState: { confidenceBias: -0.3, escalationBias: 0, uncertaintyBias: 0 } });
  // Re-derive policyVersionId so changed is computed correctly
  const afterWithId = buildFrozenPolicySnapshot(
    makeSnapshot({ boundedAdjustmentState: { confidenceBias: -0.3, escalationBias: 0, uncertaintyBias: 0, calibrationWindow: 5 } }),
    "2026-01-02T00:00:00.000Z"
  );
  const result = compareFrozenPolicies(before, afterWithId);

  it("biasesChanged is true", () => {
    expect(result.biasesChanged).toBe(true);
  });

  it("changedFields includes 'confidenceBias'", () => {
    expect(result.changedFields).toContain("confidenceBias");
  });

  it("changed is true (different policyVersionId)", () => {
    expect(result.changed).toBe(true);
  });
});

/* =========================================================
   Scenario 29: compareFrozenPolicies — calibrationWindow change
   ========================================================= */

describe("compareFrozenPolicies — calibrationWindow change → calibrationWindowChanged=true", () => {
  const before = buildFrozenPolicySnapshot(makeSnapshot(), "2026-01-01T00:00:00.000Z");
  const after = buildFrozenPolicySnapshot(
    makeSnapshot({ boundedAdjustmentState: { ...BASE_ADJ, calibrationWindow: 10 } }),
    "2026-01-02T00:00:00.000Z"
  );
  const result = compareFrozenPolicies(before, after);

  it("calibrationWindowChanged is true", () => {
    expect(result.calibrationWindowChanged).toBe(true);
  });

  it("changedFields includes 'calibrationWindow'", () => {
    expect(result.changedFields).toContain("calibrationWindow");
  });

  it("changed is true", () => {
    expect(result.changed).toBe(true);
  });
});

/* =========================================================
   Scenario 30: compareFrozenPolicies — rule text change → ruleTextChanged=true
   ========================================================= */

describe("compareFrozenPolicies — rule text change → ruleTextChanged=true, changedFields correct", () => {
  const before = buildFrozenPolicySnapshot(makeSnapshot(), "2026-01-01T00:00:00.000Z");
  const after = buildFrozenPolicySnapshot(
    makeSnapshot({
      confidenceRule: "Calibration-adjusted: confidence is reduced due to weak exact-match rate over the recent window.",
    }),
    "2026-01-02T00:00:00.000Z"
  );
  const result = compareFrozenPolicies(before, after);

  it("ruleTextChanged is true", () => {
    expect(result.ruleTextChanged).toBe(true);
  });

  it("changedFields includes 'confidenceRule'", () => {
    expect(result.changedFields).toContain("confidenceRule");
  });

  it("changed is true", () => {
    expect(result.changed).toBe(true);
  });

  it("biasesChanged is false (only rule text changed)", () => {
    expect(result.biasesChanged).toBe(false);
  });
});
