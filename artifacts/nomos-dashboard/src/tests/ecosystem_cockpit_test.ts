/**
 * ecosystem_cockpit_test.ts
 *
 * Regression tests for cockpit_types.ts and ecosystem_cockpit.ts.
 *
 * Scenarios:
 *   1.  health.overall matches healthIndex.overall
 *   2.  health.band matches healthIndex.band
 *   3.  health component scores (stability, calibrationQuality, governanceEffectiveness, policyChurn) match
 *   4.  trends.mostFrequentVariable matches driftSummary.mostFrequentVariable
 *   5.  trends.mostRecentVariable matches driftSummary.mostRecentVariable
 *   6.  trends.driftState is "stabilizing" when loopSummary.stabilizing
 *   7.  trends.driftState is "drifting" when loopSummary.drifting
 *   8.  trends.driftState is "stable" when no flags set
 *   9.  trends.driftState is "overcorrecting" when loopSummary.overcorrecting
 *  10.  prediction.predictedVariable matches failurePrediction.predictedVariable
 *  11.  prediction.confidence matches failurePrediction.confidence
 *  12.  prediction.riskDirection matches failurePrediction.riskDirection
 *  13.  governance.recentGovernanceAction is null when auditTrail is empty
 *  14.  governance.recentGovernanceAction is "promote" from latest audit record
 *  15.  governance.latestOutcomeClass is null when no reviews
 *  16.  governance.latestOutcomeClass matches last review outcomeClass
 *  17.  policy.policyVersionId matches policySnapshot.policyVersion
 *  18.  policy.confidenceBias matches boundedAdjustmentState.confidenceBias
 *  19.  policy.calibrationWindow matches boundedAdjustmentState.calibrationWindow
 *  20.  doctrine.supportingCount matches crosswalk.supportingHeuristics.length
 *  21.  doctrine.cautioningCount matches crosswalk.cautioningHeuristics.length
 *  22.  doctrine.supportingCount and cautioningCount are 0 when crosswalk is null
 *  23.  attention.alerts contains calibration fragile alert when calibrationQuality < 50
 *  24.  attention.alerts contains low-confidence alert when failurePrediction.confidence is "low"
 *  25.  attention.alerts contains overcorrecting churn alert when loopSummary.overcorrecting
 *  26.  attention.alerts contains doctrine caution alert when cautioning > supporting
 *  27.  attention.alerts contains recurring streak alert when currentStreak >= 3
 *  28.  attention.alerts is empty when ecosystem is fully healthy
 *  29.  trends.currentDominantStreak is null when no variable has streak >= 3
 *  30.  does not mutate any input array
 */

import { describe, it, expect } from "vitest";
import { buildEcosystemCockpitSnapshot } from "../audit/ecosystem_cockpit";
import type { EcosystemHealthIndex } from "../audit/ecosystem_health_types";
import type { DecisiveVariableTrendReport } from "../audit/trend_types";
import type { FailurePrediction } from "../audit/prediction_types";
import type { PredictionPolicySnapshot } from "../audit/policy_visibility_types";
import type { GovernanceAuditRecord } from "../audit/governance_audit_types";
import type { PlaybookDecisionCrosswalk, HeuristicCrosswalkEntry } from "../audit/playbook_crosswalk_types";
import type { GovernanceOutcomeReviewReport, GovernanceOutcomeReview } from "../audit/post_governance_review_types";
import type { EcosystemLoopSummary } from "../audit/ecosystem_loop_types";

/* =========================================================
   Fixtures
   ========================================================= */

function makeHealthIndex(overrides?: Partial<EcosystemHealthIndex["components"]>): EcosystemHealthIndex {
  return {
    overall: 80,
    band: "strong",
    components: {
      stability: 80,
      calibrationQuality: 75,
      governanceEffectiveness: 85,
      policyChurn: 90,
      ...overrides,
    },
    explanationLines: ["Healthy ecosystem."],
    cautionLines: [],
  };
}

function makeTrendReport(overrides?: Partial<DecisiveVariableTrendReport["driftSummary"]>): DecisiveVariableTrendReport {
  return {
    totalRuns: 5,
    variables: [],
    driftSummary: {
      mostFrequentVariable: "protein",
      mostRecentVariable: "calories",
      recurringViolations: [],
      stabilizing: false,
      drifting: false,
      summaryLines: [],
      ...overrides,
    },
    occurrenceTimeline: [],
  };
}

