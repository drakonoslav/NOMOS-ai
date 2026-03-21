/**
 * governance_learning_summary_test.ts
 *
 * Regression tests for governance_learning_types.ts and
 * governance_learning_summary.ts.
 *
 * Scenarios:
 *   1.  buildSuccessfulPromotionPatterns — empty when no met_expectations reviews
 *   2.  buildSuccessfulPromotionPatterns — returns pattern for domain with met_expectations promote
 *   3.  buildSuccessfulPromotionPatterns — does not include rollback actions
 *   4.  buildSuccessfulPromotionPatterns — does not include partially_met or did_not_meet
 *   5.  buildSuccessfulPromotionPatterns — domain matches the review domain
 *   6.  buildSuccessfulPromotionPatterns — supportingActionCount matches qualifying count
 *   7.  buildRecurringTradeoffPatterns — empty when no partially_met reviews
 *   8.  buildRecurringTradeoffPatterns — detects exact-up + unresolved-up tradeoff pattern
 *   9.  buildRecurringTradeoffPatterns — per-domain pattern when 2+ partially_met in same domain
 *  10.  buildRecurringTradeoffPatterns — no per-domain pattern when only 1 partially_met in domain
 *  11.  buildRecurringRiskPatterns — detects shallow-history risk from insufficient_followup
 *  12.  buildRecurringRiskPatterns — empty when no insufficient_followup or high-unresolved reviews
 *  13.  buildRecurringRiskPatterns — detects high unresolved delta risk
 *  14.  buildRecurringRiskPatterns — supportingActionCount matches qualifying count
 *  15.  buildRecurringGovernanceMistakes — detects did_not_meet mistakes
 *  16.  buildRecurringGovernanceMistakes — detects undeclared tradeoffs in partially_met
 *  17.  buildRecurringGovernanceMistakes — empty when no qualifying reviews
 *  18.  buildGovernanceLearningSummary — totalGovernanceActions matches input length
 *  19.  buildGovernanceLearningSummary — reviewableActions excludes insufficient_followup
 *  20.  buildGovernanceLearningSummary — summaryLines non-empty for non-empty input
 *  21.  buildGovernanceLearningSummary — empty input produces no patterns
 *  22.  buildGovernanceLearningSummary — does not mutate input array
 *  23.  buildSuccessfulPromotionPatterns — mixed domain when met_expectations span multiple domains
 *  24.  buildRecurringTradeoffPatterns — mixed domain when partials span multiple domains
 *  25.  buildRecurringRiskPatterns — insufficient_followup domain is mixed when spans multiple domains
 *  26.  buildGovernanceLearningSummary — insufficient_followup reviews contribute to risk patterns
 *  27.  buildGovernanceLearningSummary — successful patterns non-empty for met_expectations data
 *  28.  buildRecurringGovernanceMistakes — supportingActionCount is correct
 *  29.  buildGovernanceLearningSummary — summaryLines say "no governance actions" for empty input
 *  30.  buildGovernanceLearningSummary — reviewableActions is 0 when all insufficient_followup
 */

import { describe, it, expect } from "vitest";
import {
  buildSuccessfulPromotionPatterns,
  buildRecurringTradeoffPatterns,
  buildRecurringRiskPatterns,
  buildRecurringGovernanceMistakes,
  buildGovernanceLearningSummary,
} from "../audit/governance_learning_summary";
import type { GovernanceOutcomeReview } from "../audit/post_governance_review_types";

/* =========================================================
   Fixtures
   ========================================================= */

function makeReview(
  overrides?: Partial<GovernanceOutcomeReview>
): GovernanceOutcomeReview {
  return {
    actionId: "aud-00000001",
    domain: "nutrition",
    action: "promote",
    fromPolicyVersionId: "pol-aaaaaaaa",
    toPolicyVersionId: "pol-bbbbbbbb",
    expectation: {
      expectedGains: ["Improve lawful-outcome rate."],
      expectedTradeoffs: [],
      expectedRisks: [],
    },
    observed: {
      postActionRuns: 5,
      exactMatchDelta: 0.1,
      directionMatchDelta: 0.0,
      tooAggressiveDelta: null,
      tooWeakDelta: null,
      unresolvedDelta: -0.05,
      summaryLines: [],
    },
    outcomeClass: "met_expectations",
    reviewLines: ["Observed outcomes aligned with expected gains."],
    ...overrides,
  };
}

