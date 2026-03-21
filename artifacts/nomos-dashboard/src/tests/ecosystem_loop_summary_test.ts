/**
 * ecosystem_loop_summary_test.ts
 *
 * Regression tests for ecosystem_loop_types.ts and ecosystem_loop_summary.ts.
 *
 * Scenarios:
 *   1.  buildDoctrineEmergencePatterns — empty when no heuristics in playbook
 *   2.  buildDoctrineEmergencePatterns — includes moderate confidence heuristics
 *   3.  buildDoctrineEmergencePatterns — includes high confidence heuristics
 *   4.  buildDoctrineEmergencePatterns — excludes low confidence heuristics
 *   5.  buildDoctrineEmergencePatterns — sorted by supportCount descending
 *   6.  buildDoctrineEmergencePatterns — does not mutate input playbook
 *   7.  buildGovernanceChoiceOutcomePatterns — empty when no links
 *   8.  buildGovernanceChoiceOutcomePatterns — counts promote→met_expectations correctly
 *   9.  buildGovernanceChoiceOutcomePatterns — counts rollback→did_not_meet correctly
 *  10.  buildGovernanceChoiceOutcomePatterns — excludes links with null actualOutcomeClass
 *  11.  buildGovernanceChoiceOutcomePatterns — does not mutate input links
 *  12.  buildPredictionToDecisionPatterns — empty when no links
 *  13.  buildPredictionToDecisionPatterns — detects risk-driven rollback pattern
 *  14.  buildPredictionToDecisionPatterns — detects gains-first promotion pattern
 *  15.  buildPredictionToDecisionPatterns — count reflects number of matching links
 *  16.  buildPredictionToDecisionPatterns — sorted by count descending
 *  17.  buildPredictionToDecisionPatterns — does not mutate input links
 *  18.  buildEcosystemChangeSummary — stabilizing when met_expectations dominates
 *  19.  buildEcosystemChangeSummary — drifting when did_not_meet dominates
 *  20.  buildEcosystemChangeSummary — overcorrecting when churn without met outcome
 *  21.  buildEcosystemChangeSummary — summaryLines non-empty
 *  22.  buildEcosystemChangeSummary — does not mutate inputs
 *  23.  buildEcosystemLoopSummary — totalGovernanceActions matches auditRecords.length
 *  24.  buildEcosystemLoopSummary — totalOutcomeReviews matches outcomeReviews.length
 *  25.  buildEcosystemLoopSummary — summaryLines mention "no governance actions" for empty
 *  26.  buildEcosystemLoopSummary — predictionToDecisionPatterns populated from links
 *  27.  buildEcosystemLoopSummary — governanceChoiceOutcomePatterns populated from links+reviews
 *  28.  buildEcosystemLoopSummary — doctrineEmergencePatterns populated from playbook
 *  29.  buildEcosystemLoopSummary — does not mutate any input
 *  30.  buildEcosystemLoopSummary — ecosystemChangeSummary.stabilizing true when outcomes improve
 */

import { describe, it, expect } from "vitest";
import {
  buildDoctrineEmergencePatterns,
  buildGovernanceChoiceOutcomePatterns,
  buildPredictionToDecisionPatterns,
  buildEcosystemChangeSummary,
  buildEcosystemLoopSummary,
} from "../audit/ecosystem_loop_summary";
import type { GovernancePlaybook, GovernanceHeuristic } from "../audit/governance_playbook_types";
import type { GovernanceAuditRecord } from "../audit/governance_audit_types";
import type { GovernanceOutcomeReview } from "../audit/post_governance_review_types";
import type { DecisionOutcomeLink } from "../audit/decision_outcome_link_types";

/* =========================================================
   Fixtures
   ========================================================= */

function makeHeuristic(overrides?: Partial<GovernanceHeuristic>): GovernanceHeuristic {
  return {
    id: "ph-00000001",
    domain: "nutrition",
    title: "Prefer conservative promotion in nutrition",
    rule: "In nutrition, prefer conservative policy promotion.",
    supportCount: 3,
    confidence: "high",
    sourcePatternLabels: ["pattern-label"],
    rationaleLines: ["rationale"],
    cautionLines:   ["caution"],
    ...overrides,
  };
}

