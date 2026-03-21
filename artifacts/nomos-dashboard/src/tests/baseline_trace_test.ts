/**
 * baseline_trace_test.ts
 *
 * Regression tests for baseline_trace.ts — the factory that builds
 * ConstraintTrace records from ConstraintCheckResult objects.
 *
 * Each test verifies:
 *   - baselineState and candidateState are preserved exactly
 *   - proofLines are derived from variable + diff (not from violationLabel)
 *   - proof conclusions contain the right operator and variable name
 *   - suggestedRepair is correct when violated, null when satisfied
 *   - No "violation" wording appears in proof lines for satisfied results
 *   - violationLabel does not appear in prose proof lines
 *
 * Scenarios:
 *   1. buildProteinPlacementTrace — violated (whey moved meal 2 → meal 7)
 *   2. buildProteinPlacementTrace — satisfied (no movement)
 *   3. buildMealOrderTrace — violated (reordered)
 *   4. buildMealOrderTrace — satisfied
 *   5. buildMealCountTrace — violated (1 meal removed)
 *   6. buildCalorieTrace — violated (+150 kcal)
 *   7. buildCalorieTrace — satisfied (on target)
 *   8. buildFoodAdjustmentTrace — violated (out-of-scope food)
 *   9. buildFoodAdjustmentTrace — satisfied (all in scope)
 *  10. buildMacroSourceTrace — violated (wrong source)
 *  11. buildConstraintTrace — generic violated
 *  12. buildConstraintTrace — generic satisfied
 */

import { describe, it, expect } from "vitest";
import {
  buildProteinPlacementTrace,
  buildMealOrderTrace,
  buildMealCountTrace,
  buildCalorieTrace,
  buildFoodAdjustmentTrace,
  buildMacroSourceTrace,
  buildConstraintTrace,
} from "../eval/baseline_trace";
import {
  compareProteinPlacementMap,
  compareMealOrder,
  compareMealCount,
  compareCalories,
  compareFoodAdjustmentScope,
  compareMacroSourcePriority,
} from "../eval/diff_engine";
import { buildConstraintCheckResult } from "../eval/constraint_report";
import type { ProteinPlacementMap, MealOrder } from "../eval/diff_engine";
import type { ConstraintExpression } from "../eval/constraint_algebra";

/* =========================================================
   Fixture helpers
   ========================================================= */

function makeProteinExpr(
  baseline: ProteinPlacementMap,
  candidate: ProteinPlacementMap
): ConstraintExpression<ProteinPlacementMap> {
  return {
    constraintId: "STRUCTURAL_LOCK:preserve_protein_placement",
    key: "preserve_protein_placement",
    variableName: "protein placement",
    violationLabel: "protein placement violation",
    operator: "MUST_EQUAL",
    baselineValue: baseline,
    candidateValue: candidate,
  };
}

function makeMealOrderExpr(b: MealOrder, c: MealOrder): ConstraintExpression<MealOrder> {
  return {
    constraintId: "STRUCTURAL_LOCK:preserve_meal_order",
    key: "preserve_meal_order",
    variableName: "meal order",
    violationLabel: "meal order violation",
    operator: "MUST_EQUAL",
    baselineValue: b,
    candidateValue: c,
  };
}

/* =========================================================
   Scenario 1: buildProteinPlacementTrace — violated
   ========================================================= */