function makePrediction(overrides?: Partial<FailurePrediction>): FailurePrediction {
  return {
    predictedVariable: "protein",
    confidence: "high",
    riskDirection: "stable",
    explanationLines: ["Protein placement has recurred."],
    signals: [],
    ...overrides,
  };
}

function makePolicySnapshot(overrides?: { confidenceBias?: number; calibrationWindow?: number; policyVersion?: string }): PredictionPolicySnapshot {
  return {
    policyVersion: "pol-v2",
    basePredictionRule: "highest-frequency",
    confidenceRule: "streak-based",
    escalationRule: "threshold-based",
    uncertaintyRule: "shallow-history",
    boundedAdjustmentState: {
      confidenceBias: overrides?.confidenceBias ?? 0.05,
      escalationBias: 0.0,
      uncertaintyBias: -0.03,
      calibrationWindow: overrides?.calibrationWindow ?? 10,
    },
    calibrationState: {
      totalPredictions: 10,
      resolvedPredictions: 9,
      exactMatchRate: 0.7,
      directionMatchRate: 0.8,
      tooAggressiveRate: 0.1,
      tooWeakRate: 0.1,
    },
    currentPredictionContext: {
      predictedVariable: "protein",
      confidence: "high",
      riskDirection: "stable",
    },
    explanationLines: [],
  };
}

function makeAuditRecord(action: "promote" | "rollback" = "promote"): GovernanceAuditRecord {
  return {
    actionId: "aud-aaaaaaaa",
    timestamp: "2026-01-01T00:00:00.000Z",
    domain: "nutrition",
    action,
    currentPolicyVersionId: null,
    recommendedPolicyVersionId: "pol-v2",
    chosenPolicyVersionId: "pol-v2",
    expectedGains: [],
    expectedTradeoffs: [],
    expectedRisks: [],
    recommendationStrength: "strong",
    recommendationConfidence: "high",
    humanReason: "Bench confirms improvement.",
    benchEvidenceSummary: [],
    recommendationSummary: [],
  };
}

function makeReviewReport(outcomeClass?: GovernanceOutcomeReview["outcomeClass"]): GovernanceOutcomeReviewReport {
  const reviews: GovernanceOutcomeReview[] = outcomeClass
    ? [{
        actionId: "aud-aaaaaaaa",
        domain: "nutrition",
        action: "promote",
        fromPolicyVersionId: null,
        toPolicyVersionId: "pol-v2",
        expectation: { expectedGains: [], expectedTradeoffs: [], expectedRisks: [] },
        observed: {
          postActionRuns: 3,
          exactMatchDelta: 0.05,
          directionMatchDelta: null,
          tooAggressiveDelta: null,
          tooWeakDelta: null,
          unresolvedDelta: null,
          summaryLines: [],
        },
        outcomeClass,
        reviewLines: [],
      }]
    : [];

  return {
    totalGovernanceActions: reviews.length,
    reviewableActions: reviews.length,
    outcomeCounts: {
      met_expectations: outcomeClass === "met_expectations" ? 1 : 0,
      partially_met: outcomeClass === "partially_met" ? 1 : 0,
      did_not_meet: outcomeClass === "did_not_meet" ? 1 : 0,
      insufficient_followup: 0,
    },
    reviews,
    summaryLines: [],
  };
}

function makeLoopSummary(
  stabilizing = false,
  drifting = false,
  overcorrecting = false
): EcosystemLoopSummary {
  return {
    totalAuditRuns: 5,
    totalPredictions: 5,
    totalGovernanceActions: 0,
    totalOutcomeReviews: 0,
    predictionToDecisionPatterns: [],
    governanceChoiceOutcomePatterns: [],
    doctrineEmergencePatterns: [],
    ecosystemChangeSummary: {
      stabilizing,
      drifting,
      overcorrecting,
      summaryLines: [],
    },
    summaryLines: [],
  };
}

function makeCrosswalk(supportingCount = 2, cautioningCount = 1): PlaybookDecisionCrosswalk {
  const makeEntry = (id: string, title: string, rel: HeuristicCrosswalkEntry["relevance"]): HeuristicCrosswalkEntry => ({
    heuristicId: id,
    title,
    rule: "If X, then Y.",
    domain: "nutrition",
    relevance: rel,
    reasonLines: [],
  });

  return {
    domain: "nutrition",
    supportingHeuristics: Array.from({ length: supportingCount }, (_, i) =>
      makeEntry(`ph-sup${i}`, `Supporting doctrine ${i + 1}`, "supports")
    ),
    cautioningHeuristics: Array.from({ length: cautioningCount }, (_, i) =>
      makeEntry(`ph-cau${i}`, `Cautioning doctrine ${i + 1}`, "cautions")
    ),
    neutralHeuristics: [],
    summaryLines: [],
  };
}

