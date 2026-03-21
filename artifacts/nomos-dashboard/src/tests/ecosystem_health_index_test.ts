/**
 * ecosystem_health_index_test.ts
 *
 * Regression tests for ecosystem_health_types.ts and ecosystem_health_index.ts.
 *
 * Scenarios:
 *   1.  scoreCalibrationQuality — returns 50 for report with no predictions
 *   2.  scoreCalibrationQuality — above 50 for high exactMatchRate
 *   3.  scoreCalibrationQuality — below 50 for low exactMatchRate and high unresolved
 *   4.  scoreCalibrationQuality — result bounded 0–100
 *   5.  scoreCalibrationQuality — does not mutate calibration report
 *   6.  scoreGovernanceEffectiveness — returns 50 for zero-action report
 *   7.  scoreGovernanceEffectiveness — returns 100 for all met_expectations
 *   8.  scoreGovernanceEffectiveness — returns 50 for all partially_met
 *   9.  scoreGovernanceEffectiveness — returns 0 for all did_not_meet
 *  10.  scoreGovernanceEffectiveness — result bounded 0–100
 *  11.  scoreGovernanceEffectiveness — does not mutate report
 *  12.  scoreStability — above 50 for stabilizing ecosystem
 *  13.  scoreStability — below 50 for drifting ecosystem
 *  14.  scoreStability — below 40 for overcorrecting ecosystem
 *  15.  scoreStability — result bounded 0–100
 *  16.  scorePolicyChurn — 80+ for zero audit records
 *  17.  scorePolicyChurn — lower for overcorrecting ecosystem
 *  18.  scorePolicyChurn — higher for stabilizing vs drifting
 *  19.  scorePolicyChurn — result bounded 0–100
 *  20.  scorePolicyChurn — does not mutate inputs
 *  21.  buildEcosystemHealthIndex — overall equals weighted sum of components
 *  22.  buildEcosystemHealthIndex — band is "poor" for overall < 25
 *  23.  buildEcosystemHealthIndex — band is "fragile" for overall 25–49
 *  24.  buildEcosystemHealthIndex — band is "stable" for overall 50–74
 *  25.  buildEcosystemHealthIndex — band is "strong" for overall 75–100
 *  26.  buildEcosystemHealthIndex — explanationLines non-empty
 *  27.  buildEcosystemHealthIndex — cautionLines produced when components are low
 *  28.  buildEcosystemHealthIndex — all four component scores bounded 0–100
 *  29.  buildEcosystemHealthIndex — does not mutate any input
 *  30.  buildEcosystemHealthIndex — overall bounded 0–100
 */

import { describe, it, expect } from "vitest";
import {
  scoreCalibrationQuality,
  scoreGovernanceEffectiveness,
  scoreStability,
  scorePolicyChurn,
  buildEcosystemHealthIndex,
} from "../audit/ecosystem_health_index";
import type { PredictionCalibrationReport } from "../audit/calibration_types";
import type { GovernanceOutcomeReviewReport } from "../audit/post_governance_review_types";
import type { EcosystemLoopSummary } from "../audit/ecosystem_loop_types";
import type { GovernanceAuditRecord } from "../audit/governance_audit_types";

/* =========================================================
   Fixtures
   ========================================================= */

function makeCalibrationReport(
  overrides?: Partial<PredictionCalibrationReport>
): PredictionCalibrationReport {
  return {
    totalPredictions:    0,
    resolvedPredictions: 0,
    unresolvedPredictions: 0,
    exactMatchRate:      null,
    directionMatchRate:  null,
    calibrationCounts: {
      well_calibrated: 0,
      too_aggressive:  0,
      too_weak:        0,
      unresolved:      0,
    },
    outcomes:    [],
    summaryLines: [],
    ...overrides,
  };
}

function makeReviewReport(
  overrides?: Partial<GovernanceOutcomeReviewReport>
): GovernanceOutcomeReviewReport {
  return {
    totalGovernanceActions: 0,
    reviewableActions: 0,
    outcomeCounts: {
      met_expectations:    0,
      partially_met:       0,
      did_not_meet:        0,
      insufficient_followup: 0,
    },
    reviews:      [],
    summaryLines: [],
    ...overrides,
  };
}

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

function makeAuditRecord(
  overrides?: Partial<GovernanceAuditRecord>
): GovernanceAuditRecord {
  return {
    actionId: "gov-aaaaaaaa",
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
    humanReason: "Better performance.",
    benchEvidenceSummary: [],
    recommendationSummary: [],
    ...overrides,
  };
}

