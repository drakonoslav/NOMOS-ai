/**
 * governance_deliberation_summary_test.ts
 *
 * Regression tests for governance_deliberation_types.ts and
 * governance_deliberation_summary.ts.
 *
 * Scenarios:
 *   1.  buildGovernanceDeliberationSummary — domain from decisionContext
 *   2.  buildGovernanceDeliberationSummary — recommendation is "promote" when promoteSuggested
 *   3.  buildGovernanceDeliberationSummary — recommendation is "rollback" when rollbackSuggested
 *   4.  buildGovernanceDeliberationSummary — recommendation is "hold" when neither suggested
 *   5.  buildGovernanceDeliberationSummary — recommendationStrength preserved from decisionSupport
 *   6.  buildGovernanceDeliberationSummary — confidence preserved from decisionSupport
 *   7.  buildGovernanceDeliberationSummary — currentPolicyVersionId from decisionContext
 *   8.  buildGovernanceDeliberationSummary — recommendedPolicyVersionId from decisionSupport
 *   9.  buildGovernanceDeliberationSummary — keyEvidenceLines non-empty when bench data available
 *  10.  buildGovernanceDeliberationSummary — keyEvidenceLines mention exact-match when metrics available
 *  11.  buildGovernanceDeliberationSummary — keyEvidenceLines mention unresolved when unresolvedRate increases
 *  12.  buildGovernanceDeliberationSummary — keyEvidenceLines mention aggressiveness when it changes
 *  13.  buildGovernanceDeliberationSummary — gainsLines equal decisionSupport.expectedGains
 *  14.  buildGovernanceDeliberationSummary — tradeoffLines equal decisionSupport.expectedTradeoffs
 *  15.  buildGovernanceDeliberationSummary — riskLines equal decisionSupport.expectedRisks
 *  16.  buildGovernanceDeliberationSummary — supportingHeuristics titles from crosswalk
 *  17.  buildGovernanceDeliberationSummary — cautioningHeuristics titles from crosswalk
 *  18.  buildGovernanceDeliberationSummary — synthesisLines has 2–4 entries when evidence available
 *  19.  buildGovernanceDeliberationSummary — synthesisLines mention doctrine support when heuristics support
 *  20.  buildGovernanceDeliberationSummary — synthesisLines mention caution when cautioningHeuristics present
 *  21.  buildGovernanceDeliberationSummary — synthesisLines mention shallow/low confidence qualifier
 *  22.  buildGovernanceDeliberationSummary — finalDecisionPrompt non-empty and ends with "?"
 *  23.  buildGovernanceDeliberationSummary — finalDecisionPrompt contains "Promote" for promote recommendation
 *  24.  buildGovernanceDeliberationSummary — finalDecisionPrompt contains "Hold" for hold recommendation
 *  25.  buildGovernanceDeliberationSummary — finalDecisionPrompt contains "Rollback" for rollback recommendation
 *  26.  buildGovernanceDeliberationSummary — does not mutate benchReport
 *  27.  buildGovernanceDeliberationSummary — does not mutate decisionSupport
 *  28.  buildGovernanceDeliberationSummary — does not mutate playbookCrosswalk
 *  29.  buildGovernanceDeliberationSummary — does not mutate decisionContext
 *  30.  buildGovernanceDeliberationSummary — synthesisLines non-empty even when no heuristics
 */

import { describe, it, expect } from "vitest";
import { buildGovernanceDeliberationSummary } from "../audit/governance_deliberation_summary";
import type { PolicyBenchReport } from "../audit/policy_bench_types";
import type { GovernanceDecisionSupport } from "../audit/governance_decision_support_types";
import type { PlaybookDecisionCrosswalk } from "../audit/playbook_crosswalk_types";
import type { PlaybookDecisionContext } from "../audit/playbook_crosswalk_types";

/* =========================================================
   Fixtures
   ========================================================= */