describe("buildProteinPlacementTrace — violated (whey moved meal 2 → meal 7)", () => {
  const baseline: ProteinPlacementMap = {
    "2": ["whey"],
    "3": ["yogurt", "whey"],
    "4": ["whey"],
    "5": ["whey"],
    "6": ["whey"],
  };
  const candidate: ProteinPlacementMap = {
    "2": [],
    "3": ["yogurt", "whey"],
    "4": ["whey"],
    "5": ["whey"],
    "6": ["whey"],
    "7": ["whey"],
  };
  const expr = makeProteinExpr(baseline, candidate);
  const diff = compareProteinPlacementMap(baseline, candidate);
  const result = buildConstraintCheckResult(expr, diff);
  const trace = buildProteinPlacementTrace(baseline, candidate, result);

  it("trace.variableName is 'protein placement'", () => {
    expect(trace.variableName).toBe("protein placement");
  });

  it("trace.variableName does not contain 'violation'", () => {
    expect(trace.variableName).not.toContain("violation");
  });

  it("trace.baselineState is the baseline ProteinPlacementMap", () => {
    expect(trace.baselineState).toEqual(baseline);
  });

  it("trace.candidateState is the candidate ProteinPlacementMap", () => {
    expect(trace.candidateState).toEqual(candidate);
  });

  it("trace.diffSummary mentions whey and meal numbers", () => {
    expect(trace.diffSummary.toLowerCase()).toContain("whey");
    expect(trace.diffSummary).toContain("2");
    expect(trace.diffSummary).toContain("7");
  });

  it("proofLines contain 'Baseline meal 2 contains whey'", () => {
    const hasBaseline = trace.proofLines.some((l) =>
      l.includes("Baseline meal 2") && l.toLowerCase().includes("whey")
    );
    expect(hasBaseline).toBe(true);
  });

  it("proofLines contain 'Candidate meal 2 does not contain whey'", () => {
    const hasCandidateRemoved = trace.proofLines.some((l) =>
      l.toLowerCase().includes("candidate meal 2") &&
      l.toLowerCase().includes("does not contain") &&
      l.toLowerCase().includes("whey")
    );
    expect(hasCandidateRemoved).toBe(true);
  });

  it("proofLines contain 'Candidate meal 7 contains whey'", () => {
    const hasCandidateAdded = trace.proofLines.some((l) =>
      l.toLowerCase().includes("candidate meal 7") && l.toLowerCase().includes("whey")
    );
    expect(hasCandidateAdded).toBe(true);
  });

  it("proofLines contain 'Therefore whey moved from meal 2 to meal 7'", () => {
    const hasMovement = trace.proofLines.some((l) =>
      l.toLowerCase().includes("therefore") &&
      l.toLowerCase().includes("whey") &&
      l.includes("2") &&
      l.includes("7")
    );
    expect(hasMovement).toBe(true);
  });

  it("proofLines conclude with 'MUST_EQUAL on protein placement is violated'", () => {
    const conclusion = trace.proofLines[trace.proofLines.length - 1]!;
    expect(conclusion).toContain("MUST_EQUAL");
    expect(conclusion.toLowerCase()).toContain("protein placement");
    expect(conclusion.toLowerCase()).toContain("violated");
  });

  it("no proof line contains the raw violationLabel as a prose subject", () => {
    for (const line of trace.proofLines) {
      expect(line.toLowerCase()).not.toContain("protein placement violation was");
    }
  });

  it("suggestedRepair says 'Restore whey to meal 2'", () => {
    expect(trace.suggestedRepair).toContain("Restore whey to meal 2");
  });

  it("suggestedRepair does not contain 'violation'", () => {
    expect(trace.suggestedRepair?.toLowerCase()).not.toContain("violation");
  });
});

/* =========================================================
   Scenario 2: buildProteinPlacementTrace — satisfied
   ========================================================= */

describe("buildProteinPlacementTrace — satisfied (no movement)", () => {
  const map: ProteinPlacementMap = {
    "2": ["whey"],
    "3": ["yogurt", "whey"],
    "4": ["whey"],
  };
  const expr = makeProteinExpr(map, map);
  const diff = compareProteinPlacementMap(map, map);
  const result = buildConstraintCheckResult(expr, diff);
  const trace = buildProteinPlacementTrace(map, map, result);

  it("proofLines first line is 'No violation detected'", () => {
    expect(trace.proofLines[0]).toContain("No violation detected");
  });

  it("proofLines conclude with 'is satisfied'", () => {
    const conclusion = trace.proofLines[trace.proofLines.length - 1]!;
    expect(conclusion.toLowerCase()).toContain("is satisfied");
  });

  it("suggestedRepair is null", () => {
    expect(trace.suggestedRepair).toBeNull();
  });

  it("no proof line says 'violated'", () => {
    for (const line of trace.proofLines) {
      expect(line.toLowerCase()).not.toContain("is violated");
    }
  });
});

