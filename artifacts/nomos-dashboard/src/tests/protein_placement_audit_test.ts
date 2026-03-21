/**
 * protein_placement_audit_test.ts
 *
 * Regression tests for the protein placement structural audit system.
 *
 * Audit scenario:
 *   - Phase: BASE (4-meal plan, whey in M1 and M3, egg in M3+M4, yogurt in M4)
 *   - Candidate A: gram adjustment to carb foods only — no protein movement
 *   - Candidate B: explicit move of whey from meal 3 to meal 4
 *   - Candidate C: carb loading in meal 2 — no protein movement
 *
 * Expected structural results:
 *   - A: proteinPlacementMatchesBaseline = true
 *   - B: proteinPlacementMatchesBaseline = false, movedProteinFoods includes whey 3→4
 *   - C: proteinPlacementMatchesBaseline = true
 *
 * Key invariants exercised:
 *   - PI1: engine must not flag "protein placement violation" for A or C
 *   - PI2: engine must not include protein-placement adjustments for A or C
 *   - Candidate-local isolation: B's violation does not leak to A or C
 *   - Engine evaluations are independent per candidate
 *
 * Debug output (always emitted):
 *   BASELINE_PROTEIN_PLACEMENT_MAP
 *   CANDIDATE_A_PROTEIN_PLACEMENT_MAP
 *   CANDIDATE_B_PROTEIN_PLACEMENT_MAP
 *   CANDIDATE_C_PROTEIN_PLACEMENT_MAP
 *   PROTEIN_PLACEMENT_DIFFS
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  buildProteinPlacementAuditReport,
  buildCandidateAuditResult,
  diffProteinPlacements,
  extractBaselineProteinPlacement,
  extractCandidateProteinPlacement,
  assertProteinPlacementInvariants,
  printProteinPlacementAuditDebug,
  PROTEIN_BEARING_FOOD_IDS,
  PROTEIN_BEARING_THRESHOLD_G,
} from "../evaluation/protein_placement_audit";
import type { AuditPhasePlan } from "../evaluation/protein_placement_audit";
import type { CandidateEvaluationReport } from "../evaluation/evaluation_report_types";

/* =========================================================
   Local registry fixtures
   These mirror the nomos-core data exactly.
   The dashboard does not import nomos-core directly, so these
   values are maintained locally and checked against the source
   of truth (packages/constitutional-kernel/src/nutrition/).
   ========================================================= */

/**
 * Per-serving protein grams for each food in the registry.
 * Source: nomos-core food_registry.ts + food_primitive.ts macrosPerRef.protein
 */
const FOOD_PROTEIN_PER_SERVING: Record<string, number> = {
  whey:    28,    // label — 28g protein per 37g serving
  yogurt:  20,    // label — 20g protein per 1 unit serving
  egg:      6,    // estimated — 6g protein per 1 unit serving
  oats:     4,    // label — 4g protein per 32g serving
  flax:     4,    // label — 4g protein per 14g serving
  banana:   1.3,  // estimated — 1.3g protein per 1 unit serving
  dextrin:  0,    // label — 0g protein per 30g serving
};

/**
 * BASE phase plan — mirrors PHASE_REGISTRY["BASE"] from nomos-core.
 * Source: packages/constitutional-kernel/src/nutrition/phase_registry.ts
 *
 * Protein anchor summary:
 *   Meal 1 (Breakfast):   oats, whey, flax     → protein foods: [whey]
 *   Meal 2 (Pre-Lift):    banana, dextrin       → protein foods: []
 *   Meal 3 (Post-Lift):   whey, oats, egg       → protein foods: [egg, whey]
 *   Meal 4 (Evening):     yogurt, egg           → protein foods: [egg, yogurt]
 */
const BASE_PHASE: AuditPhasePlan = {
  meals: [
    {
      mealNumber: 1,
      foods: [
        { foodId: "oats" },
        { foodId: "whey" },
        { foodId: "flax" },
      ],
    },
    {
      mealNumber: 2,
      foods: [
        { foodId: "banana" },
        { foodId: "dextrin" },
      ],
    },
    {
      mealNumber: 3,
      foods: [
        { foodId: "whey" },
        { foodId: "oats" },
        { foodId: "egg" },
      ],
    },
    {
      mealNumber: 4,
      foods: [
        { foodId: "yogurt" },
        { foodId: "egg" },
      ],
    },
  ],
};