function makeBenchReport(
  overrides?: Partial<PolicyBenchReport>
): PolicyBenchReport {
  return {
    request: {
      domain: "nutrition",
      policyVersionIds: ["pol-current1", "pol-recomm1"],
      evaluationRunIds: [],
    },
    metricsByPolicy: [
      {
        policyVersionId: "pol-recomm1",
        totalRuns: 10,
        resolvedRuns: 10,
        exactMatchRate: 0.8,
        directionMatchRate: 0.9,
        tooAggressiveRate: 0.05,
        tooWeakRate: 0.02,
        unresolvedRate: 0.1,
        lowConfidenceRate: 0.1,
        moderateConfidenceRate: 0.5,
        highConfidenceRate: 0.4,
      },
      {
        policyVersionId: "pol-current1",
        totalRuns: 10,
        resolvedRuns: 10,
        exactMatchRate: 0.7,
        directionMatchRate: 0.88,
        tooAggressiveRate: 0.1,
        tooWeakRate: 0.03,
        unresolvedRate: 0.12,
        lowConfidenceRate: 0.15,
        moderateConfidenceRate: 0.5,
        highConfidenceRate: 0.35,
      },
    ],
    bestByExactMatch: "pol-recomm1",
    bestByDirectionMatch: "pol-recomm1",
    lowestAggressiveRate: "pol-recomm1",
    lowestUnresolvedRate: "pol-recomm1",
    summaryLines: ["Bench summary line."],
    ...overrides,
  };
}

function makeDecisionSupport(
  overrides?: Partial<GovernanceDecisionSupport>
): GovernanceDecisionSupport {
  return {
    domain: "nutrition",
    currentActivePolicyVersionId: "pol-current1",
    recommendedPolicyVersionId: "pol-recomm1",
    expectedGains: ["Improved exact-match rate."],
    expectedTradeoffs: ["Slight direction-match reduction."],
    expectedRisks: ["Limited evaluation window."],
    recommendationStrength: "strong",
    confidence: "high",
    promoteSuggested: true,
    rollbackSuggested: false,
    summaryLines: [],
    ...overrides,
  };
}

function makeCrosswalk(
  overrides?: Partial<PlaybookDecisionCrosswalk>
): PlaybookDecisionCrosswalk {
  return {
    domain: "nutrition",
    supportingHeuristics: [
      {
        heuristicId: "ph-00000001",
        title: "Prefer conservative promotion in nutrition",
        rule: "In nutrition, prefer conservative promotion when unresolved risk is elevated.",
        domain: "nutrition",
        relevance: "supports",
        reasonLines: ["Supports promotion."],
      },
    ],
    cautioningHeuristics: [
      {
        heuristicId: "ph-00000002",
        title: "Avoid strong promotion under shallow history",
        rule: "Avoid strong promotion decisions when fewer than 3 follow-up evaluation runs are available.",
        domain: "mixed",
        relevance: "cautions",
        reasonLines: ["Shallow evidence window."],
      },
    ],
    neutralHeuristics: [],
    summaryLines: [],
    ...overrides,
  };
}

function makeContext(
  overrides?: Partial<PlaybookDecisionContext>
): PlaybookDecisionContext {
  return {
    domain: "nutrition",
    currentPolicyVersionId: "pol-current1",
    recommendedPolicyVersionId: "pol-recomm1",
    expectedGains: ["Improved exact-match rate."],
    expectedTradeoffs: ["Slight direction-match reduction."],
    expectedRisks: ["Limited evaluation window."],
    recommendationStrength: "strong",
    confidence: "high",
    ...overrides,
  };
}

/* =========================================================
   Scenario 1: domain from decisionContext
   ========================================================= */

describe("buildGovernanceDeliberationSummary — domain from decisionContext", () => {
  it("domain matches decisionContext.domain", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport(), makeCrosswalk(),
      makeContext({ domain: "training" })
    );
    expect(result.domain).toBe("training");
  });
});

/* =========================================================
   Scenario 2: recommendation is "promote" when promoteSuggested
   ========================================================= */

describe("buildGovernanceDeliberationSummary — recommendation is 'promote' when promoteSuggested", () => {
  it("promoteSuggested=true → recommendation='promote'", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport({ promoteSuggested: true, rollbackSuggested: false }),
      makeCrosswalk(), makeContext()
    );
    expect(result.recommendation).toBe("promote");
  });
});

/* =========================================================
   Scenario 3: recommendation is "rollback" when rollbackSuggested
   ========================================================= */

describe("buildGovernanceDeliberationSummary — recommendation is 'rollback' when rollbackSuggested", () => {
  it("rollbackSuggested=true, promoteSuggested=false → recommendation='rollback'", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport({ promoteSuggested: false, rollbackSuggested: true }),
      makeCrosswalk(), makeContext()
    );
    expect(result.recommendation).toBe("rollback");
  });
});

/* =========================================================
   Scenario 4: recommendation is "hold" when neither suggested
   ========================================================= */

