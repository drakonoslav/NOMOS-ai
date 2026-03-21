/**
 * decision_outcome_linkage_test.ts
 *
 * Regression tests for decision_outcome_link_types.ts and
 * decision_outcome_linkage.ts.
 *
 * Scenarios:
 *   1.  buildGovernanceDecisionRecord — domain from deliberation summary
 *   2.  buildGovernanceDecisionRecord — decisionId starts with "dec-" and is 12 chars
 *   3.  buildGovernanceDecisionRecord — deliberationSummaryId starts with "dls-" and is 12 chars
 *   4.  buildGovernanceDecisionRecord — deliberationSummaryId is deterministic (same input → same id)
 *   5.  buildGovernanceDecisionRecord — decisionId is deterministic
 *   6.  buildGovernanceDecisionRecord — different humanReason produces different decisionId
 *   7.  buildGovernanceDecisionRecord — chosenPolicyVersionId = recommendedPolicyVersionId for promote
 *   8.  buildGovernanceDecisionRecord — chosenPolicyVersionId = currentPolicyVersionId for rollback
 *   9.  buildGovernanceDecisionRecord — chosenPolicyVersionId is null for hold
 *  10.  buildGovernanceDecisionRecord — humanReason preserved verbatim
 *  11.  buildGovernanceDecisionRecord — does not mutate deliberationSummary
 *  12.  buildGovernanceDecisionRecord — expectedGains copied from deliberation summary gainsLines
 *  13.  linkDecisionToGovernanceAction — returns null for hold decision
 *  14.  linkDecisionToGovernanceAction — returns null when no matching audit record
 *  15.  linkDecisionToGovernanceAction — returns matching audit record by domain + action + chosenPolicyVersionId
 *  16.  linkDecisionToGovernanceAction — does not match wrong domain
 *  17.  linkDecisionToGovernanceAction — does not match wrong chosenPolicyVersionId
 *  18.  linkDecisionToOutcomeReview — returns null when chosenPolicyVersionId is null
 *  19.  linkDecisionToOutcomeReview — returns null when no matching review
 *  20.  linkDecisionToOutcomeReview — returns matching review by domain + toPolicyVersionId
 *  21.  linkDecisionToOutcomeReview — does not match wrong domain
 *  22.  buildDecisionOutcomeLink — governanceActionId is null for hold decision
 *  23.  buildDecisionOutcomeLink — actualOutcomeClass is null when no review linked
 *  24.  buildDecisionOutcomeLink — actualOutcomeClass reflects outcome review class
 *  25.  buildDecisionOutcomeLink — linkageSummaryLines non-empty
 *  26.  buildDecisionOutcomeLink — linkageSummaryLines mention "promotion" for promote decision
 *  27.  buildDecisionOutcomeLink — linkageSummaryLines mention "hold" for hold decision
 *  28.  buildDecisionOutcomeLink — does not mutate inputs
 *  29.  buildDecisionOutcomeLinkReport — totalLinkedDecisions matches input records count
 *  30.  buildDecisionOutcomeLinkReport — summaryLines mention "no governance decision records" for empty
 */

import { describe, it, expect } from "vitest";
import {
  buildGovernanceDecisionRecord,
  linkDecisionToGovernanceAction,
  linkDecisionToOutcomeReview,
  buildDecisionOutcomeLink,
  buildDecisionOutcomeLinkReport,
} from "../audit/decision_outcome_linkage";
import type { GovernanceDeliberationSummary } from "../audit/governance_deliberation_types";
import type { GovernanceAuditRecord } from "../audit/governance_audit_types";
import type { GovernanceOutcomeReview } from "../audit/post_governance_review_types";

/* =========================================================
   Fixtures
   ========================================================= */