/* =========================================================
   Scenario 3: buildMealOrderTrace — violated
   ========================================================= */

describe("buildMealOrderTrace — violated (reordered)", () => {
  const baseline: MealOrder = ["meal1", "meal2", "meal3", "meal4"];
  const candidate: MealOrder = ["meal1", "meal3", "meal2", "meal4"];
  const expr = makeMealOrderExpr(baseline, candidate);
  const diff = compareMealOrder(baseline, candidate);
  const result = buildConstraintCheckResult(expr, diff);
  const trace = buildMealOrderTrace(baseline, candidate, result);

  it("trace.baselineState is the baseline meal order", () => {
    expect(trace.baselineState).toEqual(baseline);
  });

  it("trace.candidateState is the candidate meal order", () => {
    expect(trace.candidateState).toEqual(candidate);
  });

  it("proofLines contain baseline order line", () => {
    const hasBaseline = trace.proofLines.some((l) =>
      l.toLowerCase().includes("baseline order")
    );
    expect(hasBaseline).toBe(true);
  });

  it("proofLines contain candidate order line", () => {
    const hasCandidate = trace.proofLines.some((l) =>
      l.toLowerCase().includes("candidate order")
    );
    expect(hasCandidate).toBe(true);
  });

  it("proofLines contain first differing position info", () => {
    const hasPosition = trace.proofLines.some((l) =>
      l.toLowerCase().includes("index") || l.toLowerCase().includes("first differing")
    );
    expect(hasPosition).toBe(true);
  });

  it("proofLines conclude with 'MUST_EQUAL on meal order is violated'", () => {
    const conclusion = trace.proofLines[trace.proofLines.length - 1]!;
    expect(conclusion.toLowerCase()).toContain("meal order");
    expect(conclusion.toLowerCase()).toContain("violated");
  });

  it("suggestedRepair does not contain 'violation'", () => {
    expect(trace.suggestedRepair?.toLowerCase()).not.toContain("violation");
  });
});

/* =========================================================
   Scenario 4: buildMealOrderTrace — satisfied
   ========================================================= */

describe("buildMealOrderTrace — satisfied", () => {
  const order: MealOrder = ["meal1", "meal2", "meal3"];
  const expr = makeMealOrderExpr(order, order);
  const diff = compareMealOrder(order, order);
  const result = buildConstraintCheckResult(expr, diff);
  const trace = buildMealOrderTrace(order, order, result);

  it("proofLines first line is 'No violation detected'", () => {
    expect(trace.proofLines[0]).toContain("No violation detected");
  });

  it("suggestedRepair is null", () => {
    expect(trace.suggestedRepair).toBeNull();
  });
});

/* =========================================================
   Scenario 5: buildMealCountTrace — violated
   ========================================================= */

describe("buildMealCountTrace — violated (1 meal removed)", () => {
  const baseline = 4;
  const candidate = 3;
  const expr: ConstraintExpression<number> = {
    constraintId: "STRUCTURAL_LOCK:preserve_meal_count",
    key: "preserve_meal_count",
    variableName: "meal count",
    violationLabel: "meal count violation",
    operator: "MUST_EQUAL",
    baselineValue: baseline,
    candidateValue: candidate,
  };
  const diff = compareMealCount(baseline, candidate);
  const result = buildConstraintCheckResult(expr, diff);
  const trace = buildMealCountTrace(baseline, candidate, result);

  it("proofLines contain 'Baseline meal count: 4'", () => {
    expect(trace.proofLines.some((l) => l.includes("4"))).toBe(true);
  });

  it("proofLines contain 'Candidate meal count: 3'", () => {
    expect(trace.proofLines.some((l) => l.includes("3"))).toBe(true);
  });

  it("proofLines say '1 meal removed'", () => {
    const hasRemoved = trace.proofLines.some((l) =>
      l.toLowerCase().includes("removed")
    );
    expect(hasRemoved).toBe(true);
  });

  it("proofLines conclude with 'MUST_EQUAL on meal count is violated'", () => {
    const conclusion = trace.proofLines[trace.proofLines.length - 1]!;
    expect(conclusion.toLowerCase()).toContain("meal count");
    expect(conclusion.toLowerCase()).toContain("violated");
  });

  it("trace.baselineState is 4", () => {
    expect(trace.baselineState).toBe(4);
  });

  it("trace.candidateState is 3", () => {
    expect(trace.candidateState).toBe(3);
  });
});

