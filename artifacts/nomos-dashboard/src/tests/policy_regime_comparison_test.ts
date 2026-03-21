/**
 * policy_regime_comparison_test.ts
 *
 * Regression tests for policy_regime_comparison.ts — deterministic policy
 * regime grouping, metric computation, and pairwise comparison.
 *
 * Scenarios:
 *   1.  buildPolicyRegimeMetrics — empty → returns empty array
 *   2.  buildPolicyRegimeMetrics — single record: totalPredictions = 1
 *   3.  buildPolicyRegimeMetrics — single record: resolvedPredictions from calibrationState
 *   4.  buildPolicyRegimeMetrics — single record: exactMatchRate from calibrationState
 *   5.  buildPolicyRegimeMetrics — two regimes: separate groups
 *   6.  buildPolicyRegimeMetrics — two regimes: each has correct totalPredictions
 *   7.  buildPolicyRegimeMetrics — averageConfidenceScore: high → 1.0
 *   8.  buildPolicyRegimeMetrics — averageConfidenceScore: mixed (high+low) = 0.5
 *   9.  buildPolicyRegimeMetrics — averageEscalationBias computed correctly
 *  10.  buildPolicyRegimeMetrics — averageUncertaintyBias computed correctly
 *  11.  buildPolicyRegimeMetrics — nutrition keyword → nutritionPredictionCount++
 *  12.  buildPolicyRegimeMetrics — training keyword → trainingPredictionCount++
 *  13.  buildPolicyRegimeMetrics — schedule keyword → schedulePredictionCount++
 *  14.  buildPolicyRegimeMetrics — null predictedVariable → no domain count
 *  15.  buildPolicyRegimeMetrics — regimes in chronological order of first seen
 *  16.  comparePolicyRegimes — exactMatchDelta = after - before
 *  17.  comparePolicyRegimes — directionMatchDelta = after - before
 *  18.  comparePolicyRegimes — tooAggressiveDelta = after - before
 *  19.  comparePolicyRegimes — tooWeakDelta = after - before
 *  20.  comparePolicyRegimes — null before.exactMatchRate → exactMatchDelta null
 *  21.  comparePolicyRegimes — null after.exactMatchRate → exactMatchDelta null
 *  22.  comparePolicyRegimes — changed = true when IDs differ
 *  23.  comparePolicyRegimes — summaryLines non-empty
 *  24.  comparePolicyRegimes — summaryLines mention improvement when exactMatchDelta > 0.02
 *  25.  comparePolicyRegimes — summaryLines mention reduction when tooAggressiveDelta < -0.02
 *  26.  buildPolicyRegimeComparisonReport — empty → empty regimes, empty pairwise
 *  27.  buildPolicyRegimeComparisonReport — single regime → no pairwise comparisons
 *  28.  buildPolicyRegimeComparisonReport — two regimes → one pairwise comparison
 *  29.  buildPolicyRegimeComparisonReport — bestByExactMatch is correct policyVersionId
 *  30.  buildPolicyRegimeComparisonReport — all null rates → bestByExactMatch null
 */

import { describe, it, expect } from "vitest";
import {
  buildPolicyRegimeMetrics,
  comparePolicyRegimes,
  buildPolicyRegimeComparisonReport,
} from "../audit/policy_regime_comparison";
import type { FrozenPredictionRecord, FrozenPolicySnapshot } from "../audit/policy_versioning_types";
import type { PolicyRegimeMetrics } from "../audit/policy_regime_comparison_types";

/* =========================================================
   Fixtures
   ========================================================= */

let _seq = 0;