/* =========================================================
   Constants and fixtures
   ========================================================= */

const PHASE = BASE_PHASE;

/** BASE phase protein bearing foods and their declared meal locations. */
const EXPECTED_BASELINE = {
  "1": ["whey"],
  "2": [] as string[],
  "3": ["egg", "whey"],
  "4": ["egg", "yogurt"],
};

/**
 * Candidate descriptions chosen to produce unambiguous structural audit results.
 * These are CANDIDATE DESCRIPTIONS (proposed changes), not evaluation reasons.
 */
const CANDIDATE_A_DESCRIPTION =
  "Reduce oats in meal 1 from 96g to 64g. Increase dextrin in meal 2 from 45g to 60g. " +
  "No other changes.";

const CANDIDATE_B_DESCRIPTION =
  "Move whey from meal 3 to meal 4 for evening recovery, concentrating post-workout " +
  "protein into the final meal.";

const CANDIDATE_C_DESCRIPTION =
  "Add banana to meal 2 to bring carb total to 2 units for glycogen loading. " +
  "Reduce dextrin in meal 2 by 15g.";

const CANDIDATE_DESCRIPTIONS = [
  { id: "A", description: CANDIDATE_A_DESCRIPTION },
  { id: "B", description: CANDIDATE_B_DESCRIPTION },
  { id: "C", description: CANDIDATE_C_DESCRIPTION },
];

/**
 * Mock engine reports reflecting correct verdicts for A and C (no violation)
 * and a correct verdict for B (protein placement violation).
 */
function makeMockEngineReports(
  opts: {
    overrideA?: Partial<CandidateEvaluationReport>;
    overrideB?: Partial<CandidateEvaluationReport>;
    overrideC?: Partial<CandidateEvaluationReport>;
  } = {}
): CandidateEvaluationReport[] {
  const base = (id: string): CandidateEvaluationReport => ({
    candidateId: id,
    candidateLabel: `Candidate ${id}`,
    verdict: "lawful",
    decisiveVariable: "protein placement",
    margin: 0.9,
    constraintsTotal: 6,
    constraintsDeterministicallyClassified: 6,
    constraintsInterpretationRequired: 0,
    constraintsSatisfied: 6,
    constraintsViolated: 0,
    constraintsNotEvaluated: 0,
    constraintEvaluations: [],
    summaryReason: "All constraints satisfied.",
    adjustments: [],
  });

  const reportA: CandidateEvaluationReport = { ...base("A"), ...opts.overrideA };

  const reportB: CandidateEvaluationReport = {
    ...base("B"),
    verdict: "invalid",
    decisiveVariable: "protein placement violation",
    constraintsViolated: 1,
    constraintsSatisfied: 5,
    summaryReason: "Protein placement moved between meals. Structural lock violated.",
    adjustments: ["Preserve existing protein placement across all meals."],
    ...opts.overrideB,
  };

  const reportC: CandidateEvaluationReport = { ...base("C"), ...opts.overrideC };

  return [reportA, reportB, reportC];
}

/* =========================================================
   Setup — emit debug output once
   ========================================================= */

beforeAll(() => {
  // Always emit the debug maps for the audit scenario
  const baseline = extractBaselineProteinPlacement(PHASE);
  const report = buildProteinPlacementAuditReport(
    "BASE",
    PHASE,
    CANDIDATE_DESCRIPTIONS,
    makeMockEngineReports()
  );
  printProteinPlacementAuditDebug(report);
});

/* =========================================================
   1. Food registry — protein-bearing classification
   ========================================================= */

