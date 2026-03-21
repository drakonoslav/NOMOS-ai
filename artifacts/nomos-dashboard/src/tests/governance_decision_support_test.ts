/**
 * governance_decision_support_test.ts
 *
 * Regression tests for governance_decision_support.ts — expected gains,
 * tradeoffs, risks, promote/rollback flags, and full decision support build.
 *
 * Scenarios:
 *   1.  computeExpectedGains — no gains when both metrics null (no policies)
 *   2.  computeExpectedGains — gain line when exactMatchRate improves > threshold
 *   3.  computeExpectedGains — no gain when delta ≤ threshold
 *   4.  computeExpectedGains — gain line when tooAggressiveRate decreases > threshold
 *   5.  computeExpectedGains — gain line when unresolvedRate decreases > threshold
 *   6.  computeExpectedGains — null currentMetrics → baseline establishment lines
 *   7.  computeExpectedTradeoffs — no tradeoffs when both metrics null
 *   8.  computeExpectedTradeoffs — tradeoff when directionMatchRate decreases > threshold
 *   9.  computeExpectedTradeoffs — tradeoff when tooWeakRate increases > threshold
 *  10.  computeExpectedTradeoffs — tradeoff when lowConfidenceRate increases > threshold
 *  11.  computeExpectedTradeoffs — no tradeoff when delta ≤ threshold
 *  12.  computeExpectedRisks — risk when minResolved < 3
 *  13.  computeExpectedRisks — risk when recommendation confidence is "low"
 *  14.  computeExpectedRisks — risk when recommendationStrength is "weak"
 *  15.  computeExpectedRisks — risk when all policies score similarly (spread < 0.1)
 *  16.  computeExpectedRisks — no shallow-history risk when resolvedRuns >= 3
 *  17.  buildGovernanceDecisionSupport — promoteSuggested false when strength is "weak"
 *  18.  buildGovernanceDecisionSupport — promoteSuggested false when confidence is "low"
 *  19.  buildGovernanceDecisionSupport — promoteSuggested true when strong evidence + gains
 *  20.  buildGovernanceDecisionSupport — promoteSuggested false when same policy
 *  21.  buildGovernanceDecisionSupport — rollbackSuggested true when current is too aggressive
 *  22.  buildGovernanceDecisionSupport — rollbackSuggested false when promoteSuggested is true
 *  23.  buildGovernanceDecisionSupport — rollbackSuggested false when no current policy
 *  24.  buildGovernanceDecisionSupport — summaryLines non-empty
 *  25.  buildGovernanceDecisionSupport — summaryLines mention "manual governance"
 *  26.  buildGovernanceDecisionSupport — domain preserved from recommendationReport
 *  27.  buildGovernanceDecisionSupport — recommendationStrength from primary recommendation
 *  28.  buildGovernanceDecisionSupport — confidence from primary recommendation
 *  29.  buildGovernanceDecisionSupport — does not mutate benchReport
 *  30.  buildGovernanceDecisionSupport — does not mutate recommendationReport
 */

import { describe, it, expect } from "vitest";
import {
  computeExpectedGains,
  computeExpectedTradeoffs,
  computeExpectedRisks,
  buildGovernanceDecisionSupport,
} from "../audit/governance_decision_support";
import type { PolicyBenchReport, PolicyBenchMetrics, PolicyBenchRequest } from "../audit/policy_bench_types";
import type { PolicyRecommendationReport, PolicyRecommendation } from "../audit/policy_recommendation_types";

/* =========================================================
   Fixtures
   ========================================================= */

function makeMetrics(
  policyVersionId: string,
  overrides?: Partial<PolicyBenchMetrics>
): PolicyBenchMetrics {
  return {
    policyVersionId,
    totalRuns: 8,
    resolvedRuns: 8,
    exactMatchRate: 0.5,
    directionMatchRate: 0.7,
    tooAggressiveRate: 0.1,
    tooWeakRate: 0.1,
    unresolvedRate: 0.1,
    lowConfidenceRate: 0.2,
    moderateConfidenceRate: 0.6,
    highConfidenceRate: 0.2,
    ...overrides,
  };
}