describe("buildGovernanceDeliberationSummary — recommendation is 'hold' when neither suggested", () => {
  it("promoteSuggested=false, rollbackSuggested=false → recommendation='hold'", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport({ promoteSuggested: false, rollbackSuggested: false }),
      makeCrosswalk(), makeContext()
    );
    expect(result.recommendation).toBe("hold");
  });
});

/* =========================================================
   Scenario 5: recommendationStrength preserved from decisionSupport
   ========================================================= */

describe("buildGovernanceDeliberationSummary — recommendationStrength preserved from decisionSupport", () => {
  it("weak strength reflected correctly", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport({ recommendationStrength: "weak" }),
      makeCrosswalk(), makeContext()
    );
    expect(result.recommendationStrength).toBe("weak");
  });
});

/* =========================================================
   Scenario 6: confidence preserved from decisionSupport
   ========================================================= */

describe("buildGovernanceDeliberationSummary — confidence preserved from decisionSupport", () => {
  it("low confidence reflected correctly", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport({ confidence: "low" }),
      makeCrosswalk(), makeContext({ confidence: "low" })
    );
    expect(result.confidence).toBe("low");
  });
});

/* =========================================================
   Scenario 7: currentPolicyVersionId from decisionContext
   ========================================================= */

describe("buildGovernanceDeliberationSummary — currentPolicyVersionId from decisionContext", () => {
  it("currentPolicyVersionId equals decisionContext.currentPolicyVersionId", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport(), makeCrosswalk(),
      makeContext({ currentPolicyVersionId: "pol-current1" })
    );
    expect(result.currentPolicyVersionId).toBe("pol-current1");
  });
});

/* =========================================================
   Scenario 8: recommendedPolicyVersionId from decisionSupport
   ========================================================= */

describe("buildGovernanceDeliberationSummary — recommendedPolicyVersionId from decisionSupport", () => {
  it("recommendedPolicyVersionId equals decisionSupport.recommendedPolicyVersionId", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport({ recommendedPolicyVersionId: "pol-recomm1" }),
      makeCrosswalk(), makeContext()
    );
    expect(result.recommendedPolicyVersionId).toBe("pol-recomm1");
  });
});

/* =========================================================
   Scenario 9: keyEvidenceLines non-empty when bench data available
   ========================================================= */

describe("buildGovernanceDeliberationSummary — keyEvidenceLines non-empty when bench data available", () => {
  it("at least one keyEvidenceLine when metrics are present", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport(), makeCrosswalk(), makeContext()
    );
    expect(result.keyEvidenceLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 10: keyEvidenceLines mention exact-match when metrics available
   ========================================================= */

describe("buildGovernanceDeliberationSummary — keyEvidenceLines mention exact-match when metrics available", () => {
  it("at least one evidence line mentions 'exact-match'", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport(), makeCrosswalk(), makeContext()
    );
    expect(result.keyEvidenceLines.some((l) => l.toLowerCase().includes("exact-match"))).toBe(true);
  });
});

/* =========================================================
   Scenario 11: keyEvidenceLines mention unresolved when unresolvedRate increases
   ========================================================= */

describe("buildGovernanceDeliberationSummary — keyEvidenceLines mention unresolved when unresolvedRate increases", () => {
  it("evidence line mentions 'unresolved' when rate increases from current to recommended", () => {
    const report = makeBenchReport();
    // Force recommended to have higher unresolved rate than current
    report.metricsByPolicy[0].unresolvedRate = 0.25; // recommended
    report.metricsByPolicy[1].unresolvedRate = 0.10; // current
    const result = buildGovernanceDeliberationSummary(
      report, makeDecisionSupport(), makeCrosswalk(), makeContext()
    );
    expect(result.keyEvidenceLines.some((l) => l.toLowerCase().includes("unresolved"))).toBe(true);
  });
});

/* =========================================================
   Scenario 12: keyEvidenceLines mention aggressiveness when it changes
   ========================================================= */

describe("buildGovernanceDeliberationSummary — keyEvidenceLines mention aggressiveness when it changes", () => {
  it("evidence line mentions 'aggressiveness' when too-aggressive rate changes", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport(), makeCrosswalk(), makeContext()
    );
    expect(result.keyEvidenceLines.some((l) => l.toLowerCase().includes("aggressiveness"))).toBe(true);
  });
});

/* =========================================================
   Scenario 13: gainsLines equal decisionSupport.expectedGains
   ========================================================= */

describe("buildGovernanceDeliberationSummary — gainsLines equal decisionSupport.expectedGains", () => {
  it("gainsLines contains same entries as decisionSupport.expectedGains", () => {
    const gains = ["Gain A", "Gain B"];
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport({ expectedGains: gains }),
      makeCrosswalk(), makeContext()
    );
    expect(result.gainsLines).toEqual(gains);
  });
});