describe("food registry — protein-bearing classification", () => {
  it("PROTEIN_BEARING_THRESHOLD_G is 5g", () => {
    expect(PROTEIN_BEARING_THRESHOLD_G).toBe(5);
  });

  it("whey is protein-bearing (28g protein per serving)", () => {
    expect(FOOD_PROTEIN_PER_SERVING["whey"]).toBeGreaterThanOrEqual(PROTEIN_BEARING_THRESHOLD_G);
    expect(PROTEIN_BEARING_FOOD_IDS).toContain("whey");
  });

  it("yogurt is protein-bearing (20g protein per serving)", () => {
    expect(FOOD_PROTEIN_PER_SERVING["yogurt"]).toBeGreaterThanOrEqual(PROTEIN_BEARING_THRESHOLD_G);
    expect(PROTEIN_BEARING_FOOD_IDS).toContain("yogurt");
  });

  it("egg is protein-bearing (6g protein per serving)", () => {
    expect(FOOD_PROTEIN_PER_SERVING["egg"]).toBeGreaterThanOrEqual(PROTEIN_BEARING_THRESHOLD_G);
    expect(PROTEIN_BEARING_FOOD_IDS).toContain("egg");
  });

  it("oats are NOT protein-bearing (4g per 32g serving)", () => {
    expect(FOOD_PROTEIN_PER_SERVING["oats"]).toBeLessThan(PROTEIN_BEARING_THRESHOLD_G);
    expect(PROTEIN_BEARING_FOOD_IDS).not.toContain("oats");
  });

  it("dextrin is NOT protein-bearing (0g protein)", () => {
    expect(PROTEIN_BEARING_FOOD_IDS).not.toContain("dextrin");
  });

  it("banana is NOT protein-bearing (1.3g protein per unit)", () => {
    expect(PROTEIN_BEARING_FOOD_IDS).not.toContain("banana");
  });
});

/* =========================================================
   2. Baseline extraction
   ========================================================= */

describe("extractBaselineProteinPlacement — BASE phase", () => {
  const baseline = extractBaselineProteinPlacement(PHASE);

  it("meal 1 contains only whey", () => {
    expect(baseline["1"]).toEqual(EXPECTED_BASELINE["1"]);
  });

  it("meal 2 has no protein-bearing foods", () => {
    expect(baseline["2"]).toEqual(EXPECTED_BASELINE["2"]);
  });

  it("meal 3 contains egg and whey (sorted)", () => {
    expect(baseline["3"]).toEqual(EXPECTED_BASELINE["3"]);
  });

  it("meal 4 contains egg and yogurt (sorted)", () => {
    expect(baseline["4"]).toEqual(EXPECTED_BASELINE["4"]);
  });

  it("baseline has exactly 4 meals", () => {
    expect(Object.keys(baseline)).toHaveLength(4);
  });

  it("baseline does not include oats, flax, banana, or dextrin", () => {
    const allFoods = Object.values(baseline).flat();
    expect(allFoods).not.toContain("oats");
    expect(allFoods).not.toContain("flax");
    expect(allFoods).not.toContain("banana");
    expect(allFoods).not.toContain("dextrin");
  });
});

/* =========================================================
   3. Candidate A — carb adjustment only, no protein movement
   ========================================================= */

describe("candidate A — carb foods adjusted, protein placement unchanged", () => {
  const baseline = extractBaselineProteinPlacement(PHASE);
  const audit = buildCandidateAuditResult("A", CANDIDATE_A_DESCRIPTION, baseline);

  it("proteinPlacementMatchesBaseline is true", () => {
    expect(audit.proteinPlacementMatchesBaseline).toBe(true);
  });

  it("diff has no movement", () => {
    expect(audit.diff.hasMovement).toBe(false);
  });

  it("diff has no missing protein foods", () => {
    expect(Object.keys(audit.diff.missingProteinFoodsByMeal)).toHaveLength(0);
  });

  it("diff has no added protein foods", () => {
    expect(Object.keys(audit.diff.addedProteinFoodsByMeal)).toHaveLength(0);
  });

  it("candidateMap equals baselineMap", () => {
    for (const meal of Object.keys(baseline)) {
      expect([...audit.candidateMap[meal]!].sort()).toEqual([...baseline[meal]!].sort());
    }
  });

  it("violationExplanation is null", () => {
    expect(audit.violationExplanation).toBeNull();
  });

  it("detectedSignals is empty (no protein movement keywords)", () => {
    expect(audit.detectedSignals).toHaveLength(0);
  });
});