function makePlaybook(heuristics: GovernanceHeuristic[] = []): GovernancePlaybook {
  return {
    totalHeuristics: heuristics.length,
    heuristics,
    summaryLines: [],
  };
}

function makeAuditRecord(overrides?: Partial<GovernanceAuditRecord>): GovernanceAuditRecord {
  return {
    actionId: "gov-aaaaaaaa",
    timestamp: "2026-01-01T00:00:00.000Z",
    domain: "nutrition",
    action: "promote",
    currentPolicyVersionId: "pol-current1",
    recommendedPolicyVersionId: "pol-recomm1",
    chosenPolicyVersionId: "pol-recomm1",
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

function makeOutcomeReview(
  outcomeClass: GovernanceOutcomeReview["outcomeClass"],
  overrides?: Partial<GovernanceOutcomeReview>
): GovernanceOutcomeReview {
  return {
    actionId: "gov-aaaaaaaa",
    domain: "nutrition",
    action: "promote",
    fromPolicyVersionId: "pol-current1",
    toPolicyVersionId: "pol-recomm1",
    expectation: { expectedGains: [], expectedTradeoffs: [], expectedRisks: [] },
    observed: {
      postActionRuns: 5,
      exactMatchDelta: 0.05,
      directionMatchDelta: null,
      tooAggressiveDelta: null,
      tooWeakDelta: null,
      unresolvedDelta: null,
      summaryLines: [],
    },
    outcomeClass,
    reviewLines: [],
    ...overrides,
  };
}

function makeLink(
  decision: DecisionOutcomeLink["decision"],
  outcomeClass: DecisionOutcomeLink["actualOutcomeClass"],
  opts?: {
    risks?: string[];
    gains?: string[];
    tradeoffs?: string[];
  }
): DecisionOutcomeLink {
  return {
    decisionId: "dec-00000001",
    deliberationSummaryId: "dls-00000001",
    governanceActionId: decision !== "hold" ? "gov-aaaaaaaa" : null,
    governanceOutcomeReviewId: outcomeClass !== null ? "gov-aaaaaaaa" : null,
    decision,
    chosenPolicyVersionId: decision !== "hold" ? "pol-recomm1" : null,
    expectedGains:     opts?.gains     ?? [],
    expectedTradeoffs: opts?.tradeoffs ?? [],
    expectedRisks:     opts?.risks     ?? [],
    actualOutcomeClass: outcomeClass,
    actualOutcomeLines: [],
    linkageSummaryLines: [],
  };
}

/* =========================================================
   Scenario 1: buildDoctrineEmergencePatterns — empty when no heuristics
   ========================================================= */

describe("buildDoctrineEmergencePatterns — empty when no heuristics in playbook", () => {
  it("returns empty array for empty playbook", () => {
    expect(buildDoctrineEmergencePatterns(makePlaybook([]))).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 2: includes moderate confidence heuristics
   ========================================================= */

describe("buildDoctrineEmergencePatterns — includes moderate confidence heuristics", () => {
  it("moderate heuristic included", () => {
    const h = makeHeuristic({ confidence: "moderate" });
    expect(buildDoctrineEmergencePatterns(makePlaybook([h]))).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 3: includes high confidence heuristics
   ========================================================= */

describe("buildDoctrineEmergencePatterns — includes high confidence heuristics", () => {
  it("high heuristic included", () => {
    const h = makeHeuristic({ confidence: "high" });
    expect(buildDoctrineEmergencePatterns(makePlaybook([h]))).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 4: excludes low confidence heuristics
   ========================================================= */

describe("buildDoctrineEmergencePatterns — excludes low confidence heuristics", () => {
  it("low confidence heuristic excluded", () => {
    const h = makeHeuristic({ confidence: "low" });
    expect(buildDoctrineEmergencePatterns(makePlaybook([h]))).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 5: sorted by supportCount descending
   ========================================================= */

describe("buildDoctrineEmergencePatterns — sorted by supportCount descending", () => {
  it("higher supportCount appears first", () => {
    const h1 = makeHeuristic({ id: "ph-00000001", supportCount: 2, confidence: "moderate" });
    const h2 = makeHeuristic({ id: "ph-00000002", supportCount: 5, confidence: "moderate" });
    const result = buildDoctrineEmergencePatterns(makePlaybook([h1, h2]));
    expect(result[0].supportCount).toBe(5);
  });
});

/* =========================================================
   Scenario 6: does not mutate input playbook
   ========================================================= */

describe("buildDoctrineEmergencePatterns — does not mutate input playbook", () => {
  it("heuristics array length unchanged", () => {
    const p = makePlaybook([makeHeuristic()]);
    buildDoctrineEmergencePatterns(p);
    expect(p.heuristics).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 7: buildGovernanceChoiceOutcomePatterns — empty when no links
   ========================================================= */

describe("buildGovernanceChoiceOutcomePatterns — empty when no links", () => {
  it("returns empty array for empty links", () => {
    expect(buildGovernanceChoiceOutcomePatterns([])).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 8: counts promote→met_expectations correctly
   ========================================================= */

describe("buildGovernanceChoiceOutcomePatterns — counts promote→met_expectations correctly", () => {
  it("two promote+met_expectations links → count = 2", () => {
    const links = [
      makeLink("promote", "met_expectations"),
      makeLink("promote", "met_expectations"),
    ];
    const result = buildGovernanceChoiceOutcomePatterns(links);
    const entry = result.find((p) => p.label.toLowerCase().includes("met expectations"));
    expect(entry?.count).toBe(2);
  });
});

/* =========================================================
   Scenario 9: counts rollback→did_not_meet correctly
   ========================================================= */

describe("buildGovernanceChoiceOutcomePatterns — counts rollback→did_not_meet correctly", () => {
  it("rollback+did_not_meet link → count = 1", () => {
    const links = [makeLink("rollback", "did_not_meet")];
    const result = buildGovernanceChoiceOutcomePatterns(links);
    const entry = result.find((p) => p.label.toLowerCase().includes("did not meet"));
    expect(entry?.count).toBe(1);
  });
});

/* =========================================================
   Scenario 10: excludes links with null actualOutcomeClass
   ========================================================= */

describe("buildGovernanceChoiceOutcomePatterns — excludes links with null actualOutcomeClass", () => {
  it("link with null outcomeClass not included in patterns", () => {
    const links = [makeLink("promote", null)];
    expect(buildGovernanceChoiceOutcomePatterns(links)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 11: does not mutate input links
   ========================================================= */

describe("buildGovernanceChoiceOutcomePatterns — does not mutate input links", () => {
  it("links array length unchanged", () => {
    const links = [makeLink("promote", "met_expectations")];
    buildGovernanceChoiceOutcomePatterns(links);
    expect(links).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 12: buildPredictionToDecisionPatterns — empty when no links
   ========================================================= */

describe("buildPredictionToDecisionPatterns — empty when no links", () => {
  it("returns empty array for empty links", () => {
    expect(buildPredictionToDecisionPatterns([])).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 13: detects risk-driven rollback pattern
   ========================================================= */

describe("buildPredictionToDecisionPatterns — detects risk-driven rollback pattern", () => {
  it("rollback with risks → 'Risk-driven rollback' pattern", () => {
    const links = [makeLink("rollback", null, { risks: ["Elevated risk."] })];
    const result = buildPredictionToDecisionPatterns(links);
    expect(result[0].label).toBe("Risk-driven rollback");
  });
});

/* =========================================================
   Scenario 14: detects gains-first promotion pattern
   ========================================================= */

describe("buildPredictionToDecisionPatterns — detects gains-first promotion pattern", () => {
  it("promote with gains and no risks → 'Gains-first promotion' pattern", () => {
    const links = [makeLink("promote", null, { gains: ["Better exact-match."], risks: [] })];
    const result = buildPredictionToDecisionPatterns(links);
    expect(result[0].label).toBe("Gains-first promotion");
  });
});

/* =========================================================
   Scenario 15: count reflects number of matching links
   ========================================================= */

describe("buildPredictionToDecisionPatterns — count reflects number of matching links", () => {
  it("three matching rollback+risk links → count = 3", () => {
    const links = [
      makeLink("rollback", null, { risks: ["Risk A."] }),
      makeLink("rollback", null, { risks: ["Risk B."] }),
      makeLink("rollback", null, { risks: ["Risk C."] }),
    ];
    const result = buildPredictionToDecisionPatterns(links);
    const entry = result.find((p) => p.label === "Risk-driven rollback");
    expect(entry?.count).toBe(3);
  });
});

/* =========================================================
   Scenario 16: sorted by count descending
   ========================================================= */

describe("buildPredictionToDecisionPatterns — sorted by count descending", () => {
  it("more frequent pattern appears first", () => {
    const links = [
      makeLink("rollback", null, { risks: ["R."] }),
      makeLink("rollback", null, { risks: ["R."] }),
      makeLink("promote", null, { gains: ["G."] }),
    ];
    const result = buildPredictionToDecisionPatterns(links);
    expect(result[0].count).toBeGreaterThanOrEqual(result[1]?.count ?? 0);
  });
});

/* =========================================================
   Scenario 17: does not mutate input links
   ========================================================= */

describe("buildPredictionToDecisionPatterns — does not mutate input links", () => {
  it("links array length unchanged", () => {
    const links = [makeLink("promote", null, { gains: ["G."] })];
    buildPredictionToDecisionPatterns(links);
    expect(links).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 18: buildEcosystemChangeSummary — stabilizing when met dominates
   ========================================================= */

describe("buildEcosystemChangeSummary — stabilizing when met_expectations dominates", () => {
  it("3 met, 1 did_not_meet → stabilizing = true", () => {
    const reviews = [
      makeOutcomeReview("met_expectations"),
      makeOutcomeReview("met_expectations"),
      makeOutcomeReview("met_expectations"),
      makeOutcomeReview("did_not_meet"),
    ];
    const result = buildEcosystemChangeSummary(reviews, [makeAuditRecord()]);
    expect(result.stabilizing).toBe(true);
    expect(result.drifting).toBe(false);
  });
});

/* =========================================================
   Scenario 19: buildEcosystemChangeSummary — drifting when did_not_meet dominates
   ========================================================= */

describe("buildEcosystemChangeSummary — drifting when did_not_meet dominates", () => {
  it("1 met, 2 did_not_meet → drifting = true", () => {
    const reviews = [
      makeOutcomeReview("met_expectations"),
      makeOutcomeReview("did_not_meet"),
      makeOutcomeReview("did_not_meet"),
    ];
    const result = buildEcosystemChangeSummary(reviews, [makeAuditRecord()]);
    expect(result.drifting).toBe(true);
    expect(result.stabilizing).toBe(false);
  });
});

/* =========================================================
   Scenario 20: buildEcosystemChangeSummary — overcorrecting when churn without met outcome
   ========================================================= */

describe("buildEcosystemChangeSummary — overcorrecting when churn without met outcome", () => {
  it("3+ audit records, 0 met, 1 did_not_meet → overcorrecting = true", () => {
    const reviews = [makeOutcomeReview("did_not_meet")];
    const audits  = [makeAuditRecord(), makeAuditRecord(), makeAuditRecord()];
    const result  = buildEcosystemChangeSummary(reviews, audits);
    expect(result.overcorrecting).toBe(true);
  });
});

/* =========================================================
   Scenario 21: buildEcosystemChangeSummary — summaryLines non-empty
   ========================================================= */

describe("buildEcosystemChangeSummary — summaryLines non-empty", () => {
  it("at least one summary line produced", () => {
    const result = buildEcosystemChangeSummary([], []);
    expect(result.summaryLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 22: buildEcosystemChangeSummary — does not mutate inputs
   ========================================================= */

describe("buildEcosystemChangeSummary — does not mutate inputs", () => {
  it("reviews and audits arrays unchanged", () => {
    const reviews = [makeOutcomeReview("met_expectations")];
    const audits  = [makeAuditRecord()];
    buildEcosystemChangeSummary(reviews, audits);
    expect(reviews).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 23: buildEcosystemLoopSummary — totalGovernanceActions matches auditRecords.length
   ========================================================= */

describe("buildEcosystemLoopSummary — totalGovernanceActions matches auditRecords.length", () => {
  it("two audit records → totalGovernanceActions = 2", () => {
    const result = buildEcosystemLoopSummary(
      [makeAuditRecord(), makeAuditRecord()],
      [],
      makePlaybook([]),
      []
    );
    expect(result.totalGovernanceActions).toBe(2);
  });
});

/* =========================================================
   Scenario 24: buildEcosystemLoopSummary — totalOutcomeReviews matches outcomeReviews.length
   ========================================================= */

describe("buildEcosystemLoopSummary — totalOutcomeReviews matches outcomeReviews.length", () => {
  it("one outcome review → totalOutcomeReviews = 1", () => {
    const result = buildEcosystemLoopSummary(
      [makeAuditRecord()],
      [makeOutcomeReview("met_expectations")],
      makePlaybook([]),
      []
    );
    expect(result.totalOutcomeReviews).toBe(1);
  });
});

/* =========================================================
   Scenario 25: buildEcosystemLoopSummary — summaryLines mention "no governance actions" for empty
   ========================================================= */

describe("buildEcosystemLoopSummary — summaryLines mention 'no governance actions' for empty", () => {
  it("first summaryLine mentions 'no governance actions'", () => {
    const result = buildEcosystemLoopSummary([], [], makePlaybook([]), []);
    expect(result.summaryLines[0]).toMatch(/no governance actions/i);
  });
});

/* =========================================================
   Scenario 26: predictionToDecisionPatterns populated from links
   ========================================================= */

describe("buildEcosystemLoopSummary — predictionToDecisionPatterns populated from links", () => {
  it("one promote link → predictionToDecisionPatterns has one entry", () => {
    const links = [makeLink("promote", null, { gains: ["G."] })];
    const result = buildEcosystemLoopSummary([makeAuditRecord()], [], makePlaybook([]), links);
    expect(result.predictionToDecisionPatterns.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 27: governanceChoiceOutcomePatterns populated from links+reviews
   ========================================================= */

describe("buildEcosystemLoopSummary — governanceChoiceOutcomePatterns populated from links", () => {
  it("one promote+met_expectations link → governanceChoiceOutcomePatterns has one entry", () => {
    const links = [makeLink("promote", "met_expectations")];
    const result = buildEcosystemLoopSummary([makeAuditRecord()], [], makePlaybook([]), links);
    expect(result.governanceChoiceOutcomePatterns.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 28: doctrineEmergencePatterns populated from playbook
   ========================================================= */

describe("buildEcosystemLoopSummary — doctrineEmergencePatterns populated from playbook", () => {
  it("high confidence heuristic in playbook → doctrineEmergencePatterns has one entry", () => {
    const p = makePlaybook([makeHeuristic({ confidence: "high" })]);
    const result = buildEcosystemLoopSummary([makeAuditRecord()], [], p, []);
    expect(result.doctrineEmergencePatterns.length).toBe(1);
  });
});

/* =========================================================
   Scenario 29: does not mutate any input
   ========================================================= */

describe("buildEcosystemLoopSummary — does not mutate any input", () => {
  it("all input arrays unchanged after call", () => {
    const audits  = [makeAuditRecord()];
    const reviews = [makeOutcomeReview("met_expectations")];
    const p       = makePlaybook([makeHeuristic()]);
    const links   = [makeLink("promote", "met_expectations")];
    buildEcosystemLoopSummary(audits, reviews, p, links);
    expect(audits).toHaveLength(1);
    expect(reviews).toHaveLength(1);
    expect(p.heuristics).toHaveLength(1);
    expect(links).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 30: ecosystemChangeSummary.stabilizing true when outcomes improve
   ========================================================= */

describe("buildEcosystemLoopSummary — ecosystemChangeSummary.stabilizing true when outcomes improve", () => {
  it("two met_expectations reviews → ecosystemChangeSummary.stabilizing = true", () => {
    const reviews = [
      makeOutcomeReview("met_expectations"),
      makeOutcomeReview("met_expectations"),
    ];
    const result = buildEcosystemLoopSummary([makeAuditRecord()], reviews, makePlaybook([]), []);
    expect(result.ecosystemChangeSummary.stabilizing).toBe(true);
  });
});
