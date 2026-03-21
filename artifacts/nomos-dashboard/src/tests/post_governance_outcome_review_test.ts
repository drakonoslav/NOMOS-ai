/**
 * post_governance_outcome_review_test.ts
 *
 * Regression tests for post_governance_review_types.ts and
 * post_governance_outcome_review.ts.
 *
 * All AuditRecord fixtures include only the fields the functions under test
 * actually read (timestamp, intent, routingRecord, evaluationResult).
 *
 * Scenarios:
 *   1.  collectPostGovernanceRuns — returns only records after governance timestamp
 *   2.  collectPostGovernanceRuns — excludes records before governance timestamp
 *   3.  collectPostGovernanceRuns — excludes records at exact same timestamp
 *   4.  collectPostGovernanceRuns — filters by domain using routingRecord
 *   5.  collectPostGovernanceRuns — returns empty when no post-action records
 *   6.  collectPostGovernanceRuns — returns empty when auditRecords is empty
 *   7.  collectPostGovernanceRuns — result is ordered oldest first
 *   8.  comparePrePostGovernanceMetrics — postActionRuns reflects post count
 *   9.  comparePrePostGovernanceMetrics — exactMatchDelta positive when lawful rate improves
 *  10.  comparePrePostGovernanceMetrics — unresolvedDelta negative when invalid rate decreases
 *  11.  comparePrePostGovernanceMetrics — exactMatchDelta null when no post records
 *  12.  comparePrePostGovernanceMetrics — summaryLines non-empty when data available
 *  13.  comparePrePostGovernanceMetrics — tooAggressiveDelta is always null
 *  14.  comparePrePostGovernanceMetrics — tooWeakDelta is always null
 *  15.  comparePrePostGovernanceMetrics — domain filter applied (other-domain records ignored)
 *  16.  classifyGovernanceOutcome — insufficient_followup when postActionRuns < 3
 *  17.  classifyGovernanceOutcome — postActionRuns = 2 is insufficient_followup
 *  18.  classifyGovernanceOutcome — postActionRuns = 3 is not insufficient_followup
 *  19.  classifyGovernanceOutcome — met_expectations when improvement and no regression
 *  20.  classifyGovernanceOutcome — partially_met when improvement but regression present
 *  21.  classifyGovernanceOutcome — did_not_meet when no improvement and gains were expected
 *  22.  classifyGovernanceOutcome — partially_met when no improvement and no gains expected
 *  23.  buildGovernanceOutcomeReview — actionId matches governance action
 *  24.  buildGovernanceOutcomeReview — fromPolicyVersionId is currentPolicyVersionId
 *  25.  buildGovernanceOutcomeReview — toPolicyVersionId is chosenPolicyVersionId
 *  26.  buildGovernanceOutcomeReview — expectation arrays copied from governance action
 *  27.  buildGovernanceOutcomeReview — reviewLines non-empty
 *  28.  buildGovernanceOutcomeReview — insufficient_followup review line when < 3 runs
 *  29.  buildGovernanceOutcomeReviewReport — totalGovernanceActions count matches trail
 *  30.  buildGovernanceOutcomeReviewReport — outcomeCounts sums equal reviews.length
 */

import { describe, it, expect } from "vitest";
import {
  collectPostGovernanceRuns,
  comparePrePostGovernanceMetrics,
  classifyGovernanceOutcome,
  buildGovernanceOutcomeReview,
  buildGovernanceOutcomeReviewReport,
} from "../audit/post_governance_outcome_review";
import type { GovernanceAuditRecord } from "../audit/governance_audit_types";
import type { AuditRecord } from "../audit/audit_types";
import type {
  GovernanceOutcomeExpectation,
  GovernanceOutcomeObserved,
} from "../audit/post_governance_review_types";

/* =========================================================
   Fixtures
   ========================================================= */