/* =========================================================
   4. Candidate B — whey explicitly moved from meal 3 to meal 4
   ========================================================= */

describe("candidate B — whey moved from meal 3 to meal 4", () => {
  const baseline = extractBaselineProteinPlacement(PHASE);
  const audit = buildCandidateAuditResult("B", CANDIDATE_B_DESCRIPTION, baseline);

  it("proteinPlacementMatchesBaseline is false", () => {
    expect(audit.proteinPlacementMatchesBaseline).toBe(false);
  });

  it("diff has movement", () => {
    expect(audit.diff.hasMovement).toBe(true);
  });

  it("whey is missing from meal 3 in candidate map", () => {
    const missing = audit.diff.missingProteinFoodsByMeal["3"] ?? [];
    expect(missing).toContain("whey");
  });

  it("whey is added to meal 4 in candidate map", () => {
    const added = audit.diff.addedProteinFoodsByMeal["4"] ?? [];
    expect(added).toContain("whey");
  });

  it("movedProteinFoods contains whey from meal 3 to meal 4", () => {
    const move = audit.diff.movedProteinFoods.find(
      (m) => m.food === "whey" && m.fromMeal === "3" && m.toMeal === "4"
    );
    expect(move).toBeDefined();
  });

  it("candidateMap meal 3 no longer contains whey", () => {
    expect(audit.candidateMap["3"]).not.toContain("whey");
  });

  it("candidateMap meal 4 now contains whey in addition to egg and yogurt", () => {
    expect(audit.candidateMap["4"]).toContain("whey");
    expect(audit.candidateMap["4"]).toContain("egg");
    expect(audit.candidateMap["4"]).toContain("yogurt");
  });

  it("violationExplanation is non-null and mentions whey", () => {
    expect(audit.violationExplanation).not.toBeNull();
    expect(audit.violationExplanation!.toLowerCase()).toContain("whey");
  });

  it("violationExplanation mentions the source meal (3) and destination meal (4)", () => {
    expect(audit.violationExplanation!).toContain("3");
    expect(audit.violationExplanation!).toContain("4");
  });

  it("detectedSignals is non-empty (protein movement keyword found)", () => {
    expect(audit.detectedSignals.length).toBeGreaterThan(0);
  });

  it("inferenceConfidence is 'high' (explicit move pattern matched)", () => {
    expect(audit.inferenceConfidence).toBe("high");
  });
});

/* =========================================================
   5. Candidate C — carb loading in meal 2, no protein movement
   ========================================================= */

describe("candidate C — carb loading only, protein placement unchanged", () => {
  const baseline = extractBaselineProteinPlacement(PHASE);
  const audit = buildCandidateAuditResult("C", CANDIDATE_C_DESCRIPTION, baseline);

  it("proteinPlacementMatchesBaseline is true", () => {
    expect(audit.proteinPlacementMatchesBaseline).toBe(true);
  });

  it("diff has no movement", () => {
    expect(audit.diff.hasMovement).toBe(false);
  });

  it("candidateMap equals baselineMap", () => {
    for (const meal of Object.keys(baseline)) {
      expect([...audit.candidateMap[meal]!].sort()).toEqual([...baseline[meal]!].sort());
    }
  });

  it("violationExplanation is null", () => {
    expect(audit.violationExplanation).toBeNull();
  });
});

/* =========================================================
   6. Candidate-local isolation — B's violation does not affect A or C
   ========================================================= */

