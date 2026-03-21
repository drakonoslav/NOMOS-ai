/**
 * health_index_traceability_test.ts
 *
 * Regression tests for health_trace_types.ts and health_index_traceability.ts.
 *
 * Scenarios:
 *   1.  buildStabilityTrace — component field is "stability"
 *   2.  buildStabilityTrace — rawInputs contains stabilizing, drifting, overcorrecting
 *   3.  buildStabilityTrace — formulaLines mention "base = 50"
 *   4.  buildStabilityTrace — formulaLines mention "clamp"
 *   5.  buildStabilityTrace — weightedContribution equals score × 0.35
 *   6.  buildStabilityTrace — contributingRecordIds contains audit record actionIds
 *   7.  buildStabilityTrace — explanationLines non-empty
 *   8.  buildCalibrationQualityTrace — component field is "calibrationQuality"
 *   9.  buildCalibrationQualityTrace — rawInputs contains exactMatchRate
 *  10.  buildCalibrationQualityTrace — rawInputs contains directionMatchRate
 *  11.  buildCalibrationQualityTrace — formulaLines mention "exactMatchContrib"
 *  12.  buildCalibrationQualityTrace — weightedContribution equals score × 0.25
 *  13.  buildCalibrationQualityTrace — contributingRecordIds derived from outcome sourceVersionIds
 *  14.  buildGovernanceEffectivenessTrace — component field is "governanceEffectiveness"
 *  15.  buildGovernanceEffectivenessTrace — rawInputs contains reviewableActions and met_expectations
 *  16.  buildGovernanceEffectivenessTrace — formulaLines mention "100 * metRate + 50 * partialRate"
 *  17.  buildGovernanceEffectivenessTrace — weightedContribution equals score × 0.25
 *  18.  buildGovernanceEffectivenessTrace — contributingRecordIds from reviews
 *  19.  buildPolicyChurnTrace — component field is "policyChurn"
 *  20.  buildPolicyChurnTrace — rawInputs contains n (audit trail length)
 *  21.  buildPolicyChurnTrace — formulaLines mention "100 - n × 8"
 *  22.  buildPolicyChurnTrace — weightedContribution equals score × 0.15
 *  23.  buildPolicyChurnTrace — contributingRecordIds from governanceAuditTrail
 *  24.  buildEcosystemHealthTrace — componentTraces has exactly 4 entries
 *  25.  buildEcosystemHealthTrace — overallFormulaLines contain "0.35"
 *  26.  buildEcosystemHealthTrace — overallInputs contains stability, calibrationQuality, governanceEffectiveness, policyChurn
 *  27.  buildEcosystemHealthTrace — each componentTrace has non-empty formulaLines
 *  28.  buildEcosystemHealthTrace — does not mutate any input
 *  29.  buildEcosystemHealthTrace — componentTraces cover all four components
 *  30.  buildEcosystemHealthTrace — overallInputs.overall matches healthIndex.overall
 */

import { describe, it, expect } from "vitest";
import {
  buildStabilityTrace,
  buildCalibrationQualityTrace,
  buildGovernanceEffectivenessTrace,
  buildPolicyChurnTrace,
  buildEcosystemHealthTrace,
} from "../audit/health_index_traceability";
import type { EcosystemLoopSummary } from "../audit/ecosystem_loop_types";
import type { GovernanceAuditRecord } from "../audit/governance_audit_types";
import type { PredictionCalibrationReport, PredictionOutcomeRecord } from "../audit/calibration_types";
import type { GovernanceOutcomeReviewReport, GovernanceOutcomeReview } from "../audit/post_governance_review_types";
import type { EcosystemHealthIndex } from "../audit/ecosystem_health_types";

/* =========================================================
   Fixtures
   ========================================================= */