/* =========================================================
   Scenario 6: buildCalorieTrace — violated (+150 kcal)
   ========================================================= */

describe("buildCalorieTrace — violated (+150 kcal)", () => {
  const target = 2000;
  const actual = 2150;
  const expr: ConstraintExpression<number> = {
    constraintId: "TARGET_TOLERANCE:calorie_delta_minimize",
    key: "calorie_delta_minimize",
    variableName: "calorie delta",
    violationLabel: "calorie delta violation",
    operator: "MINIMIZE_ABS_DELTA",
    baselineValue: target,
    candidateValue: actual,
  };
  const diff = compareCalories(target, actual);
  const result = buildConstraintCheckResult(expr, diff);
  const trace = buildCalorieTrace(target, actual, result);

  it("proofLines contain 'Calorie target: 2000'", () => {
    expect(trace.proofLines.some((l) => l.includes("2000"))).toBe(true);
  });

  it("proofLines contain 'Candidate calories: 2150'", () => {
    expect(trace.proofLines.some((l) => l.includes("2150"))).toBe(true);
  });

  it("proofLines say '150 kcal above target'", () => {
    const hasAbove = trace.proofLines.some((l) =>
      l.includes("150") && l.toLowerCase().includes("above")
    );
    expect(hasAbove).toBe(true);
  });

  it("proofLines conclude with 'MINIMIZE_ABS_DELTA on calorie delta is violated'", () => {
    const conclusion = trace.proofLines[trace.proofLines.length - 1]!;
    expect(conclusion.toLowerCase()).toContain("calorie delta");
    expect(conclusion.toLowerCase()).toContain("violated");
  });

  it("suggestedRepair says 'Reduce calorie delta by 150'", () => {
    expect(trace.suggestedRepair).toContain("150");
    expect(trace.suggestedRepair?.toLowerCase()).toContain("reduce");
  });

  it("suggestedRepair does not contain 'violation'", () => {
    expect(trace.suggestedRepair?.toLowerCase()).not.toContain("violation");
  });

  it("trace.baselineState is 2000", () => {
    expect(trace.baselineState).toBe(2000);
  });

  it("trace.candidateState is 2150", () => {
    expect(trace.candidateState).toBe(2150);
  });
});

/* =========================================================
   Scenario 7: buildCalorieTrace — satisfied
   ========================================================= */

describe("buildCalorieTrace — satisfied (on target)", () => {
  const expr: ConstraintExpression<number> = {
    constraintId: "TARGET_TOLERANCE:calorie_delta_minimize",
    key: "calorie_delta_minimize",
    variableName: "calorie delta",
    violationLabel: "calorie delta violation",
    operator: "MINIMIZE_ABS_DELTA",
    baselineValue: 2000,
    candidateValue: 2000,
  };
  const diff = compareCalories(2000, 2000);
  const result = buildConstraintCheckResult(expr, diff);
  const trace = buildCalorieTrace(2000, 2000, result);

  it("proofLines first line is 'No violation detected'", () => {
    expect(trace.proofLines[0]).toContain("No violation detected");
  });

  it("proofLines conclude with 'is satisfied'", () => {
    const conclusion = trace.proofLines[trace.proofLines.length - 1]!;
    expect(conclusion.toLowerCase()).toContain("is satisfied");
  });

  it("suggestedRepair is null", () => {
    expect(trace.suggestedRepair).toBeNull();
  });
});

/* =========================================================
   Scenario 8: buildFoodAdjustmentTrace — violated
   ========================================================= */