/* =========================================================
   Scenario 1: buildSuccessfulPromotionPatterns — empty when no met_expectations reviews
   ========================================================= */

describe("buildSuccessfulPromotionPatterns — empty when no met_expectations reviews", () => {
  it("returns empty array", () => {
    const reviews = [
      makeReview({ outcomeClass: "partially_met" }),
      makeReview({ outcomeClass: "did_not_meet" }),
    ];
    expect(buildSuccessfulPromotionPatterns(reviews)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 2: buildSuccessfulPromotionPatterns — returns pattern for domain with met_expectations promote
   ========================================================= */

describe("buildSuccessfulPromotionPatterns — returns pattern for domain with met_expectations promote", () => {
  it("one met_expectations promote → one pattern", () => {
    const reviews = [makeReview({ outcomeClass: "met_expectations", action: "promote" })];
    const result = buildSuccessfulPromotionPatterns(reviews);
    expect(result.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 3: buildSuccessfulPromotionPatterns — does not include rollback actions
   ========================================================= */

describe("buildSuccessfulPromotionPatterns — does not include rollback actions", () => {
  it("met_expectations rollback is not counted", () => {
    const reviews = [
      makeReview({ outcomeClass: "met_expectations", action: "rollback" }),
    ];
    expect(buildSuccessfulPromotionPatterns(reviews)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 4: buildSuccessfulPromotionPatterns — does not include partially_met or did_not_meet
   ========================================================= */

describe("buildSuccessfulPromotionPatterns — does not include partially_met or did_not_meet", () => {
  it("partially_met and did_not_meet are ignored", () => {
    const reviews = [
      makeReview({ outcomeClass: "partially_met" }),
      makeReview({ outcomeClass: "did_not_meet" }),
    ];
    expect(buildSuccessfulPromotionPatterns(reviews)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 5: buildSuccessfulPromotionPatterns — domain matches the review domain
   ========================================================= */

describe("buildSuccessfulPromotionPatterns — domain matches the review domain", () => {
  it("pattern domain is 'training' when all reviews are training", () => {
    const reviews = [
      makeReview({ outcomeClass: "met_expectations", action: "promote", domain: "training" }),
    ];
    const result = buildSuccessfulPromotionPatterns(reviews);
    expect(result[0].domain).toBe("training");
  });
});

/* =========================================================
   Scenario 6: buildSuccessfulPromotionPatterns — supportingActionCount matches qualifying count
   ========================================================= */

describe("buildSuccessfulPromotionPatterns — supportingActionCount matches qualifying count", () => {
  it("3 nutrition met_expectations promotes → supportingActionCount 3", () => {
    const reviews = [
      makeReview({ actionId: "aud-00000001", outcomeClass: "met_expectations" }),
      makeReview({ actionId: "aud-00000002", outcomeClass: "met_expectations" }),
      makeReview({ actionId: "aud-00000003", outcomeClass: "met_expectations" }),
    ];
    const result = buildSuccessfulPromotionPatterns(reviews);
    const nutritionPattern = result.find((p) => p.domain === "nutrition");
    expect(nutritionPattern?.supportingActionCount).toBe(3);
  });
});

/* =========================================================
   Scenario 7: buildRecurringTradeoffPatterns — empty when no partially_met reviews
   ========================================================= */

describe("buildRecurringTradeoffPatterns — empty when no partially_met reviews", () => {
  it("returns empty array when all reviews are met_expectations", () => {
    const reviews = [makeReview({ outcomeClass: "met_expectations" })];
    expect(buildRecurringTradeoffPatterns(reviews)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 8: buildRecurringTradeoffPatterns — detects exact-up + unresolved-up tradeoff pattern
   ========================================================= */

describe("buildRecurringTradeoffPatterns — detects exact-up + unresolved-up tradeoff pattern", () => {
  it("pattern detected when exactMatchDelta > 0 AND unresolvedDelta > 0", () => {
    const reviews = [
      makeReview({
        outcomeClass: "partially_met",
        observed: {
          postActionRuns: 5,
          exactMatchDelta: 0.08,
          directionMatchDelta: 0.0,
          tooAggressiveDelta: null,
          tooWeakDelta: null,
          unresolvedDelta: 0.05,
          summaryLines: [],
        },
      }),
    ];
    const result = buildRecurringTradeoffPatterns(reviews);
    const tradeoffPattern = result.find((p) =>
      p.label.includes("Unresolved-rate")
    );
    expect(tradeoffPattern).toBeDefined();
    expect(tradeoffPattern!.supportingActionCount).toBe(1);
  });
});

/* =========================================================
   Scenario 9: buildRecurringTradeoffPatterns — per-domain pattern when 2+ partially_met in same domain
   ========================================================= */

describe("buildRecurringTradeoffPatterns — per-domain pattern when 2+ partially_met in same domain", () => {
  it("2 partially_met in nutrition → per-domain pattern", () => {
    const reviews = [
      makeReview({ actionId: "aud-00000001", outcomeClass: "partially_met", domain: "nutrition" }),
      makeReview({ actionId: "aud-00000002", outcomeClass: "partially_met", domain: "nutrition" }),
    ];
    const result = buildRecurringTradeoffPatterns(reviews);
    const perDomain = result.find((p) => p.label.includes("nutrition"));
    expect(perDomain).toBeDefined();
    expect(perDomain!.supportingActionCount).toBe(2);
  });
});

/* =========================================================
   Scenario 10: buildRecurringTradeoffPatterns — no per-domain pattern when only 1 partially_met in domain
   ========================================================= */

describe("buildRecurringTradeoffPatterns — no per-domain pattern when only 1 partially_met in domain", () => {
  it("1 partially_met in nutrition → no per-domain recurring pattern", () => {
    const reviews = [
      makeReview({
        outcomeClass: "partially_met",
        domain: "nutrition",
        observed: {
          postActionRuns: 5,
          exactMatchDelta: 0.0,
          directionMatchDelta: 0.0,
          tooAggressiveDelta: null,
          tooWeakDelta: null,
          unresolvedDelta: 0.0,
          summaryLines: [],
        },
      }),
    ];
    const result = buildRecurringTradeoffPatterns(reviews);
    const perDomain = result.find(
      (p) => p.label.includes("nutrition") && p.label.includes("Repeated")
    );
    expect(perDomain).toBeUndefined();
  });
});

/* =========================================================
   Scenario 11: buildRecurringRiskPatterns — detects shallow-history risk from insufficient_followup
   ========================================================= */

describe("buildRecurringRiskPatterns — detects shallow-history risk from insufficient_followup", () => {
  it("insufficient_followup review → shallow-history risk pattern", () => {
    const reviews = [makeReview({ outcomeClass: "insufficient_followup" })];
    const result = buildRecurringRiskPatterns(reviews);
    const shallowPattern = result.find((p) => p.label.includes("Shallow-history"));
    expect(shallowPattern).toBeDefined();
    expect(shallowPattern!.supportingActionCount).toBe(1);
  });
});

/* =========================================================
   Scenario 12: buildRecurringRiskPatterns — empty when no qualifying reviews
   ========================================================= */

describe("buildRecurringRiskPatterns — empty when no insufficient_followup or high-unresolved reviews", () => {
  it("clean met_expectations reviews with low deltas → empty risk patterns", () => {
    const reviews = [
      makeReview({
        outcomeClass: "met_expectations",
        observed: {
          postActionRuns: 5,
          exactMatchDelta: 0.1,
          directionMatchDelta: 0.0,
          tooAggressiveDelta: null,
          tooWeakDelta: null,
          unresolvedDelta: 0.01,
          summaryLines: [],
        },
      }),
    ];
    expect(buildRecurringRiskPatterns(reviews)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 13: buildRecurringRiskPatterns — detects high unresolved delta risk
   ========================================================= */

describe("buildRecurringRiskPatterns — detects high unresolved delta risk", () => {
  it("unresolvedDelta > 0.10 → elevated unresolved pattern", () => {
    const reviews = [
      makeReview({
        outcomeClass: "partially_met",
        observed: {
          postActionRuns: 5,
          exactMatchDelta: 0.0,
          directionMatchDelta: 0.0,
          tooAggressiveDelta: null,
          tooWeakDelta: null,
          unresolvedDelta: 0.15,
          summaryLines: [],
        },
      }),
    ];
    const result = buildRecurringRiskPatterns(reviews);
    const highPattern = result.find((p) => p.label.includes("Elevated unresolved"));
    expect(highPattern).toBeDefined();
    expect(highPattern!.supportingActionCount).toBe(1);
  });
});

/* =========================================================
   Scenario 14: buildRecurringRiskPatterns — supportingActionCount matches qualifying count
   ========================================================= */

describe("buildRecurringRiskPatterns — supportingActionCount matches qualifying count", () => {
  it("2 insufficient_followup → supportingActionCount 2", () => {
    const reviews = [
      makeReview({ actionId: "aud-00000001", outcomeClass: "insufficient_followup" }),
      makeReview({ actionId: "aud-00000002", outcomeClass: "insufficient_followup" }),
    ];
    const result = buildRecurringRiskPatterns(reviews);
    const shallow = result.find((p) => p.label.includes("Shallow-history"));
    expect(shallow?.supportingActionCount).toBe(2);
  });
});

/* =========================================================
   Scenario 15: buildRecurringGovernanceMistakes — detects did_not_meet mistakes
   ========================================================= */

describe("buildRecurringGovernanceMistakes — detects did_not_meet mistakes", () => {
  it("did_not_meet review → 'Expected gains did not materialise' pattern", () => {
    const reviews = [makeReview({ outcomeClass: "did_not_meet" })];
    const result = buildRecurringGovernanceMistakes(reviews);
    const mistake = result.find((p) => p.label.includes("Expected gains"));
    expect(mistake).toBeDefined();
    expect(mistake!.supportingActionCount).toBe(1);
  });
});

/* =========================================================
   Scenario 16: buildRecurringGovernanceMistakes — detects undeclared tradeoffs in partially_met
   ========================================================= */

describe("buildRecurringGovernanceMistakes — detects undeclared tradeoffs in partially_met", () => {
  it("partially_met + no declared tradeoffs + unresolvedDelta > 0 → undeclared-tradeoff pattern", () => {
    const reviews = [
      makeReview({
        outcomeClass: "partially_met",
        expectation: { expectedGains: [], expectedTradeoffs: [], expectedRisks: [] },
        observed: {
          postActionRuns: 5,
          exactMatchDelta: 0.05,
          directionMatchDelta: 0.0,
          tooAggressiveDelta: null,
          tooWeakDelta: null,
          unresolvedDelta: 0.08,
          summaryLines: [],
        },
      }),
    ];
    const result = buildRecurringGovernanceMistakes(reviews);
    const undeclared = result.find((p) => p.label.includes("Tradeoffs repeatedly"));
    expect(undeclared).toBeDefined();
    expect(undeclared!.supportingActionCount).toBe(1);
  });
});

/* =========================================================
   Scenario 17: buildRecurringGovernanceMistakes — empty when no qualifying reviews
   ========================================================= */

describe("buildRecurringGovernanceMistakes — empty when no qualifying reviews", () => {
  it("all met_expectations → empty mistakes", () => {
    const reviews = [makeReview({ outcomeClass: "met_expectations" })];
    expect(buildRecurringGovernanceMistakes(reviews)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 18: buildGovernanceLearningSummary — totalGovernanceActions matches input length
   ========================================================= */

describe("buildGovernanceLearningSummary — totalGovernanceActions matches input length", () => {
  it("3 reviews → totalGovernanceActions 3", () => {
    const reviews = [
      makeReview({ actionId: "aud-00000001" }),
      makeReview({ actionId: "aud-00000002" }),
      makeReview({ actionId: "aud-00000003" }),
    ];
    expect(buildGovernanceLearningSummary(reviews).totalGovernanceActions).toBe(3);
  });
});

/* =========================================================
   Scenario 19: buildGovernanceLearningSummary — reviewableActions excludes insufficient_followup
   ========================================================= */

describe("buildGovernanceLearningSummary — reviewableActions excludes insufficient_followup", () => {
  it("1 met_expectations + 1 insufficient_followup → reviewableActions 1", () => {
    const reviews = [
      makeReview({ actionId: "aud-00000001", outcomeClass: "met_expectations" }),
      makeReview({ actionId: "aud-00000002", outcomeClass: "insufficient_followup" }),
    ];
    expect(buildGovernanceLearningSummary(reviews).reviewableActions).toBe(1);
  });
});

/* =========================================================
   Scenario 20: buildGovernanceLearningSummary — summaryLines non-empty for non-empty input
   ========================================================= */

describe("buildGovernanceLearningSummary — summaryLines non-empty for non-empty input", () => {
  it("at least one summary line produced", () => {
    const reviews = [makeReview()];
    expect(buildGovernanceLearningSummary(reviews).summaryLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 21: buildGovernanceLearningSummary — empty input produces no patterns
   ========================================================= */

describe("buildGovernanceLearningSummary — empty input produces no patterns", () => {
  it("all pattern arrays are empty for empty input", () => {
    const result = buildGovernanceLearningSummary([]);
    expect(result.successfulPromotionPatterns).toHaveLength(0);
    expect(result.recurringTradeoffPatterns).toHaveLength(0);
    expect(result.recurringRiskPatterns).toHaveLength(0);
    expect(result.recurringGovernanceMistakes).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 22: buildGovernanceLearningSummary — does not mutate input array
   ========================================================= */

describe("buildGovernanceLearningSummary — does not mutate input array", () => {
  it("input length unchanged after call", () => {
    const reviews = [makeReview()];
    const originalLength = reviews.length;
    buildGovernanceLearningSummary(reviews);
    expect(reviews).toHaveLength(originalLength);
  });
});

/* =========================================================
   Scenario 23: buildSuccessfulPromotionPatterns — mixed domain when met_expectations span multiple domains
   ========================================================= */

describe("buildSuccessfulPromotionPatterns — separate patterns per domain, not merged as mixed", () => {
  it("nutrition + training met_expectations → 2 separate domain patterns", () => {
    const reviews = [
      makeReview({ actionId: "aud-00000001", domain: "nutrition", outcomeClass: "met_expectations" }),
      makeReview({ actionId: "aud-00000002", domain: "training", outcomeClass: "met_expectations" }),
    ];
    const result = buildSuccessfulPromotionPatterns(reviews);
    expect(result.length).toBe(2);
    const domains = result.map((p) => p.domain);
    expect(domains).toContain("nutrition");
    expect(domains).toContain("training");
  });
});

/* =========================================================
   Scenario 24: buildRecurringTradeoffPatterns — mixed domain when partials span multiple domains
   ========================================================= */

describe("buildRecurringTradeoffPatterns — mixed domain for cross-domain tradeoff pattern", () => {
  it("exact-up+unresolved-up in nutrition and training → mixed domain", () => {
    const reviews = [
      makeReview({
        actionId: "aud-00000001",
        domain: "nutrition",
        outcomeClass: "partially_met",
        observed: {
          postActionRuns: 5,
          exactMatchDelta: 0.08,
          directionMatchDelta: 0.0,
          tooAggressiveDelta: null,
          tooWeakDelta: null,
          unresolvedDelta: 0.05,
          summaryLines: [],
        },
      }),
      makeReview({
        actionId: "aud-00000002",
        domain: "training",
        outcomeClass: "partially_met",
        observed: {
          postActionRuns: 5,
          exactMatchDelta: 0.06,
          directionMatchDelta: 0.0,
          tooAggressiveDelta: null,
          tooWeakDelta: null,
          unresolvedDelta: 0.04,
          summaryLines: [],
        },
      }),
    ];
    const result = buildRecurringTradeoffPatterns(reviews);
    const crossDomain = result.find((p) => p.label.includes("Unresolved-rate"));
    expect(crossDomain?.domain).toBe("mixed");
  });
});

/* =========================================================
   Scenario 25: buildRecurringRiskPatterns — insufficient_followup domain is mixed when spans domains
   ========================================================= */

describe("buildRecurringRiskPatterns — insufficient_followup domain is mixed when spans domains", () => {
  it("insufficient_followup in nutrition and training → mixed domain", () => {
    const reviews = [
      makeReview({ actionId: "aud-00000001", domain: "nutrition", outcomeClass: "insufficient_followup" }),
      makeReview({ actionId: "aud-00000002", domain: "training", outcomeClass: "insufficient_followup" }),
    ];
    const result = buildRecurringRiskPatterns(reviews);
    const shallow = result.find((p) => p.label.includes("Shallow-history"));
    expect(shallow?.domain).toBe("mixed");
  });
});

/* =========================================================
   Scenario 26: buildGovernanceLearningSummary — insufficient_followup reviews contribute to risk patterns
   ========================================================= */

describe("buildGovernanceLearningSummary — insufficient_followup reviews contribute to risk patterns", () => {
  it("recurringRiskPatterns is non-empty when insufficient_followup reviews exist", () => {
    const reviews = [makeReview({ outcomeClass: "insufficient_followup" })];
    const result = buildGovernanceLearningSummary(reviews);
    expect(result.recurringRiskPatterns.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 27: buildGovernanceLearningSummary — successful patterns non-empty for met_expectations data
   ========================================================= */

describe("buildGovernanceLearningSummary — successful patterns non-empty for met_expectations data", () => {
  it("successfulPromotionPatterns non-empty when met_expectations promote exists", () => {
    const reviews = [makeReview({ outcomeClass: "met_expectations", action: "promote" })];
    const result = buildGovernanceLearningSummary(reviews);
    expect(result.successfulPromotionPatterns.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 28: buildRecurringGovernanceMistakes — supportingActionCount is correct
   ========================================================= */

describe("buildRecurringGovernanceMistakes — supportingActionCount is correct", () => {
  it("2 did_not_meet → supportingActionCount 2", () => {
    const reviews = [
      makeReview({ actionId: "aud-00000001", outcomeClass: "did_not_meet" }),
      makeReview({ actionId: "aud-00000002", outcomeClass: "did_not_meet" }),
    ];
    const result = buildRecurringGovernanceMistakes(reviews);
    const mistake = result.find((p) => p.label.includes("Expected gains"));
    expect(mistake?.supportingActionCount).toBe(2);
  });
});

/* =========================================================
   Scenario 29: buildGovernanceLearningSummary — summaryLines say "no governance actions" for empty input
   ========================================================= */

describe("buildGovernanceLearningSummary — summaryLines say 'no governance actions' for empty input", () => {
  it("summaryLines[0] mentions no governance actions", () => {
    const result = buildGovernanceLearningSummary([]);
    expect(result.summaryLines[0]).toMatch(/no governance actions/i);
  });
});

/* =========================================================
   Scenario 30: buildGovernanceLearningSummary — reviewableActions is 0 when all insufficient_followup
   ========================================================= */

describe("buildGovernanceLearningSummary — reviewableActions is 0 when all insufficient_followup", () => {
  it("all insufficient_followup → reviewableActions 0", () => {
    const reviews = [
      makeReview({ actionId: "aud-00000001", outcomeClass: "insufficient_followup" }),
      makeReview({ actionId: "aud-00000002", outcomeClass: "insufficient_followup" }),
    ];
    expect(buildGovernanceLearningSummary(reviews).reviewableActions).toBe(0);
  });
});
