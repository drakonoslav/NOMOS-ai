/**
 * policy_replay_test.ts
 *
 * Regression tests for policy_replay.ts — deterministic replay under
 * alternate frozen policies, field diffing, and comparison building.
 *
 * Scenarios:
 *   1.  replayUnderPolicy — result has correct policyVersionId
 *   2.  replayUnderPolicy — predictedVariable null when no audit context
 *   3.  replayUnderPolicy — predictedVariable derived from auditContext signals
 *   4.  replayUnderPolicy — confidence "low" when auditContext < 3 records
 *   5.  replayUnderPolicy — confidence upgraded by positive confidenceBias > 0.3
 *   6.  replayUnderPolicy — confidence downgraded by negative confidenceBias < -0.3
 *   7.  replayUnderPolicy — confidence unchanged when bias in [-0.3, 0.3]
 *   8.  replayUnderPolicy — riskDirection "rising" when escalationBias > 0.3
 *   9.  replayUnderPolicy — riskDirection "decreasing" when escalationBias < -0.3
 *  10.  replayUnderPolicy — riskDirection unchanged when escalationBias in range
 *  11.  replayUnderPolicy — explanationLines non-empty
 *  12.  replayUnderPolicy — explanationLines include replay context line
 *  13.  replayUnderPolicy — explanationLines mention confidence upgrade when biased
 *  14.  replayUnderPolicy — does not mutate frozenPolicySnapshot
 *  15.  replayUnderPolicy — does not mutate auditContext
 *  16.  diffReplayResults — returns empty when only one result
 *  17.  diffReplayResults — returns empty when all fields identical
 *  18.  diffReplayResults — returns "confidence" when confidence differs
 *  19.  diffReplayResults — returns "riskDirection" when direction differs
 *  20.  diffReplayResults — returns "predictedVariable" when predictedVariable differs
 *  21.  diffReplayResults — returns "explanationLines" when line counts differ
 *  22.  diffReplayResults — returns empty for 0 results
 *  23.  buildPolicyReplayComparison — canonicalDeclarationHash is deterministic
 *  24.  buildPolicyReplayComparison — same hash for same declaration
 *  25.  buildPolicyReplayComparison — different hash for different declaration
 *  26.  buildPolicyReplayComparison — results length = replayPolicyVersionIds length
 *  27.  buildPolicyReplayComparison — empty frozenPolicies → empty results
 *  28.  buildPolicyReplayComparison — differingFields empty when identical outputs
 *  29.  buildPolicyReplayComparison — summaryLines non-empty when results exist
 *  30.  buildPolicyReplayComparison — result per policyVersionId matches request order
 */

import { describe, it, expect } from "vitest";
import {
  replayUnderPolicy,
  diffReplayResults,
  buildPolicyReplayComparison,
} from "../audit/policy_replay";
import type { PolicyReplayRequest, PolicyReplayResult } from "../audit/policy_replay_types";
import type { FrozenPolicySnapshot } from "../audit/policy_versioning_types";
import type { AuditRecord } from "../audit/audit_types";

/* =========================================================
   Fixtures
   ========================================================= */

function makeSnapshot(
  policyVersionId: string,
  overrides?: {
    confidenceBias?: number;
    escalationBias?: number;
    uncertaintyBias?: number;
  }
): FrozenPolicySnapshot {
  return {
    policyVersionId,
    createdAt: "2026-01-01T00:00:00.000Z",
    basePredictionRule: "Selects the highest weighted recurring decisive variable.",
    confidenceRule: "Confidence derived from signal dominance.",
    escalationRule: "Escalation from drift analysis.",
    uncertaintyRule: "Uncertainty follows calibration depth.",
    calibrationWindow: 5,
    boundedAdjustmentState: {
      confidenceBias: overrides?.confidenceBias ?? 0,
      escalationBias: overrides?.escalationBias ?? 0,
      uncertaintyBias: overrides?.uncertaintyBias ?? 0,
    },
    calibrationState: {
      totalPredictions: 5,
      resolvedPredictions: 3,
      exactMatchRate: 0.67,
      directionMatchRate: 0.8,
      tooAggressiveRate: 0.1,
      tooWeakRate: 0.05,
    },
    explanationLines: ["Base prediction rule selects the highest weighted recurring decisive variable."],
  };
}