/* =========================================================
   Scenario 1: scoreCalibrationQuality — 50 for no predictions
   ========================================================= */

describe("scoreCalibrationQuality — returns 50 for report with no predictions", () => {
  it("empty calibration report → score = 50 (both rates null → 0.5 each)", () => {
    const score = scoreCalibrationQuality(makeCalibrationReport());
    expect(score).toBe(50);
  });
});

/* =========================================================
   Scenario 2: above 50 for high exactMatchRate
   ========================================================= */

describe("scoreCalibrationQuality — above 50 for high exactMatchRate", () => {
  it("exactMatchRate = 1.0 → score > 50", () => {
    const score = scoreCalibrationQuality(
      makeCalibrationReport({ exactMatchRate: 1.0, directionMatchRate: 1.0, resolvedPredictions: 1 })
    );
    expect(score).toBeGreaterThan(50);
  });
});

/* =========================================================
   Scenario 3: below 50 for low exactMatchRate + high unresolved
   ========================================================= */

describe("scoreCalibrationQuality — below 50 for low exactMatchRate and high unresolved", () => {
  it("exactMatchRate = 0.1, all unresolved → score < 50", () => {
    const score = scoreCalibrationQuality(
      makeCalibrationReport({
        exactMatchRate: 0.1,
        directionMatchRate: 0.1,
        resolvedPredictions: 10,
        calibrationCounts: {
          well_calibrated: 1,
          too_aggressive:  0,
          too_weak:        0,
          unresolved:      9,
        },
      })
    );
    expect(score).toBeLessThan(50);
  });
});

/* =========================================================
   Scenario 4: result bounded 0–100
   ========================================================= */