function makeRequest(): PolicyBenchRequest {
  return {
    auditRecordIds: ["r1", "r2", "r3"],
    policyVersionIds: ["pol-aaaaaaaa", "pol-bbbbbbbb"],
    domain: "nutrition",
  };
}

function makeBenchReport(metrics: PolicyBenchMetrics[]): PolicyBenchReport {
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

function makeRecommendation(
  policyVersionId: string,
  strength: PolicyRecommendation["recommendationStrength"] = "moderate",
  confidence: PolicyRecommendation["confidence"] = "moderate"
): PolicyRecommendation {
  return {
    domain: "nutrition",
    recommendedPolicyVersionId: policyVersionId,
    candidatePolicyVersionIds: [policyVersionId],
    basis: {
      exactMatchRate: 0.7,
      directionMatchRate: 0.75,
      tooAggressiveRate: 0.05,
      tooWeakRate: 0.05,
      unresolvedRate: 0.1,
    },
    rationaleLines: ["Policy is recommended."],
    tradeoffLines: [],
    confidence,
    recommendationStrength: strength,
  };
}

function makeRecReport(
  policyVersionId: string,
  strength: PolicyRecommendation["recommendationStrength"] = "moderate",
  confidence: PolicyRecommendation["confidence"] = "moderate"
): PolicyRecommendationReport {
  return {
    domain: "nutrition",
    recommendations: [makeRecommendation(policyVersionId, strength, confidence)],
    summaryLines: [],
  };
}

const M_CURRENT = makeMetrics("pol-current", {
  exactMatchRate: 0.4,
  directionMatchRate: 0.6,
  tooAggressiveRate: 0.2,
  tooWeakRate: 0.2,
  unresolvedRate: 0.2,
  lowConfidenceRate: 0.3,
});

const M_RECOMMENDED = makeMetrics("pol-recommended", {
  exactMatchRate: 0.7,    // +0.3 → gain
  directionMatchRate: 0.5, // -0.1 → tradeoff
  tooAggressiveRate: 0.05, // -0.15 → gain
  tooWeakRate: 0.1,
  unresolvedRate: 0.05,   // -0.15 → gain
  lowConfidenceRate: 0.5, // +0.2 → tradeoff (more conservative)
});

/* =========================================================
   Scenario 1: no gains when recommended metrics null
   ========================================================= */

describe("computeExpectedGains — no gains when recommendedMetrics is null", () => {
  it("returns empty array", () => {
    expect(computeExpectedGains(M_CURRENT, null)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 2: gain line when exactMatchRate improves > threshold
   ========================================================= */

describe("computeExpectedGains — gain when exactMatchRate improves > threshold", () => {
  const gains = computeExpectedGains(M_CURRENT, M_RECOMMENDED);

  it("includes exact-match gain line", () => {
    const combined = gains.join(" ");
    expect(combined.toLowerCase()).toContain("exact-match");
  });
});

/* =========================================================
   Scenario 3: no gain when delta ≤ threshold
   ========================================================= */

describe("computeExpectedGains — no gain when delta ≤ threshold", () => {
  const mSmallDelta = makeMetrics("pol-small", { exactMatchRate: 0.42 }); // delta=0.02 < 0.05
  const gains = computeExpectedGains(M_CURRENT, mSmallDelta);

  it("no exact-match gain line (delta below threshold)", () => {
    const combined = gains.join(" ").toLowerCase();
    expect(combined).not.toContain("exact-match performance is likely to improve");
  });
});

/* =========================================================
   Scenario 4: gain line when tooAggressiveRate decreases > threshold
   ========================================================= */

describe("computeExpectedGains — gain when tooAggressiveRate decreases > threshold", () => {
  const gains = computeExpectedGains(M_CURRENT, M_RECOMMENDED);

  it("includes aggressiveness gain line", () => {
    const combined = gains.join(" ").toLowerCase();
    expect(combined).toContain("aggressive");
  });
});

/* =========================================================
   Scenario 5: gain line when unresolvedRate decreases > threshold
   ========================================================= */

describe("computeExpectedGains — gain when unresolvedRate decreases > threshold", () => {
  const gains = computeExpectedGains(M_CURRENT, M_RECOMMENDED);

  it("includes unresolved gain line", () => {
    const combined = gains.join(" ").toLowerCase();
    expect(combined).toContain("unresolved");
  });
});

/* =========================================================
   Scenario 6: null currentMetrics → baseline establishment
   ========================================================= */

describe("computeExpectedGains — null currentMetrics → baseline establishment lines", () => {
  const gains = computeExpectedGains(null, M_RECOMMENDED);

  it("returns baseline establishment lines", () => {
    expect(gains.length).toBeGreaterThan(0);
  });

  it("includes 'exact-match rate' or 'direction-match' baseline line", () => {
    const combined = gains.join(" ").toLowerCase();
    expect(combined.includes("exact-match") || combined.includes("direction-match")).toBe(true);
  });
});

/* =========================================================
   Scenario 7: no tradeoffs when both metrics null
   ========================================================= */

describe("computeExpectedTradeoffs — no tradeoffs when recommendedMetrics is null", () => {
  it("returns empty array", () => {
    expect(computeExpectedTradeoffs(M_CURRENT, null)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 8: tradeoff when directionMatchRate decreases > threshold
   ========================================================= */

describe("computeExpectedTradeoffs — tradeoff when directionMatchRate decreases > threshold", () => {
  // M_CURRENT directionMatchRate=0.6, M_RECOMMENDED=0.5 → delta=-0.1 → tradeoff
  const tradeoffs = computeExpectedTradeoffs(M_CURRENT, M_RECOMMENDED);

  it("includes direction-match tradeoff line", () => {
    const combined = tradeoffs.join(" ").toLowerCase();
    expect(combined).toContain("direction-match");
  });
});

/* =========================================================
   Scenario 9: tradeoff when tooWeakRate increases > threshold
   ========================================================= */

describe("computeExpectedTradeoffs — tradeoff when tooWeakRate increases > threshold", () => {
  const mHighWeak = makeMetrics("pol-weak", { tooWeakRate: 0.4 }); // current=0.2 → delta=+0.2
  const tradeoffs = computeExpectedTradeoffs(M_CURRENT, mHighWeak);

  it("includes missed violations tradeoff", () => {
    const combined = tradeoffs.join(" ").toLowerCase();
    expect(combined).toContain("missed violations");
  });
});

/* =========================================================
   Scenario 10: tradeoff when lowConfidenceRate increases > threshold
   ========================================================= */

describe("computeExpectedTradeoffs — tradeoff when lowConfidenceRate increases > threshold", () => {
  // M_CURRENT lowConfidenceRate=0.3, M_RECOMMENDED=0.5 → delta=+0.2 → tradeoff
  const tradeoffs = computeExpectedTradeoffs(M_CURRENT, M_RECOMMENDED);

  it("includes confidence conservatism tradeoff", () => {
    const combined = tradeoffs.join(" ").toLowerCase();
    expect(combined).toContain("conservative");
  });
});

/* =========================================================
   Scenario 11: no tradeoff when delta ≤ threshold
   ========================================================= */

describe("computeExpectedTradeoffs — no tradeoff when delta ≤ threshold", () => {
  const mSmall = makeMetrics("pol-small", { directionMatchRate: 0.62 }); // delta=0.02
  const tradeoffs = computeExpectedTradeoffs(M_CURRENT, mSmall);

  it("no direction-match tradeoff", () => {
    const combined = tradeoffs.join(" ").toLowerCase();
    expect(combined).not.toContain("direction-match rate may decrease");
  });
});

/* =========================================================
   Scenario 12: risk when minResolved < 3
   ========================================================= */

describe("computeExpectedRisks — risk when minResolved < 3", () => {
  const m = makeMetrics("pol-aaaaaaaa", { resolvedRuns: 2 });
  const report = makeBenchReport([m]);
  const recReport = makeRecReport("pol-aaaaaaaa");
  const risks = computeExpectedRisks(report, recReport);

  it("includes shallow window risk", () => {
    const combined = risks.join(" ").toLowerCase();
    expect(combined).toContain("shallow");
  });
});

/* =========================================================
   Scenario 13: risk when recommendation confidence is "low"
   ========================================================= */

describe("computeExpectedRisks — risk when recommendation confidence is 'low'", () => {
  const report = makeBenchReport([makeMetrics("pol-aaaaaaaa", { resolvedRuns: 5 })]);
  const recReport = makeRecReport("pol-aaaaaaaa", "moderate", "low");
  const risks = computeExpectedRisks(report, recReport);

  it("includes confidence risk", () => {
    const combined = risks.join(" ").toLowerCase();
    expect(combined).toContain("confidence is low");
  });
});

/* =========================================================
   Scenario 14: risk when recommendationStrength is "weak"
   ========================================================= */

describe("computeExpectedRisks — risk when recommendationStrength is 'weak'", () => {
  const report = makeBenchReport([makeMetrics("pol-aaaaaaaa", { resolvedRuns: 5 })]);
  const recReport = makeRecReport("pol-aaaaaaaa", "weak", "moderate");
  const risks = computeExpectedRisks(report, recReport);

  it("includes modest differences risk", () => {
    const combined = risks.join(" ").toLowerCase();
    expect(combined).toContain("modest");
  });
});

/* =========================================================
   Scenario 15: risk when all policies score similarly
   ========================================================= */

describe("computeExpectedRisks — risk when all policies score similarly (spread < 0.1)", () => {
  const m1 = makeMetrics("pol-aaaaaaaa", { exactMatchRate: 0.55, resolvedRuns: 5 });
  const m2 = makeMetrics("pol-bbbbbbbb", { exactMatchRate: 0.60, resolvedRuns: 5 });
  const report = makeBenchReport([m1, m2]);
  const recReport = makeRecReport("pol-aaaaaaaa", "moderate", "moderate");
  const risks = computeExpectedRisks(report, recReport);

  it("includes similar performance risk", () => {
    const combined = risks.join(" ").toLowerCase();
    expect(combined).toContain("similarly");
  });
});

/* =========================================================
   Scenario 16: no shallow-history risk when resolvedRuns >= 3
   ========================================================= */

describe("computeExpectedRisks — no shallow-history risk when resolvedRuns >= 3", () => {
  const m = makeMetrics("pol-aaaaaaaa", { resolvedRuns: 5 });
  const report = makeBenchReport([m]);
  const recReport = makeRecReport("pol-aaaaaaaa", "strong", "high");
  const risks = computeExpectedRisks(report, recReport);

  it("no shallow window risk", () => {
    const combined = risks.join(" ").toLowerCase();
    expect(combined).not.toContain("shallow");
  });
});

/* =========================================================
   Scenario 17: promoteSuggested false when strength is "weak"
   ========================================================= */

describe("buildGovernanceDecisionSupport — promoteSuggested false when strength is 'weak'", () => {
  const benchReport = makeBenchReport([M_CURRENT, M_RECOMMENDED]);
  const recReport = makeRecReport("pol-recommended", "weak", "moderate");
  const support = buildGovernanceDecisionSupport("pol-current", "pol-recommended", benchReport, recReport);

  it("promoteSuggested is false", () => {
    expect(support.promoteSuggested).toBe(false);
  });
});

/* =========================================================
   Scenario 18: promoteSuggested false when confidence is "low"
   ========================================================= */

describe("buildGovernanceDecisionSupport — promoteSuggested false when confidence is 'low'", () => {
  const benchReport = makeBenchReport([M_CURRENT, M_RECOMMENDED]);
  const recReport = makeRecReport("pol-recommended", "strong", "low");
  const support = buildGovernanceDecisionSupport("pol-current", "pol-recommended", benchReport, recReport);

  it("promoteSuggested is false", () => {
    expect(support.promoteSuggested).toBe(false);
  });
});

/* =========================================================
   Scenario 19: promoteSuggested true when strong evidence + gains
   ========================================================= */

describe("buildGovernanceDecisionSupport — promoteSuggested true when strong evidence + gains", () => {
  const mStrong = makeMetrics("pol-strong-recommended", {
    exactMatchRate: 0.8,   // +0.4 over current → gain
    directionMatchRate: 0.7,
    tooAggressiveRate: 0.05,
    tooWeakRate: 0.1,
    unresolvedRate: 0.05,
    resolvedRuns: 8,
  });
  const benchReport = makeBenchReport([M_CURRENT, mStrong]);
  const recReport: PolicyRecommendationReport = {
    domain: "nutrition",
    recommendations: [{
      ...makeRecommendation("pol-strong-recommended", "strong", "high"),
      basis: {
        exactMatchRate: 0.8,
        directionMatchRate: 0.7,
        tooAggressiveRate: 0.05,
        tooWeakRate: 0.1,
        unresolvedRate: 0.05,
      },
    }],
    summaryLines: [],
  };
  const support = buildGovernanceDecisionSupport("pol-current", "pol-strong-recommended", benchReport, recReport);

  it("promoteSuggested is true", () => {
    expect(support.promoteSuggested).toBe(true);
  });
});

/* =========================================================
   Scenario 20: promoteSuggested false when same policy
   ========================================================= */

describe("buildGovernanceDecisionSupport — promoteSuggested false when same policy", () => {
  const benchReport = makeBenchReport([M_CURRENT, M_RECOMMENDED]);
  const recReport = makeRecReport("pol-current", "strong", "high");
  const support = buildGovernanceDecisionSupport("pol-current", "pol-current", benchReport, recReport);

  it("promoteSuggested is false (same policy, no change needed)", () => {
    expect(support.promoteSuggested).toBe(false);
  });
});

/* =========================================================
   Scenario 21: rollbackSuggested true when current is too aggressive
   ========================================================= */

describe("buildGovernanceDecisionSupport — rollbackSuggested true when current is too aggressive", () => {
  const mAggressive = makeMetrics("pol-current", { tooAggressiveRate: 0.6 });
  const benchReport = makeBenchReport([mAggressive, M_RECOMMENDED]);
  const recReport = makeRecReport("pol-recommended", "weak", "low"); // weak strength → no promote
  const support = buildGovernanceDecisionSupport("pol-current", "pol-recommended", benchReport, recReport);

  it("rollbackSuggested is true", () => {
    expect(support.rollbackSuggested).toBe(true);
  });
});

/* =========================================================
   Scenario 22: rollbackSuggested false when promoteSuggested is true
   ========================================================= */

describe("buildGovernanceDecisionSupport — rollbackSuggested false when promoteSuggested is true", () => {
  const mAggressive = makeMetrics("pol-current", { tooAggressiveRate: 0.6, resolvedRuns: 8 });
  const mStrong = makeMetrics("pol-strong-r", {
    exactMatchRate: 0.8, directionMatchRate: 0.7,
    tooAggressiveRate: 0.05, unresolvedRate: 0.05, resolvedRuns: 8,
  });
  const benchReport = makeBenchReport([mAggressive, mStrong]);
  const recReport: PolicyRecommendationReport = {
    domain: "nutrition",
    recommendations: [{
      ...makeRecommendation("pol-strong-r", "strong", "high"),
      basis: {
        exactMatchRate: 0.8,
        directionMatchRate: 0.7,
        tooAggressiveRate: 0.05,
        tooWeakRate: 0.05,
        unresolvedRate: 0.05,
      },
    }],
    summaryLines: [],
  };
  const support = buildGovernanceDecisionSupport("pol-current", "pol-strong-r", benchReport, recReport);

  it("rollbackSuggested is false (promoteSuggested takes priority)", () => {
    expect(support.rollbackSuggested).toBe(false);
  });
});

/* =========================================================
   Scenario 23: rollbackSuggested false when no current policy
   ========================================================= */

describe("buildGovernanceDecisionSupport — rollbackSuggested false when no current policy", () => {
  const benchReport = makeBenchReport([M_RECOMMENDED]);
  const recReport = makeRecReport("pol-recommended", "weak", "low");
  const support = buildGovernanceDecisionSupport(null, "pol-recommended", benchReport, recReport);

  it("rollbackSuggested is false (nothing to roll back from)", () => {
    expect(support.rollbackSuggested).toBe(false);
  });
});

/* =========================================================
   Scenario 24: summaryLines non-empty
   ========================================================= */

describe("buildGovernanceDecisionSupport — summaryLines non-empty", () => {
  const benchReport = makeBenchReport([M_CURRENT, M_RECOMMENDED]);
  const recReport = makeRecReport("pol-recommended", "moderate", "moderate");
  const support = buildGovernanceDecisionSupport("pol-current", "pol-recommended", benchReport, recReport);

  it("summaryLines has at least 1 entry", () => {
    expect(support.summaryLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 25: summaryLines mention "manual governance"
   ========================================================= */

describe("buildGovernanceDecisionSupport — summaryLines mention 'manual governance'", () => {
  const benchReport = makeBenchReport([M_CURRENT, M_RECOMMENDED]);
  const recReport = makeRecReport("pol-recommended", "moderate", "moderate");
  const support = buildGovernanceDecisionSupport("pol-current", "pol-recommended", benchReport, recReport);
  const combined = support.summaryLines.join(" ");

  it("includes 'manual governance'", () => {
    expect(combined.toLowerCase()).toContain("manual governance");
  });
});

/* =========================================================
   Scenario 26: domain preserved from recommendationReport
   ========================================================= */

describe("buildGovernanceDecisionSupport — domain preserved from recommendationReport", () => {
  const recReport: PolicyRecommendationReport = {
    ...makeRecReport("pol-recommended"),
    domain: "training",
    recommendations: [{ ...makeRecommendation("pol-recommended"), domain: "training" }],
  };
  const benchReport = makeBenchReport([M_CURRENT, M_RECOMMENDED]);
  const support = buildGovernanceDecisionSupport("pol-current", "pol-recommended", benchReport, recReport);

  it("domain is 'training'", () => {
    expect(support.domain).toBe("training");
  });
});

/* =========================================================
   Scenario 27: recommendationStrength from primary recommendation
   ========================================================= */

describe("buildGovernanceDecisionSupport — recommendationStrength from primary recommendation", () => {
  const benchReport = makeBenchReport([M_CURRENT, M_RECOMMENDED]);
  const recReport = makeRecReport("pol-recommended", "strong", "high");
  const support = buildGovernanceDecisionSupport("pol-current", "pol-recommended", benchReport, recReport);

  it("recommendationStrength is 'strong'", () => {
    expect(support.recommendationStrength).toBe("strong");
  });
});

/* =========================================================
   Scenario 28: confidence from primary recommendation
   ========================================================= */

describe("buildGovernanceDecisionSupport — confidence from primary recommendation", () => {
  const benchReport = makeBenchReport([M_CURRENT, M_RECOMMENDED]);
  const recReport = makeRecReport("pol-recommended", "moderate", "high");
  const support = buildGovernanceDecisionSupport("pol-current", "pol-recommended", benchReport, recReport);

  it("confidence is 'high'", () => {
    expect(support.confidence).toBe("high");
  });
});

/* =========================================================
   Scenario 29: does not mutate benchReport
   ========================================================= */

describe("buildGovernanceDecisionSupport — does not mutate benchReport", () => {
  const benchReport = makeBenchReport([M_CURRENT, M_RECOMMENDED]);
  const originalLen = benchReport.metricsByPolicy.length;
  const recReport = makeRecReport("pol-recommended");
  buildGovernanceDecisionSupport("pol-current", "pol-recommended", benchReport, recReport);

  it("metricsByPolicy length unchanged", () => {
    expect(benchReport.metricsByPolicy).toHaveLength(originalLen);
  });
});

/* =========================================================
   Scenario 30: does not mutate recommendationReport
   ========================================================= */

describe("buildGovernanceDecisionSupport — does not mutate recommendationReport", () => {
  const benchReport = makeBenchReport([M_CURRENT, M_RECOMMENDED]);
  const recReport = makeRecReport("pol-recommended");
  const originalLen = recReport.recommendations.length;
  buildGovernanceDecisionSupport("pol-current", "pol-recommended", benchReport, recReport);

  it("recommendations length unchanged", () => {
    expect(recReport.recommendations).toHaveLength(originalLen);
  });
});