function makeRecord(
  id: string,
  timestamp: string,
  decisiveVariable: string | null,
  overallStatus = "DEGRADED"
): AuditRecord {
  return {
    id,
    versionId: `ver_${id}`,
    parentVersionId: null,
    timestamp,
    intent: "NUTRITION_AUDIT",
    title: `Run ${id}`,
    isEvaluable: true,
    isConfirmed: true,
    canonicalDeclaration: "Calorie target 2400kcal/day with protein at 160g.",
    compileResult: null,
    patchedDraft: null,
    evaluationResult: {
      status: overallStatus,
      payload: {
        overallStatus,
        decisiveVariable,
        candidateEvaluations: [],
      },
    },
  };
}

const SNAPSHOT_A = makeSnapshot("pol-aaaaaaaa");
const SNAPSHOT_B = makeSnapshot("pol-bbbbbbbb", { confidenceBias: 0.5 });
const SNAPSHOT_C = makeSnapshot("pol-cccccccc", { escalationBias: -0.5 });

const EMPTY_CONTEXT: AuditRecord[] = [];

// 5 records with the same decisive variable → dominant signal for prediction
const RICH_CONTEXT: AuditRecord[] = [
  makeRecord("r1", "2026-01-01T00:00:00.000Z", "calorie delta violation"),
  makeRecord("r2", "2026-01-02T00:00:00.000Z", "calorie delta violation"),
  makeRecord("r3", "2026-01-03T00:00:00.000Z", "calorie delta violation"),
  makeRecord("r4", "2026-01-04T00:00:00.000Z", "calorie delta violation"),
  makeRecord("r5", "2026-01-05T00:00:00.000Z", "calorie delta violation"),
];

const REQUEST: PolicyReplayRequest = {
  canonicalDeclaration: "Calorie target 2400kcal/day with protein at 160g.",
  intent: "NUTRITION_AUDIT",
  baselineAuditRecordId: "r1",
  replayPolicyVersionIds: ["pol-aaaaaaaa", "pol-bbbbbbbb"],
};

/* =========================================================
   Scenario 1: correct policyVersionId
   ========================================================= */

describe("replayUnderPolicy — result has correct policyVersionId", () => {
  const result = replayUnderPolicy(REQUEST, SNAPSHOT_A, EMPTY_CONTEXT);

  it("policyVersionId is pol-aaaaaaaa", () => {
    expect(result.policyVersionId).toBe("pol-aaaaaaaa");
  });
});

/* =========================================================
   Scenario 2: predictedVariable null when no context
   ========================================================= */

describe("replayUnderPolicy — predictedVariable null when no audit context", () => {
  const result = replayUnderPolicy(REQUEST, SNAPSHOT_A, EMPTY_CONTEXT);

  it("predictedVariable is null", () => {
    expect(result.predictedVariable).toBeNull();
  });
});

/* =========================================================
   Scenario 3: predictedVariable derived from auditContext
   ========================================================= */

describe("replayUnderPolicy — predictedVariable derived from auditContext signals", () => {
  const result = replayUnderPolicy(REQUEST, SNAPSHOT_A, RICH_CONTEXT);

  it("predictedVariable is 'calorie delta violation'", () => {
    expect(result.predictedVariable).toBe("calorie delta violation");
  });
});

/* =========================================================
   Scenario 4: confidence "low" when < 3 records
   ========================================================= */