function makeDeliberation(
  overrides?: Partial<GovernanceDeliberationSummary>
): GovernanceDeliberationSummary {
  return {
    domain: "nutrition",
    currentPolicyVersionId: "pol-current1",
    recommendedPolicyVersionId: "pol-recomm1",
    recommendation: "promote",
    recommendationStrength: "strong",
    confidence: "high",
    keyEvidenceLines: ["Exact-match improves."],
    gainsLines: ["Improved exact-match rate."],
    tradeoffLines: ["Slight direction-match reduction."],
    riskLines: ["Limited evaluation window."],
    supportingHeuristics: ["Prefer conservative promotion"],
    cautioningHeuristics: [],
    synthesisLines: ["Evidence supports promotion."],
    finalDecisionPrompt: "Promote pol-recomm1 over pol-current1?",
    ...overrides,
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
    currentPolicyVersionId: "pol-current1",
    recommendedPolicyVersionId: "pol-recomm1",
    chosenPolicyVersionId: "pol-recomm1",
    expectedGains: ["Improved exact-match rate."],
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
  overrides?: Partial<GovernanceOutcomeReview>
): GovernanceOutcomeReview {
  return {
    actionId: "gov-aaaaaaaa",
    domain: "nutrition",
    action: "promote",
    fromPolicyVersionId: "pol-current1",
    toPolicyVersionId: "pol-recomm1",
    expectation: {
      expectedGains: ["Improved exact-match rate."],
      expectedTradeoffs: [],
      expectedRisks: [],
    },
    observed: {
      postActionRuns: 5,
      exactMatchDelta: 0.05,
      directionMatchDelta: -0.02,
      tooAggressiveDelta: null,
      tooWeakDelta: null,
      unresolvedDelta: 0.01,
      summaryLines: ["Aggressiveness fell, unresolved increased slightly."],
    },
    outcomeClass: "partially_met",
    reviewLines: ["Exact-match improved as expected; unresolved outcomes rose slightly."],
    ...overrides,
  };
}

/* =========================================================
   Scenario 1: domain from deliberation summary
   ========================================================= */

describe("buildGovernanceDecisionRecord — domain from deliberation summary", () => {
  it("domain equals deliberation.domain", () => {
    const r = buildGovernanceDecisionRecord(makeDeliberation(), "promote", "Better match.");
    expect(r.domain).toBe("nutrition");
  });
});

/* =========================================================
   Scenario 2: decisionId starts with "dec-" and is 12 chars
   ========================================================= */

describe("buildGovernanceDecisionRecord — decisionId starts with 'dec-' and is 12 chars", () => {
  it("decisionId prefix and length", () => {
    const r = buildGovernanceDecisionRecord(makeDeliberation(), "promote", "Reason.");
    expect(r.decisionId.startsWith("dec-")).toBe(true);
    expect(r.decisionId.length).toBe(12);
  });
});

/* =========================================================
   Scenario 3: deliberationSummaryId starts with "dls-" and is 12 chars
   ========================================================= */

describe("buildGovernanceDecisionRecord — deliberationSummaryId starts with 'dls-' and is 12 chars", () => {
  it("deliberationSummaryId prefix and length", () => {
    const r = buildGovernanceDecisionRecord(makeDeliberation(), "promote", "Reason.");
    expect(r.deliberationSummaryId.startsWith("dls-")).toBe(true);
    expect(r.deliberationSummaryId.length).toBe(12);
  });
});

/* =========================================================
   Scenario 4: deliberationSummaryId is deterministic
   ========================================================= */

describe("buildGovernanceDecisionRecord — deliberationSummaryId is deterministic (same input → same id)", () => {
  it("two calls with same deliberation produce same deliberationSummaryId", () => {
    const d = makeDeliberation();
    const r1 = buildGovernanceDecisionRecord(d, "promote", "Reason.");
    const r2 = buildGovernanceDecisionRecord(d, "hold", "Different reason.");
    expect(r1.deliberationSummaryId).toBe(r2.deliberationSummaryId);
  });
});

/* =========================================================
   Scenario 5: decisionId is deterministic
   ========================================================= */

describe("buildGovernanceDecisionRecord — decisionId is deterministic", () => {
  it("same inputs produce same decisionId", () => {
    const d = makeDeliberation();
    const r1 = buildGovernanceDecisionRecord(d, "promote", "Consistent reason.");
    const r2 = buildGovernanceDecisionRecord(d, "promote", "Consistent reason.");
    expect(r1.decisionId).toBe(r2.decisionId);
  });
});

/* =========================================================
   Scenario 6: different humanReason produces different decisionId
   ========================================================= */

describe("buildGovernanceDecisionRecord — different humanReason produces different decisionId", () => {
  it("two different reasons → different decisionIds", () => {
    const d = makeDeliberation();
    const r1 = buildGovernanceDecisionRecord(d, "promote", "Reason A.");
    const r2 = buildGovernanceDecisionRecord(d, "promote", "Reason B.");
    expect(r1.decisionId).not.toBe(r2.decisionId);
  });
});

/* =========================================================
   Scenario 7: chosenPolicyVersionId = recommendedPolicyVersionId for promote
   ========================================================= */

describe("buildGovernanceDecisionRecord — chosenPolicyVersionId = recommendedPolicyVersionId for promote", () => {
  it("promote → chosenPolicyVersionId equals recommendedPolicyVersionId", () => {
    const d = makeDeliberation({ recommendedPolicyVersionId: "pol-recomm1" });
    const r = buildGovernanceDecisionRecord(d, "promote", "Promoting.");
    expect(r.chosenPolicyVersionId).toBe("pol-recomm1");
  });
});

/* =========================================================
   Scenario 8: chosenPolicyVersionId = currentPolicyVersionId for rollback
   ========================================================= */

describe("buildGovernanceDecisionRecord — chosenPolicyVersionId = currentPolicyVersionId for rollback", () => {
  it("rollback → chosenPolicyVersionId equals currentPolicyVersionId", () => {
    const d = makeDeliberation({ currentPolicyVersionId: "pol-current1", recommendation: "rollback" });
    const r = buildGovernanceDecisionRecord(d, "rollback", "Rolling back.");
    expect(r.chosenPolicyVersionId).toBe("pol-current1");
  });
});

/* =========================================================
   Scenario 9: chosenPolicyVersionId is null for hold
   ========================================================= */

describe("buildGovernanceDecisionRecord — chosenPolicyVersionId is null for hold", () => {
  it("hold → chosenPolicyVersionId is null", () => {
    const r = buildGovernanceDecisionRecord(makeDeliberation(), "hold", "Not yet.");
    expect(r.chosenPolicyVersionId).toBeNull();
  });
});

/* =========================================================
   Scenario 10: humanReason preserved verbatim
   ========================================================= */

describe("buildGovernanceDecisionRecord — humanReason preserved verbatim", () => {
  it("humanReason matches input", () => {
    const reason = "This looks like a solid improvement.";
    const r = buildGovernanceDecisionRecord(makeDeliberation(), "promote", reason);
    expect(r.humanReason).toBe(reason);
  });
});

/* =========================================================
   Scenario 11: does not mutate deliberationSummary
   ========================================================= */

describe("buildGovernanceDecisionRecord — does not mutate deliberationSummary", () => {
  it("gainsLines length unchanged after call", () => {
    const d = makeDeliberation();
    const origLen = d.gainsLines.length;
    buildGovernanceDecisionRecord(d, "promote", "Reason.");
    expect(d.gainsLines).toHaveLength(origLen);
  });
});

/* =========================================================
   Scenario 12: expectedGains copied from deliberation gainsLines
   ========================================================= */

describe("buildGovernanceDecisionRecord — expectedGains copied from deliberation summary gainsLines", () => {
  it("expectedGains equals deliberation.gainsLines", () => {
    const d = makeDeliberation({ gainsLines: ["Gain A", "Gain B"] });
    const r = buildGovernanceDecisionRecord(d, "promote", "Reason.");
    expect(r.expectedGains).toEqual(["Gain A", "Gain B"]);
  });
});

/* =========================================================
   Scenario 13: linkDecisionToGovernanceAction — null for hold
   ========================================================= */

describe("linkDecisionToGovernanceAction — returns null for hold decision", () => {
  it("hold decision → null regardless of audit trail", () => {
    const d = makeDeliberation();
    const rec = buildGovernanceDecisionRecord(d, "hold", "Not yet.");
    const result = linkDecisionToGovernanceAction(rec, [makeAuditRecord()]);
    expect(result).toBeNull();
  });
});

/* =========================================================
   Scenario 14: linkDecisionToGovernanceAction — null when no matching audit record
   ========================================================= */

describe("linkDecisionToGovernanceAction — returns null when no matching audit record", () => {
  it("empty audit trail → null", () => {
    const d = makeDeliberation();
    const rec = buildGovernanceDecisionRecord(d, "promote", "Promoting.");
    expect(linkDecisionToGovernanceAction(rec, [])).toBeNull();
  });
});

/* =========================================================
   Scenario 15: linkDecisionToGovernanceAction — matches by domain + action + chosenPolicyVersionId
   ========================================================= */

describe("linkDecisionToGovernanceAction — returns matching audit record by domain + action + chosenPolicyVersionId", () => {
  it("matching audit record returned", () => {
    const d = makeDeliberation({ recommendedPolicyVersionId: "pol-recomm1" });
    const rec = buildGovernanceDecisionRecord(d, "promote", "Promoting.");
    const audit = makeAuditRecord({ domain: "nutrition", action: "promote", chosenPolicyVersionId: "pol-recomm1" });
    const result = linkDecisionToGovernanceAction(rec, [audit]);
    expect(result?.actionId).toBe("gov-aaaaaaaa");
  });
});

/* =========================================================
   Scenario 16: linkDecisionToGovernanceAction — does not match wrong domain
   ========================================================= */

describe("linkDecisionToGovernanceAction — does not match wrong domain", () => {
  it("training audit record not matched for nutrition decision", () => {
    const d = makeDeliberation({ domain: "nutrition", recommendedPolicyVersionId: "pol-recomm1" });
    const rec = buildGovernanceDecisionRecord(d, "promote", "Promoting.");
    const audit = makeAuditRecord({ domain: "training", action: "promote", chosenPolicyVersionId: "pol-recomm1" });
    expect(linkDecisionToGovernanceAction(rec, [audit])).toBeNull();
  });
});

/* =========================================================
   Scenario 17: linkDecisionToGovernanceAction — does not match wrong chosenPolicyVersionId
   ========================================================= */

describe("linkDecisionToGovernanceAction — does not match wrong chosenPolicyVersionId", () => {
  it("different chosenPolicyVersionId → no match", () => {
    const d = makeDeliberation({ recommendedPolicyVersionId: "pol-recomm1" });
    const rec = buildGovernanceDecisionRecord(d, "promote", "Promoting.");
    const audit = makeAuditRecord({ chosenPolicyVersionId: "pol-other11" });
    expect(linkDecisionToGovernanceAction(rec, [audit])).toBeNull();
  });
});

/* =========================================================
   Scenario 18: linkDecisionToOutcomeReview — null when chosenPolicyVersionId is null
   ========================================================= */

describe("linkDecisionToOutcomeReview — returns null when chosenPolicyVersionId is null", () => {
  it("hold decision → null", () => {
    const d = makeDeliberation();
    const rec = buildGovernanceDecisionRecord(d, "hold", "Holding.");
    expect(linkDecisionToOutcomeReview(rec, [makeOutcomeReview()])).toBeNull();
  });
});

/* =========================================================
   Scenario 19: linkDecisionToOutcomeReview — null when no matching review
   ========================================================= */

describe("linkDecisionToOutcomeReview — returns null when no matching review", () => {
  it("empty reviews list → null", () => {
    const d = makeDeliberation({ recommendedPolicyVersionId: "pol-recomm1" });
    const rec = buildGovernanceDecisionRecord(d, "promote", "Promoting.");
    expect(linkDecisionToOutcomeReview(rec, [])).toBeNull();
  });
});

/* =========================================================
   Scenario 20: linkDecisionToOutcomeReview — matches by domain + toPolicyVersionId
   ========================================================= */

describe("linkDecisionToOutcomeReview — returns matching review by domain + toPolicyVersionId", () => {
  it("matching review returned for promote decision", () => {
    const d = makeDeliberation({ recommendedPolicyVersionId: "pol-recomm1" });
    const rec = buildGovernanceDecisionRecord(d, "promote", "Promoting.");
    const review = makeOutcomeReview({ domain: "nutrition", toPolicyVersionId: "pol-recomm1" });
    const result = linkDecisionToOutcomeReview(rec, [review]);
    expect(result?.actionId).toBe("gov-aaaaaaaa");
  });
});

/* =========================================================
   Scenario 21: linkDecisionToOutcomeReview — does not match wrong domain
   ========================================================= */

describe("linkDecisionToOutcomeReview — does not match wrong domain", () => {
  it("training review not matched for nutrition decision", () => {
    const d = makeDeliberation({ domain: "nutrition", recommendedPolicyVersionId: "pol-recomm1" });
    const rec = buildGovernanceDecisionRecord(d, "promote", "Promoting.");
    const review = makeOutcomeReview({ domain: "training", toPolicyVersionId: "pol-recomm1" });
    expect(linkDecisionToOutcomeReview(rec, [review])).toBeNull();
  });
});

/* =========================================================
   Scenario 22: buildDecisionOutcomeLink — governanceActionId is null for hold
   ========================================================= */

describe("buildDecisionOutcomeLink — governanceActionId is null for hold decision", () => {
  it("hold → governanceActionId null", () => {
    const d = makeDeliberation();
    const rec = buildGovernanceDecisionRecord(d, "hold", "Holding.");
    const link = buildDecisionOutcomeLink(rec, [makeAuditRecord()], [makeOutcomeReview()]);
    expect(link.governanceActionId).toBeNull();
  });
});

/* =========================================================
   Scenario 23: buildDecisionOutcomeLink — actualOutcomeClass is null when no review
   ========================================================= */

describe("buildDecisionOutcomeLink — actualOutcomeClass is null when no review linked", () => {
  it("empty reviews → actualOutcomeClass null", () => {
    const d = makeDeliberation({ recommendedPolicyVersionId: "pol-recomm1" });
    const rec = buildGovernanceDecisionRecord(d, "promote", "Promoting.");
    const link = buildDecisionOutcomeLink(rec, [], []);
    expect(link.actualOutcomeClass).toBeNull();
  });
});

/* =========================================================
   Scenario 24: buildDecisionOutcomeLink — actualOutcomeClass reflects outcome review class
   ========================================================= */

describe("buildDecisionOutcomeLink — actualOutcomeClass reflects outcome review class", () => {
  it("partially_met review → actualOutcomeClass = 'partially_met'", () => {
    const d = makeDeliberation({ recommendedPolicyVersionId: "pol-recomm1" });
    const rec = buildGovernanceDecisionRecord(d, "promote", "Promoting.");
    const review = makeOutcomeReview({ domain: "nutrition", toPolicyVersionId: "pol-recomm1", outcomeClass: "partially_met" });
    const link = buildDecisionOutcomeLink(rec, [], [review]);
    expect(link.actualOutcomeClass).toBe("partially_met");
  });
});

/* =========================================================
   Scenario 25: buildDecisionOutcomeLink — linkageSummaryLines non-empty
   ========================================================= */

describe("buildDecisionOutcomeLink — linkageSummaryLines non-empty", () => {
  it("at least one linkage summary line", () => {
    const d = makeDeliberation();
    const rec = buildGovernanceDecisionRecord(d, "promote", "Promoting.");
    const link = buildDecisionOutcomeLink(rec, [], []);
    expect(link.linkageSummaryLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 26: buildDecisionOutcomeLink — linkageSummaryLines mention "promotion" for promote
   ========================================================= */

describe("buildDecisionOutcomeLink — linkageSummaryLines mention 'promotion' for promote decision", () => {
  it("first linkage line contains 'promotion'", () => {
    const d = makeDeliberation();
    const rec = buildGovernanceDecisionRecord(d, "promote", "Promoting.");
    const link = buildDecisionOutcomeLink(rec, [], []);
    expect(link.linkageSummaryLines[0].toLowerCase()).toContain("promotion");
  });
});

/* =========================================================
   Scenario 27: buildDecisionOutcomeLink — linkageSummaryLines mention "hold" for hold decision
   ========================================================= */

describe("buildDecisionOutcomeLink — linkageSummaryLines mention 'hold' for hold decision", () => {
  it("first linkage line contains 'hold'", () => {
    const d = makeDeliberation();
    const rec = buildGovernanceDecisionRecord(d, "hold", "Holding.");
    const link = buildDecisionOutcomeLink(rec, [], []);
    expect(link.linkageSummaryLines[0].toLowerCase()).toContain("hold");
  });
});

/* =========================================================
   Scenario 28: buildDecisionOutcomeLink — does not mutate inputs
   ========================================================= */

describe("buildDecisionOutcomeLink — does not mutate inputs", () => {
  it("audit trail and reviews array lengths unchanged", () => {
    const d = makeDeliberation();
    const rec = buildGovernanceDecisionRecord(d, "promote", "Promoting.");
    const trail = [makeAuditRecord()];
    const reviews = [makeOutcomeReview()];
    buildDecisionOutcomeLink(rec, trail, reviews);
    expect(trail).toHaveLength(1);
    expect(reviews).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 29: buildDecisionOutcomeLinkReport — totalLinkedDecisions matches records count
   ========================================================= */

describe("buildDecisionOutcomeLinkReport — totalLinkedDecisions matches input records count", () => {
  it("two records → totalLinkedDecisions = 2", () => {
    const d = makeDeliberation();
    const rec1 = buildGovernanceDecisionRecord(d, "promote", "Reason A.");
    const rec2 = buildGovernanceDecisionRecord(makeDeliberation({ domain: "training" }), "hold", "Reason B.");
    const report = buildDecisionOutcomeLinkReport([rec1, rec2], [], []);
    expect(report.totalLinkedDecisions).toBe(2);
  });
});

/* =========================================================
   Scenario 30: buildDecisionOutcomeLinkReport — summaryLines mention "no governance decision records" for empty
   ========================================================= */

describe("buildDecisionOutcomeLinkReport — summaryLines mention 'no governance decision records' for empty", () => {
  it("empty records → first summaryLine contains 'no governance decision records'", () => {
    const report = buildDecisionOutcomeLinkReport([], [], []);
    expect(report.summaryLines[0]).toMatch(/no governance decision records/i);
  });
});
