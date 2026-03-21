/**
 * playbook_to_decision_crosswalk_test.ts
 *
 * Regression tests for playbook_crosswalk_types.ts and
 * playbook_to_decision_crosswalk.ts.
 *
 * Scenarios:
 *   1.  buildPlaybookDecisionContext — returns correct domain
 *   2.  buildPlaybookDecisionContext — all fields preserved with defensive copies
 *   3.  evaluateHeuristicRelevance — not_relevant when heuristic domain doesn't match decision domain
 *   4.  evaluateHeuristicRelevance — not_relevant only for nutrition heuristic on training decision
 *   5.  evaluateHeuristicRelevance — domain-relevant (not not_relevant) for mixed heuristic on any domain
 *   6.  evaluateHeuristicRelevance — supports for prefer heuristic with gains and strong recommendation
 *   7.  evaluateHeuristicRelevance — neutral for prefer heuristic with no gains
 *   8.  evaluateHeuristicRelevance — neutral for prefer heuristic with weak recommendation
 *   9.  evaluateHeuristicRelevance — cautions for use-caution heuristic when risks present
 *  10.  evaluateHeuristicRelevance — cautions for use-caution heuristic when tradeoffs present
 *  11.  evaluateHeuristicRelevance — neutral for use-caution heuristic when no risks or tradeoffs
 *  12.  evaluateHeuristicRelevance — cautions for shallow-history heuristic when confidence is low
 *  13.  evaluateHeuristicRelevance — neutral for shallow-history heuristic when confidence is high
 *  14.  evaluateHeuristicRelevance — cautions for no-tradeoffs heuristic when expectedTradeoffs empty
 *  15.  evaluateHeuristicRelevance — neutral for no-tradeoffs heuristic when tradeoffs declared
 *  16.  evaluateHeuristicRelevance — cautions for no-bench-signal heuristic when weak recommendation
 *  17.  evaluateHeuristicRelevance — neutral for no-bench-signal heuristic when strong recommendation
 *  18.  evaluateHeuristicRelevance — cautions for elevated-unresolved heuristic when risks present
 *  19.  evaluateHeuristicRelevance — reasonLines non-empty for supports relevance
 *  20.  evaluateHeuristicRelevance — reasonLines non-empty for cautions relevance
 *  21.  evaluateHeuristicRelevance — reasonLines non-empty for neutral relevance
 *  22.  evaluateHeuristicRelevance — reasonLines non-empty for not_relevant relevance
 *  23.  buildPlaybookDecisionCrosswalk — supportingHeuristics contains supports entry
 *  24.  buildPlaybookDecisionCrosswalk — cautioningHeuristics contains cautions entry
 *  25.  buildPlaybookDecisionCrosswalk — neutralHeuristics contains neutral entry
 *  26.  buildPlaybookDecisionCrosswalk — not_relevant heuristics excluded from all three lists
 *  27.  buildPlaybookDecisionCrosswalk — summaryLines non-empty when heuristics present
 *  28.  buildPlaybookDecisionCrosswalk — empty playbook produces no crosswalk entries
 *  29.  buildPlaybookDecisionCrosswalk — does not mutate playbook or decisionContext
 *  30.  buildPlaybookDecisionCrosswalk — mixed-domain heuristic is classified (not excluded)
 */

import { describe, it, expect } from "vitest";
import {
  buildPlaybookDecisionContext,
  evaluateHeuristicRelevance,
  buildPlaybookDecisionCrosswalk,
} from "../audit/playbook_to_decision_crosswalk";
import type { GovernanceHeuristic, GovernancePlaybook } from "../audit/governance_playbook_types";
import type { PlaybookDecisionContext } from "../audit/playbook_crosswalk_types";

/* =========================================================
   Fixtures
   ========================================================= */

function makeHeuristic(overrides?: Partial<GovernanceHeuristic>): GovernanceHeuristic {
  return {
    id: "ph-00000001",
    domain: "nutrition",
    title: "Prefer promotion in nutrition when past changes succeeded",
    rule: "In nutrition, prefer policy promotion when past promotions in this domain have met expectations.",
    supportCount: 2,
    confidence: "moderate",
    sourcePatternLabels: ["Nutrition promotions that met expectations"],
    rationaleLines: ["2 promotions met expectations."],
    cautionLines:   ["Conditions may vary."],
    ...overrides,
  };
}