function makeSnapshot(
  policyVersionId: string,
  overrides?: {
    escalationBias?: number;
    uncertaintyBias?: number;
    exactMatchRate?: number | null;
    directionMatchRate?: number | null;
    tooAggressiveRate?: number | null;
    tooWeakRate?: number | null;
    resolvedPredictions?: number;
    totalPredictions?: number;
  }
): FrozenPolicySnapshot {
  return {
    policyVersionId,
    createdAt: `2026-01-0${(_seq % 9) + 1}T00:00:00.000Z`,
    basePredictionRule: "Selects the highest weighted recurring decisive variable from audit history.",
    confidenceRule: "Baseline: confidence is derived from signal dominance.",
    escalationRule: "Baseline: escalation from drift analysis.",
    uncertaintyRule: "Baseline: uncertainty follows calibration depth.",
    calibrationWindow: 5,
    boundedAdjustmentState: {
      confidenceBias: 0,
      escalationBias: overrides?.escalationBias ?? 0,
      uncertaintyBias: overrides?.uncertaintyBias ?? 0,
    },
    calibrationState: {
      totalPredictions: overrides?.totalPredictions ?? 5,
      resolvedPredictions: overrides?.resolvedPredictions ?? 3,
      exactMatchRate: overrides?.exactMatchRate !== undefined ? overrides.exactMatchRate : 0.67,
      directionMatchRate: overrides?.directionMatchRate !== undefined ? overrides.directionMatchRate : 0.8,
      tooAggressiveRate: overrides?.tooAggressiveRate !== undefined ? overrides.tooAggressiveRate : 0.1,
      tooWeakRate: overrides?.tooWeakRate !== undefined ? overrides.tooWeakRate : 0.05,
    },
    explanationLines: ["Base prediction rule selects the highest weighted recurring decisive variable."],
  };
}

function makeFrozenRecord(
  policyVersionId: string,
  confidence: "low" | "moderate" | "high",
  predictedVariable: string | null,
  timestamp: string,
  snapshotOverrides?: {
    escalationBias?: number;
    uncertaintyBias?: number;
    exactMatchRate?: number | null;
    directionMatchRate?: number | null;
    tooAggressiveRate?: number | null;
    tooWeakRate?: number | null;
    resolvedPredictions?: number;
  }
): FrozenPredictionRecord {
  _seq++;
  return {
    sourceVersionId: `ver_${_seq}`,
    predictionTimestamp: timestamp,
    predictedVariable,
    confidence,
    riskDirection: "rising",
    frozenPolicyVersionId: policyVersionId,
    frozenPolicySnapshot: makeSnapshot(policyVersionId, snapshotOverrides),
  };
}

function makeMetrics(
  policyVersionId: string,
  overrides?: Partial<PolicyRegimeMetrics>
): PolicyRegimeMetrics {
  return {
    policyVersionId,
    totalPredictions: 5,
    resolvedPredictions: 3,
    exactMatchRate: 0.67,
    directionMatchRate: 0.8,
    tooAggressiveRate: 0.1,
    tooWeakRate: 0.05,
    averageConfidenceScore: 0.5,
    averageEscalationBias: 0,
    averageUncertaintyBias: 0,
    nutritionPredictionCount: 0,
    trainingPredictionCount: 0,
    schedulePredictionCount: 0,
    ...overrides,
  };
}

/* =========================================================
   Scenario 1: empty → empty array
   ========================================================= */

describe("buildPolicyRegimeMetrics — empty → returns empty array", () => {
  const result = buildPolicyRegimeMetrics([]);

  it("returns empty array", () => {
    expect(result).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 2: single record: totalPredictions = 1
   ========================================================= */

describe("buildPolicyRegimeMetrics — single record: totalPredictions = 1", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "moderate", "calorie delta violation", "2026-01-01T00:00:00.000Z"),
  ];
  const result = buildPolicyRegimeMetrics(records);

  it("produces one regime", () => {
    expect(result).toHaveLength(1);
  });

  it("totalPredictions is 1", () => {
    expect(result[0].totalPredictions).toBe(1);
  });
});

/* =========================================================
   Scenario 3: resolvedPredictions from calibrationState
   ========================================================= */

describe("buildPolicyRegimeMetrics — resolvedPredictions from last record's calibrationState", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "moderate", "calorie delta violation", "2026-01-01T00:00:00.000Z", { resolvedPredictions: 7 }),
  ];
  const result = buildPolicyRegimeMetrics(records);

  it("resolvedPredictions is 7", () => {
    expect(result[0].resolvedPredictions).toBe(7);
  });
});

/* =========================================================
   Scenario 4: exactMatchRate from calibrationState
   ========================================================= */

describe("buildPolicyRegimeMetrics — exactMatchRate from last record's calibrationState", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "high", "calorie delta violation", "2026-01-01T00:00:00.000Z", { exactMatchRate: 0.85 }),
  ];
  const result = buildPolicyRegimeMetrics(records);

  it("exactMatchRate is 0.85", () => {
    expect(result[0].exactMatchRate).toBeCloseTo(0.85, 5);
  });
});