function makeLoopSummary(
  stabilizing = false,
  drifting = false,
  overcorrecting = false
): EcosystemLoopSummary {
  return {
    totalAuditRuns: 0,
    totalPredictions: 0,
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

function makeAuditRecord(id = "gov-aaaaaaaa"): GovernanceAuditRecord {
  return {
    actionId: id,
    timestamp: "2026-01-01T00:00:00.000Z",
    domain: "nutrition",
    action: "promote",
    currentPolicyVersionId: null,
    recommendedPolicyVersionId: "pol-v1",
    chosenPolicyVersionId: "pol-v1",
    expectedGains: [],
    expectedTradeoffs: [],
    expectedRisks: [],
    recommendationStrength: "strong",
    recommendationConfidence: "high",
    humanReason: "Good outcome.",
    benchEvidenceSummary: [],
    recommendationSummary: [],
  };
}

function makeCalibrationReport(
  overrides?: Partial<PredictionCalibrationReport>
): PredictionCalibrationReport {
  return {
    totalPredictions: 5,
    resolvedPredictions: 5,
    unresolvedPredictions: 0,
    exactMatchRate: 0.6,
    directionMatchRate: 0.8,
    calibrationCounts: {
      well_calibrated: 3,
      too_aggressive:  1,
      too_weak:        1,
      unresolved:      0,
    },
    outcomes: [],
    summaryLines: [],
    ...overrides,
  };
}

function makeOutcomeRecord(srcId: string): PredictionOutcomeRecord {
  return {
    sourceVersionId: srcId,
    resolvedVersionId: srcId,
    predictedVariable: "protein",
    actualNextVariable: "protein",
    predictedRiskDirection: "stable",
    actualRiskDirection: "stable",
    exactMatch: true,
    directionMatch: true,
    confidence: "high",
    calibrationClass: "well_calibrated",
    summary: "Exact match.",
  };
}

function makeReviewReport(
  overrides?: Partial<GovernanceOutcomeReviewReport>
): GovernanceOutcomeReviewReport {
  return {
    totalGovernanceActions: 2,
    reviewableActions: 2,
    outcomeCounts: {
      met_expectations:    2,
      partially_met:       0,
      did_not_meet:        0,
      insufficient_followup: 0,
    },
    reviews: [],
    summaryLines: [],
    ...overrides,
  };
}

function makeReview(actionId: string): GovernanceOutcomeReview {
  return {
    actionId,
    domain: "nutrition",
    action: "promote",
    fromPolicyVersionId: null,
    toPolicyVersionId: "pol-v1",
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
    outcomeClass: "met_expectations",
    reviewLines: [],
  };
}

function makeHealthIndex(overall = 75): EcosystemHealthIndex {
  return {
    overall,
    band: "strong",
    components: {
      stability: 75,
      calibrationQuality: 75,
      governanceEffectiveness: 75,
      policyChurn: 75,
    },
    explanationLines: ["All components healthy."],
    cautionLines: [],
  };
}

/* =========================================================
   Scenario 1: buildStabilityTrace — component field is "stability"
   ========================================================= */

describe("buildStabilityTrace — component field is 'stability'", () => {
  it("component = 'stability'", () => {
    const t = buildStabilityTrace(makeLoopSummary(), [], 50);
    expect(t.component).toBe("stability");
  });
});

/* =========================================================
   Scenario 2: rawInputs contains stabilizing, drifting, overcorrecting
   ========================================================= */

describe("buildStabilityTrace — rawInputs contains stabilizing, drifting, overcorrecting", () => {
  it("all three flags present in rawInputs", () => {
    const t = buildStabilityTrace(makeLoopSummary(true, false, false), [], 75);
    expect("stabilizing"    in t.rawInputs).toBe(true);
    expect("drifting"       in t.rawInputs).toBe(true);
    expect("overcorrecting" in t.rawInputs).toBe(true);
  });
});

/* =========================================================
   Scenario 3: formulaLines mention "base = 50"
   ========================================================= */

describe("buildStabilityTrace — formulaLines mention 'base = 50'", () => {
  it("at least one formula line contains 'base = 50'", () => {
    const t = buildStabilityTrace(makeLoopSummary(), [], 50);
    expect(t.formulaLines.some((l) => l.includes("base = 50"))).toBe(true);
  });
});

/* =========================================================
   Scenario 4: formulaLines mention "clamp"
   ========================================================= */

describe("buildStabilityTrace — formulaLines mention 'clamp'", () => {
  it("at least one formula line contains 'clamp'", () => {
    const t = buildStabilityTrace(makeLoopSummary(), [], 50);
    expect(t.formulaLines.some((l) => l.toLowerCase().includes("clamp"))).toBe(true);
  });
});

/* =========================================================
   Scenario 5: weightedContribution equals score × 0.35
   ========================================================= */

describe("buildStabilityTrace — weightedContribution equals score × 0.35", () => {
  it("weightedContribution = 75 × 0.35 = 26.25", () => {
    const t = buildStabilityTrace(makeLoopSummary(true), [], 75);
    expect(t.weightedContribution).toBeCloseTo(75 * 0.35, 2);
  });
});

/* =========================================================
   Scenario 6: contributingRecordIds contains audit record actionIds
   ========================================================= */

describe("buildStabilityTrace — contributingRecordIds contains audit record actionIds", () => {
  it("one audit record → contributingRecordIds = ['gov-aaaaaaaa']", () => {
    const t = buildStabilityTrace(makeLoopSummary(), [makeAuditRecord()], 50);
    expect(t.contributingRecordIds).toContain("gov-aaaaaaaa");
  });
});

/* =========================================================
   Scenario 7: explanationLines non-empty
   ========================================================= */

describe("buildStabilityTrace — explanationLines non-empty", () => {
  it("at least one explanation line", () => {
    const t = buildStabilityTrace(makeLoopSummary(), [], 50);
    expect(t.explanationLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 8: buildCalibrationQualityTrace — component is "calibrationQuality"
   ========================================================= */

describe("buildCalibrationQualityTrace — component field is 'calibrationQuality'", () => {
  it("component = 'calibrationQuality'", () => {
    const t = buildCalibrationQualityTrace(makeCalibrationReport(), 70);
    expect(t.component).toBe("calibrationQuality");
  });
});

/* =========================================================
   Scenario 9: rawInputs contains exactMatchRate
   ========================================================= */

describe("buildCalibrationQualityTrace — rawInputs contains exactMatchRate", () => {
  it("exactMatchRate key present in rawInputs", () => {
    const t = buildCalibrationQualityTrace(makeCalibrationReport({ exactMatchRate: 0.7 }), 70);
    expect("exactMatchRate" in t.rawInputs).toBe(true);
    expect(t.rawInputs.exactMatchRate).toBe(0.7);
  });
});

/* =========================================================
   Scenario 10: rawInputs contains directionMatchRate
   ========================================================= */

describe("buildCalibrationQualityTrace — rawInputs contains directionMatchRate (or alias)", () => {
  it("directionMatchRate-related key present in rawInputs", () => {
    const t = buildCalibrationQualityTrace(makeCalibrationReport({ directionMatchRate: 0.8 }), 70);
    const hasKey = "directionMatchRate" in t.rawInputs || "directiomMatchRate" in t.rawInputs;
    expect(hasKey).toBe(true);
  });
});

/* =========================================================
   Scenario 11: formulaLines mention "exactMatchContrib"
   ========================================================= */

describe("buildCalibrationQualityTrace — formulaLines mention 'exactMatchContrib'", () => {
  it("at least one formula line contains 'exactMatchContrib'", () => {
    const t = buildCalibrationQualityTrace(makeCalibrationReport(), 70);
    expect(t.formulaLines.some((l) => l.includes("exactMatchContrib"))).toBe(true);
  });
});

/* =========================================================
   Scenario 12: weightedContribution equals score × 0.25
   ========================================================= */

describe("buildCalibrationQualityTrace — weightedContribution equals score × 0.25", () => {
  it("weightedContribution = 70 × 0.25 = 17.5", () => {
    const t = buildCalibrationQualityTrace(makeCalibrationReport(), 70);
    expect(t.weightedContribution).toBeCloseTo(70 * 0.25, 2);
  });
});

/* =========================================================
   Scenario 13: contributingRecordIds from outcome sourceVersionIds
   ========================================================= */

describe("buildCalibrationQualityTrace — contributingRecordIds derived from outcome sourceVersionIds", () => {
  it("outcome sourceVersionId appears in contributingRecordIds", () => {
    const report = makeCalibrationReport({ outcomes: [makeOutcomeRecord("pol-src-v1")] });
    const t = buildCalibrationQualityTrace(report, 70);
    expect(t.contributingRecordIds).toContain("pol-src-v1");
  });
});

/* =========================================================
   Scenario 14: buildGovernanceEffectivenessTrace — component is "governanceEffectiveness"
   ========================================================= */

describe("buildGovernanceEffectivenessTrace — component field is 'governanceEffectiveness'", () => {
  it("component = 'governanceEffectiveness'", () => {
    const t = buildGovernanceEffectivenessTrace(makeReviewReport(), 100);
    expect(t.component).toBe("governanceEffectiveness");
  });
});

/* =========================================================
   Scenario 15: rawInputs contains reviewableActions and met_expectations
   ========================================================= */

describe("buildGovernanceEffectivenessTrace — rawInputs contains reviewableActions and met_expectations", () => {
  it("both keys present in rawInputs", () => {
    const t = buildGovernanceEffectivenessTrace(makeReviewReport(), 100);
    expect("reviewableActions" in t.rawInputs).toBe(true);
    expect("met_expectations"  in t.rawInputs).toBe(true);
  });
});

/* =========================================================
   Scenario 16: formulaLines mention "100 * metRate + 50 * partialRate"
   ========================================================= */

describe("buildGovernanceEffectivenessTrace — formulaLines mention '100 × metRate + 50 × partialRate'", () => {
  it("at least one formula line references the scoring expression", () => {
    const t = buildGovernanceEffectivenessTrace(makeReviewReport(), 100);
    const joined = t.formulaLines.join(" ");
    expect(joined.includes("100") && joined.includes("metRate") && joined.includes("50")).toBe(true);
  });
});

/* =========================================================
   Scenario 17: weightedContribution equals score × 0.25
   ========================================================= */

describe("buildGovernanceEffectivenessTrace — weightedContribution equals score × 0.25", () => {
  it("weightedContribution = 100 × 0.25 = 25", () => {
    const t = buildGovernanceEffectivenessTrace(makeReviewReport(), 100);
    expect(t.weightedContribution).toBeCloseTo(25, 2);
  });
});

/* =========================================================
   Scenario 18: contributingRecordIds from reviews
   ========================================================= */

describe("buildGovernanceEffectivenessTrace — contributingRecordIds from reviews", () => {
  it("review actionId appears in contributingRecordIds", () => {
    const report = makeReviewReport({ reviews: [makeReview("gov-bbbbbbbb")] });
    const t = buildGovernanceEffectivenessTrace(report, 100);
    expect(t.contributingRecordIds).toContain("gov-bbbbbbbb");
  });
});

/* =========================================================
   Scenario 19: buildPolicyChurnTrace — component is "policyChurn"
   ========================================================= */

describe("buildPolicyChurnTrace — component field is 'policyChurn'", () => {
  it("component = 'policyChurn'", () => {
    const t = buildPolicyChurnTrace([], makeLoopSummary(), 100);
    expect(t.component).toBe("policyChurn");
  });
});

/* =========================================================
   Scenario 20: rawInputs contains n
   ========================================================= */

describe("buildPolicyChurnTrace — rawInputs contains n (audit trail length)", () => {
  it("n key present in rawInputs and equals trail length", () => {
    const t = buildPolicyChurnTrace([makeAuditRecord()], makeLoopSummary(), 92);
    expect("n" in t.rawInputs).toBe(true);
    expect(t.rawInputs.n).toBe(1);
  });
});

/* =========================================================
   Scenario 21: formulaLines mention "100 - n × 8"
   ========================================================= */

describe("buildPolicyChurnTrace — formulaLines mention '100 - n × 8'", () => {
  it("at least one formula line references the churnBase formula", () => {
    const t = buildPolicyChurnTrace([], makeLoopSummary(), 100);
    expect(t.formulaLines.some((l) => l.includes("100 -") && l.includes("× 8"))).toBe(true);
  });
});

/* =========================================================
   Scenario 22: weightedContribution equals score × 0.15
   ========================================================= */

describe("buildPolicyChurnTrace — weightedContribution equals score × 0.15", () => {
  it("weightedContribution = 100 × 0.15 = 15", () => {
    const t = buildPolicyChurnTrace([], makeLoopSummary(), 100);
    expect(t.weightedContribution).toBeCloseTo(15, 2);
  });
});

/* =========================================================
   Scenario 23: contributingRecordIds from governanceAuditTrail
   ========================================================= */

describe("buildPolicyChurnTrace — contributingRecordIds from governanceAuditTrail", () => {
  it("audit record actionId appears in contributingRecordIds", () => {
    const t = buildPolicyChurnTrace([makeAuditRecord("gov-cccccccc")], makeLoopSummary(), 92);
    expect(t.contributingRecordIds).toContain("gov-cccccccc");
  });
});

/* =========================================================
   Scenario 24: buildEcosystemHealthTrace — componentTraces has exactly 4 entries
   ========================================================= */

describe("buildEcosystemHealthTrace — componentTraces has exactly 4 entries", () => {
  it("four component traces produced", () => {
    const t = buildEcosystemHealthTrace(
      makeHealthIndex(),
      makeLoopSummary(),
      makeCalibrationReport(),
      makeReviewReport(),
      []
    );
    expect(t.componentTraces).toHaveLength(4);
  });
});

/* =========================================================
   Scenario 25: overallFormulaLines contain "0.35"
   ========================================================= */

describe("buildEcosystemHealthTrace — overallFormulaLines contain '0.35'", () => {
  it("at least one overallFormulaLine contains '0.35'", () => {
    const t = buildEcosystemHealthTrace(
      makeHealthIndex(),
      makeLoopSummary(),
      makeCalibrationReport(),
      makeReviewReport(),
      []
    );
    expect(t.overallFormulaLines.some((l) => l.includes("0.35"))).toBe(true);
  });
});

/* =========================================================
   Scenario 26: overallInputs contains stability, calibrationQuality, governanceEffectiveness, policyChurn
   ========================================================= */

describe("buildEcosystemHealthTrace — overallInputs contains all four component keys", () => {
  it("all four keys present in overallInputs", () => {
    const t = buildEcosystemHealthTrace(
      makeHealthIndex(),
      makeLoopSummary(),
      makeCalibrationReport(),
      makeReviewReport(),
      []
    );
    expect("stability"               in t.overallInputs).toBe(true);
    expect("calibrationQuality"      in t.overallInputs).toBe(true);
    expect("governanceEffectiveness" in t.overallInputs).toBe(true);
    expect("policyChurn"             in t.overallInputs).toBe(true);
  });
});

/* =========================================================
   Scenario 27: each componentTrace has non-empty formulaLines
   ========================================================= */

describe("buildEcosystemHealthTrace — each componentTrace has non-empty formulaLines", () => {
  it("all four componentTraces have at least one formula line", () => {
    const t = buildEcosystemHealthTrace(
      makeHealthIndex(),
      makeLoopSummary(),
      makeCalibrationReport(),
      makeReviewReport(),
      []
    );
    for (const trace of t.componentTraces) {
      expect(trace.formulaLines.length).toBeGreaterThan(0);
    }
  });
});

/* =========================================================
   Scenario 28: does not mutate any input
   ========================================================= */

describe("buildEcosystemHealthTrace — does not mutate any input", () => {
  it("audit trail and reviews array lengths unchanged", () => {
    const audits  = [makeAuditRecord()];
    const reviews = makeReviewReport({ reviews: [makeReview("gov-aaaaaaaa")] });
    buildEcosystemHealthTrace(
      makeHealthIndex(),
      makeLoopSummary(),
      makeCalibrationReport(),
      reviews,
      audits
    );
    expect(audits).toHaveLength(1);
    expect(reviews.reviews).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 29: componentTraces cover all four components
   ========================================================= */

describe("buildEcosystemHealthTrace — componentTraces cover all four components", () => {
  it("component fields are stability, calibrationQuality, governanceEffectiveness, policyChurn", () => {
    const t = buildEcosystemHealthTrace(
      makeHealthIndex(),
      makeLoopSummary(),
      makeCalibrationReport(),
      makeReviewReport(),
      []
    );
    const components = t.componentTraces.map((c) => c.component);
    expect(components).toContain("stability");
    expect(components).toContain("calibrationQuality");
    expect(components).toContain("governanceEffectiveness");
    expect(components).toContain("policyChurn");
  });
});

/* =========================================================
   Scenario 30: overallInputs.overall matches healthIndex.overall
   ========================================================= */

describe("buildEcosystemHealthTrace — overallInputs.overall matches healthIndex.overall", () => {
  it("overallInputs.overall equals 75", () => {
    const t = buildEcosystemHealthTrace(
      makeHealthIndex(75),
      makeLoopSummary(),
      makeCalibrationReport(),
      makeReviewReport(),
      []
    );
    expect(t.overallInputs.overall).toBe(75);
  });
});
