/**
 * governance_playbook_extraction_test.ts
 *
 * Regression tests for governance_playbook_types.ts and
 * governance_playbook_extraction.ts.
 *
 * Scenarios:
 *   1.  extractGovernanceHeuristics — empty when no patterns in summary
 *   2.  extractGovernanceHeuristics — returns "prefer" heuristic from successful promotion pattern
 *   3.  extractGovernanceHeuristics — returns "use caution" heuristic from tradeoff pattern
 *   4.  extractGovernanceHeuristics — returns "avoid" heuristic from shallow-history risk pattern
 *   5.  extractGovernanceHeuristics — returns "avoid" heuristic from elevated-unresolved risk pattern
 *   6.  extractGovernanceHeuristics — returns "do not" heuristic from governance mistake pattern
 *   7.  extractGovernanceHeuristics — sourcePatternLabels contains original pattern label
 *   8.  extractGovernanceHeuristics — rationaleLines non-empty for each heuristic
 *   9.  extractGovernanceHeuristics — cautionLines non-empty for each heuristic
 *  10.  extractGovernanceHeuristics — heuristic id has prefix "ph-"
 *  11.  extractGovernanceHeuristics — heuristic id is 11 chars total ("ph-" + 8)
 *  12.  scoreHeuristicConfidence — low when support < 2
 *  13.  scoreHeuristicConfidence — low when contradictionCount > 0
 *  14.  scoreHeuristicConfidence — moderate when support >= 2 and contradiction = 0
 *  15.  scoreHeuristicConfidence — high when support >= 3 and contradiction = 0 and domainConsistency
 *  16.  scoreHeuristicConfidence — moderate (not high) when support >= 3 but not domainConsistency
 *  17.  scoreHeuristicConfidence — low when support = 1 regardless of other params
 *  18.  buildGovernancePlaybook — totalHeuristics matches heuristics.length
 *  19.  buildGovernancePlaybook — summaryLines non-empty when heuristics exist
 *  20.  buildGovernancePlaybook — summaryLines say "no governance heuristics" when empty
 *  21.  buildGovernancePlaybook — does not mutate input
 *  22.  extractGovernanceHeuristics — heuristic id is deterministic (same input → same id)
 *  23.  extractGovernanceHeuristics — different patterns produce different heuristic ids
 *  24.  extractGovernanceHeuristics — sorted high confidence first
 *  25.  extractGovernanceHeuristics — confident heuristic from high-support promotion pattern
 *  26.  extractGovernanceHeuristics — risk heuristic rule contains "avoid" or "do not"
 *  27.  extractGovernanceHeuristics — mistake heuristic rule starts with "do not"
 *  28.  buildGovernancePlaybook — heuristics array matches extractGovernanceHeuristics result
 *  29.  extractGovernanceHeuristics — does not mutate input summary
 *  30.  buildGovernancePlaybook — empty learning summary produces empty playbook
 */

import { describe, it, expect } from "vitest";
import {
  extractGovernanceHeuristics,
  scoreHeuristicConfidence,
  buildGovernancePlaybook,
} from "../audit/governance_playbook_extraction";
import type { GovernanceLearningSummary } from "../audit/governance_learning_types";

/* =========================================================
   Fixtures
   ========================================================= */

function makeEmptySummary(
  overrides?: Partial<GovernanceLearningSummary>
): GovernanceLearningSummary {
  return {
    totalGovernanceActions: 0,
    reviewableActions: 0,
    successfulPromotionPatterns: [],
    recurringTradeoffPatterns: [],
    recurringRiskPatterns: [],
    recurringGovernanceMistakes: [],
    summaryLines: [],
    ...overrides,
  };
}

/* =========================================================
   Scenario 1: extractGovernanceHeuristics — empty when no patterns
   ========================================================= */