/* =========================================================
   Scenario 5: two regimes: separate groups
   ========================================================= */

describe("buildPolicyRegimeMetrics — two regimes: separate groups", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "moderate", "calorie delta violation", "2026-01-01T00:00:00.000Z"),
    makeFrozenRecord("pol-bbbbbbbb", "high", "protein placement violation", "2026-01-02T00:00:00.000Z"),
  ];
  const result = buildPolicyRegimeMetrics(records);

  it("produces two regimes", () => {
    expect(result).toHaveLength(2);
  });

  it("first regime is pol-aaaaaaaa", () => {
    expect(result[0].policyVersionId).toBe("pol-aaaaaaaa");
  });

  it("second regime is pol-bbbbbbbb", () => {
    expect(result[1].policyVersionId).toBe("pol-bbbbbbbb");
  });
});

/* =========================================================
   Scenario 6: two regimes: each has correct totalPredictions
   ========================================================= */

describe("buildPolicyRegimeMetrics — two regimes: each has correct totalPredictions", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "moderate", "calorie delta violation", "2026-01-01T00:00:00.000Z"),
    makeFrozenRecord("pol-aaaaaaaa", "low", "calorie delta violation", "2026-01-02T00:00:00.000Z"),
    makeFrozenRecord("pol-bbbbbbbb", "high", "protein placement violation", "2026-01-03T00:00:00.000Z"),
  ];
  const result = buildPolicyRegimeMetrics(records);

  it("pol-aaaaaaaa has 2 predictions", () => {
    const r = result.find((x) => x.policyVersionId === "pol-aaaaaaaa")!;
    expect(r.totalPredictions).toBe(2);
  });

  it("pol-bbbbbbbb has 1 prediction", () => {
    const r = result.find((x) => x.policyVersionId === "pol-bbbbbbbb")!;
    expect(r.totalPredictions).toBe(1);
  });
});

/* =========================================================
   Scenario 7: averageConfidenceScore: high → 1.0
   ========================================================= */

describe("buildPolicyRegimeMetrics — averageConfidenceScore: high → 1.0", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "high", "calorie delta violation", "2026-01-01T00:00:00.000Z"),
  ];
  const result = buildPolicyRegimeMetrics(records);

  it("averageConfidenceScore is 1.0", () => {
    expect(result[0].averageConfidenceScore).toBeCloseTo(1.0, 5);
  });
});

/* =========================================================
   Scenario 8: averageConfidenceScore: mixed (high+low) = 0.5
   ========================================================= */

describe("buildPolicyRegimeMetrics — averageConfidenceScore: high + low = 0.5", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "high", "calorie delta violation", "2026-01-01T00:00:00.000Z"),
    makeFrozenRecord("pol-aaaaaaaa", "low", "calorie delta violation", "2026-01-02T00:00:00.000Z"),
  ];
  const result = buildPolicyRegimeMetrics(records);

  it("averageConfidenceScore is 0.5", () => {
    expect(result[0].averageConfidenceScore).toBeCloseTo(0.5, 5);
  });
});

/* =========================================================
   Scenario 9: averageEscalationBias
   ========================================================= */

describe("buildPolicyRegimeMetrics — averageEscalationBias computed correctly", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "moderate", "calorie delta violation", "2026-01-01T00:00:00.000Z", { escalationBias: -0.2 }),
    makeFrozenRecord("pol-aaaaaaaa", "moderate", "calorie delta violation", "2026-01-02T00:00:00.000Z", { escalationBias: -0.4 }),
  ];
  const result = buildPolicyRegimeMetrics(records);

  it("averageEscalationBias is -0.3", () => {
    expect(result[0].averageEscalationBias).toBeCloseTo(-0.3, 5);
  });
});

/* =========================================================
   Scenario 10: averageUncertaintyBias
   ========================================================= */

describe("buildPolicyRegimeMetrics — averageUncertaintyBias computed correctly", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "moderate", "calorie delta violation", "2026-01-01T00:00:00.000Z", { uncertaintyBias: 0.5 }),
    makeFrozenRecord("pol-aaaaaaaa", "moderate", "calorie delta violation", "2026-01-02T00:00:00.000Z", { uncertaintyBias: 1.0 }),
  ];
  const result = buildPolicyRegimeMetrics(records);

  it("averageUncertaintyBias is 0.75", () => {
    expect(result[0].averageUncertaintyBias).toBeCloseTo(0.75, 5);
  });
});