describe("candidate-local isolation — violations are candidate-specific", () => {
  const baseline = extractBaselineProteinPlacement(PHASE);

  it("each candidate produces an independent audit result", () => {
    const auditA = buildCandidateAuditResult("A", CANDIDATE_A_DESCRIPTION, baseline);
    const auditB = buildCandidateAuditResult("B", CANDIDATE_B_DESCRIPTION, baseline);
    const auditC = buildCandidateAuditResult("C", CANDIDATE_C_DESCRIPTION, baseline);

    expect(auditA.proteinPlacementMatchesBaseline).toBe(true);
    expect(auditB.proteinPlacementMatchesBaseline).toBe(false);
    expect(auditC.proteinPlacementMatchesBaseline).toBe(true);
  });

  it("building audit B first does not change what audit A produces", () => {
    // Build B first to ensure no shared mutable state
    buildCandidateAuditResult("B", CANDIDATE_B_DESCRIPTION, baseline);
    const auditA = buildCandidateAuditResult("A", CANDIDATE_A_DESCRIPTION, baseline);

    expect(auditA.proteinPlacementMatchesBaseline).toBe(true);
    expect(auditA.diff.hasMovement).toBe(false);
  });

  it("building audit A first does not change what audit B produces", () => {
    buildCandidateAuditResult("A", CANDIDATE_A_DESCRIPTION, baseline);
    const auditB = buildCandidateAuditResult("B", CANDIDATE_B_DESCRIPTION, baseline);

    expect(auditB.proteinPlacementMatchesBaseline).toBe(false);
    expect(auditB.diff.movedProteinFoods.length).toBeGreaterThan(0);
  });

  it("baseline map is immutable — candidate audit cannot modify it", () => {
    const auditB = buildCandidateAuditResult("B", CANDIDATE_B_DESCRIPTION, baseline);
    // The baseline in auditA should be unchanged after B's whey movement
    const auditA = buildCandidateAuditResult("A", CANDIDATE_A_DESCRIPTION, baseline);

    expect(auditA.baselineMap["3"]).toContain("whey");
    expect(auditA.baselineMap["1"]).toContain("whey");
  });

  it("A's violation status is independent of B's (no state sharing)", () => {
    const results = CANDIDATE_DESCRIPTIONS.map((c) =>
      buildCandidateAuditResult(c.id, c.description, baseline)
    );
    const byId = Object.fromEntries(results.map((r) => [r.candidateId, r]));

    // Verify each candidate produces its own result independently
    expect(byId["A"]!.proteinPlacementMatchesBaseline).toBe(true);
    expect(byId["B"]!.proteinPlacementMatchesBaseline).toBe(false);
    expect(byId["C"]!.proteinPlacementMatchesBaseline).toBe(true);

    // Verify B's violation is specific to B
    expect(byId["A"]!.diff.hasMovement).toBe(false);
    expect(byId["C"]!.diff.hasMovement).toBe(false);
  });
});

/* =========================================================
   7. Invariants — PI1 and PI2
   ========================================================= */

describe("assertProteinPlacementInvariants — correct engine reports pass", () => {
  const baseline = extractBaselineProteinPlacement(PHASE);
  const auditResults = CANDIDATE_DESCRIPTIONS.map((c) =>
    buildCandidateAuditResult(c.id, c.description, baseline)
  );

  it("returns no violations when engine verdicts are consistent with structural audit", () => {
    const engineReports = makeMockEngineReports();
    const violations = assertProteinPlacementInvariants(auditResults, engineReports);
    expect(violations).toHaveLength(0);
  });
});

describe("assertProteinPlacementInvariants — PI1 fires when engine flags A incorrectly", () => {
  const baseline = extractBaselineProteinPlacement(PHASE);
  const auditResults = CANDIDATE_DESCRIPTIONS.map((c) =>
    buildCandidateAuditResult(c.id, c.description, baseline)
  );

  it("PI1 fires when engine says 'protein placement violation' for candidate A (no structural violation)", () => {
    const engineReports = makeMockEngineReports({
      overrideA: {
        decisiveVariable: "protein placement violation",
        constraintsViolated: 1,
        verdict: "invalid",
      },
    });

    const violations = assertProteinPlacementInvariants(auditResults, engineReports);
    const pi1 = violations.filter((v) => v.invariant === "PI1" && v.candidateId === "A");
    expect(pi1).toHaveLength(1);
  });

  it("PI1 fires when engine says 'protein placement violation' for candidate C (no structural violation)", () => {
    const engineReports = makeMockEngineReports({
      overrideC: {
        decisiveVariable: "protein placement violation",
        constraintsViolated: 1,
        verdict: "invalid",
      },
    });

    const violations = assertProteinPlacementInvariants(auditResults, engineReports);
    const pi1 = violations.filter((v) => v.invariant === "PI1" && v.candidateId === "C");
    expect(pi1).toHaveLength(1);
  });

  it("PI1 does NOT fire for candidate B even with 'protein placement violation' (structural violation exists)", () => {
    const engineReports = makeMockEngineReports(); // B already has protein placement violation
    const violations = assertProteinPlacementInvariants(auditResults, engineReports);
    const pi1B = violations.filter((v) => v.invariant === "PI1" && v.candidateId === "B");
    expect(pi1B).toHaveLength(0);
  });
});