function makeGovernanceAction(
  overrides?: Partial<GovernanceAuditRecord>
): GovernanceAuditRecord {
  return {
    actionId: "aud-00000001",
    timestamp: "2026-03-21T12:00:00.000Z",
    domain: "nutrition",
    action: "promote",
    currentPolicyVersionId: "pol-aaaaaaaa",
    recommendedPolicyVersionId: "pol-bbbbbbbb",
    chosenPolicyVersionId: "pol-bbbbbbbb",
    expectedGains: ["Improve lawful-outcome rate."],
    expectedTradeoffs: ["Slight increase in degraded outcomes."],
    expectedRisks: ["May be too aggressive on high-variance days."],
    recommendationStrength: "strong",
    recommendationConfidence: "high",
    humanReason: "Evidence supports promotion.",
    benchEvidenceSummary: [],
    recommendationSummary: [],
    ...overrides,
  };
}

function makeAuditRecord(
  timestamp: string,
  overallStatus: "LAWFUL" | "DEGRADED" | "INVALID" | null,
  domain: "nutrition" | "training" | "schedule" | "generic" = "nutrition",
  overrides?: Partial<AuditRecord>
): AuditRecord {
  return {
    id: `rec-${timestamp}`,
    versionId: "v1",
    timestamp,
    intent: "NUTRITION_AUDIT",
    title: "Test record",
    isEvaluable: true,
    isConfirmed: true,
    canonicalDeclaration: "test",
    compileResult: null,
    patchedDraft: null,
    evaluationResult: overallStatus
      ? { payload: { overallStatus } }
      : null,
    routingRecord: {
      domain,
      activePolicyVersionId: "pol-bbbbbbbb",
      routingReason: "test",
      usedDefaultFallback: false,
    } as AuditRecord["routingRecord"],
    ...overrides,
  } as AuditRecord;
}

function makeObserved(
  overrides?: Partial<GovernanceOutcomeObserved>
): GovernanceOutcomeObserved {
  return {
    postActionRuns: 5,
    exactMatchDelta: 0.1,
    directionMatchDelta: 0.0,
    tooAggressiveDelta: null,
    tooWeakDelta: null,
    unresolvedDelta: -0.05,
    summaryLines: [],
    ...overrides,
  };
}

function makeExpectation(
  overrides?: Partial<GovernanceOutcomeExpectation>
): GovernanceOutcomeExpectation {
  return {
    expectedGains: ["Improve lawful-outcome rate."],
    expectedTradeoffs: [],
    expectedRisks: [],
    ...overrides,
  };
}

/* =========================================================
   Scenario 1: collectPostGovernanceRuns — returns only records after governance timestamp
   ========================================================= */