/* =========================================================
   Scenario 14: tradeoffLines equal decisionSupport.expectedTradeoffs
   ========================================================= */

describe("buildGovernanceDeliberationSummary — tradeoffLines equal decisionSupport.expectedTradeoffs", () => {
  it("tradeoffLines contains same entries as decisionSupport.expectedTradeoffs", () => {
    const tradeoffs = ["Slight regression."];
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport({ expectedTradeoffs: tradeoffs }),
      makeCrosswalk(), makeContext()
    );
    expect(result.tradeoffLines).toEqual(tradeoffs);
  });
});

/* =========================================================
   Scenario 15: riskLines equal decisionSupport.expectedRisks
   ========================================================= */

describe("buildGovernanceDeliberationSummary — riskLines equal decisionSupport.expectedRisks", () => {
  it("riskLines contains same entries as decisionSupport.expectedRisks", () => {
    const risks = ["Shallow window."];
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport({ expectedRisks: risks }),
      makeCrosswalk(), makeContext()
    );
    expect(result.riskLines).toEqual(risks);
  });
});

/* =========================================================
   Scenario 16: supportingHeuristics titles from crosswalk
   ========================================================= */

describe("buildGovernanceDeliberationSummary — supportingHeuristics titles from crosswalk", () => {
  it("supportingHeuristics[0] equals the supporting heuristic's title", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport(), makeCrosswalk(), makeContext()
    );
    expect(result.supportingHeuristics[0]).toBe("Prefer conservative promotion in nutrition");
  });
});

/* =========================================================
   Scenario 17: cautioningHeuristics titles from crosswalk
   ========================================================= */

describe("buildGovernanceDeliberationSummary — cautioningHeuristics titles from crosswalk", () => {
  it("cautioningHeuristics[0] equals the cautioning heuristic's title", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport(), makeCrosswalk(), makeContext()
    );
    expect(result.cautioningHeuristics[0]).toBe("Avoid strong promotion under shallow history");
  });
});

/* =========================================================
   Scenario 18: synthesisLines has 2–4 entries when evidence available
   ========================================================= */

describe("buildGovernanceDeliberationSummary — synthesisLines has 2–4 entries when evidence available", () => {
  it("synthesisLines length between 2 and 4", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport(), makeCrosswalk(), makeContext()
    );
    expect(result.synthesisLines.length).toBeGreaterThanOrEqual(2);
    expect(result.synthesisLines.length).toBeLessThanOrEqual(4);
  });
});

/* =========================================================
   Scenario 19: synthesisLines mention doctrine support when heuristics support
   ========================================================= */

describe("buildGovernanceDeliberationSummary — synthesisLines mention doctrine support when heuristics support", () => {
  it("a synthesisLine contains 'doctrine' when supporting heuristics are present", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport(), makeCrosswalk(), makeContext()
    );
    expect(result.synthesisLines.some((l) => l.toLowerCase().includes("doctrine"))).toBe(true);
  });
});

/* =========================================================
   Scenario 20: synthesisLines mention caution when cautioningHeuristics present
   ========================================================= */

describe("buildGovernanceDeliberationSummary — synthesisLines mention caution when cautioningHeuristics present", () => {
  it("a synthesisLine contains 'caution' when cautioning heuristics are present", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport(), makeCrosswalk(), makeContext()
    );
    expect(result.synthesisLines.some((l) => l.toLowerCase().includes("caution"))).toBe(true);
  });
});

/* =========================================================
   Scenario 21: synthesisLines mention shallow / low confidence qualifier
   ========================================================= */

describe("buildGovernanceDeliberationSummary — synthesisLines mention shallow/low confidence qualifier", () => {
  it("a synthesisLine contains 'low' or 'shallow' when confidence is low", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(),
      makeDecisionSupport({ confidence: "low", promoteSuggested: true }),
      makeCrosswalk({ supportingHeuristics: [], cautioningHeuristics: [] }),
      makeContext({ confidence: "low" })
    );
    expect(
      result.synthesisLines.some(
        (l) => l.toLowerCase().includes("low") || l.toLowerCase().includes("shallow")
      )
    ).toBe(true);
  });
});

/* =========================================================
   Scenario 22: finalDecisionPrompt non-empty and ends with "?"
   ========================================================= */