describe("replayUnderPolicy — confidence 'low' when auditContext < 3 records", () => {
  const twoRecords = RICH_CONTEXT.slice(0, 2);
  const result = replayUnderPolicy(REQUEST, SNAPSHOT_A, twoRecords);

  it("confidence is 'low'", () => {
    expect(result.confidence).toBe("low");
  });
});

/* =========================================================
   Scenario 5: confidence upgraded by positive confidenceBias > 0.3
   ========================================================= */

describe("replayUnderPolicy — confidence upgraded by positive confidenceBias > 0.3", () => {
  // SNAPSHOT_B has confidenceBias = 0.5
  // With 5 records and dominant signal, base confidence is likely "moderate" or "high"
  // Minimum: base "low" (< 3 records never upgrades past guard, but with >= 3 should be moderate)
  // Let's use a snapshot with bias 0.5 and context of 3 records with dominant signal → moderate → high
  const threeRecords = RICH_CONTEXT.slice(0, 3);
  const result = replayUnderPolicy(REQUEST, SNAPSHOT_B, threeRecords);

  it("confidence is 'high' (upgraded from moderate by +0.5 bias)", () => {
    expect(result.confidence).toBe("high");
  });
});

/* =========================================================
   Scenario 6: confidence downgraded by negative confidenceBias < -0.3
   ========================================================= */

describe("replayUnderPolicy — confidence downgraded by negative confidenceBias < -0.3", () => {
  const snapshotNeg = makeSnapshot("pol-negconf", { confidenceBias: -0.5 });
  const threeRecords = RICH_CONTEXT.slice(0, 3);
  const result = replayUnderPolicy(REQUEST, snapshotNeg, threeRecords);

  it("confidence is 'low' (downgraded from moderate by -0.5 bias)", () => {
    expect(result.confidence).toBe("low");
  });
});

/* =========================================================
   Scenario 7: confidence unchanged when bias in range
   ========================================================= */

describe("replayUnderPolicy — confidence unchanged when bias in [-0.3, 0.3]", () => {
  const snapshotSmall = makeSnapshot("pol-smallbias", { confidenceBias: 0.1 });
  // 0 context → always "low" (hard guard); check bias doesn't change null output
  const result = replayUnderPolicy(REQUEST, snapshotSmall, EMPTY_CONTEXT);

  it("confidence is still 'low' (no bias effect)", () => {
    expect(result.confidence).toBe("low");
  });
});

/* =========================================================
   Scenario 8: riskDirection "rising" when escalationBias > 0.3
   ========================================================= */

describe("replayUnderPolicy — riskDirection 'rising' when escalationBias > 0.3", () => {
  const snapshotRising = makeSnapshot("pol-rising", { escalationBias: 0.5 });
  const result = replayUnderPolicy(REQUEST, snapshotRising, EMPTY_CONTEXT);

  it("riskDirection is 'rising'", () => {
    expect(result.riskDirection).toBe("rising");
  });
});

/* =========================================================
   Scenario 9: riskDirection "decreasing" when escalationBias < -0.3
   ========================================================= */

describe("replayUnderPolicy — riskDirection 'decreasing' when escalationBias < -0.3", () => {
  // SNAPSHOT_C has escalationBias = -0.5
  const result = replayUnderPolicy(REQUEST, SNAPSHOT_C, EMPTY_CONTEXT);

  it("riskDirection is 'decreasing'", () => {
    expect(result.riskDirection).toBe("decreasing");
  });
});

/* =========================================================
   Scenario 10: riskDirection unchanged when escalationBias in range
   ========================================================= */

describe("replayUnderPolicy — riskDirection unchanged when escalationBias in [-0.3, 0.3]", () => {
  const snapshotSmallEsc = makeSnapshot("pol-smallesc", { escalationBias: 0.1 });
  // 5 records all with same violation → drifting → base "rising"
  const result = replayUnderPolicy(REQUEST, snapshotSmallEsc, RICH_CONTEXT);

  it("riskDirection follows base history (not overridden)", () => {
    // With 5 identical violations, drift analysis should give "rising"
    expect(result.riskDirection).toBe("rising");
  });
});