describe("assertProteinPlacementInvariants — PI2 fires when engine has protein-placement adjustment for A", () => {
  const baseline = extractBaselineProteinPlacement(PHASE);
  const auditResults = CANDIDATE_DESCRIPTIONS.map((c) =>
    buildCandidateAuditResult(c.id, c.description, baseline)
  );

  it("PI2 fires when engine adjustment mentions 'protein placement' for A (no structural violation)", () => {
    const engineReports = makeMockEngineReports({
      overrideA: {
        adjustments: ["Preserve existing protein placement across all meals."],
      },
    });

    const violations = assertProteinPlacementInvariants(auditResults, engineReports);
    const pi2 = violations.filter((v) => v.invariant === "PI2" && v.candidateId === "A");
    expect(pi2).toHaveLength(1);
  });

  it("PI2 does NOT fire for B (engine correctly flags protein placement for candidate with structural violation)", () => {
    const engineReports = makeMockEngineReports();
    const violations = assertProteinPlacementInvariants(auditResults, engineReports);
    const pi2B = violations.filter((v) => v.invariant === "PI2" && v.candidateId === "B");
    expect(pi2B).toHaveLength(0);
  });
});

describe("all-flagged scenario — PI1 fires for all three if engine flags A, B, C identically", () => {
  const baseline = extractBaselineProteinPlacement(PHASE);
  const auditResults = CANDIDATE_DESCRIPTIONS.map((c) =>
    buildCandidateAuditResult(c.id, c.description, baseline)
  );

  it("PI1 fires for A and C but not B when all three are flagged with protein placement violation", () => {
    // This simulates the suspect bug: all three candidates flagged with the same violation
    const engineReports = makeMockEngineReports({
      overrideA: { decisiveVariable: "protein placement violation", constraintsViolated: 1, verdict: "invalid" },
      overrideC: { decisiveVariable: "protein placement violation", constraintsViolated: 1, verdict: "invalid" },
    });

    const violations = assertProteinPlacementInvariants(auditResults, engineReports);
    const pi1Ids = violations.filter((v) => v.invariant === "PI1").map((v) => v.candidateId);

    expect(pi1Ids).toContain("A");
    expect(pi1Ids).toContain("C");
    expect(pi1Ids).not.toContain("B");
  });
});

/* =========================================================
   8. Full report builder
   ========================================================= */

describe("buildProteinPlacementAuditReport — full report", () => {
  const report = buildProteinPlacementAuditReport(
    "BASE",
    PHASE,
    CANDIDATE_DESCRIPTIONS,
    makeMockEngineReports()
  );

  it("phaseId is 'BASE'", () => {
    expect(report.phaseId).toBe("BASE");
  });

  it("baseline map is exposed on the report", () => {
    expect(report.baselineMap["1"]).toContain("whey");
    expect(report.baselineMap["3"]).toContain("whey");
    expect(report.baselineMap["3"]).toContain("egg");
    expect(report.baselineMap["4"]).toContain("yogurt");
  });

  it("report contains results for all three candidates", () => {
    expect(report.candidates).toHaveLength(3);
    expect(report.candidates.map((c) => c.candidateId)).toEqual(["A", "B", "C"]);
  });

  it("no invariant violations with consistent engine reports", () => {
    expect(report.invariantViolations).toHaveLength(0);
  });

  it("report can detect invariant violations when engine is inconsistent", () => {
    const badReport = buildProteinPlacementAuditReport(
      "BASE",
      PHASE,
      CANDIDATE_DESCRIPTIONS,
      makeMockEngineReports({
        overrideA: { decisiveVariable: "protein placement violation", constraintsViolated: 1, verdict: "invalid" },
        overrideC: { decisiveVariable: "protein placement violation", constraintsViolated: 1, verdict: "invalid" },
      })
    );

    expect(badReport.invariantViolations.length).toBeGreaterThan(0);
    const violatingIds = badReport.invariantViolations.map((v) => v.candidateId);
    expect(violatingIds).toContain("A");
    expect(violatingIds).toContain("C");
    expect(violatingIds).not.toContain("B");
  });
});

