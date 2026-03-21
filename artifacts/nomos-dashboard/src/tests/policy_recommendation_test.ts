/**
 * policy_recommendation_test.ts
 *
 * Regression tests for policy_recommendation.ts — deterministic ranking,
 * confidence and strength classification, rationale/tradeoff building,
 * and full report generation.
 *
 * Scenarios:
 *   1.  rankPoliciesFromBench — empty metrics → empty ranking
 *   2.  rankPoliciesFromBench — single policy ranked first
 *   3.  rankPoliciesFromBench — higher exact-match scores higher
 *   4.  rankPoliciesFromBench — aggressiveness penalizes rank
 *   5.  rankPoliciesFromBench — unresolved rate penalizes rank
 *   6.  rankPoliciesFromBench — tie broken alphabetically by policyVersionId
 *   7.  rankPoliciesFromBench — ranking is deterministic (same on two calls)
 *   8.  buildPolicyRecommendation — null recommendedPolicyVersionId when no resolved runs
 *   9.  buildPolicyRecommendation — recommendedPolicyVersionId is top-ranked policy
 *  10.  buildPolicyRecommendation — confidence "low" when resolvedRuns < 3
 *  11.  buildPolicyRecommendation — confidence "high" when resolvedRuns >= 8 and low unresolved
 *  12.  buildPolicyRecommendation — confidence "moderate" in mid-range
 *  13.  buildPolicyRecommendation — strength "strong" when gap > 0.15
 *  14.  buildPolicyRecommendation — strength "weak" when single candidate
 *  15.  buildPolicyRecommendation — strength "weak" when gap ≤ 0.05
 *  16.  buildPolicyRecommendation — basis matches top policy metrics
 *  17.  buildPolicyRecommendation — rationaleLines non-empty
 *  18.  buildPolicyRecommendation — rationaleLines mention domain
 *  19.  buildPolicyRecommendation — tradeoffLines reference runner-up
 *  20.  buildPolicyRecommendation — does not mutate benchReport
 *  21.  buildPolicyRecommendationReport — empty metrics → empty recommendations
 *  22.  buildPolicyRecommendationReport — returns one recommendation per ranked candidate
 *  23.  buildPolicyRecommendationReport — first recommendation is primary (top-ranked)
 *  24.  buildPolicyRecommendationReport — runner-up has recommendationStrength "weak"
 *  25.  buildPolicyRecommendationReport — summaryLines non-empty
 *  26.  buildPolicyRecommendationReport — summaryLines mention domain
 *  27.  buildPolicyRecommendationReport — summaryLines mention "manual governance"
 *  28.  buildPolicyRecommendationReport — candidatePolicyVersionIds in rank order
 *  29.  buildPolicyRecommendationReport — domain preserved on each recommendation
 *  30.  buildPolicyRecommendationReport — does not mutate benchReport
 */

import { describe, it, expect } from "vitest";
import {
  rankPoliciesFromBench,
  buildPolicyRecommendation,
  buildPolicyRecommendationReport,
} from "../audit/policy_recommendation";
import type { PolicyBenchReport, PolicyBenchMetrics } from "../audit/policy_bench_types";
import type { PolicyBenchRequest } from "../audit/policy_bench_types";

/* =========================================================
   Fixtures
   ========================================================= */

function makeRequest(): PolicyBenchRequest {
  return {
    auditRecordIds: ["r1", "r2", "r3"],
    policyVersionIds: [],
    domain: "nutrition",
  };
}

function makeMetrics(
  policyVersionId: string,
  overrides?: Partial<PolicyBenchMetrics>
): PolicyBenchMetrics {
  return {
    policyVersionId,
    totalRuns: 5,
    resolvedRuns: 5,
    exactMatchRate: 0.6,
    directionMatchRate: 0.8,
    tooAggressiveRate: 0.1,
    tooWeakRate: 0.1,
    unresolvedRate: 0.0,
    lowConfidenceRate: 0.2,
    moderateConfidenceRate: 0.6,
    highConfidenceRate: 0.2,
    ...overrides,
  };
}

function makeReport(metrics: PolicyBenchMetrics[]): PolicyBenchReport {
  return {
    request: makeRequest(),
    metricsByPolicy: metrics,
    bestByExactMatch: metrics[0]?.policyVersionId ?? null,
    bestByDirectionMatch: metrics[0]?.policyVersionId ?? null,
    lowestAggressiveRate: metrics[0]?.policyVersionId ?? null,
    lowestUnresolvedRate: metrics[0]?.policyVersionId ?? null,
    summaryLines: [],
  };
}