/* =========================================================
   Scenario 11: nutrition keyword → nutritionPredictionCount
   ========================================================= */

describe("buildPolicyRegimeMetrics — nutrition keyword → nutritionPredictionCount++", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "moderate", "calorie delta violation", "2026-01-01T00:00:00.000Z"),
    makeFrozenRecord("pol-aaaaaaaa", "moderate", "protein placement violation", "2026-01-02T00:00:00.000Z"),
  ];
  const result = buildPolicyRegimeMetrics(records);

  it("nutritionPredictionCount is 2", () => {
    expect(result[0].nutritionPredictionCount).toBe(2);
  });
});

/* =========================================================
   Scenario 12: training keyword → trainingPredictionCount
   ========================================================= */

describe("buildPolicyRegimeMetrics — training keyword → trainingPredictionCount++", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "moderate", "training volume violation", "2026-01-01T00:00:00.000Z"),
  ];
  const result = buildPolicyRegimeMetrics(records);

  it("trainingPredictionCount is 1", () => {
    expect(result[0].trainingPredictionCount).toBe(1);
  });
});

/* =========================================================
   Scenario 13: schedule keyword → schedulePredictionCount
   ========================================================= */

describe("buildPolicyRegimeMetrics — schedule keyword → schedulePredictionCount++", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "moderate", "schedule interval violation", "2026-01-01T00:00:00.000Z"),
  ];
  const result = buildPolicyRegimeMetrics(records);

  it("schedulePredictionCount is 1", () => {
    expect(result[0].schedulePredictionCount).toBe(1);
  });
});

/* =========================================================
   Scenario 14: null predictedVariable → no domain count
   ========================================================= */

describe("buildPolicyRegimeMetrics — null predictedVariable → no domain count", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "low", null, "2026-01-01T00:00:00.000Z"),
  ];
  const result = buildPolicyRegimeMetrics(records);

  it("nutritionPredictionCount is 0", () => {
    expect(result[0].nutritionPredictionCount).toBe(0);
  });

  it("trainingPredictionCount is 0", () => {
    expect(result[0].trainingPredictionCount).toBe(0);
  });
});

/* =========================================================
   Scenario 15: regimes in chronological order of first seen
   ========================================================= */

describe("buildPolicyRegimeMetrics — regimes in chronological order", () => {
  const records = [
    makeFrozenRecord("pol-bbbbbbbb", "moderate", null, "2026-01-03T00:00:00.000Z"),
    makeFrozenRecord("pol-aaaaaaaa", "moderate", null, "2026-01-01T00:00:00.000Z"),
    makeFrozenRecord("pol-cccccccc", "moderate", null, "2026-01-05T00:00:00.000Z"),
    makeFrozenRecord("pol-aaaaaaaa", "moderate", null, "2026-01-02T00:00:00.000Z"),
  ];
  const result = buildPolicyRegimeMetrics(records);

  it("first regime is pol-aaaaaaaa (first seen: Jan 1)", () => {
    expect(result[0].policyVersionId).toBe("pol-aaaaaaaa");
  });

  it("second regime is pol-bbbbbbbb (first seen: Jan 3)", () => {
    expect(result[1].policyVersionId).toBe("pol-bbbbbbbb");
  });

  it("third regime is pol-cccccccc (first seen: Jan 5)", () => {
    expect(result[2].policyVersionId).toBe("pol-cccccccc");
  });
});

/* =========================================================
   Scenario 16: comparePolicyRegimes — exactMatchDelta = after - before
   ========================================================= */

describe("comparePolicyRegimes — exactMatchDelta = after - before", () => {
  const before = makeMetrics("pol-aaaaaaaa", { exactMatchRate: 0.6 });
  const after = makeMetrics("pol-bbbbbbbb", { exactMatchRate: 0.8 });
  const result = comparePolicyRegimes(before, after);

  it("exactMatchDelta is 0.2", () => {
    expect(result.exactMatchDelta).toBeCloseTo(0.2, 5);
  });
});

/* =========================================================
   Scenario 17: comparePolicyRegimes — directionMatchDelta = after - before
   ========================================================= */