function makeContext(overrides?: Partial<PlaybookDecisionContext>): PlaybookDecisionContext {
  return {
    domain: "nutrition",
    currentPolicyVersionId: "pol-aaaaaaaa",
    recommendedPolicyVersionId: "pol-bbbbbbbb",
    expectedGains: ["Improve lawful-outcome rate."],
    expectedTradeoffs: [],
    expectedRisks: [],
    recommendationStrength: "strong",
    confidence: "high",
    ...overrides,
  };
}

function makePlaybook(
  heuristics: GovernanceHeuristic[] = []
): GovernancePlaybook {
  return {
    totalHeuristics: heuristics.length,
    heuristics,
    summaryLines: [],
  };
}

/* =========================================================
   Scenario 1: buildPlaybookDecisionContext — returns correct domain
   ========================================================= */

describe("buildPlaybookDecisionContext — returns correct domain", () => {
  it("domain matches the provided value", () => {
    const ctx = buildPlaybookDecisionContext(
      "training", null, null, [], [], [], "strong", "high"
    );
    expect(ctx.domain).toBe("training");
  });
});

/* =========================================================
   Scenario 2: buildPlaybookDecisionContext — all fields preserved with defensive copies
   ========================================================= */

describe("buildPlaybookDecisionContext — all fields preserved with defensive copies", () => {
  it("expectedGains matches input array", () => {
    const gains = ["Gain A"];
    const ctx = buildPlaybookDecisionContext(
      "nutrition", "pol-aaa", "pol-bbb", gains, [], [], "moderate", "moderate"
    );
    expect(ctx.expectedGains).toEqual(["Gain A"]);
    gains.push("Gain B");
    expect(ctx.expectedGains).toHaveLength(1); // defensive copy
  });
});

/* =========================================================
   Scenario 3: evaluateHeuristicRelevance — not_relevant when domain doesn't match
   ========================================================= */

describe("evaluateHeuristicRelevance — not_relevant when heuristic domain doesn't match decision domain", () => {
  it("schedule heuristic on nutrition decision → not_relevant", () => {
    const h = makeHeuristic({ domain: "schedule" });
    const ctx = makeContext({ domain: "nutrition" });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("not_relevant");
  });
});

/* =========================================================
   Scenario 4: evaluateHeuristicRelevance — not_relevant for nutrition heuristic on training decision
   ========================================================= */

describe("evaluateHeuristicRelevance — not_relevant only for nutrition heuristic on training decision", () => {
  it("nutrition heuristic on training decision → not_relevant", () => {
    const h = makeHeuristic({ domain: "nutrition" });
    const ctx = makeContext({ domain: "training" });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("not_relevant");
  });
});

/* =========================================================
   Scenario 5: evaluateHeuristicRelevance — mixed heuristic is domain-relevant for any domain
   ========================================================= */

describe("evaluateHeuristicRelevance — domain-relevant (not not_relevant) for mixed heuristic on any domain", () => {
  it("mixed heuristic on training decision is not not_relevant", () => {
    const h = makeHeuristic({ domain: "mixed" });
    const ctx = makeContext({ domain: "training" });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).not.toBe("not_relevant");
  });
});

/* =========================================================
   Scenario 6: evaluateHeuristicRelevance — supports for prefer heuristic with gains and strong recommendation
   ========================================================= */

describe("evaluateHeuristicRelevance — supports for prefer heuristic with gains and strong recommendation", () => {
  it("prefer rule + expectedGains + strong recommendation → supports", () => {
    const h = makeHeuristic({
      rule: "In nutrition, prefer policy promotion when past promotions have met expectations.",
    });
    const ctx = makeContext({
      expectedGains: ["Improve lawful rate"],
      recommendationStrength: "strong",
    });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("supports");
  });
});

/* =========================================================
   Scenario 7: evaluateHeuristicRelevance — neutral for prefer heuristic with no gains
   ========================================================= */

describe("evaluateHeuristicRelevance — neutral for prefer heuristic with no gains", () => {
  it("prefer rule + empty expectedGains → neutral", () => {
    const h = makeHeuristic({
      rule: "In nutrition, prefer policy promotion when past promotions have met expectations.",
    });
    const ctx = makeContext({ expectedGains: [], recommendationStrength: "strong" });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("neutral");
  });
});

/* =========================================================
   Scenario 8: evaluateHeuristicRelevance — neutral for prefer heuristic with weak recommendation
   ========================================================= */

describe("evaluateHeuristicRelevance — neutral for prefer heuristic with weak recommendation", () => {
  it("prefer rule + gains but weak recommendation → neutral", () => {
    const h = makeHeuristic({
      rule: "Prefer policy promotion in nutrition when past history is consistent.",
    });
    const ctx = makeContext({
      expectedGains: ["Improve lawful rate"],
      recommendationStrength: "weak",
    });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("neutral");
  });
});