/* =========================================================
   9. Structural diff edge cases
   ========================================================= */

describe("diffProteinPlacements — edge cases", () => {
  const baseline = extractBaselineProteinPlacement(PHASE);

  it("identical maps produce empty diff (no movement)", () => {
    const diff = diffProteinPlacements(baseline, baseline);
    expect(diff.hasMovement).toBe(false);
    expect(diff.movedProteinFoods).toHaveLength(0);
  });

  it("removing whey from meal 1 and adding to meal 2 produces a move entry", () => {
    const candidate = {
      "1": [] as string[],
      "2": ["whey"],
      "3": ["egg", "whey"],
      "4": ["egg", "yogurt"],
    };
    const diff = diffProteinPlacements(baseline, candidate);
    expect(diff.hasMovement).toBe(true);
    const move = diff.movedProteinFoods.find(
      (m) => m.food === "whey" && m.fromMeal === "1" && m.toMeal === "2"
    );
    expect(move).toBeDefined();
  });

  it("adding a new protein food to a meal with none produces an 'added' entry", () => {
    const candidate = {
      "1": ["whey"],
      "2": ["yogurt"],  // yogurt added to meal 2 (not in baseline)
      "3": ["egg", "whey"],
      "4": ["egg", "yogurt"],
    };
    const diff = diffProteinPlacements(baseline, candidate);
    expect(diff.hasMovement).toBe(true);
    expect(diff.addedProteinFoodsByMeal["2"]).toContain("yogurt");
  });
});

/* =========================================================
   10. extractCandidateProteinPlacement — parser accuracy
   ========================================================= */

describe("extractCandidateProteinPlacement — pattern detection", () => {
  const baseline = extractBaselineProteinPlacement(PHASE);

  it("no protein keywords → candidateMap equals baseline (inferenceConfidence: none)", () => {
    const { map, confidence } = extractCandidateProteinPlacement(
      "Reduce oats from 96g to 64g and increase dextrin to 60g.",
      baseline
    );
    expect(confidence).toBe("none");
    for (const meal of Object.keys(baseline)) {
      expect([...map[meal]!].sort()).toEqual([...baseline[meal]!].sort());
    }
  });

  it("'move whey from meal 3 to meal 4' produces high-confidence whey movement", () => {
    const { map, movements, confidence } = extractCandidateProteinPlacement(
      "Move whey from meal 3 to meal 4.",
      baseline
    );
    expect(confidence).toBe("high");
    expect(movements.length).toBeGreaterThan(0);
    expect(map["3"]).not.toContain("whey");
    expect(map["4"]).toContain("whey");
  });

  it("'add yogurt to meal 2' adds yogurt to meal 2 map", () => {
    const { map } = extractCandidateProteinPlacement(
      "Add yogurt to meal 2 for protein variety.",
      baseline
    );
    expect(map["2"]).toContain("yogurt");
  });

  it("'remove egg from meal 3' removes egg from meal 3 map", () => {
    const { map } = extractCandidateProteinPlacement(
      "Remove egg from meal 3 to reduce fat.",
      baseline
    );
    expect(map["3"]).not.toContain("egg");
    expect(map["3"]).toContain("whey");  // whey stays
  });

  it("'transfer whey protein from meal 1 to meal 2' is detected", () => {
    const { movements } = extractCandidateProteinPlacement(
      "Transfer whey protein from meal 1 to meal 2.",
      baseline
    );
    const move = movements.find(
      (m) => m.food === "whey" && m.fromMeal === "1" && m.toMeal === "2"
    );
    expect(move).toBeDefined();
  });
});