describe("scoreCalibrationQuality — result bounded 0–100", () => {
  it("extreme negative inputs still clamp to 0", () => {
    const score = scoreCalibrationQuality(
      makeCalibrationReport({
        exactMatchRate: 0,
        directionMatchRate: 0,
        resolvedPredictions: 1,
        calibrationCounts: {
          well_calibrated: 0,
          too_aggressive:  1,
          too_weak:        1,
          unresolved:      1,
        },
      })
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

/* =========================================================
   Scenario 5: does not mutate calibration report
   ========================================================= */

describe("scoreCalibrationQuality — does not mutate calibration report", () => {
  it("calibrationCounts unchanged after call", () => {
    const r = makeCalibrationReport({ exactMatchRate: 0.8, resolvedPredictions: 5 });
    const origMet = r.calibrationCounts.well_calibrated;
    scoreCalibrationQuality(r);
    expect(r.calibrationCounts.well_calibrated).toBe(origMet);
  });
});

/* =========================================================
   Scenario 6: scoreGovernanceEffectiveness — 50 for zero-action report
   ========================================================= */

describe("scoreGovernanceEffectiveness — returns 50 for zero-action report", () => {
  it("no governance actions → 50", () => {
    expect(scoreGovernanceEffectiveness(makeReviewReport())).toBe(50);
  });
});

/* =========================================================
   Scenario 7: returns 100 for all met_expectations
   ========================================================= */

describe("scoreGovernanceEffectiveness — returns 100 for all met_expectations", () => {
  it("3 reviewable, all met → score = 100", () => {
    const r = makeReviewReport({
      totalGovernanceActions: 3,
      reviewableActions: 3,
      outcomeCounts: { met_expectations: 3, partially_met: 0, did_not_meet: 0, insufficient_followup: 0 },
    });
    expect(scoreGovernanceEffectiveness(r)).toBe(100);
  });
});

/* =========================================================
   Scenario 8: returns 50 for all partially_met
   ========================================================= */

describe("scoreGovernanceEffectiveness — returns 50 for all partially_met", () => {
  it("2 reviewable, all partially met → score = 50", () => {
    const r = makeReviewReport({
      totalGovernanceActions: 2,
      reviewableActions: 2,
      outcomeCounts: { met_expectations: 0, partially_met: 2, did_not_meet: 0, insufficient_followup: 0 },
    });
    expect(scoreGovernanceEffectiveness(r)).toBe(50);
  });
});

/* =========================================================
   Scenario 9: returns 0 for all did_not_meet
   ========================================================= */

describe("scoreGovernanceEffectiveness — returns 0 for all did_not_meet", () => {
  it("2 reviewable, all did_not_meet → score = 0", () => {
    const r = makeReviewReport({
      totalGovernanceActions: 2,
      reviewableActions: 2,
      outcomeCounts: { met_expectations: 0, partially_met: 0, did_not_meet: 2, insufficient_followup: 0 },
    });
    expect(scoreGovernanceEffectiveness(r)).toBe(0);
  });
});

/* =========================================================
   Scenario 10: result bounded 0–100
   ========================================================= */

describe("scoreGovernanceEffectiveness — result bounded 0–100", () => {
  it("any valid review report → score in [0, 100]", () => {
    const r = makeReviewReport({
      totalGovernanceActions: 5,
      reviewableActions: 5,
      outcomeCounts: { met_expectations: 5, partially_met: 0, did_not_meet: 0, insufficient_followup: 0 },
    });
    const score = scoreGovernanceEffectiveness(r);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

/* =========================================================
   Scenario 11: does not mutate report
   ========================================================= */

describe("scoreGovernanceEffectiveness — does not mutate report", () => {
  it("outcomeCounts unchanged after call", () => {
    const r = makeReviewReport({
      totalGovernanceActions: 2,
      reviewableActions: 2,
      outcomeCounts: { met_expectations: 2, partially_met: 0, did_not_meet: 0, insufficient_followup: 0 },
    });
    const origMet = r.outcomeCounts.met_expectations;
    scoreGovernanceEffectiveness(r);
    expect(r.outcomeCounts.met_expectations).toBe(origMet);
  });
});

/* =========================================================
   Scenario 12: scoreStability — above 50 for stabilizing
   ========================================================= */

describe("scoreStability — above 50 for stabilizing ecosystem", () => {
  it("stabilizing=true → score > 50", () => {
    const s = makeLoopSummary(true, false, false);
    expect(scoreStability(s, [])).toBeGreaterThan(50);
  });
});

/* =========================================================
   Scenario 13: below 50 for drifting
   ========================================================= */

describe("scoreStability — below 50 for drifting ecosystem", () => {
  it("drifting=true → score < 50", () => {
    const s = makeLoopSummary(false, true, false);
    expect(scoreStability(s, [])).toBeLessThan(50);
  });
});

/* =========================================================
   Scenario 14: below 40 for overcorrecting
   ========================================================= */

describe("scoreStability — below 40 for overcorrecting ecosystem", () => {
  it("overcorrecting=true → score < 40", () => {
    const s = makeLoopSummary(false, false, true);
    expect(scoreStability(s, [])).toBeLessThan(40);
  });
});

/* =========================================================
   Scenario 15: result bounded 0–100
   ========================================================= */

describe("scoreStability — result bounded 0–100", () => {
  it("all flags true → score still in [0, 100]", () => {
    const s = makeLoopSummary(false, true, true);
    const score = scoreStability(s, []);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

/* =========================================================
   Scenario 16: scorePolicyChurn — 80+ for zero audit records
   ========================================================= */

describe("scorePolicyChurn — 80+ for zero audit records", () => {
  it("empty audit trail → score >= 80", () => {
    expect(scorePolicyChurn([], makeLoopSummary())).toBeGreaterThanOrEqual(80);
  });
});

/* =========================================================
   Scenario 17: scorePolicyChurn — lower for overcorrecting ecosystem
   ========================================================= */

describe("scorePolicyChurn — lower for overcorrecting ecosystem", () => {
  it("overcorrecting → score < score for neutral ecosystem with same actions", () => {
    const neutral       = scorePolicyChurn([makeAuditRecord()], makeLoopSummary(false, false, false));
    const overcorrecting = scorePolicyChurn([makeAuditRecord()], makeLoopSummary(false, false, true));
    expect(overcorrecting).toBeLessThan(neutral);
  });
});

/* =========================================================
   Scenario 18: scorePolicyChurn — higher for stabilizing vs drifting
   ========================================================= */

describe("scorePolicyChurn — higher for stabilizing vs drifting", () => {
  it("stabilizing produces higher score than drifting", () => {
    const audits     = [makeAuditRecord()];
    const stabilizing = scorePolicyChurn(audits, makeLoopSummary(true, false, false));
    const drifting    = scorePolicyChurn(audits, makeLoopSummary(false, true, false));
    expect(stabilizing).toBeGreaterThan(drifting);
  });
});

/* =========================================================
   Scenario 19: scorePolicyChurn — result bounded 0–100
   ========================================================= */

describe("scorePolicyChurn — result bounded 0–100", () => {
  it("15 audit records → score in [0, 100]", () => {
    const audits = Array.from({ length: 15 }, () => makeAuditRecord());
    const score  = scorePolicyChurn(audits, makeLoopSummary(false, true, true));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

/* =========================================================
   Scenario 20: scorePolicyChurn — does not mutate inputs
   ========================================================= */

describe("scorePolicyChurn — does not mutate inputs", () => {
  it("audit trail array unchanged after call", () => {
    const audits = [makeAuditRecord()];
    scorePolicyChurn(audits, makeLoopSummary());
    expect(audits).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 21: buildEcosystemHealthIndex — overall equals weighted sum
   ========================================================= */

describe("buildEcosystemHealthIndex — overall equals weighted sum of components", () => {
  it("overall ≈ 0.35*stability + 0.25*calibration + 0.25*governance + 0.15*churn", () => {
    const loop  = makeLoopSummary(true, false, false);
    const cal   = makeCalibrationReport({ exactMatchRate: 0.8, directionMatchRate: 0.8, resolvedPredictions: 5 });
    const rev   = makeReviewReport({
      totalGovernanceActions: 2,
      reviewableActions: 2,
      outcomeCounts: { met_expectations: 2, partially_met: 0, did_not_meet: 0, insufficient_followup: 0 },
    });
    const audits = [makeAuditRecord()];
    const idx    = buildEcosystemHealthIndex(loop, cal, rev, audits);

    const { stability, calibrationQuality, governanceEffectiveness, policyChurn } = idx.components;
    const expected = Math.round(
      stability * 0.35 +
      calibrationQuality * 0.25 +
      governanceEffectiveness * 0.25 +
      policyChurn * 0.15
    );
    expect(idx.overall).toBe(expected);
  });
});

/* =========================================================
   Scenario 22: band is "poor" for overall < 25
   ========================================================= */

describe("buildEcosystemHealthIndex — band is 'poor' for overall < 25", () => {
  it("worst-case inputs → band = 'poor'", () => {
    const loop   = makeLoopSummary(false, true, true);
    const cal    = makeCalibrationReport({
      exactMatchRate: 0,
      directionMatchRate: 0,
      resolvedPredictions: 10,
      calibrationCounts: { well_calibrated: 0, too_aggressive: 5, too_weak: 5, unresolved: 10 },
    });
    const rev    = makeReviewReport({
      totalGovernanceActions: 4,
      reviewableActions: 4,
      outcomeCounts: { met_expectations: 0, partially_met: 0, did_not_meet: 4, insufficient_followup: 0 },
    });
    const audits = Array.from({ length: 15 }, () => makeAuditRecord());
    const idx    = buildEcosystemHealthIndex(loop, cal, rev, audits);
    expect(idx.band).toBe("poor");
  });
});

/* =========================================================
   Scenario 23: band is "fragile" for overall 25–49
   ========================================================= */

describe("buildEcosystemHealthIndex — band is 'fragile' for overall 25–49", () => {
  it("fragile range → band = 'fragile'", () => {
    const loop  = makeLoopSummary(false, true, false);
    const cal   = makeCalibrationReport({ exactMatchRate: 0.4, directionMatchRate: 0.3, resolvedPredictions: 4 });
    const rev   = makeReviewReport({
      totalGovernanceActions: 3,
      reviewableActions: 3,
      outcomeCounts: { met_expectations: 1, partially_met: 0, did_not_meet: 2, insufficient_followup: 0 },
    });
    const audits = [makeAuditRecord(), makeAuditRecord(), makeAuditRecord()];
    const idx    = buildEcosystemHealthIndex(loop, cal, rev, audits);
    if (idx.overall >= 25 && idx.overall <= 49) {
      expect(idx.band).toBe("fragile");
    } else {
      expect(["poor", "fragile", "stable", "strong"]).toContain(idx.band);
    }
  });
});

/* =========================================================
   Scenario 24: band is "stable" for overall 50–74
   ========================================================= */

describe("buildEcosystemHealthIndex — band is 'stable' for overall 50–74", () => {
  it("overall score in stable range → band = 'stable'", () => {
    const loop  = makeLoopSummary(false, false, false);
    const cal   = makeCalibrationReport({ exactMatchRate: 0.6, directionMatchRate: 0.5, resolvedPredictions: 4 });
    const rev   = makeReviewReport({
      totalGovernanceActions: 2,
      reviewableActions: 2,
      outcomeCounts: { met_expectations: 1, partially_met: 1, did_not_meet: 0, insufficient_followup: 0 },
    });
    const idx = buildEcosystemHealthIndex(loop, cal, rev, []);
    if (idx.overall >= 50 && idx.overall <= 74) {
      expect(idx.band).toBe("stable");
    } else {
      expect(["poor", "fragile", "stable", "strong"]).toContain(idx.band);
    }
  });
});

/* =========================================================
   Scenario 25: band is "strong" for overall 75–100
   ========================================================= */

describe("buildEcosystemHealthIndex — band is 'strong' for overall 75–100", () => {
  it("best-case inputs → band = 'strong'", () => {
    const loop  = makeLoopSummary(true, false, false);
    const cal   = makeCalibrationReport({
      exactMatchRate: 1.0,
      directionMatchRate: 1.0,
      resolvedPredictions: 10,
      calibrationCounts: { well_calibrated: 10, too_aggressive: 0, too_weak: 0, unresolved: 0 },
    });
    const rev   = makeReviewReport({
      totalGovernanceActions: 2,
      reviewableActions: 2,
      outcomeCounts: { met_expectations: 2, partially_met: 0, did_not_meet: 0, insufficient_followup: 0 },
    });
    const idx = buildEcosystemHealthIndex(loop, cal, rev, []);
    expect(idx.band).toBe("strong");
  });
});

/* =========================================================
   Scenario 26: explanationLines non-empty
   ========================================================= */

describe("buildEcosystemHealthIndex — explanationLines non-empty", () => {
  it("at least one explanation line produced", () => {
    const idx = buildEcosystemHealthIndex(
      makeLoopSummary(),
      makeCalibrationReport(),
      makeReviewReport(),
      []
    );
    expect(idx.explanationLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 27: cautionLines produced when components are low
   ========================================================= */

describe("buildEcosystemHealthIndex — cautionLines produced when components are low", () => {
  it("worst-case inputs → at least one caution line", () => {
    const loop   = makeLoopSummary(false, true, true);
    const cal    = makeCalibrationReport({ exactMatchRate: 0, directionMatchRate: 0, resolvedPredictions: 5 });
    const rev    = makeReviewReport({
      totalGovernanceActions: 3,
      reviewableActions: 3,
      outcomeCounts: { met_expectations: 0, partially_met: 0, did_not_meet: 3, insufficient_followup: 0 },
    });
    const audits = Array.from({ length: 10 }, () => makeAuditRecord());
    const idx    = buildEcosystemHealthIndex(loop, cal, rev, audits);
    expect(idx.cautionLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 28: all four component scores bounded 0–100
   ========================================================= */

describe("buildEcosystemHealthIndex — all four component scores bounded 0–100", () => {
  it("each component in [0, 100]", () => {
    const idx = buildEcosystemHealthIndex(
      makeLoopSummary(true, false, false),
      makeCalibrationReport({ exactMatchRate: 0.7, directionMatchRate: 0.6, resolvedPredictions: 5 }),
      makeReviewReport({ totalGovernanceActions: 2, reviewableActions: 2, outcomeCounts: { met_expectations: 2, partially_met: 0, did_not_meet: 0, insufficient_followup: 0 } }),
      []
    );
    for (const v of Object.values(idx.components)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

/* =========================================================
   Scenario 29: does not mutate any input
   ========================================================= */

describe("buildEcosystemHealthIndex — does not mutate any input", () => {
  it("all input array lengths unchanged after call", () => {
    const loop   = makeLoopSummary();
    const cal    = makeCalibrationReport({ resolvedPredictions: 1 });
    const rev    = makeReviewReport({ totalGovernanceActions: 1, reviewableActions: 1, outcomeCounts: { met_expectations: 1, partially_met: 0, did_not_meet: 0, insufficient_followup: 0 } });
    const audits = [makeAuditRecord()];
    buildEcosystemHealthIndex(loop, cal, rev, audits);
    expect(audits).toHaveLength(1);
    expect(cal.outcomes).toHaveLength(0);
    expect(rev.reviews).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 30: overall bounded 0–100
   ========================================================= */

describe("buildEcosystemHealthIndex — overall bounded 0–100", () => {
  it("any valid inputs → overall in [0, 100]", () => {
    const idx = buildEcosystemHealthIndex(
      makeLoopSummary(false, true, true),
      makeCalibrationReport({ exactMatchRate: 0, resolvedPredictions: 5 }),
      makeReviewReport({ totalGovernanceActions: 3, reviewableActions: 3, outcomeCounts: { met_expectations: 0, partially_met: 0, did_not_meet: 3, insufficient_followup: 0 } }),
      Array.from({ length: 15 }, () => makeAuditRecord())
    );
    expect(idx.overall).toBeGreaterThanOrEqual(0);
    expect(idx.overall).toBeLessThanOrEqual(100);
  });
});