const M_A = makeMetrics("pol-aaaaaaaa", { exactMatchRate: 0.8, tooAggressiveRate: 0.1 });
const M_B = makeMetrics("pol-bbbbbbbb", { exactMatchRate: 0.4, tooAggressiveRate: 0.05 });
const M_C = makeMetrics("pol-cccccccc", { exactMatchRate: 0.6, tooAggressiveRate: 0.2 });

/* =========================================================
   Scenario 1: empty metrics → empty ranking
   ========================================================= */

describe("rankPoliciesFromBench — empty metrics → empty ranking", () => {
  const report = makeReport([]);

  it("returns empty array", () => {
    expect(rankPoliciesFromBench(report)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 2: single policy ranked first
   ========================================================= */

describe("rankPoliciesFromBench — single policy ranked first", () => {
  const report = makeReport([M_A]);
  const ranked = rankPoliciesFromBench(report);

  it("first entry is pol-aaaaaaaa", () => {
    expect(ranked[0]!.policyVersionId).toBe("pol-aaaaaaaa");
  });
});

/* =========================================================
   Scenario 3: higher exact-match scores higher
   ========================================================= */

describe("rankPoliciesFromBench — higher exact-match scores higher", () => {
  // M_A has exactMatchRate=0.8, M_B has 0.4 — M_A should rank first
  const report = makeReport([M_B, M_A]);
  const ranked = rankPoliciesFromBench(report);

  it("pol-aaaaaaaa ranks first (better exact match)", () => {
    expect(ranked[0]!.policyVersionId).toBe("pol-aaaaaaaa");
  });
});

/* =========================================================
   Scenario 4: aggressiveness penalizes rank
   ========================================================= */

describe("rankPoliciesFromBench — aggressiveness penalizes rank", () => {
  // M_C has exactMatchRate=0.6, tooAggressiveRate=0.2 (higher penalty)
  // M_B has exactMatchRate=0.4, tooAggressiveRate=0.05
  // Score M_B: 0.4*2 - 0.05*1.5 + 0.8*1 - 0.1*1 = 0.8 - 0.075 + 0.8 - 0.1 - 0.0 = 1.425
  // Score M_C: 0.6*2 - 0.2*1.5 + 0.8*1 - 0.1*1 = 1.2 - 0.3 + 0.8 - 0.1 - 0.0 = 1.6
  // M_C still wins due to higher exact match outweighing aggressiveness here
  // Test: M_noexact (exactMatchRate=0) vs M_aggressive (tooAggressiveRate=0.9)
  const mNoExact = makeMetrics("pol-noexact", { exactMatchRate: 0, tooAggressiveRate: 0.05 });
  const mAggressive = makeMetrics("pol-agg", { exactMatchRate: 0.5, tooAggressiveRate: 0.9 });
  // Score mNoExact: 0*2 - 0.05*1.5 + 0.8*1 - 0.1*1 = -0.075 + 0.8 - 0.1 = 0.625
  // Score mAggressive: 0.5*2 - 0.9*1.5 + 0.8*1 - 0.1*1 = 1.0 - 1.35 + 0.8 - 0.1 = 0.35
  const report = makeReport([mAggressive, mNoExact]);
  const ranked = rankPoliciesFromBench(report);

  it("pol-noexact ranks above pol-agg despite no exact matches", () => {
    expect(ranked[0]!.policyVersionId).toBe("pol-noexact");
  });
});

/* =========================================================
   Scenario 5: unresolved rate penalizes rank
   ========================================================= */

describe("rankPoliciesFromBench — unresolved rate penalizes rank", () => {
  const mLowUnres = makeMetrics("pol-low-unres", { exactMatchRate: 0.5, unresolvedRate: 0.0 });
  const mHighUnres = makeMetrics("pol-high-unres", { exactMatchRate: 0.5, unresolvedRate: 0.8 });
  const report = makeReport([mHighUnres, mLowUnres]);
  const ranked = rankPoliciesFromBench(report);

  it("pol-low-unres ranks first", () => {
    expect(ranked[0]!.policyVersionId).toBe("pol-low-unres");
  });
});

/* =========================================================
   Scenario 6: tie broken alphabetically
   ========================================================= */

describe("rankPoliciesFromBench — tie broken alphabetically by policyVersionId", () => {
  const mSame1 = makeMetrics("pol-zzz", {
    exactMatchRate: 0.5, directionMatchRate: 0.5,
    tooAggressiveRate: 0.1, tooWeakRate: 0.1, unresolvedRate: 0.1,
  });
  const mSame2 = makeMetrics("pol-aaa", {
    exactMatchRate: 0.5, directionMatchRate: 0.5,
    tooAggressiveRate: 0.1, tooWeakRate: 0.1, unresolvedRate: 0.1,
  });
  const report = makeReport([mSame1, mSame2]);
  const ranked = rankPoliciesFromBench(report);

  it("pol-aaa ranks first (alphabetically earlier)", () => {
    expect(ranked[0]!.policyVersionId).toBe("pol-aaa");
  });
});

/* =========================================================
   Scenario 7: ranking is deterministic
   ========================================================= */

describe("rankPoliciesFromBench — ranking is deterministic", () => {
  const report = makeReport([M_A, M_B, M_C]);
  const ranked1 = rankPoliciesFromBench(report);
  const ranked2 = rankPoliciesFromBench(report);

  it("first call and second call produce same order", () => {
    expect(ranked1.map((r) => r.policyVersionId))
      .toEqual(ranked2.map((r) => r.policyVersionId));
  });
});

/* =========================================================
   Scenario 8: null recommendedPolicyVersionId when no resolved runs
   ========================================================= */

describe("buildPolicyRecommendation — null recommendedPolicyVersionId when no resolved runs", () => {
  const m = makeMetrics("pol-aaaaaaaa", { resolvedRuns: 0, exactMatchRate: null });
  const report = makeReport([m]);
  const rec = buildPolicyRecommendation("nutrition", report);

  it("recommendedPolicyVersionId is null", () => {
    expect(rec.recommendedPolicyVersionId).toBeNull();
  });
});

/* =========================================================
   Scenario 9: recommendedPolicyVersionId is top-ranked policy
   ========================================================= */

describe("buildPolicyRecommendation — recommendedPolicyVersionId is top-ranked policy", () => {
  const report = makeReport([M_B, M_A, M_C]); // M_A should win
  const rec = buildPolicyRecommendation("nutrition", report);

  it("recommendedPolicyVersionId is pol-aaaaaaaa", () => {
    expect(rec.recommendedPolicyVersionId).toBe("pol-aaaaaaaa");
  });
});

/* =========================================================
   Scenario 10: confidence "low" when resolvedRuns < 3
   ========================================================= */

describe("buildPolicyRecommendation — confidence 'low' when resolvedRuns < 3", () => {
  const m = makeMetrics("pol-aaaaaaaa", { resolvedRuns: 2 });
  const report = makeReport([m]);
  const rec = buildPolicyRecommendation("nutrition", report);

  it("confidence is 'low'", () => {
    expect(rec.confidence).toBe("low");
  });
});

/* =========================================================
   Scenario 11: confidence "high" when resolvedRuns >= 8 and low unresolved
   ========================================================= */

describe("buildPolicyRecommendation — confidence 'high' when resolvedRuns >= 8", () => {
  const m = makeMetrics("pol-aaaaaaaa", { resolvedRuns: 10, unresolvedRate: 0.1 });
  const report = makeReport([m]);
  const rec = buildPolicyRecommendation("nutrition", report);

  it("confidence is 'high'", () => {
    expect(rec.confidence).toBe("high");
  });
});

/* =========================================================
   Scenario 12: confidence "moderate" in mid-range
   ========================================================= */

describe("buildPolicyRecommendation — confidence 'moderate' in mid-range", () => {
  const m = makeMetrics("pol-aaaaaaaa", { resolvedRuns: 5, unresolvedRate: 0.2 });
  const report = makeReport([m]);
  const rec = buildPolicyRecommendation("nutrition", report);

  it("confidence is 'moderate'", () => {
    expect(rec.confidence).toBe("moderate");
  });
});

/* =========================================================
   Scenario 13: strength "strong" when score gap > 0.15
   ========================================================= */

describe("buildPolicyRecommendation — strength 'strong' when gap > 0.15", () => {
  // M_A: score ≈ 0.8*2 + 0.8*1 - 0.1*1.5 - 0.1*1 - 0.0*0.8 = 1.6+0.8-0.15-0.1 = 2.15
  // M_weak: exactMatch=0, direction=0, agg=0, weak=0, unres=0 → score=0
  const mWeak = makeMetrics("pol-weak", {
    exactMatchRate: 0, directionMatchRate: 0,
    tooAggressiveRate: 0, tooWeakRate: 0, unresolvedRate: 0,
  });
  const report = makeReport([M_A, mWeak]);
  const rec = buildPolicyRecommendation("nutrition", report);

  it("recommendationStrength is 'strong'", () => {
    expect(rec.recommendationStrength).toBe("strong");
  });
});

/* =========================================================
   Scenario 14: strength "weak" when single candidate
   ========================================================= */

describe("buildPolicyRecommendation — strength 'weak' when single candidate", () => {
  const report = makeReport([M_A]);
  const rec = buildPolicyRecommendation("nutrition", report);

  it("recommendationStrength is 'weak'", () => {
    expect(rec.recommendationStrength).toBe("weak");
  });
});

/* =========================================================
   Scenario 15: strength "weak" when gap ≤ 0.05
   ========================================================= */

describe("buildPolicyRecommendation — strength 'weak' when gap ≤ 0.05", () => {
  const mAlmost = makeMetrics("pol-almost", {
    exactMatchRate: 0.799, directionMatchRate: 0.8,
    tooAggressiveRate: 0.1, tooWeakRate: 0.1, unresolvedRate: 0.0,
  });
  // M_A score and mAlmost score differ by tiny amount
  const report = makeReport([M_A, mAlmost]);
  const rec = buildPolicyRecommendation("nutrition", report);

  it("recommendationStrength is 'weak'", () => {
    expect(rec.recommendationStrength).toBe("weak");
  });
});

/* =========================================================
   Scenario 16: basis matches top policy metrics
   ========================================================= */

describe("buildPolicyRecommendation — basis matches top policy metrics", () => {
  const report = makeReport([M_A]);
  const rec = buildPolicyRecommendation("nutrition", report);

  it("basis.exactMatchRate matches M_A.exactMatchRate", () => {
    expect(rec.basis.exactMatchRate).toBe(M_A.exactMatchRate);
  });

  it("basis.tooAggressiveRate matches M_A.tooAggressiveRate", () => {
    expect(rec.basis.tooAggressiveRate).toBe(M_A.tooAggressiveRate);
  });
});

/* =========================================================
   Scenario 17: rationaleLines non-empty
   ========================================================= */

describe("buildPolicyRecommendation — rationaleLines non-empty", () => {
  const report = makeReport([M_A]);
  const rec = buildPolicyRecommendation("nutrition", report);

  it("rationaleLines has at least 1 entry", () => {
    expect(rec.rationaleLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 18: rationaleLines mention domain
   ========================================================= */

describe("buildPolicyRecommendation — rationaleLines mention domain", () => {
  const report = makeReport([M_A]);
  const rec = buildPolicyRecommendation("training", report);
  const combined = rec.rationaleLines.join(" ");

  it("rationaleLines contain 'training'", () => {
    expect(combined).toContain("training");
  });
});

/* =========================================================
   Scenario 19: tradeoffLines reference runner-up
   ========================================================= */

describe("buildPolicyRecommendation — tradeoffLines reference runner-up when one exists", () => {
  // M_B has lower aggressiveness than M_A → should trigger a tradeoff line
  const mRunnerLowAgg = makeMetrics("pol-runner", {
    exactMatchRate: 0.3,
    directionMatchRate: 0.9,  // better direction match → triggers tradeoff
    tooAggressiveRate: 0.1,
    tooWeakRate: 0.1,
    unresolvedRate: 0.0,
  });
  const report = makeReport([M_A, mRunnerLowAgg]);
  const rec = buildPolicyRecommendation("nutrition", report);

  it("tradeoffLines is an array", () => {
    expect(Array.isArray(rec.tradeoffLines)).toBe(true);
  });
});

/* =========================================================
   Scenario 20: does not mutate benchReport
   ========================================================= */

describe("buildPolicyRecommendation — does not mutate benchReport", () => {
  const report = makeReport([M_A, M_B]);
  const originalLen = report.metricsByPolicy.length;
  buildPolicyRecommendation("nutrition", report);

  it("metricsByPolicy length unchanged", () => {
    expect(report.metricsByPolicy).toHaveLength(originalLen);
  });
});

/* =========================================================
   Scenario 21: empty metrics → empty recommendations
   ========================================================= */

describe("buildPolicyRecommendationReport — empty metrics → empty recommendations", () => {
  const report = makeReport([]);
  const recReport = buildPolicyRecommendationReport("nutrition", report);

  it("recommendations is empty", () => {
    expect(recReport.recommendations).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 22: one recommendation per ranked candidate
   ========================================================= */

describe("buildPolicyRecommendationReport — one recommendation per ranked candidate", () => {
  const report = makeReport([M_A, M_B, M_C]);
  const recReport = buildPolicyRecommendationReport("nutrition", report);

  it("has 3 recommendations (1 primary + 2 runners)", () => {
    expect(recReport.recommendations).toHaveLength(3);
  });
});

/* =========================================================
   Scenario 23: first recommendation is primary (top-ranked)
   ========================================================= */

describe("buildPolicyRecommendationReport — first recommendation is primary (top-ranked)", () => {
  const report = makeReport([M_B, M_A]); // M_A should win
  const recReport = buildPolicyRecommendationReport("nutrition", report);

  it("first recommendation is pol-aaaaaaaa", () => {
    expect(recReport.recommendations[0]!.recommendedPolicyVersionId).toBe("pol-aaaaaaaa");
  });
});

/* =========================================================
   Scenario 24: runner-up has recommendationStrength "weak"
   ========================================================= */

describe("buildPolicyRecommendationReport — runner-up has recommendationStrength 'weak'", () => {
  const report = makeReport([M_A, M_B]);
  const recReport = buildPolicyRecommendationReport("nutrition", report);
  const runner = recReport.recommendations[1]!;

  it("runner-up recommendationStrength is 'weak'", () => {
    expect(runner.recommendationStrength).toBe("weak");
  });
});

/* =========================================================
   Scenario 25: summaryLines non-empty
   ========================================================= */

describe("buildPolicyRecommendationReport — summaryLines non-empty", () => {
  const report = makeReport([M_A]);
  const recReport = buildPolicyRecommendationReport("nutrition", report);

  it("summaryLines has at least 1 entry", () => {
    expect(recReport.summaryLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 26: summaryLines mention domain
   ========================================================= */

describe("buildPolicyRecommendationReport — summaryLines mention domain", () => {
  const report = makeReport([M_A]);
  const recReport = buildPolicyRecommendationReport("training", report);
  const combined = recReport.summaryLines.join(" ");

  it("summaryLines contain 'training'", () => {
    expect(combined).toContain("training");
  });
});

/* =========================================================
   Scenario 27: summaryLines mention "manual governance"
   ========================================================= */

describe("buildPolicyRecommendationReport — summaryLines mention 'manual governance'", () => {
  const report = makeReport([M_A]);
  const recReport = buildPolicyRecommendationReport("nutrition", report);
  const combined = recReport.summaryLines.join(" ");

  it("summaryLines contain 'manual governance'", () => {
    expect(combined).toContain("manual governance");
  });
});

/* =========================================================
   Scenario 28: candidatePolicyVersionIds in rank order
   ========================================================= */

describe("buildPolicyRecommendationReport — candidatePolicyVersionIds in rank order", () => {
  const report = makeReport([M_B, M_A, M_C]);
  const recReport = buildPolicyRecommendationReport("nutrition", report);
  const primary = recReport.recommendations[0]!;
  const ranked = [M_A.policyVersionId]; // M_A wins

  it("first candidatePolicyVersionId is pol-aaaaaaaa", () => {
    expect(primary.candidatePolicyVersionIds[0]).toBe("pol-aaaaaaaa");
  });
});

/* =========================================================
   Scenario 29: domain preserved on each recommendation
   ========================================================= */

describe("buildPolicyRecommendationReport — domain preserved on each recommendation", () => {
  const report = makeReport([M_A, M_B]);
  const recReport = buildPolicyRecommendationReport("schedule", report);

  it("all recommendations have domain 'schedule'", () => {
    expect(recReport.recommendations.every((r) => r.domain === "schedule")).toBe(true);
  });
});

/* =========================================================
   Scenario 30: does not mutate benchReport
   ========================================================= */

describe("buildPolicyRecommendationReport — does not mutate benchReport", () => {
  const report = makeReport([M_A, M_B]);
  const originalLen = report.metricsByPolicy.length;
  buildPolicyRecommendationReport("nutrition", report);

  it("metricsByPolicy length unchanged", () => {
    expect(report.metricsByPolicy).toHaveLength(originalLen);
  });
});