describe("buildGovernanceDeliberationSummary — finalDecisionPrompt non-empty and ends with '?'", () => {
  it("finalDecisionPrompt length > 0 and last char is '?'", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport(), makeCrosswalk(), makeContext()
    );
    expect(result.finalDecisionPrompt.length).toBeGreaterThan(0);
    expect(result.finalDecisionPrompt.endsWith("?")).toBe(true);
  });
});

/* =========================================================
   Scenario 23: finalDecisionPrompt contains "Promote" for promote recommendation
   ========================================================= */

describe("buildGovernanceDeliberationSummary — finalDecisionPrompt contains 'Promote' for promote", () => {
  it("prompt starts with 'Promote' when recommendation is promote", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport({ promoteSuggested: true }),
      makeCrosswalk(), makeContext()
    );
    expect(result.finalDecisionPrompt).toMatch(/^Promote/);
  });
});

/* =========================================================
   Scenario 24: finalDecisionPrompt contains "Hold" for hold recommendation
   ========================================================= */

describe("buildGovernanceDeliberationSummary — finalDecisionPrompt contains 'Hold' for hold recommendation", () => {
  it("prompt starts with 'Hold' when recommendation is hold", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(),
      makeDecisionSupport({ promoteSuggested: false, rollbackSuggested: false }),
      makeCrosswalk(), makeContext()
    );
    expect(result.finalDecisionPrompt).toMatch(/^Hold/);
  });
});

/* =========================================================
   Scenario 25: finalDecisionPrompt contains "Rollback" for rollback recommendation
   ========================================================= */

describe("buildGovernanceDeliberationSummary — finalDecisionPrompt contains 'Rollback' for rollback recommendation", () => {
  it("prompt starts with 'Rollback' when recommendation is rollback", () => {
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(),
      makeDecisionSupport({ promoteSuggested: false, rollbackSuggested: true }),
      makeCrosswalk(), makeContext()
    );
    expect(result.finalDecisionPrompt).toMatch(/^Rollback/);
  });
});

/* =========================================================
   Scenario 26: does not mutate benchReport
   ========================================================= */

describe("buildGovernanceDeliberationSummary — does not mutate benchReport", () => {
  it("metricsByPolicy length unchanged after call", () => {
    const report = makeBenchReport();
    const origLen = report.metricsByPolicy.length;
    buildGovernanceDeliberationSummary(report, makeDecisionSupport(), makeCrosswalk(), makeContext());
    expect(report.metricsByPolicy).toHaveLength(origLen);
  });
});

/* =========================================================
   Scenario 27: does not mutate decisionSupport
   ========================================================= */

describe("buildGovernanceDeliberationSummary — does not mutate decisionSupport", () => {
  it("expectedGains length unchanged after call", () => {
    const ds = makeDecisionSupport({ expectedGains: ["gain"] });
    buildGovernanceDeliberationSummary(makeBenchReport(), ds, makeCrosswalk(), makeContext());
    expect(ds.expectedGains).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 28: does not mutate playbookCrosswalk
   ========================================================= */

describe("buildGovernanceDeliberationSummary — does not mutate playbookCrosswalk", () => {
  it("supportingHeuristics length unchanged after call", () => {
    const cw = makeCrosswalk();
    const origLen = cw.supportingHeuristics.length;
    buildGovernanceDeliberationSummary(makeBenchReport(), makeDecisionSupport(), cw, makeContext());
    expect(cw.supportingHeuristics).toHaveLength(origLen);
  });
});

/* =========================================================
   Scenario 29: does not mutate decisionContext
   ========================================================= */

describe("buildGovernanceDeliberationSummary — does not mutate decisionContext", () => {
  it("expectedGains length unchanged after call", () => {
    const ctx = makeContext({ expectedGains: ["gain A"] });
    buildGovernanceDeliberationSummary(makeBenchReport(), makeDecisionSupport(), makeCrosswalk(), ctx);
    expect(ctx.expectedGains).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 30: synthesisLines non-empty even when no heuristics
   ========================================================= */

describe("buildGovernanceDeliberationSummary — synthesisLines non-empty even when no heuristics", () => {
  it("at least one synthesis line even with empty crosswalk", () => {
    const cw = makeCrosswalk({
      supportingHeuristics: [],
      cautioningHeuristics: [],
      neutralHeuristics: [],
    });
    const result = buildGovernanceDeliberationSummary(
      makeBenchReport(), makeDecisionSupport(), cw, makeContext()
    );
    expect(result.synthesisLines.length).toBeGreaterThan(0);
  });
});