describe("collectPostGovernanceRuns — returns only records after governance timestamp", () => {
  it("post-action record is included", () => {
    const ga = makeGovernanceAction();
    const rec = makeAuditRecord("2026-03-21T13:00:00.000Z", "LAWFUL");
    const result = collectPostGovernanceRuns(ga, [rec]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(rec.id);
  });
});

/* =========================================================
   Scenario 2: collectPostGovernanceRuns — excludes records before governance timestamp
   ========================================================= */

describe("collectPostGovernanceRuns — excludes records before governance timestamp", () => {
  it("pre-action record is excluded", () => {
    const ga = makeGovernanceAction();
    const rec = makeAuditRecord("2026-03-21T10:00:00.000Z", "LAWFUL");
    const result = collectPostGovernanceRuns(ga, [rec]);
    expect(result).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 3: collectPostGovernanceRuns — excludes records at exact same timestamp
   ========================================================= */

describe("collectPostGovernanceRuns — excludes records at exact same timestamp", () => {
  it("simultaneous record is excluded", () => {
    const ga = makeGovernanceAction();
    const rec = makeAuditRecord("2026-03-21T12:00:00.000Z", "LAWFUL");
    const result = collectPostGovernanceRuns(ga, [rec]);
    expect(result).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 4: collectPostGovernanceRuns — filters by domain using routingRecord
   ========================================================= */

describe("collectPostGovernanceRuns — filters by domain using routingRecord", () => {
  it("training-domain record excluded from nutrition governance action", () => {
    const ga = makeGovernanceAction({ domain: "nutrition" });
    const wrongDomain = makeAuditRecord(
      "2026-03-21T13:00:00.000Z",
      "LAWFUL",
      "training"
    );
    const result = collectPostGovernanceRuns(ga, [wrongDomain]);
    expect(result).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 5: collectPostGovernanceRuns — returns empty when no post-action records
   ========================================================= */

describe("collectPostGovernanceRuns — returns empty when no post-action records", () => {
  it("all pre-action records → empty result", () => {
    const ga = makeGovernanceAction();
    const pre1 = makeAuditRecord("2026-03-21T09:00:00.000Z", "LAWFUL");
    const pre2 = makeAuditRecord("2026-03-21T10:00:00.000Z", "DEGRADED");
    const result = collectPostGovernanceRuns(ga, [pre1, pre2]);
    expect(result).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 6: collectPostGovernanceRuns — returns empty when auditRecords is empty
   ========================================================= */

describe("collectPostGovernanceRuns — returns empty when auditRecords is empty", () => {
  it("empty input → empty result", () => {
    const ga = makeGovernanceAction();
    expect(collectPostGovernanceRuns(ga, [])).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 7: collectPostGovernanceRuns — result is ordered oldest first
   ========================================================= */

describe("collectPostGovernanceRuns — result is ordered oldest first", () => {
  it("first element has the earlier timestamp", () => {
    const ga = makeGovernanceAction();
    const later = makeAuditRecord("2026-03-21T15:00:00.000Z", "LAWFUL");
    const earlier = makeAuditRecord("2026-03-21T13:00:00.000Z", "LAWFUL");
    const result = collectPostGovernanceRuns(ga, [later, earlier]);
    expect(result[0].id).toBe(earlier.id);
    expect(result[1].id).toBe(later.id);
  });
});

/* =========================================================
   Scenario 8: comparePrePostGovernanceMetrics — postActionRuns reflects post count
   ========================================================= */

describe("comparePrePostGovernanceMetrics — postActionRuns reflects post count", () => {
  it("3 post-action records → postActionRuns is 3", () => {
    const ga = makeGovernanceAction();
    const post1 = makeAuditRecord("2026-03-21T13:00:00.000Z", "LAWFUL");
    const post2 = makeAuditRecord("2026-03-21T14:00:00.000Z", "LAWFUL");
    const post3 = makeAuditRecord("2026-03-21T15:00:00.000Z", "DEGRADED");
    const result = comparePrePostGovernanceMetrics(ga, [post1, post2, post3]);
    expect(result.postActionRuns).toBe(3);
  });
});

/* =========================================================
   Scenario 9: comparePrePostGovernanceMetrics — exactMatchDelta positive when lawful rate improves
   ========================================================= */

describe("comparePrePostGovernanceMetrics — exactMatchDelta positive when lawful rate improves", () => {
  it("pre=0% lawful, post=100% lawful → exactMatchDelta > 0", () => {
    const ga = makeGovernanceAction();
    const pre = makeAuditRecord("2026-03-21T10:00:00.000Z", "INVALID");
    const post = makeAuditRecord("2026-03-21T13:00:00.000Z", "LAWFUL");
    const result = comparePrePostGovernanceMetrics(ga, [pre, post]);
    expect(result.exactMatchDelta).not.toBeNull();
    expect(result.exactMatchDelta as number).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 10: comparePrePostGovernanceMetrics — unresolvedDelta negative when invalid rate decreases
   ========================================================= */

describe("comparePrePostGovernanceMetrics — unresolvedDelta negative when invalid rate decreases", () => {
  it("pre=100% invalid, post=0% invalid → unresolvedDelta < 0", () => {
    const ga = makeGovernanceAction();
    const pre = makeAuditRecord("2026-03-21T10:00:00.000Z", "INVALID");
    const post = makeAuditRecord("2026-03-21T13:00:00.000Z", "LAWFUL");
    const result = comparePrePostGovernanceMetrics(ga, [pre, post]);
    expect(result.unresolvedDelta).not.toBeNull();
    expect(result.unresolvedDelta as number).toBeLessThan(0);
  });
});

/* =========================================================
   Scenario 11: comparePrePostGovernanceMetrics — exactMatchDelta null when no post records
   ========================================================= */

describe("comparePrePostGovernanceMetrics — exactMatchDelta null when no post records", () => {
  it("no post records → all deltas null", () => {
    const ga = makeGovernanceAction();
    const pre = makeAuditRecord("2026-03-21T10:00:00.000Z", "LAWFUL");
    const result = comparePrePostGovernanceMetrics(ga, [pre]);
    expect(result.exactMatchDelta).toBeNull();
    expect(result.unresolvedDelta).toBeNull();
    expect(result.directionMatchDelta).toBeNull();
  });
});

/* =========================================================
   Scenario 12: comparePrePostGovernanceMetrics — summaryLines non-empty when data available
   ========================================================= */

describe("comparePrePostGovernanceMetrics — summaryLines non-empty when data available", () => {
  it("with post records, summaryLines has at least one entry", () => {
    const ga = makeGovernanceAction();
    const post = makeAuditRecord("2026-03-21T13:00:00.000Z", "LAWFUL");
    const result = comparePrePostGovernanceMetrics(ga, [post]);
    expect(result.summaryLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 13: comparePrePostGovernanceMetrics — tooAggressiveDelta is always null
   ========================================================= */

describe("comparePrePostGovernanceMetrics — tooAggressiveDelta is always null", () => {
  it("tooAggressiveDelta is null regardless of data", () => {
    const ga = makeGovernanceAction();
    const post = makeAuditRecord("2026-03-21T13:00:00.000Z", "INVALID");
    const result = comparePrePostGovernanceMetrics(ga, [post]);
    expect(result.tooAggressiveDelta).toBeNull();
  });
});

/* =========================================================
   Scenario 14: comparePrePostGovernanceMetrics — tooWeakDelta is always null
   ========================================================= */

describe("comparePrePostGovernanceMetrics — tooWeakDelta is always null", () => {
  it("tooWeakDelta is null regardless of data", () => {
    const ga = makeGovernanceAction();
    const post = makeAuditRecord("2026-03-21T13:00:00.000Z", "DEGRADED");
    const result = comparePrePostGovernanceMetrics(ga, [post]);
    expect(result.tooWeakDelta).toBeNull();
  });
});

/* =========================================================
   Scenario 15: comparePrePostGovernanceMetrics — domain filter applied
   ========================================================= */

describe("comparePrePostGovernanceMetrics — domain filter applied (other-domain records ignored)", () => {
  it("training record after governance action not counted for nutrition governance", () => {
    const ga = makeGovernanceAction({ domain: "nutrition" });
    const trainingPost = makeAuditRecord(
      "2026-03-21T13:00:00.000Z",
      "LAWFUL",
      "training"
    );
    const result = comparePrePostGovernanceMetrics(ga, [trainingPost]);
    expect(result.postActionRuns).toBe(0);
  });
});

/* =========================================================
   Scenario 16: classifyGovernanceOutcome — insufficient_followup when postActionRuns < 3
   ========================================================= */

describe("classifyGovernanceOutcome — insufficient_followup when postActionRuns < 3", () => {
  it("1 follow-up run → insufficient_followup", () => {
    const exp = makeExpectation();
    const obs = makeObserved({ postActionRuns: 1, exactMatchDelta: 0.5 });
    expect(classifyGovernanceOutcome(exp, obs)).toBe("insufficient_followup");
  });
});

/* =========================================================
   Scenario 17: classifyGovernanceOutcome — postActionRuns = 2 is insufficient_followup
   ========================================================= */

describe("classifyGovernanceOutcome — postActionRuns = 2 is insufficient_followup", () => {
  it("2 follow-up runs → insufficient_followup", () => {
    const exp = makeExpectation();
    const obs = makeObserved({ postActionRuns: 2 });
    expect(classifyGovernanceOutcome(exp, obs)).toBe("insufficient_followup");
  });
});

/* =========================================================
   Scenario 18: classifyGovernanceOutcome — postActionRuns = 3 is not insufficient_followup
   ========================================================= */

describe("classifyGovernanceOutcome — postActionRuns = 3 is not insufficient_followup", () => {
  it("3 follow-up runs with clear improvement → met_expectations", () => {
    const exp = makeExpectation();
    const obs = makeObserved({
      postActionRuns: 3,
      exactMatchDelta: 0.1,
      unresolvedDelta: 0.0,
    });
    expect(classifyGovernanceOutcome(exp, obs)).toBe("met_expectations");
  });
});

/* =========================================================
   Scenario 19: classifyGovernanceOutcome — met_expectations when improvement and no regression
   ========================================================= */

describe("classifyGovernanceOutcome — met_expectations when improvement and no regression", () => {
  it("large positive exactMatchDelta, zero unresolvedDelta → met_expectations", () => {
    const exp = makeExpectation();
    const obs = makeObserved({
      postActionRuns: 5,
      exactMatchDelta: 0.2,
      unresolvedDelta: 0.0,
    });
    expect(classifyGovernanceOutcome(exp, obs)).toBe("met_expectations");
  });
});

/* =========================================================
   Scenario 20: classifyGovernanceOutcome — partially_met when improvement but regression present
   ========================================================= */

describe("classifyGovernanceOutcome — partially_met when improvement but regression present", () => {
  it("positive exactMatchDelta AND material unresolvedDelta → partially_met", () => {
    const exp = makeExpectation();
    const obs = makeObserved({
      postActionRuns: 5,
      exactMatchDelta: 0.1,
      unresolvedDelta: 0.08,
    });
    expect(classifyGovernanceOutcome(exp, obs)).toBe("partially_met");
  });
});

/* =========================================================
   Scenario 21: classifyGovernanceOutcome — did_not_meet when no improvement and gains expected
   ========================================================= */

describe("classifyGovernanceOutcome — did_not_meet when no improvement and gains were expected", () => {
  it("zero exactMatchDelta with gains expected → did_not_meet", () => {
    const exp = makeExpectation({
      expectedGains: ["Improve lawful-outcome rate."],
    });
    const obs = makeObserved({
      postActionRuns: 5,
      exactMatchDelta: -0.05,
      unresolvedDelta: 0.01,
    });
    expect(classifyGovernanceOutcome(exp, obs)).toBe("did_not_meet");
  });
});

/* =========================================================
   Scenario 22: classifyGovernanceOutcome — partially_met when no improvement and no gains expected
   ========================================================= */

describe("classifyGovernanceOutcome — partially_met when no improvement and no gains expected", () => {
  it("zero exactMatchDelta with no gains expected → partially_met", () => {
    const exp = makeExpectation({ expectedGains: [] });
    const obs = makeObserved({
      postActionRuns: 5,
      exactMatchDelta: -0.01,
      unresolvedDelta: 0.01,
    });
    expect(classifyGovernanceOutcome(exp, obs)).toBe("partially_met");
  });
});

/* =========================================================
   Scenario 23: buildGovernanceOutcomeReview — actionId matches governance action
   ========================================================= */

describe("buildGovernanceOutcomeReview — actionId matches governance action", () => {
  it("review.actionId equals ga.actionId", () => {
    const ga = makeGovernanceAction({ actionId: "aud-cafebabe" });
    const review = buildGovernanceOutcomeReview(ga, []);
    expect(review.actionId).toBe("aud-cafebabe");
  });
});

/* =========================================================
   Scenario 24: buildGovernanceOutcomeReview — fromPolicyVersionId is currentPolicyVersionId
   ========================================================= */

describe("buildGovernanceOutcomeReview — fromPolicyVersionId is currentPolicyVersionId", () => {
  it("fromPolicyVersionId matches currentPolicyVersionId", () => {
    const ga = makeGovernanceAction({
      currentPolicyVersionId: "pol-aaaaaaaa",
    });
    const review = buildGovernanceOutcomeReview(ga, []);
    expect(review.fromPolicyVersionId).toBe("pol-aaaaaaaa");
  });
});

/* =========================================================
   Scenario 25: buildGovernanceOutcomeReview — toPolicyVersionId is chosenPolicyVersionId
   ========================================================= */

describe("buildGovernanceOutcomeReview — toPolicyVersionId is chosenPolicyVersionId", () => {
  it("toPolicyVersionId matches chosenPolicyVersionId", () => {
    const ga = makeGovernanceAction({ chosenPolicyVersionId: "pol-bbbbbbbb" });
    const review = buildGovernanceOutcomeReview(ga, []);
    expect(review.toPolicyVersionId).toBe("pol-bbbbbbbb");
  });
});

/* =========================================================
   Scenario 26: buildGovernanceOutcomeReview — expectation arrays copied from governance action
   ========================================================= */

describe("buildGovernanceOutcomeReview — expectation arrays copied from governance action", () => {
  it("expectation.expectedGains contains the same text as ga.expectedGains", () => {
    const ga = makeGovernanceAction({
      expectedGains: ["Gain A", "Gain B"],
      expectedTradeoffs: ["Tradeoff X"],
      expectedRisks: ["Risk Z"],
    });
    const review = buildGovernanceOutcomeReview(ga, []);
    expect(review.expectation.expectedGains).toEqual(["Gain A", "Gain B"]);
    expect(review.expectation.expectedTradeoffs).toEqual(["Tradeoff X"]);
    expect(review.expectation.expectedRisks).toEqual(["Risk Z"]);
  });
});

/* =========================================================
   Scenario 27: buildGovernanceOutcomeReview — reviewLines non-empty
   ========================================================= */

describe("buildGovernanceOutcomeReview — reviewLines non-empty", () => {
  it("at least one review line is always produced", () => {
    const ga = makeGovernanceAction();
    const review = buildGovernanceOutcomeReview(ga, []);
    expect(review.reviewLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 28: buildGovernanceOutcomeReview — insufficient_followup review line when < 3 runs
   ========================================================= */

describe("buildGovernanceOutcomeReview — insufficient_followup review line when < 3 runs", () => {
  it("review line contains 'too shallow' when insufficient follow-up", () => {
    const ga = makeGovernanceAction();
    const review = buildGovernanceOutcomeReview(ga, []);
    expect(review.reviewLines[0]).toMatch(/too shallow/i);
  });
});

/* =========================================================
   Scenario 29: buildGovernanceOutcomeReviewReport — totalGovernanceActions count matches trail
   ========================================================= */

describe("buildGovernanceOutcomeReviewReport — totalGovernanceActions count matches trail", () => {
  it("report.totalGovernanceActions equals trail length", () => {
    const ga1 = makeGovernanceAction({ actionId: "aud-00000001" });
    const ga2 = makeGovernanceAction({
      actionId: "aud-00000002",
      timestamp: "2026-03-21T14:00:00.000Z",
    });
    const report = buildGovernanceOutcomeReviewReport([ga1, ga2], []);
    expect(report.totalGovernanceActions).toBe(2);
  });
});

/* =========================================================
   Scenario 30: buildGovernanceOutcomeReviewReport — outcomeCounts sums equal reviews.length
   ========================================================= */

describe("buildGovernanceOutcomeReviewReport — outcomeCounts sums equal reviews.length", () => {
  it("sum of all outcomeCounts equals reviews.length", () => {
    const ga1 = makeGovernanceAction({ actionId: "aud-00000001" });
    const ga2 = makeGovernanceAction({
      actionId: "aud-00000002",
      timestamp: "2026-03-21T14:00:00.000Z",
    });
    const report = buildGovernanceOutcomeReviewReport([ga1, ga2], []);
    const countSum = Object.values(report.outcomeCounts).reduce(
      (a, b) => a + b,
      0
    );
    expect(countSum).toBe(report.reviews.length);
  });
});