describe("comparePolicyRegimes — directionMatchDelta = after - before", () => {
  const before = makeMetrics("pol-aaaaaaaa", { directionMatchRate: 0.7 });
  const after = makeMetrics("pol-bbbbbbbb", { directionMatchRate: 0.5 });
  const result = comparePolicyRegimes(before, after);

  it("directionMatchDelta is -0.2", () => {
    expect(result.directionMatchDelta).toBeCloseTo(-0.2, 5);
  });
});

/* =========================================================
   Scenario 18: comparePolicyRegimes — tooAggressiveDelta = after - before
   ========================================================= */

describe("comparePolicyRegimes — tooAggressiveDelta = after - before", () => {
  const before = makeMetrics("pol-aaaaaaaa", { tooAggressiveRate: 0.4 });
  const after = makeMetrics("pol-bbbbbbbb", { tooAggressiveRate: 0.2 });
  const result = comparePolicyRegimes(before, after);

  it("tooAggressiveDelta is -0.2", () => {
    expect(result.tooAggressiveDelta).toBeCloseTo(-0.2, 5);
  });
});

/* =========================================================
   Scenario 19: comparePolicyRegimes — tooWeakDelta = after - before
   ========================================================= */

describe("comparePolicyRegimes — tooWeakDelta = after - before", () => {
  const before = makeMetrics("pol-aaaaaaaa", { tooWeakRate: 0.1 });
  const after = makeMetrics("pol-bbbbbbbb", { tooWeakRate: 0.25 });
  const result = comparePolicyRegimes(before, after);

  it("tooWeakDelta is 0.15", () => {
    expect(result.tooWeakDelta).toBeCloseTo(0.15, 5);
  });
});

/* =========================================================
   Scenario 20: null before.exactMatchRate → exactMatchDelta null
   ========================================================= */

describe("comparePolicyRegimes — null before.exactMatchRate → exactMatchDelta null", () => {
  const before = makeMetrics("pol-aaaaaaaa", { exactMatchRate: null });
  const after = makeMetrics("pol-bbbbbbbb", { exactMatchRate: 0.8 });
  const result = comparePolicyRegimes(before, after);

  it("exactMatchDelta is null", () => {
    expect(result.exactMatchDelta).toBeNull();
  });
});

/* =========================================================
   Scenario 21: null after.exactMatchRate → exactMatchDelta null
   ========================================================= */

describe("comparePolicyRegimes — null after.exactMatchRate → exactMatchDelta null", () => {
  const before = makeMetrics("pol-aaaaaaaa", { exactMatchRate: 0.6 });
  const after = makeMetrics("pol-bbbbbbbb", { exactMatchRate: null });
  const result = comparePolicyRegimes(before, after);

  it("exactMatchDelta is null", () => {
    expect(result.exactMatchDelta).toBeNull();
  });
});

/* =========================================================
   Scenario 22: changed = true when IDs differ
   ========================================================= */

describe("comparePolicyRegimes — changed = true when IDs differ", () => {
  const before = makeMetrics("pol-aaaaaaaa");
  const after = makeMetrics("pol-bbbbbbbb");
  const result = comparePolicyRegimes(before, after);

  it("changed is true", () => {
    expect(result.changed).toBe(true);
  });

  const sameBefore = makeMetrics("pol-aaaaaaaa");
  const sameAfter = makeMetrics("pol-aaaaaaaa");
  const sameResult = comparePolicyRegimes(sameBefore, sameAfter);

  it("changed is false when IDs match", () => {
    expect(sameResult.changed).toBe(false);
  });
});

/* =========================================================
   Scenario 23: summaryLines non-empty
   ========================================================= */