/* =========================================================
   Scenario 9: evaluateHeuristicRelevance — cautions for use-caution heuristic when risks present
   ========================================================= */

describe("evaluateHeuristicRelevance — cautions for use-caution heuristic when risks present", () => {
  it("use caution rule + non-empty expectedRisks → cautions", () => {
    const h = makeHeuristic({
      rule: "Use caution when promoting a policy that improves exact-match but increases unresolved outcomes.",
    });
    const ctx = makeContext({ expectedRisks: ["May be too aggressive."] });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("cautions");
  });
});

/* =========================================================
   Scenario 10: evaluateHeuristicRelevance — cautions for use-caution heuristic when tradeoffs present
   ========================================================= */

describe("evaluateHeuristicRelevance — cautions for use-caution heuristic when tradeoffs present", () => {
  it("use caution rule + non-empty expectedTradeoffs → cautions", () => {
    const h = makeHeuristic({
      rule: "Use caution when promoting a policy that improves direction-match but increases unresolved outcomes.",
    });
    const ctx = makeContext({ expectedTradeoffs: ["Slight degraded increase."] });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("cautions");
  });
});

/* =========================================================
   Scenario 11: evaluateHeuristicRelevance — neutral for use-caution when no risks or tradeoffs
   ========================================================= */

describe("evaluateHeuristicRelevance — neutral for use-caution heuristic when no risks or tradeoffs", () => {
  it("use caution rule + empty risks and tradeoffs → neutral", () => {
    const h = makeHeuristic({
      rule: "Use caution when promoting a policy that improves exact-match but increases unresolved outcomes.",
    });
    const ctx = makeContext({ expectedRisks: [], expectedTradeoffs: [] });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("neutral");
  });
});

/* =========================================================
   Scenario 12: evaluateHeuristicRelevance — cautions for shallow-history heuristic when low confidence
   ========================================================= */

describe("evaluateHeuristicRelevance — cautions for shallow-history heuristic when confidence is low", () => {
  it("shallow-history rule + low confidence → cautions", () => {
    const h = makeHeuristic({
      rule: "Avoid strong promotion decisions when fewer than 3 follow-up evaluation runs are available.",
      domain: "mixed",
    });
    const ctx = makeContext({ confidence: "low" });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("cautions");
  });
});

/* =========================================================
   Scenario 13: evaluateHeuristicRelevance — neutral for shallow-history heuristic when high confidence
   ========================================================= */

describe("evaluateHeuristicRelevance — neutral for shallow-history heuristic when confidence is high", () => {
  it("shallow-history rule + high confidence → neutral", () => {
    const h = makeHeuristic({
      rule: "Avoid strong promotion decisions when fewer than 3 follow-up evaluation runs are available.",
      domain: "mixed",
    });
    const ctx = makeContext({ confidence: "high" });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("neutral");
  });
});

/* =========================================================
   Scenario 14: evaluateHeuristicRelevance — cautions for no-tradeoffs heuristic when expectedTradeoffs empty
   ========================================================= */

describe("evaluateHeuristicRelevance — cautions for no-tradeoffs heuristic when expectedTradeoffs empty", () => {
  it("documenting tradeoffs rule + empty expectedTradeoffs → cautions", () => {
    const h = makeHeuristic({
      rule: "Do not proceed with governance actions without documenting expected tradeoffs.",
      domain: "mixed",
    });
    const ctx = makeContext({ expectedTradeoffs: [] });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("cautions");
  });
});

/* =========================================================
   Scenario 15: evaluateHeuristicRelevance — neutral for no-tradeoffs heuristic when tradeoffs declared
   ========================================================= */

describe("evaluateHeuristicRelevance — neutral for no-tradeoffs heuristic when tradeoffs declared", () => {
  it("documenting tradeoffs rule + non-empty expectedTradeoffs → neutral", () => {
    const h = makeHeuristic({
      rule: "Do not proceed with governance actions without documenting expected tradeoffs.",
      domain: "mixed",
    });
    const ctx = makeContext({ expectedTradeoffs: ["Some tradeoff."] });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("neutral");
  });
});

/* =========================================================
   Scenario 16: evaluateHeuristicRelevance — cautions for no-bench-signal heuristic when weak
   ========================================================= */