describe("buildFoodAdjustmentTrace — violated (pasta out of scope)", () => {
  const allowed = ["chicken", "rice", "broccoli"];
  const adjusted = ["chicken", "rice", "broccoli", "pasta"];
  const expr: ConstraintExpression<string[]> = {
    constraintId: "ALLOWED_ACTION:adjustment_scope",
    key: "adjustment_scope",
    variableName: "adjustment scope",
    violationLabel: "adjustment scope violation",
    operator: "SUBSET_OF",
    baselineValue: allowed,
    candidateValue: adjusted,
  };
  const diff = compareFoodAdjustmentScope(allowed, adjusted);
  const result = buildConstraintCheckResult(expr, diff);
  const trace = buildFoodAdjustmentTrace(allowed, adjusted, result);

  it("proofLines contain 'Declared baseline foods'", () => {
    const hasBaseline = trace.proofLines.some((l) =>
      l.toLowerCase().includes("declared") && l.toLowerCase().includes("baseline")
    );
    expect(hasBaseline).toBe(true);
  });

  it("proofLines contain 'Out-of-scope additions: pasta'", () => {
    const hasScope = trace.proofLines.some((l) =>
      l.toLowerCase().includes("out-of-scope") && l.toLowerCase().includes("pasta")
    );
    expect(hasScope).toBe(true);
  });

  it("proofLines contain 'Pasta is not declared in the baseline plan'", () => {
    const hasNotDeclared = trace.proofLines.some((l) =>
      l.toLowerCase().includes("pasta") && l.toLowerCase().includes("not declared")
    );
    expect(hasNotDeclared).toBe(true);
  });

  it("proofLines conclude with 'SUBSET_OF on adjustment scope is violated'", () => {
    const conclusion = trace.proofLines[trace.proofLines.length - 1]!;
    expect(conclusion.toLowerCase()).toContain("adjustment scope");
    expect(conclusion.toLowerCase()).toContain("violated");
  });

  it("suggestedRepair mentions pasta", () => {
    expect(trace.suggestedRepair?.toLowerCase()).toContain("pasta");
  });

  it("suggestedRepair does not contain 'violation'", () => {
    expect(trace.suggestedRepair?.toLowerCase()).not.toContain("violation");
  });

  it("trace.baselineState is the allowed list", () => {
    expect(trace.baselineState).toEqual(allowed);
  });

  it("trace.candidateState is the adjusted list", () => {
    expect(trace.candidateState).toEqual(adjusted);
  });
});

/* =========================================================
   Scenario 9: buildFoodAdjustmentTrace — satisfied
   ========================================================= */

describe("buildFoodAdjustmentTrace — satisfied (all in scope)", () => {
  const allowed = ["chicken", "rice", "broccoli"];
  const adjusted = ["chicken", "rice"];
  const expr: ConstraintExpression<string[]> = {
    constraintId: "ALLOWED_ACTION:adjustment_scope",
    key: "adjustment_scope",
    variableName: "adjustment scope",
    violationLabel: "adjustment scope violation",
    operator: "SUBSET_OF",
    baselineValue: allowed,
    candidateValue: adjusted,
  };
  const diff = compareFoodAdjustmentScope(allowed, adjusted);
  const result = buildConstraintCheckResult(expr, diff);
  const trace = buildFoodAdjustmentTrace(allowed, adjusted, result);

  it("proofLines first line is 'No violation detected'", () => {
    expect(trace.proofLines[0]).toContain("No violation detected");
  });

  it("suggestedRepair is null", () => {
    expect(trace.suggestedRepair).toBeNull();
  });
});

/* =========================================================
   Scenario 10: buildMacroSourceTrace — violated
   ========================================================= */