describe("comparePolicyRegimes — summaryLines non-empty", () => {
  const before = makeMetrics("pol-aaaaaaaa");
  const after = makeMetrics("pol-bbbbbbbb");
  const result = comparePolicyRegimes(before, after);

  it("summaryLines has at least one entry", () => {
    expect(result.summaryLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 24: summaryLines mention improvement when exactMatchDelta > 0.02
   ========================================================= */

describe("comparePolicyRegimes — summaryLines mention improvement when exactMatchDelta > 0.02", () => {
  const before = makeMetrics("pol-aaaaaaaa", { exactMatchRate: 0.5 });
  const after = makeMetrics("pol-bbbbbbbb", { exactMatchRate: 0.8 });
  const result = comparePolicyRegimes(before, after);

  it("summaryLines contain 'improved exact-match'", () => {
    const combined = result.summaryLines.join(" ").toLowerCase();
    expect(combined).toContain("improved exact-match");
  });
});

/* =========================================================
   Scenario 25: summaryLines mention reduction when tooAggressiveDelta < -0.02
   ========================================================= */

describe("comparePolicyRegimes — summaryLines mention reduction when tooAggressiveDelta < -0.02", () => {
  const before = makeMetrics("pol-aaaaaaaa", { tooAggressiveRate: 0.5 });
  const after = makeMetrics("pol-bbbbbbbb", { tooAggressiveRate: 0.2 });
  const result = comparePolicyRegimes(before, after);

  it("summaryLines contain 'reduced over-aggressive'", () => {
    const combined = result.summaryLines.join(" ").toLowerCase();
    expect(combined).toContain("reduced over-aggressive");
  });
});

/* =========================================================
   Scenario 26: buildPolicyRegimeComparisonReport — empty
   ========================================================= */

describe("buildPolicyRegimeComparisonReport — empty → empty regimes, empty pairwise", () => {
  const report = buildPolicyRegimeComparisonReport([]);

  it("regimes is empty", () => {
    expect(report.regimes).toHaveLength(0);
  });

  it("pairwiseComparisons is empty", () => {
    expect(report.pairwiseComparisons).toHaveLength(0);
  });

  it("bestByExactMatch is null", () => {
    expect(report.bestByExactMatch).toBeNull();
  });
});

/* =========================================================
   Scenario 27: single regime → no pairwise comparisons
   ========================================================= */

describe("buildPolicyRegimeComparisonReport — single regime → no pairwise", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "moderate", "calorie delta violation", "2026-01-01T00:00:00.000Z"),
  ];
  const report = buildPolicyRegimeComparisonReport(records);

  it("pairwiseComparisons is empty", () => {
    expect(report.pairwiseComparisons).toHaveLength(0);
  });

  it("regimes has 1 entry", () => {
    expect(report.regimes).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 28: two regimes → one pairwise comparison
   ========================================================= */

describe("buildPolicyRegimeComparisonReport — two regimes → one pairwise", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "moderate", "calorie delta violation", "2026-01-01T00:00:00.000Z"),
    makeFrozenRecord("pol-bbbbbbbb", "high", "protein placement violation", "2026-01-02T00:00:00.000Z"),
  ];
  const report = buildPolicyRegimeComparisonReport(records);

  it("pairwiseComparisons has 1 entry", () => {
    expect(report.pairwiseComparisons).toHaveLength(1);
  });

  it("comparison goes from pol-aaaaaaaa to pol-bbbbbbbb", () => {
    expect(report.pairwiseComparisons[0].beforePolicyVersionId).toBe("pol-aaaaaaaa");
    expect(report.pairwiseComparisons[0].afterPolicyVersionId).toBe("pol-bbbbbbbb");
  });
});

/* =========================================================
   Scenario 29: bestByExactMatch is correct policyVersionId
   ========================================================= */

describe("buildPolicyRegimeComparisonReport — bestByExactMatch is correct policyVersionId", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "moderate", null, "2026-01-01T00:00:00.000Z", { exactMatchRate: 0.5 }),
    makeFrozenRecord("pol-bbbbbbbb", "high", null, "2026-01-02T00:00:00.000Z", { exactMatchRate: 0.85 }),
  ];
  const report = buildPolicyRegimeComparisonReport(records);

  it("bestByExactMatch is pol-bbbbbbbb (0.85 > 0.5)", () => {
    expect(report.bestByExactMatch).toBe("pol-bbbbbbbb");
  });
});

/* =========================================================
   Scenario 30: all null rates → bestByExactMatch null
   ========================================================= */

describe("buildPolicyRegimeComparisonReport — all null exactMatchRate → bestByExactMatch null", () => {
  const records = [
    makeFrozenRecord("pol-aaaaaaaa", "low", null, "2026-01-01T00:00:00.000Z", { exactMatchRate: null, resolvedPredictions: 0, tooAggressiveRate: null, tooWeakRate: null }),
  ];
  const report = buildPolicyRegimeComparisonReport(records);

  it("bestByExactMatch is null", () => {
    expect(report.bestByExactMatch).toBeNull();
  });

  it("summaryLines is non-empty", () => {
    expect(report.summaryLines.length).toBeGreaterThan(0);
  });
});