describe("evaluateHeuristicRelevance — cautions for no-bench-signal heuristic when weak recommendation", () => {
  it("no-bench-signal rule + weak recommendation → cautions", () => {
    const h = makeHeuristic({
      rule: "Do not promote a policy unless bench evidence shows a reliable improvement signal.",
      domain: "mixed",
    });
    const ctx = makeContext({ recommendationStrength: "weak" });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("cautions");
  });
});

/* =========================================================
   Scenario 17: evaluateHeuristicRelevance — neutral for no-bench-signal heuristic when strong
   ========================================================= */

describe("evaluateHeuristicRelevance — neutral for no-bench-signal heuristic when strong recommendation", () => {
  it("no-bench-signal rule + strong recommendation → neutral", () => {
    const h = makeHeuristic({
      rule: "Do not promote a policy unless bench evidence shows a reliable improvement signal.",
      domain: "mixed",
    });
    const ctx = makeContext({ recommendationStrength: "strong" });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("neutral");
  });
});

/* =========================================================
   Scenario 18: evaluateHeuristicRelevance — cautions for elevated-unresolved when risks present
   ========================================================= */

describe("evaluateHeuristicRelevance — cautions for elevated-unresolved heuristic when risks present", () => {
  it("elevated unresolved-outcome rate rule + expectedRisks → cautions", () => {
    const h = makeHeuristic({
      rule: "Avoid governance actions that are followed by a material increase in the unresolved-outcome rate (>10% delta).",
      domain: "nutrition",
    });
    const ctx = makeContext({ expectedRisks: ["Possible aggressiveness increase."] });
    expect(evaluateHeuristicRelevance(h, ctx).relevance).toBe("cautions");
  });
});

/* =========================================================
   Scenario 19: evaluateHeuristicRelevance — reasonLines non-empty for supports
   ========================================================= */