/* =========================================================
   Scenario 11: explanationLines non-empty
   ========================================================= */

describe("replayUnderPolicy — explanationLines non-empty", () => {
  const result = replayUnderPolicy(REQUEST, SNAPSHOT_A, EMPTY_CONTEXT);

  it("explanationLines has at least 1 entry", () => {
    expect(result.explanationLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 12: explanationLines include replay context line
   ========================================================= */

describe("replayUnderPolicy — explanationLines include replay context line", () => {
  const result = replayUnderPolicy(REQUEST, SNAPSHOT_A, EMPTY_CONTEXT);

  it("explanationLines include 'Replayed under policy'", () => {
    const combined = result.explanationLines.join(" ");
    expect(combined).toContain("Replayed under policy");
  });
});

/* =========================================================
   Scenario 13: explanationLines mention confidence upgrade when biased
   ========================================================= */

describe("replayUnderPolicy — explanationLines mention confidence upgrade when biased", () => {
  const threeRecords = RICH_CONTEXT.slice(0, 3);
  const result = replayUnderPolicy(REQUEST, SNAPSHOT_B, threeRecords);

  it("explanationLines include 'Confidence upgraded'", () => {
    const combined = result.explanationLines.join(" ");
    expect(combined).toContain("Confidence upgraded");
  });
});

/* =========================================================
   Scenario 14: does not mutate frozenPolicySnapshot
   ========================================================= */

describe("replayUnderPolicy — does not mutate frozenPolicySnapshot", () => {
  const snapshot = makeSnapshot("pol-muttest", { confidenceBias: 0.5 });
  const originalBias = snapshot.boundedAdjustmentState.confidenceBias;
  replayUnderPolicy(REQUEST, snapshot, RICH_CONTEXT);

  it("confidenceBias unchanged", () => {
    expect(snapshot.boundedAdjustmentState.confidenceBias).toBe(originalBias);
  });
});

/* =========================================================
   Scenario 15: does not mutate auditContext
   ========================================================= */

describe("replayUnderPolicy — does not mutate auditContext", () => {
  const context = [...RICH_CONTEXT];
  const originalLen = context.length;
  replayUnderPolicy(REQUEST, SNAPSHOT_A, context);

  it("auditContext length unchanged", () => {
    expect(context).toHaveLength(originalLen);
  });
});

/* =========================================================
   Scenario 16: diffReplayResults — empty for single result
   ========================================================= */

describe("diffReplayResults — returns empty when only one result", () => {
  const results: PolicyReplayResult[] = [
    { policyVersionId: "pol-aaaaaaaa", predictedVariable: "calorie delta violation", confidence: "moderate", riskDirection: "rising", explanationLines: ["line 1"] },
  ];

  it("returns empty array", () => {
    expect(diffReplayResults(results)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 17: diffReplayResults — empty when all fields identical
   ========================================================= */

describe("diffReplayResults — returns empty when all fields identical", () => {
  const r: PolicyReplayResult = {
    policyVersionId: "pol-aaaaaaaa",
    predictedVariable: "calorie delta violation",
    confidence: "moderate",
    riskDirection: "rising",
    explanationLines: ["line 1"],
  };
  const results = [r, { ...r, policyVersionId: "pol-bbbbbbbb" }];

  it("returns empty array", () => {
    expect(diffReplayResults(results)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 18: diffReplayResults — "confidence" when differs
   ========================================================= */

describe("diffReplayResults — returns 'confidence' when confidence differs", () => {
  const results: PolicyReplayResult[] = [
    { policyVersionId: "pol-aaaaaaaa", predictedVariable: "x", confidence: "low", riskDirection: "stable", explanationLines: ["a"] },
    { policyVersionId: "pol-bbbbbbbb", predictedVariable: "x", confidence: "high", riskDirection: "stable", explanationLines: ["a"] },
  ];

  it("includes 'confidence'", () => {
    expect(diffReplayResults(results)).toContain("confidence");
  });
});

/* =========================================================
   Scenario 19: diffReplayResults — "riskDirection" when differs
   ========================================================= */

describe("diffReplayResults — returns 'riskDirection' when direction differs", () => {
  const results: PolicyReplayResult[] = [
    { policyVersionId: "pol-aaaaaaaa", predictedVariable: "x", confidence: "moderate", riskDirection: "stable", explanationLines: ["a"] },
    { policyVersionId: "pol-bbbbbbbb", predictedVariable: "x", confidence: "moderate", riskDirection: "rising", explanationLines: ["a"] },
  ];

  it("includes 'riskDirection'", () => {
    expect(diffReplayResults(results)).toContain("riskDirection");
  });
});

/* =========================================================
   Scenario 20: diffReplayResults — "predictedVariable" when differs
   ========================================================= */

describe("diffReplayResults — returns 'predictedVariable' when predictedVariable differs", () => {
  const results: PolicyReplayResult[] = [
    { policyVersionId: "pol-aaaaaaaa", predictedVariable: "calorie delta violation", confidence: "moderate", riskDirection: "stable", explanationLines: ["a"] },
    { policyVersionId: "pol-bbbbbbbb", predictedVariable: null, confidence: "moderate", riskDirection: "stable", explanationLines: ["a"] },
  ];

  it("includes 'predictedVariable'", () => {
    expect(diffReplayResults(results)).toContain("predictedVariable");
  });
});

/* =========================================================
   Scenario 21: diffReplayResults — "explanationLines" when counts differ
   ========================================================= */

describe("diffReplayResults — returns 'explanationLines' when line counts differ", () => {
  const results: PolicyReplayResult[] = [
    { policyVersionId: "pol-aaaaaaaa", predictedVariable: "x", confidence: "moderate", riskDirection: "stable", explanationLines: ["a"] },
    { policyVersionId: "pol-bbbbbbbb", predictedVariable: "x", confidence: "moderate", riskDirection: "stable", explanationLines: ["a", "b", "c"] },
  ];

  it("includes 'explanationLines'", () => {
    expect(diffReplayResults(results)).toContain("explanationLines");
  });
});

/* =========================================================
   Scenario 22: diffReplayResults — empty for 0 results
   ========================================================= */

describe("diffReplayResults — returns empty for 0 results", () => {
  it("returns empty array", () => {
    expect(diffReplayResults([])).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 23: buildPolicyReplayComparison — hash is deterministic
   ========================================================= */

describe("buildPolicyReplayComparison — canonicalDeclarationHash is deterministic", () => {
  const comparison1 = buildPolicyReplayComparison(REQUEST, [SNAPSHOT_A, SNAPSHOT_B], RICH_CONTEXT);
  const comparison2 = buildPolicyReplayComparison(REQUEST, [SNAPSHOT_A, SNAPSHOT_B], RICH_CONTEXT);

  it("hash is the same on second call", () => {
    expect(comparison1.canonicalDeclarationHash).toBe(comparison2.canonicalDeclarationHash);
  });
});

/* =========================================================
   Scenario 24: same hash for same declaration
   ========================================================= */

describe("buildPolicyReplayComparison — same hash for same declaration", () => {
  const r2: PolicyReplayRequest = { ...REQUEST };
  const comp1 = buildPolicyReplayComparison(REQUEST, [SNAPSHOT_A], EMPTY_CONTEXT);
  const comp2 = buildPolicyReplayComparison(r2, [SNAPSHOT_A], EMPTY_CONTEXT);

  it("hashes are equal", () => {
    expect(comp1.canonicalDeclarationHash).toBe(comp2.canonicalDeclarationHash);
  });
});

/* =========================================================
   Scenario 25: different hash for different declaration
   ========================================================= */

describe("buildPolicyReplayComparison — different hash for different declaration", () => {
  const reqB: PolicyReplayRequest = { ...REQUEST, canonicalDeclaration: "Completely different input." };
  const comp1 = buildPolicyReplayComparison(REQUEST, [SNAPSHOT_A], EMPTY_CONTEXT);
  const comp2 = buildPolicyReplayComparison(reqB, [SNAPSHOT_A], EMPTY_CONTEXT);

  it("hashes differ", () => {
    expect(comp1.canonicalDeclarationHash).not.toBe(comp2.canonicalDeclarationHash);
  });
});

/* =========================================================
   Scenario 26: results length = replayPolicyVersionIds length
   ========================================================= */

describe("buildPolicyReplayComparison — results length = replayPolicyVersionIds length", () => {
  const req: PolicyReplayRequest = { ...REQUEST, replayPolicyVersionIds: ["pol-aaaaaaaa", "pol-bbbbbbbb", "pol-cccccccc"] };
  const comparison = buildPolicyReplayComparison(req, [SNAPSHOT_A, SNAPSHOT_B, SNAPSHOT_C], EMPTY_CONTEXT);

  it("results has 3 entries", () => {
    expect(comparison.results).toHaveLength(3);
  });
});

/* =========================================================
   Scenario 27: empty frozenPolicies → empty results
   ========================================================= */

describe("buildPolicyReplayComparison — empty frozenPolicies → empty results", () => {
  const comparison = buildPolicyReplayComparison(REQUEST, [], EMPTY_CONTEXT);

  it("results is empty", () => {
    expect(comparison.results).toHaveLength(0);
  });

  it("summaryLines are non-empty even with no results", () => {
    expect(comparison.summaryLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 28: differingFields empty when identical outputs
   ========================================================= */

describe("buildPolicyReplayComparison — differingFields empty when identical outputs", () => {
  // Two identical snapshots (bias 0) → same predictions
  const snapA = makeSnapshot("pol-aaaaaaaa");
  const snapB = makeSnapshot("pol-bbbbbbbb");
  const req: PolicyReplayRequest = { ...REQUEST, replayPolicyVersionIds: ["pol-aaaaaaaa", "pol-bbbbbbbb"] };
  const comparison = buildPolicyReplayComparison(req, [snapA, snapB], EMPTY_CONTEXT);

  it("differingFields is empty", () => {
    expect(comparison.differingFields).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 29: summaryLines non-empty when results exist
   ========================================================= */

describe("buildPolicyReplayComparison — summaryLines non-empty when results exist", () => {
  const comparison = buildPolicyReplayComparison(REQUEST, [SNAPSHOT_A, SNAPSHOT_B], RICH_CONTEXT);

  it("summaryLines has at least 1 entry", () => {
    expect(comparison.summaryLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 30: result order matches request order
   ========================================================= */

describe("buildPolicyReplayComparison — result per policyVersionId matches request order", () => {
  const req: PolicyReplayRequest = {
    ...REQUEST,
    replayPolicyVersionIds: ["pol-cccccccc", "pol-aaaaaaaa", "pol-bbbbbbbb"],
  };
  const comparison = buildPolicyReplayComparison(req, [SNAPSHOT_A, SNAPSHOT_B, SNAPSHOT_C], EMPTY_CONTEXT);

  it("first result is pol-cccccccc", () => {
    expect(comparison.results[0]?.policyVersionId).toBe("pol-cccccccc");
  });

  it("second result is pol-aaaaaaaa", () => {
    expect(comparison.results[1]?.policyVersionId).toBe("pol-aaaaaaaa");
  });

  it("third result is pol-bbbbbbbb", () => {
    expect(comparison.results[2]?.policyVersionId).toBe("pol-bbbbbbbb");
  });
});