describe("buildMacroSourceTrace — violated (declared vs estimated)", () => {
  const declared = "declared";
  const actual = "estimated";
  const expr: ConstraintExpression<string> = {
    constraintId: "SOURCE_TRUTH:declared_macros_override",
    key: "declared_macros_override",
    variableName: "macro source",
    violationLabel: "macro source violation",
    operator: "SOURCE_PRIORITY",
    baselineValue: declared,
    candidateValue: actual,
  };
  const diff = compareMacroSourcePriority(declared, actual);
  const result = buildConstraintCheckResult(expr, diff);
  const trace = buildMacroSourceTrace(declared, actual, result);

  it("proofLines contain 'Declared macro source: declared'", () => {
    const hasDeclared = trace.proofLines.some((l) =>
      l.toLowerCase().includes("declared macro source")
    );
    expect(hasDeclared).toBe(true);
  });

  it("proofLines contain 'Candidate macro source: estimated'", () => {
    const hasCandidate = trace.proofLines.some((l) =>
      l.toLowerCase().includes("candidate macro source") &&
      l.toLowerCase().includes("estimated")
    );
    expect(hasCandidate).toBe(true);
  });

  it("proofLines contain 'Source conflict: expected declared, found estimated'", () => {
    const hasConflict = trace.proofLines.some((l) =>
      l.toLowerCase().includes("conflict") &&
      l.toLowerCase().includes("declared") &&
      l.toLowerCase().includes("estimated")
    );
    expect(hasConflict).toBe(true);
  });

  it("proofLines conclude with 'SOURCE_PRIORITY on macro source is violated'", () => {
    const conclusion = trace.proofLines[trace.proofLines.length - 1]!;
    expect(conclusion.toLowerCase()).toContain("macro source");
    expect(conclusion.toLowerCase()).toContain("violated");
  });

  it("suggestedRepair references 'macro source' without 'violation'", () => {
    expect(trace.suggestedRepair?.toLowerCase()).toContain("macro source");
    expect(trace.suggestedRepair?.toLowerCase()).not.toContain("violation");
  });
});

/* =========================================================
   Scenario 11: buildConstraintTrace — generic violated
   ========================================================= */

describe("buildConstraintTrace — generic violated", () => {
  const expr: ConstraintExpression<unknown> = {
    constraintId: "STRUCTURAL_LOCK:generic_test",
    key: "generic_test",
    variableName: "structure",
    violationLabel: "structure violation",
    operator: "MUST_EQUAL",
    baselineValue: { a: 1 },
    candidateValue: { a: 2 },
  };
  const diff = { equal: false, summary: "Structure differs from baseline." };
  const result = buildConstraintCheckResult(expr, diff);
  const trace = buildConstraintTrace(result);

  it("trace.constraintId matches", () => {
    expect(trace.constraintId).toBe("STRUCTURAL_LOCK:generic_test");
  });

  it("trace.variableName does not contain 'violation'", () => {
    expect(trace.variableName).not.toContain("violation");
  });

  it("trace.diffSummary is the diff summary", () => {
    expect(trace.diffSummary).toBe("Structure differs from baseline.");
  });

  it("proofLines include the diff summary", () => {
    expect(trace.proofLines.some((l) => l.includes(diff.summary))).toBe(true);
  });

  it("proofLines conclude with 'MUST_EQUAL on structure is violated'", () => {
    const conclusion = trace.proofLines[trace.proofLines.length - 1]!;
    expect(conclusion.toLowerCase()).toContain("structure");
    expect(conclusion.toLowerCase()).toContain("violated");
  });
});

/* =========================================================
   Scenario 12: buildConstraintTrace — generic satisfied
   ========================================================= */

describe("buildConstraintTrace — generic satisfied", () => {
  const expr: ConstraintExpression<number> = {
    constraintId: "TARGET_TOLERANCE:magnitude",
    key: "magnitude",
    variableName: "change magnitude",
    violationLabel: "change magnitude violation",
    operator: "MINIMIZE_ABS_DELTA",
    baselineValue: 0,
    candidateValue: 0,
  };
  const diff = { equal: true, delta: 0, summary: "No change detected." };
  const result = buildConstraintCheckResult(expr, diff);
  const trace = buildConstraintTrace(result);

  it("proofLines first line is 'No violation detected'", () => {
    expect(trace.proofLines[0]).toContain("No violation detected");
  });

  it("proofLines conclude with 'is satisfied'", () => {
    const conclusion = trace.proofLines[trace.proofLines.length - 1]!;
    expect(conclusion.toLowerCase()).toContain("is satisfied");
  });

  it("suggestedRepair is null", () => {
    expect(trace.suggestedRepair).toBeNull();
  });

  it("no proof line contains 'violated'", () => {
    for (const line of trace.proofLines) {
      expect(line.toLowerCase()).not.toContain("is violated");
    }
  });
});