function buildBase() {
  return buildEcosystemCockpitSnapshot(
    makeHealthIndex(),
    makeTrendReport(),
    makePrediction(),
    makePolicySnapshot(),
    [],
    null,
    makeReviewReport(),
    makeLoopSummary()
  );
}

/* =========================================================
   Scenario 1: health.overall
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — health.overall matches healthIndex.overall", () => {
  it("health.overall = 80", () => {
    expect(buildBase().health.overall).toBe(80);
  });
});

/* =========================================================
   Scenario 2: health.band
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — health.band matches healthIndex.band", () => {
  it("health.band = 'strong'", () => {
    expect(buildBase().health.band).toBe("strong");
  });
});

/* =========================================================
   Scenario 3: health component scores
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — health component scores match", () => {
  it("stability = 80", () => {
    expect(buildBase().health.stability).toBe(80);
  });
  it("calibrationQuality = 75", () => {
    expect(buildBase().health.calibrationQuality).toBe(75);
  });
  it("governanceEffectiveness = 85", () => {
    expect(buildBase().health.governanceEffectiveness).toBe(85);
  });
  it("policyChurn = 90", () => {
    expect(buildBase().health.policyChurn).toBe(90);
  });
});

/* =========================================================
   Scenario 4: trends.mostFrequentVariable
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — trends.mostFrequentVariable", () => {
  it("trends.mostFrequentVariable = 'protein'", () => {
    expect(buildBase().trends.mostFrequentVariable).toBe("protein");
  });
});

/* =========================================================
   Scenario 5: trends.mostRecentVariable
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — trends.mostRecentVariable", () => {
  it("trends.mostRecentVariable = 'calories'", () => {
    expect(buildBase().trends.mostRecentVariable).toBe("calories");
  });
});

/* =========================================================
   Scenario 6: driftState = "stabilizing"
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — driftState is 'stabilizing'", () => {
  it("driftState = 'stabilizing' when stabilizing flag is set", () => {
    const snap = buildEcosystemCockpitSnapshot(
      makeHealthIndex(), makeTrendReport(), makePrediction(), makePolicySnapshot(),
      [], null, makeReviewReport(), makeLoopSummary(true)
    );
    expect(snap.trends.driftState).toBe("stabilizing");
  });
});

/* =========================================================
   Scenario 7: driftState = "drifting"
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — driftState is 'drifting'", () => {
  it("driftState = 'drifting' when drifting flag is set", () => {
    const snap = buildEcosystemCockpitSnapshot(
      makeHealthIndex(), makeTrendReport(), makePrediction(), makePolicySnapshot(),
      [], null, makeReviewReport(), makeLoopSummary(false, true)
    );
    expect(snap.trends.driftState).toBe("drifting");
  });
});

/* =========================================================
   Scenario 8: driftState = "stable"
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — driftState is 'stable'", () => {
  it("driftState = 'stable' when no flags set", () => {
    expect(buildBase().trends.driftState).toBe("stable");
  });
});

/* =========================================================
   Scenario 9: driftState = "overcorrecting"
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — driftState is 'overcorrecting'", () => {
  it("driftState = 'overcorrecting' when overcorrecting flag is set", () => {
    const snap = buildEcosystemCockpitSnapshot(
      makeHealthIndex(), makeTrendReport(), makePrediction(), makePolicySnapshot(),
      [], null, makeReviewReport(), makeLoopSummary(false, false, true)
    );
    expect(snap.trends.driftState).toBe("overcorrecting");
  });
});

/* =========================================================
   Scenario 10: prediction.predictedVariable
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — prediction.predictedVariable", () => {
  it("predictedVariable = 'protein'", () => {
    expect(buildBase().prediction.predictedVariable).toBe("protein");
  });
});

/* =========================================================
   Scenario 11: prediction.confidence
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — prediction.confidence", () => {
  it("confidence = 'high'", () => {
    expect(buildBase().prediction.confidence).toBe("high");
  });
});

/* =========================================================
   Scenario 12: prediction.riskDirection
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — prediction.riskDirection", () => {
  it("riskDirection = 'stable'", () => {
    expect(buildBase().prediction.riskDirection).toBe("stable");
  });
});

/* =========================================================
   Scenario 13: governance.recentGovernanceAction is null when auditTrail empty
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — recentGovernanceAction is null when trail is empty", () => {
  it("recentGovernanceAction = null", () => {
    expect(buildBase().governance.recentGovernanceAction).toBeNull();
  });
});

/* =========================================================
   Scenario 14: governance.recentGovernanceAction from latest audit record
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — recentGovernanceAction from latest audit record", () => {
  it("recentGovernanceAction = 'promote'", () => {
    const snap = buildEcosystemCockpitSnapshot(
      makeHealthIndex(), makeTrendReport(), makePrediction(), makePolicySnapshot(),
      [makeAuditRecord("promote")], null, makeReviewReport(), makeLoopSummary()
    );
    expect(snap.governance.recentGovernanceAction).toBe("promote");
  });
});

/* =========================================================
   Scenario 15: governance.latestOutcomeClass is null when no reviews
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — latestOutcomeClass is null when no reviews", () => {
  it("latestOutcomeClass = null", () => {
    expect(buildBase().governance.latestOutcomeClass).toBeNull();
  });
});

/* =========================================================
   Scenario 16: governance.latestOutcomeClass from last review
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — latestOutcomeClass from last review", () => {
  it("latestOutcomeClass = 'met_expectations'", () => {
    const snap = buildEcosystemCockpitSnapshot(
      makeHealthIndex(), makeTrendReport(), makePrediction(), makePolicySnapshot(),
      [], null, makeReviewReport("met_expectations"), makeLoopSummary()
    );
    expect(snap.governance.latestOutcomeClass).toBe("met_expectations");
  });
});

/* =========================================================
   Scenario 17: policy.policyVersionId
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — policy.policyVersionId", () => {
  it("policyVersionId = 'pol-v2'", () => {
    expect(buildBase().policy.policyVersionId).toBe("pol-v2");
  });
});

/* =========================================================
   Scenario 18: policy.confidenceBias
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — policy.confidenceBias", () => {
  it("confidenceBias = 0.05", () => {
    expect(buildBase().policy.confidenceBias).toBe(0.05);
  });
});

/* =========================================================
   Scenario 19: policy.calibrationWindow
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — policy.calibrationWindow", () => {
  it("calibrationWindow = 10", () => {
    expect(buildBase().policy.calibrationWindow).toBe(10);
  });
});

/* =========================================================
   Scenario 20: doctrine.supportingCount
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — doctrine.supportingCount", () => {
  it("supportingCount = 2 when crosswalk has 2 supporting heuristics", () => {
    const snap = buildEcosystemCockpitSnapshot(
      makeHealthIndex(), makeTrendReport(), makePrediction(), makePolicySnapshot(),
      [], makeCrosswalk(2, 0), makeReviewReport(), makeLoopSummary()
    );
    expect(snap.doctrine.supportingCount).toBe(2);
  });
});

/* =========================================================
   Scenario 21: doctrine.cautioningCount
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — doctrine.cautioningCount", () => {
  it("cautioningCount = 1 when crosswalk has 1 cautioning heuristic", () => {
    const snap = buildEcosystemCockpitSnapshot(
      makeHealthIndex(), makeTrendReport(), makePrediction(), makePolicySnapshot(),
      [], makeCrosswalk(2, 1), makeReviewReport(), makeLoopSummary()
    );
    expect(snap.doctrine.cautioningCount).toBe(1);
  });
});

/* =========================================================
   Scenario 22: doctrine counts are 0 when crosswalk is null
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — doctrine counts are 0 when crosswalk is null", () => {
  it("supportingCount = 0 and cautioningCount = 0", () => {
    const snap = buildBase();
    expect(snap.doctrine.supportingCount).toBe(0);
    expect(snap.doctrine.cautioningCount).toBe(0);
  });
});

/* =========================================================
   Scenario 23: attention alert for calibration fragile
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — attention alert when calibrationQuality < 50", () => {
  it("alert mentions 'Calibration quality is fragile'", () => {
    const snap = buildEcosystemCockpitSnapshot(
      makeHealthIndex({ calibrationQuality: 40 }),
      makeTrendReport(), makePrediction(), makePolicySnapshot(),
      [], null, makeReviewReport(), makeLoopSummary()
    );
    expect(snap.attention.alerts.some((a) => a.toLowerCase().includes("calibration quality is fragile"))).toBe(true);
  });
});

/* =========================================================
   Scenario 24: attention alert for low confidence
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — attention alert for low prediction confidence", () => {
  it("alert mentions low confidence", () => {
    const snap = buildEcosystemCockpitSnapshot(
      makeHealthIndex(), makeTrendReport(),
      makePrediction({ confidence: "low" }),
      makePolicySnapshot(), [], null, makeReviewReport(), makeLoopSummary()
    );
    expect(snap.attention.alerts.some((a) => a.toLowerCase().includes("low"))).toBe(true);
  });
});

/* =========================================================
   Scenario 25: attention alert for overcorrecting churn
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — attention alert for overcorrecting", () => {
  it("alert mentions governance churn", () => {
    const snap = buildEcosystemCockpitSnapshot(
      makeHealthIndex(), makeTrendReport(), makePrediction(), makePolicySnapshot(),
      [], null, makeReviewReport(), makeLoopSummary(false, false, true)
    );
    expect(snap.attention.alerts.some((a) => a.toLowerCase().includes("churn"))).toBe(true);
  });
});

/* =========================================================
   Scenario 26: attention alert when doctrine cautions > supporting
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — attention alert when cautioning > supporting", () => {
  it("alert mentions doctrine cautions", () => {
    const snap = buildEcosystemCockpitSnapshot(
      makeHealthIndex(), makeTrendReport(), makePrediction(), makePolicySnapshot(),
      [], makeCrosswalk(1, 3), makeReviewReport(), makeLoopSummary()
    );
    expect(snap.attention.alerts.some((a) => a.toLowerCase().includes("doctrine cautions"))).toBe(true);
  });
});

/* =========================================================
   Scenario 27: attention alert when currentStreak >= 3
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — attention alert for recurring streak >= 3", () => {
  it("alert mentions recurred in consecutive runs", () => {
    const trendReport = makeTrendReport();
    trendReport.variables = [{
      variable: "protein",
      count: 5,
      firstSeen: "2026-01-01",
      lastSeen: "2026-01-05",
      currentStreak: 4,
      longestStreak: 4,
      statuses: {},
    }];
    const snap = buildEcosystemCockpitSnapshot(
      makeHealthIndex(), trendReport, makePrediction(), makePolicySnapshot(),
      [], null, makeReviewReport(), makeLoopSummary()
    );
    expect(snap.attention.alerts.some((a) => a.includes("consecutive runs"))).toBe(true);
  });
});

/* =========================================================
   Scenario 28: attention.alerts is empty when ecosystem is fully healthy
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — no alerts when fully healthy", () => {
  it("alerts is empty", () => {
    const snap = buildEcosystemCockpitSnapshot(
      makeHealthIndex({ stability: 90, calibrationQuality: 85, governanceEffectiveness: 90, policyChurn: 88 }),
      makeTrendReport(),
      makePrediction({ confidence: "high", riskDirection: "stable" }),
      makePolicySnapshot(),
      [], makeCrosswalk(3, 0), makeReviewReport(), makeLoopSummary()
    );
    expect(snap.attention.alerts).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 29: trends.currentDominantStreak is null when no streak >= 3
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — currentDominantStreak is null when no streak >= 3", () => {
  it("currentDominantStreak = null", () => {
    const trendReport = makeTrendReport();
    trendReport.variables = [{
      variable: "protein",
      count: 2,
      firstSeen: "2026-01-01",
      lastSeen: "2026-01-02",
      currentStreak: 2,
      longestStreak: 2,
      statuses: {},
    }];
    const snap = buildEcosystemCockpitSnapshot(
      makeHealthIndex(), trendReport, makePrediction(), makePolicySnapshot(),
      [], null, makeReviewReport(), makeLoopSummary()
    );
    expect(snap.trends.currentDominantStreak).toBeNull();
  });
});

/* =========================================================
   Scenario 30: does not mutate any input array
   ========================================================= */

describe("buildEcosystemCockpitSnapshot — does not mutate any input array", () => {
  it("auditTrail length unchanged", () => {
    const trail = [makeAuditRecord()];
    buildEcosystemCockpitSnapshot(
      makeHealthIndex(), makeTrendReport(), makePrediction(), makePolicySnapshot(),
      trail, null, makeReviewReport(), makeLoopSummary()
    );
    expect(trail).toHaveLength(1);
  });
});