describe("extractGovernanceHeuristics — empty when no patterns in summary", () => {
  it("returns empty array", () => {
    expect(extractGovernanceHeuristics(makeEmptySummary())).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 2: extractGovernanceHeuristics — "prefer" from successful promotion
   ========================================================= */

describe("extractGovernanceHeuristics — returns 'prefer' heuristic from successful promotion pattern", () => {
  it("rule starts with 'In' or 'Prefer' for successful promotion", () => {
    const summary = makeEmptySummary({
      successfulPromotionPatterns: [
        {
          label: "Nutrition promotions that met expectations",
          domain: "nutrition",
          supportingActionCount: 2,
          summary: "2 promotions met expectations.",
        },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    expect(result).toHaveLength(1);
    expect(
      result[0].rule.toLowerCase().startsWith("in") ||
        result[0].rule.toLowerCase().startsWith("prefer")
    ).toBe(true);
  });
});

/* =========================================================
   Scenario 3: extractGovernanceHeuristics — "use caution" from tradeoff pattern
   ========================================================= */

describe("extractGovernanceHeuristics — returns 'use caution' heuristic from tradeoff pattern", () => {
  it("rule starts with 'use caution'", () => {
    const summary = makeEmptySummary({
      recurringTradeoffPatterns: [
        {
          label: "Unresolved-rate increases underestimated after policy changes",
          domain: "nutrition",
          supportingActionCount: 2,
          summary: "2 cases.",
        },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    expect(result).toHaveLength(1);
    expect(result[0].rule.toLowerCase()).toMatch(/^use caution/);
  });
});

/* =========================================================
   Scenario 4: extractGovernanceHeuristics — "avoid" from shallow-history risk
   ========================================================= */

describe("extractGovernanceHeuristics — returns 'avoid' heuristic from shallow-history risk pattern", () => {
  it("rule starts with 'Avoid' for shallow-history pattern", () => {
    const summary = makeEmptySummary({
      recurringRiskPatterns: [
        {
          label: "Shallow-history promotions most often produced inconclusive outcomes",
          domain: "mixed",
          supportingActionCount: 3,
          summary: "3 cases.",
        },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    expect(result).toHaveLength(1);
    expect(result[0].rule.toLowerCase()).toMatch(/^avoid/);
  });
});

/* =========================================================
   Scenario 5: extractGovernanceHeuristics — "avoid" from elevated unresolved risk
   ========================================================= */

describe("extractGovernanceHeuristics — returns 'avoid' heuristic from elevated-unresolved risk pattern", () => {
  it("rule contains 'avoid' for elevated unresolved risk", () => {
    const summary = makeEmptySummary({
      recurringRiskPatterns: [
        {
          label: "Elevated unresolved-outcome rate after governance actions",
          domain: "nutrition",
          supportingActionCount: 2,
          summary: "2 cases.",
        },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    expect(result).toHaveLength(1);
    expect(result[0].rule.toLowerCase()).toMatch(/avoid/);
  });
});

/* =========================================================
   Scenario 6: extractGovernanceHeuristics — "do not" from governance mistake
   ========================================================= */

describe("extractGovernanceHeuristics — returns 'do not' heuristic from governance mistake pattern", () => {
  it("rule starts with 'Do not' for mistake pattern", () => {
    const summary = makeEmptySummary({
      recurringGovernanceMistakes: [
        {
          label: "Expected gains did not materialise",
          domain: "nutrition",
          supportingActionCount: 2,
          summary: "2 cases.",
        },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    expect(result).toHaveLength(1);
    expect(result[0].rule.toLowerCase()).toMatch(/^do not/);
  });
});

/* =========================================================
   Scenario 7: extractGovernanceHeuristics — sourcePatternLabels contains original label
   ========================================================= */

describe("extractGovernanceHeuristics — sourcePatternLabels contains original pattern label", () => {
  it("sourcePatternLabels[0] equals the pattern label", () => {
    const patternLabel = "Nutrition promotions that met expectations";
    const summary = makeEmptySummary({
      successfulPromotionPatterns: [
        { label: patternLabel, domain: "nutrition", supportingActionCount: 2, summary: "" },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    expect(result[0].sourcePatternLabels).toContain(patternLabel);
  });
});

/* =========================================================
   Scenario 8: extractGovernanceHeuristics — rationaleLines non-empty
   ========================================================= */

describe("extractGovernanceHeuristics — rationaleLines non-empty for each heuristic", () => {
  it("all heuristics have at least one rationale line", () => {
    const summary = makeEmptySummary({
      successfulPromotionPatterns: [
        { label: "label", domain: "nutrition", supportingActionCount: 1, summary: "" },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    expect(result[0].rationaleLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 9: extractGovernanceHeuristics — cautionLines non-empty
   ========================================================= */

describe("extractGovernanceHeuristics — cautionLines non-empty for each heuristic", () => {
  it("all heuristics have at least one caution line", () => {
    const summary = makeEmptySummary({
      recurringGovernanceMistakes: [
        { label: "Expected gains did not materialise", domain: "mixed", supportingActionCount: 1, summary: "" },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    expect(result[0].cautionLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 10: extractGovernanceHeuristics — id has prefix "ph-"
   ========================================================= */

describe("extractGovernanceHeuristics — heuristic id has prefix 'ph-'", () => {
  it("id starts with 'ph-'", () => {
    const summary = makeEmptySummary({
      successfulPromotionPatterns: [
        { label: "label", domain: "nutrition", supportingActionCount: 1, summary: "" },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    expect(result[0].id.startsWith("ph-")).toBe(true);
  });
});

/* =========================================================
   Scenario 11: extractGovernanceHeuristics — id is 11 chars total
   ========================================================= */

describe("extractGovernanceHeuristics — heuristic id is 11 chars total ('ph-' + 8 hex)", () => {
  it("id length is 11", () => {
    const summary = makeEmptySummary({
      successfulPromotionPatterns: [
        { label: "label", domain: "nutrition", supportingActionCount: 1, summary: "" },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    expect(result[0].id.length).toBe(11);
  });
});

/* =========================================================
   Scenario 12: scoreHeuristicConfidence — low when support < 2
   ========================================================= */

describe("scoreHeuristicConfidence — low when support < 2", () => {
  it("support 1 → low", () => {
    expect(scoreHeuristicConfidence(1, true, 0)).toBe("low");
  });
});

/* =========================================================
   Scenario 13: scoreHeuristicConfidence — low when contradictionCount > 0
   ========================================================= */

describe("scoreHeuristicConfidence — low when contradictionCount > 0", () => {
  it("support 5, contradiction 1 → low", () => {
    expect(scoreHeuristicConfidence(5, true, 1)).toBe("low");
  });
});

/* =========================================================
   Scenario 14: scoreHeuristicConfidence — moderate when support >= 2 and contradiction = 0
   ========================================================= */

describe("scoreHeuristicConfidence — moderate when support >= 2 and contradiction = 0", () => {
  it("support 2, contradiction 0, domainConsistency true → moderate (not yet high)", () => {
    expect(scoreHeuristicConfidence(2, true, 0)).toBe("moderate");
  });
});

/* =========================================================
   Scenario 15: scoreHeuristicConfidence — high when support >= 3 and contradiction = 0 and domainConsistency
   ========================================================= */

describe("scoreHeuristicConfidence — high when support >= 3, contradiction = 0, and domainConsistency", () => {
  it("support 3, contradiction 0, domainConsistency true → high", () => {
    expect(scoreHeuristicConfidence(3, true, 0)).toBe("high");
  });
});

/* =========================================================
   Scenario 16: scoreHeuristicConfidence — moderate (not high) when not domainConsistency
   ========================================================= */

describe("scoreHeuristicConfidence — moderate (not high) when support >= 3 but domainConsistency false", () => {
  it("support 3, contradiction 0, domainConsistency false → moderate", () => {
    expect(scoreHeuristicConfidence(3, false, 0)).toBe("moderate");
  });
});

/* =========================================================
   Scenario 17: scoreHeuristicConfidence — low when support = 1
   ========================================================= */

describe("scoreHeuristicConfidence — low when support = 1 regardless of other params", () => {
  it("support 1, contradiction 0, domainConsistency true → low", () => {
    expect(scoreHeuristicConfidence(1, true, 0)).toBe("low");
  });
});

/* =========================================================
   Scenario 18: buildGovernancePlaybook — totalHeuristics matches heuristics.length
   ========================================================= */

describe("buildGovernancePlaybook — totalHeuristics matches heuristics.length", () => {
  it("totalHeuristics equals heuristics.length", () => {
    const summary = makeEmptySummary({
      successfulPromotionPatterns: [
        { label: "label", domain: "nutrition", supportingActionCount: 2, summary: "" },
      ],
    });
    const result = buildGovernancePlaybook(summary);
    expect(result.totalHeuristics).toBe(result.heuristics.length);
  });
});

/* =========================================================
   Scenario 19: buildGovernancePlaybook — summaryLines non-empty when heuristics exist
   ========================================================= */

describe("buildGovernancePlaybook — summaryLines non-empty when heuristics exist", () => {
  it("at least one summary line produced", () => {
    const summary = makeEmptySummary({
      totalGovernanceActions: 2,
      reviewableActions: 2,
      successfulPromotionPatterns: [
        { label: "label", domain: "nutrition", supportingActionCount: 2, summary: "" },
      ],
    });
    const result = buildGovernancePlaybook(summary);
    expect(result.summaryLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 20: buildGovernancePlaybook — summaryLines mention "no governance heuristics" for empty
   ========================================================= */

describe("buildGovernancePlaybook — summaryLines say 'no governance heuristics' when empty", () => {
  it("first summaryLine contains 'no governance heuristics'", () => {
    const result = buildGovernancePlaybook(makeEmptySummary());
    expect(result.summaryLines[0]).toMatch(/no governance heuristics/i);
  });
});

/* =========================================================
   Scenario 21: buildGovernancePlaybook — does not mutate input
   ========================================================= */

describe("buildGovernancePlaybook — does not mutate input", () => {
  it("input heuristics array length unchanged after call", () => {
    const summary = makeEmptySummary({
      successfulPromotionPatterns: [
        { label: "label", domain: "nutrition", supportingActionCount: 1, summary: "" },
      ],
    });
    const origLength = summary.successfulPromotionPatterns.length;
    buildGovernancePlaybook(summary);
    expect(summary.successfulPromotionPatterns).toHaveLength(origLength);
  });
});

/* =========================================================
   Scenario 22: extractGovernanceHeuristics — id is deterministic
   ========================================================= */

describe("extractGovernanceHeuristics — heuristic id is deterministic (same input → same id)", () => {
  it("two calls with identical input produce identical id", () => {
    const summary = makeEmptySummary({
      successfulPromotionPatterns: [
        { label: "Nutrition promotions that met expectations", domain: "nutrition", supportingActionCount: 2, summary: "" },
      ],
    });
    const r1 = extractGovernanceHeuristics(summary);
    const r2 = extractGovernanceHeuristics(summary);
    expect(r1[0].id).toBe(r2[0].id);
  });
});

/* =========================================================
   Scenario 23: extractGovernanceHeuristics — different patterns produce different ids
   ========================================================= */

describe("extractGovernanceHeuristics — different patterns produce different heuristic ids", () => {
  it("nutrition and training patterns have different ids", () => {
    const summary = makeEmptySummary({
      successfulPromotionPatterns: [
        { label: "Nutrition promotions that met expectations", domain: "nutrition", supportingActionCount: 2, summary: "" },
        { label: "Training promotions that met expectations", domain: "training", supportingActionCount: 2, summary: "" },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    expect(result[0].id).not.toBe(result[1].id);
  });
});

/* =========================================================
   Scenario 24: extractGovernanceHeuristics — sorted high confidence first
   ========================================================= */

describe("extractGovernanceHeuristics — sorted high confidence first", () => {
  it("high-confidence heuristic appears before low-confidence heuristic", () => {
    const summary = makeEmptySummary({
      successfulPromotionPatterns: [
        { label: "Nutrition promotions", domain: "nutrition", supportingActionCount: 3, summary: "" },
      ],
      recurringGovernanceMistakes: [
        { label: "Expected gains did not materialise", domain: "mixed", supportingActionCount: 1, summary: "" },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    const highIdx = result.findIndex((h) => h.confidence === "high");
    const lowIdx  = result.findIndex((h) => h.confidence === "low");
    if (highIdx !== -1 && lowIdx !== -1) {
      expect(highIdx).toBeLessThan(lowIdx);
    }
  });
});

/* =========================================================
   Scenario 25: extractGovernanceHeuristics — high confidence from high-support promotion
   ========================================================= */

describe("extractGovernanceHeuristics — confident heuristic from high-support promotion pattern", () => {
  it("support 3, same domain, no contradictions → high confidence", () => {
    const summary = makeEmptySummary({
      successfulPromotionPatterns: [
        { label: "Nutrition promotions that met expectations", domain: "nutrition", supportingActionCount: 3, summary: "" },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    expect(result[0].confidence).toBe("high");
  });
});

/* =========================================================
   Scenario 26: extractGovernanceHeuristics — risk heuristic rule contains "avoid" or "do not"
   ========================================================= */

describe("extractGovernanceHeuristics — risk heuristic rule contains 'avoid' or 'do not'", () => {
  it("elevated unresolved risk rule contains 'avoid'", () => {
    const summary = makeEmptySummary({
      recurringRiskPatterns: [
        {
          label: "Elevated unresolved-outcome rate after governance actions",
          domain: "nutrition",
          supportingActionCount: 2,
          summary: "",
        },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    expect(result[0].rule.toLowerCase()).toMatch(/avoid|do not/);
  });
});

/* =========================================================
   Scenario 27: extractGovernanceHeuristics — mistake heuristic rule starts with "do not"
   ========================================================= */

describe("extractGovernanceHeuristics — mistake heuristic rule starts with 'do not'", () => {
  it("undeclared-tradeoff mistake rule starts with 'Do not'", () => {
    const summary = makeEmptySummary({
      recurringGovernanceMistakes: [
        {
          label: "Tradeoffs repeatedly underestimated at decision time",
          domain: "mixed",
          supportingActionCount: 2,
          summary: "",
        },
      ],
    });
    const result = extractGovernanceHeuristics(summary);
    expect(result[0].rule.toLowerCase()).toMatch(/^do not/);
  });
});

/* =========================================================
   Scenario 28: buildGovernancePlaybook — heuristics match extractGovernanceHeuristics
   ========================================================= */

describe("buildGovernancePlaybook — heuristics array matches extractGovernanceHeuristics result", () => {
  it("heuristics[0].id matches extractGovernanceHeuristics(summary)[0].id", () => {
    const summary = makeEmptySummary({
      successfulPromotionPatterns: [
        { label: "label", domain: "nutrition", supportingActionCount: 2, summary: "" },
      ],
    });
    const extracted = extractGovernanceHeuristics(summary);
    const playbook  = buildGovernancePlaybook(summary);
    expect(playbook.heuristics[0].id).toBe(extracted[0].id);
  });
});

/* =========================================================
   Scenario 29: extractGovernanceHeuristics — does not mutate input summary
   ========================================================= */

describe("extractGovernanceHeuristics — does not mutate input summary", () => {
  it("successfulPromotionPatterns length unchanged after call", () => {
    const summary = makeEmptySummary({
      successfulPromotionPatterns: [
        { label: "label", domain: "nutrition", supportingActionCount: 1, summary: "" },
      ],
    });
    const origLen = summary.successfulPromotionPatterns.length;
    extractGovernanceHeuristics(summary);
    expect(summary.successfulPromotionPatterns).toHaveLength(origLen);
  });
});

/* =========================================================
   Scenario 30: buildGovernancePlaybook — empty learning summary produces empty playbook
   ========================================================= */

describe("buildGovernancePlaybook — empty learning summary produces empty playbook", () => {
  it("totalHeuristics is 0 and heuristics is empty for empty summary", () => {
    const result = buildGovernancePlaybook(makeEmptySummary());
    expect(result.totalHeuristics).toBe(0);
    expect(result.heuristics).toHaveLength(0);
  });
});