describe("evaluateHeuristicRelevance — reasonLines non-empty for supports relevance", () => {
  it("supports entry has at least one reason line", () => {
    const h = makeHeuristic({
      rule: "In nutrition, prefer policy promotion when past promotions have met expectations.",
    });
    const ctx = makeContext({
      expectedGains: ["Improve lawful rate"],
      recommendationStrength: "strong",
    });
    const entry = evaluateHeuristicRelevance(h, ctx);
    expect(entry.reasonLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 20: evaluateHeuristicRelevance — reasonLines non-empty for cautions
   ========================================================= */

describe("evaluateHeuristicRelevance — reasonLines non-empty for cautions relevance", () => {
  it("cautions entry has at least one reason line", () => {
    const h = makeHeuristic({
      rule: "Do not proceed with governance actions without documenting expected tradeoffs.",
      domain: "mixed",
    });
    const ctx = makeContext({ expectedTradeoffs: [] });
    const entry = evaluateHeuristicRelevance(h, ctx);
    expect(entry.reasonLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 21: evaluateHeuristicRelevance — reasonLines non-empty for neutral
   ========================================================= */

describe("evaluateHeuristicRelevance — reasonLines non-empty for neutral relevance", () => {
  it("neutral entry has at least one reason line", () => {
    const h = makeHeuristic({
      rule: "In nutrition, prefer policy promotion when past promotions have met expectations.",
    });
    const ctx = makeContext({ expectedGains: [], recommendationStrength: "strong" });
    const entry = evaluateHeuristicRelevance(h, ctx);
    expect(entry.reasonLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 22: evaluateHeuristicRelevance — reasonLines non-empty for not_relevant
   ========================================================= */

describe("evaluateHeuristicRelevance — reasonLines non-empty for not_relevant relevance", () => {
  it("not_relevant entry has at least one reason line", () => {
    const h = makeHeuristic({ domain: "schedule" });
    const ctx = makeContext({ domain: "nutrition" });
    const entry = evaluateHeuristicRelevance(h, ctx);
    expect(entry.reasonLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 23: buildPlaybookDecisionCrosswalk — supportingHeuristics contains supports entry
   ========================================================= */

describe("buildPlaybookDecisionCrosswalk — supportingHeuristics contains supports entry", () => {
  it("prefer heuristic with gains and strong recommendation → in supportingHeuristics", () => {
    const h = makeHeuristic({
      rule: "In nutrition, prefer policy promotion when past promotions have met expectations.",
    });
    const ctx = makeContext({
      expectedGains: ["Improve lawful rate"],
      recommendationStrength: "strong",
    });
    const crosswalk = buildPlaybookDecisionCrosswalk(makePlaybook([h]), ctx);
    expect(crosswalk.supportingHeuristics).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 24: buildPlaybookDecisionCrosswalk — cautioningHeuristics contains cautions entry
   ========================================================= */

describe("buildPlaybookDecisionCrosswalk — cautioningHeuristics contains cautions entry", () => {
  it("shallow-history heuristic with low confidence → in cautioningHeuristics", () => {
    const h = makeHeuristic({
      rule: "Avoid strong promotion decisions when fewer than 3 follow-up evaluation runs are available.",
      domain: "nutrition",
    });
    const ctx = makeContext({ confidence: "low" });
    const crosswalk = buildPlaybookDecisionCrosswalk(makePlaybook([h]), ctx);
    expect(crosswalk.cautioningHeuristics).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 25: buildPlaybookDecisionCrosswalk — neutralHeuristics contains neutral entry
   ========================================================= */

describe("buildPlaybookDecisionCrosswalk — neutralHeuristics contains neutral entry", () => {
  it("prefer heuristic with no gains → in neutralHeuristics", () => {
    const h = makeHeuristic({
      rule: "In nutrition, prefer policy promotion when past promotions have met expectations.",
    });
    const ctx = makeContext({ expectedGains: [], recommendationStrength: "strong" });
    const crosswalk = buildPlaybookDecisionCrosswalk(makePlaybook([h]), ctx);
    expect(crosswalk.neutralHeuristics).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 26: buildPlaybookDecisionCrosswalk — not_relevant heuristics excluded from all lists
   ========================================================= */

describe("buildPlaybookDecisionCrosswalk — not_relevant heuristics excluded from all three lists", () => {
  it("schedule heuristic on nutrition decision excluded from all lists", () => {
    const h = makeHeuristic({ domain: "schedule" });
    const ctx = makeContext({ domain: "nutrition" });
    const crosswalk = buildPlaybookDecisionCrosswalk(makePlaybook([h]), ctx);
    expect(crosswalk.supportingHeuristics).toHaveLength(0);
    expect(crosswalk.cautioningHeuristics).toHaveLength(0);
    expect(crosswalk.neutralHeuristics).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 27: buildPlaybookDecisionCrosswalk — summaryLines non-empty when heuristics present
   ========================================================= */

describe("buildPlaybookDecisionCrosswalk — summaryLines non-empty when heuristics present", () => {
  it("at least one summary line when a relevant heuristic exists", () => {
    const h = makeHeuristic({
      rule: "In nutrition, prefer policy promotion when past promotions have met expectations.",
    });
    const ctx = makeContext({ expectedGains: [], recommendationStrength: "strong" });
    const crosswalk = buildPlaybookDecisionCrosswalk(makePlaybook([h]), ctx);
    expect(crosswalk.summaryLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 28: buildPlaybookDecisionCrosswalk — empty playbook produces no crosswalk entries
   ========================================================= */

describe("buildPlaybookDecisionCrosswalk — empty playbook produces no crosswalk entries", () => {
  it("all three lists empty for empty playbook", () => {
    const ctx = makeContext();
    const crosswalk = buildPlaybookDecisionCrosswalk(makePlaybook([]), ctx);
    expect(crosswalk.supportingHeuristics).toHaveLength(0);
    expect(crosswalk.cautioningHeuristics).toHaveLength(0);
    expect(crosswalk.neutralHeuristics).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 29: buildPlaybookDecisionCrosswalk — does not mutate playbook or decisionContext
   ========================================================= */

describe("buildPlaybookDecisionCrosswalk — does not mutate playbook or decisionContext", () => {
  it("playbook.heuristics length and context arrays unchanged after call", () => {
    const h = makeHeuristic();
    const playbook = makePlaybook([h]);
    const ctx = makeContext({ expectedGains: ["gain"] });
    buildPlaybookDecisionCrosswalk(playbook, ctx);
    expect(playbook.heuristics).toHaveLength(1);
    expect(ctx.expectedGains).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 30: buildPlaybookDecisionCrosswalk — mixed-domain heuristic is classified (not excluded)
   ========================================================= */

describe("buildPlaybookDecisionCrosswalk — mixed-domain heuristic is classified (not excluded)", () => {
  it("mixed heuristic appears in one of the three lists for any decision domain", () => {
    const h = makeHeuristic({
      domain: "mixed",
      rule: "Avoid strong promotion decisions when fewer than 3 follow-up evaluation runs are available.",
    });
    const ctx = makeContext({ domain: "training", confidence: "low" });
    const crosswalk = buildPlaybookDecisionCrosswalk(makePlaybook([h]), ctx);
    const total =
      crosswalk.supportingHeuristics.length +
      crosswalk.cautioningHeuristics.length +
      crosswalk.neutralHeuristics.length;
    expect(total).toBe(1);
  });
});
