/**
 * constraint_algebra_test.ts
 *
 * Regression tests for the formal constraint algebra + diff engine.
 *
 * Covers the six key scenarios that prove NOMOS can:
 *   - hold baseline state
 *   - hold candidate state
 *   - diff the two
 *   - determine satisfaction
 *   - explain the failure from variable + diff (not from violation label)
 *   - suggest a repair from variable-level data
 *
 * Test scenarios:
 *   1. Satisfied MUST_EQUAL — protein placement (no diff, lock held)
 *   2. Violated MUST_EQUAL — protein placement (whey moved, movement-aware summary)
 *   3. Violated MUST_EQUAL — meal order (reordered meals)
 *   4. Violated SUBSET_OF  — adjustment scope (out-of-scope food adjusted)
 *   5. Violated MINIMIZE_ABS_DELTA — calorie delta reporting
 *   6. Violated SOURCE_PRIORITY — macro source conflict
 */

import { describe, it, expect } from "vitest";
import type { ConstraintExpression } from "../eval/constraint_algebra";
import {
  assertConstraintExpressionInvariants,
  assertConstraintCheckResultInvariants,
  evaluateSatisfaction,
} from "../eval/constraint_algebra";
import {
  compareProteinPlacementMap,
  compareMealOrder,
  compareMealCount,
  compareFoodAdjustmentScope,
  compareCalories,
  compareMacroSourcePriority,
} from "../eval/diff_engine";
import { buildConstraintCheckResult, buildAndAssertConstraintCheckResult } from "../eval/constraint_report";
import type { ProteinPlacementMap, MealOrder } from "../eval/diff_engine";

/* =========================================================
   Shared fixture builder helpers
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

function makeMealOrderExpr(
  baseline: MealOrder,
  candidate: MealOrder
): ConstraintExpression<MealOrder> {
  return {
    constraintId: "STRUCTURAL_LOCK:preserve_meal_order",
    key: "preserve_meal_order",
    variableName: "meal order",
    violationLabel: "meal order violation",
    operator: "MUST_EQUAL",
    baselineValue: baseline,
    candidateValue: candidate,
  };
}

/* =========================================================
   Constraint expression invariants
   ========================================================= */

describe("assertConstraintExpressionInvariants", () => {
  it("passes for a clean protein placement expression", () => {
    const expr = makeProteinExpr({ "2": ["whey"] }, { "2": ["whey"] });
    expect(assertConstraintExpressionInvariants(expr)).toHaveLength(0);
  });

  it("A1: fires when variableName contains 'violation'", () => {
    const expr = makeProteinExpr({}, {});
    const bad = { ...expr, variableName: "protein placement violation" };
    const violations = assertConstraintExpressionInvariants(bad);
    expect(violations.some((v) => v.invariant === "A1")).toBe(true);
  });

  it("A2: fires when violationLabel does not equal variableName + ' violation'", () => {
    const expr = makeProteinExpr({}, {});
    const bad = { ...expr, violationLabel: "wrong label" };
    const violations = assertConstraintExpressionInvariants(bad);
    expect(violations.some((v) => v.invariant === "A2")).toBe(true);
  });

  it("A2: passes when violationLabel === variableName + ' violation'", () => {
    const expr = makeProteinExpr({}, {});
    const violations = assertConstraintExpressionInvariants(expr);
    expect(violations.some((v) => v.invariant === "A2")).toBe(false);
  });
});

/* =========================================================
   Scenario 1: Satisfied MUST_EQUAL — protein placement
   ========================================================= */

describe("Scenario 1 — satisfied MUST_EQUAL: protein placement unchanged", () => {
  const baseline: ProteinPlacementMap = {
    "2": ["whey"],
    "3": ["yogurt", "whey"],
    "4": ["whey"],
    "5": ["whey"],
    "6": ["whey"],
  };
  const candidate: ProteinPlacementMap = {
    "2": ["whey"],
    "3": ["yogurt", "whey"],
    "4": ["whey"],
    "5": ["whey"],
    "6": ["whey"],
  };

  it("diff is equal", () => {
    const diff = compareProteinPlacementMap(baseline, candidate);
    expect(diff.equal).toBe(true);
  });

  it("diff summary says 'unchanged'", () => {
    const diff = compareProteinPlacementMap(baseline, candidate);
    expect(diff.summary).toContain("unchanged");
  });

  it("satisfactionStatus is 'satisfied'", () => {
    const diff = compareProteinPlacementMap(baseline, candidate);
    expect(evaluateSatisfaction("MUST_EQUAL", diff)).toBe("satisfied");
  });

  it("result.satisfactionStatus is 'satisfied'", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.satisfactionStatus).toBe("satisfied");
  });

  it("result.decisiveVariable is null when satisfied", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.decisiveVariable).toBeNull();
  });

  it("result.suggestedRepair is null when satisfied", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.suggestedRepair).toBeNull();
  });

  it("result.explanation says 'matches baseline' and does not say 'was altered'", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.explanation).toContain("matches baseline");
    expect(result.explanation.toLowerCase()).not.toContain("was altered");
  });

  it("result.variableName is 'protein placement' (no 'violation' word)", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.variableName).toBe("protein placement");
    expect(result.variableName).not.toContain("violation");
  });

  it("no invariant violations on the satisfied result", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(assertConstraintCheckResultInvariants(result)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 2: Violated MUST_EQUAL — protein placement (whey moved)
   ========================================================= */

describe("Scenario 2 — violated MUST_EQUAL: protein placement — whey moved meal 2 → meal 7", () => {
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

  it("diff is not equal", () => {
    const diff = compareProteinPlacementMap(baseline, candidate);
    expect(diff.equal).toBe(false);
  });

  it("diff.removed contains meal 2 with whey", () => {
    const diff = compareProteinPlacementMap(baseline, candidate);
    const removed = diff.removed as Record<string, string[]>;
    expect(removed["2"]).toContain("whey");
  });

  it("diff.added contains meal 7 with whey", () => {
    const diff = compareProteinPlacementMap(baseline, candidate);
    const added = diff.added as Record<string, string[]>;
    expect(added["7"]).toContain("whey");
  });

  it("diff.summary describes whey moving from meal 2 to meal 7", () => {
    const diff = compareProteinPlacementMap(baseline, candidate);
    expect(diff.summary.toLowerCase()).toContain("whey");
    expect(diff.summary).toContain("2");
    expect(diff.summary).toContain("7");
  });

  it("satisfactionStatus is 'violated'", () => {
    const diff = compareProteinPlacementMap(baseline, candidate);
    expect(evaluateSatisfaction("MUST_EQUAL", diff)).toBe("violated");
  });

  it("result.satisfactionStatus is 'violated'", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.satisfactionStatus).toBe("violated");
  });

  it("result.decisiveVariable is 'protein placement violation' (violationLabel) when violated", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.decisiveVariable).toBe("protein placement violation");
  });

  it("result.variableName is 'protein placement' — never equals violationLabel", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.variableName).toBe("protein placement");
    expect(result.variableName).not.toBe(result.violationLabel);
    expect(result.variableName).not.toContain("violation");
  });

  it("result.explanation references 'protein placement' and 'baseline', not 'was altered'", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.explanation.toLowerCase()).toContain("protein placement");
    expect(result.explanation.toLowerCase()).toContain("baseline");
    expect(result.explanation.toLowerCase()).not.toContain("was altered");
  });

  it("result.explanation contains the movement summary", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.explanation).toContain(diff.summary);
  });

  it("result.suggestedRepair says 'Restore whey to meal 2'", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.suggestedRepair).toContain("Restore whey to meal 2");
  });

  it("result.suggestedRepair does NOT contain 'violation'", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.suggestedRepair?.toLowerCase()).not.toContain("violation");
  });

  it("baselineValue and candidateValue are preserved on the result", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.baselineValue).toEqual(baseline);
    expect(result.candidateValue).toEqual(candidate);
  });

  it("no invariant violations on the violated result", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(assertConstraintCheckResultInvariants(result)).toHaveLength(0);
  });

  it("buildAndAssertConstraintCheckResult returns zero algebra violations", () => {
    const expr = makeProteinExpr(baseline, candidate);
    const diff = compareProteinPlacementMap(baseline, candidate);
    const { violations } = buildAndAssertConstraintCheckResult(expr, diff);
    expect(violations).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 3: Violated MUST_EQUAL — meal order reordered
   ========================================================= */

describe("Scenario 3 — violated MUST_EQUAL: meal order reordered", () => {
  const baseline: MealOrder = ["meal1", "meal2", "meal3", "meal4"];
  const candidate: MealOrder = ["meal1", "meal3", "meal2", "meal4"];

  it("compareMealOrder detects the reorder", () => {
    const diff = compareMealOrder(baseline, candidate);
    expect(diff.equal).toBe(false);
  });

  it("diff.summary mentions 'reordered'", () => {
    const diff = compareMealOrder(baseline, candidate);
    expect(diff.summary.toLowerCase()).toContain("reorder");
  });

  it("result.satisfactionStatus is 'violated'", () => {
    const expr = makeMealOrderExpr(baseline, candidate);
    const diff = compareMealOrder(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.satisfactionStatus).toBe("violated");
  });

  it("result.decisiveVariable is 'meal order violation'", () => {
    const expr = makeMealOrderExpr(baseline, candidate);
    const diff = compareMealOrder(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.decisiveVariable).toBe("meal order violation");
  });

  it("result.variableName is 'meal order' (not 'meal order violation')", () => {
    const expr = makeMealOrderExpr(baseline, candidate);
    const diff = compareMealOrder(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.variableName).toBe("meal order");
  });

  it("result.explanation references 'meal order' and 'baseline'", () => {
    const expr = makeMealOrderExpr(baseline, candidate);
    const diff = compareMealOrder(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.explanation.toLowerCase()).toContain("meal order");
    expect(result.explanation.toLowerCase()).toContain("baseline");
  });

  it("no invariant violations on the result", () => {
    const expr = makeMealOrderExpr(baseline, candidate);
    const diff = compareMealOrder(baseline, candidate);
    const result = buildConstraintCheckResult(expr, diff);
    expect(assertConstraintCheckResultInvariants(result)).toHaveLength(0);
  });

  it("unchanged meal order produces satisfied result", () => {
    const same = ["meal1", "meal2", "meal3", "meal4"];
    const expr = makeMealOrderExpr(same, same);
    const diff = compareMealOrder(same, same);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.satisfactionStatus).toBe("satisfied");
    expect(result.decisiveVariable).toBeNull();
  });
});

/* =========================================================
   Scenario 4: Violated SUBSET_OF — food adjustment scope
   ========================================================= */

describe("Scenario 4 — violated SUBSET_OF: adjustment scope — out-of-scope food adjusted", () => {
  const baselineFoods = ["chicken", "rice", "broccoli"];
  const candidateAdjusted = ["chicken", "rice", "broccoli", "pasta"];

  const expr: ConstraintExpression<string[]> = {
    constraintId: "ALLOWED_ACTION:adjustment_scope",
    key: "adjustment_scope",
    variableName: "adjustment scope",
    violationLabel: "adjustment scope violation",
    operator: "SUBSET_OF",
    baselineValue: baselineFoods,
    candidateValue: candidateAdjusted,
  };

  it("compareFoodAdjustmentScope detects out-of-scope food", () => {
    const diff = compareFoodAdjustmentScope(baselineFoods, candidateAdjusted);
    expect(diff.equal).toBe(false);
    expect(diff.added).toContain("pasta");
  });

  it("diff.summary mentions the out-of-scope food", () => {
    const diff = compareFoodAdjustmentScope(baselineFoods, candidateAdjusted);
    expect(diff.summary.toLowerCase()).toContain("pasta");
  });

  it("result.satisfactionStatus is 'violated'", () => {
    const diff = compareFoodAdjustmentScope(baselineFoods, candidateAdjusted);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.satisfactionStatus).toBe("violated");
  });

  it("result.decisiveVariable is 'adjustment scope violation'", () => {
    const diff = compareFoodAdjustmentScope(baselineFoods, candidateAdjusted);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.decisiveVariable).toBe("adjustment scope violation");
  });

  it("result.explanation references 'adjustment scope' and the diff summary", () => {
    const diff = compareFoodAdjustmentScope(baselineFoods, candidateAdjusted);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.explanation.toLowerCase()).toContain("adjustment scope");
    expect(result.explanation).toContain(diff.summary);
  });

  it("result.suggestedRepair mentions the out-of-scope food", () => {
    const diff = compareFoodAdjustmentScope(baselineFoods, candidateAdjusted);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.suggestedRepair?.toLowerCase()).toContain("pasta");
  });

  it("result.suggestedRepair does not contain 'violation'", () => {
    const diff = compareFoodAdjustmentScope(baselineFoods, candidateAdjusted);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.suggestedRepair?.toLowerCase()).not.toContain("violation");
  });

  it("no out-of-scope → satisfied with null decisiveVariable", () => {
    const inScope = ["chicken", "rice"];
    const diff = compareFoodAdjustmentScope(baselineFoods, inScope);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.satisfactionStatus).toBe("satisfied");
    expect(result.decisiveVariable).toBeNull();
  });

  it("no invariant violations", () => {
    const diff = compareFoodAdjustmentScope(baselineFoods, candidateAdjusted);
    const result = buildConstraintCheckResult(expr, diff);
    expect(assertConstraintCheckResultInvariants(result)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 5: Violated MINIMIZE_ABS_DELTA — calorie delta
   ========================================================= */

describe("Scenario 5 — violated MINIMIZE_ABS_DELTA: calorie delta", () => {
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

  it("compareCalories reports delta of 150", () => {
    const diff = compareCalories(target, actual);
    expect(diff.equal).toBe(false);
    expect(diff.delta).toBe(150);
  });

  it("diff.summary says 'above target'", () => {
    const diff = compareCalories(target, actual);
    expect(diff.summary.toLowerCase()).toContain("above");
    expect(diff.summary).toContain("150");
  });

  it("result.satisfactionStatus is 'violated'", () => {
    const diff = compareCalories(target, actual);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.satisfactionStatus).toBe("violated");
  });

  it("result.decisiveVariable is 'calorie delta violation'", () => {
    const diff = compareCalories(target, actual);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.decisiveVariable).toBe("calorie delta violation");
  });

  it("result.explanation references 'calorie delta' and the diff summary", () => {
    const diff = compareCalories(target, actual);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.explanation.toLowerCase()).toContain("calorie delta");
    expect(result.explanation).toContain(diff.summary);
  });

  it("result.suggestedRepair says 'Reduce calorie delta by 150'", () => {
    const diff = compareCalories(target, actual);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.suggestedRepair).toContain("150");
    expect(result.suggestedRepair?.toLowerCase()).toContain("reduce");
  });

  it("result.suggestedRepair does not contain 'violation'", () => {
    const diff = compareCalories(target, actual);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.suggestedRepair?.toLowerCase()).not.toContain("violation");
  });

  it("baselineValue=target and candidateValue=actual are preserved", () => {
    const diff = compareCalories(target, actual);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.baselineValue).toBe(target);
    expect(result.candidateValue).toBe(actual);
    expect(result.diff.delta).toBe(150);
  });

  it("exact match → satisfied, null decisiveVariable, null suggestedRepair", () => {
    const diff = compareCalories(2000, 2000);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.satisfactionStatus).toBe("satisfied");
    expect(result.decisiveVariable).toBeNull();
    expect(result.suggestedRepair).toBeNull();
  });

  it("no invariant violations", () => {
    const diff = compareCalories(target, actual);
    const result = buildConstraintCheckResult(expr, diff);
    expect(assertConstraintCheckResultInvariants(result)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 6: Violated SOURCE_PRIORITY — macro source conflict
   ========================================================= */

describe("Scenario 6 — violated SOURCE_PRIORITY: macro source conflict", () => {
  const declaredSource = "declared";
  const actualSource = "estimated";

  const expr: ConstraintExpression<string> = {
    constraintId: "SOURCE_TRUTH:declared_macros_override",
    key: "declared_macros_override",
    variableName: "macro source",
    violationLabel: "macro source violation",
    operator: "SOURCE_PRIORITY",
    baselineValue: declaredSource,
    candidateValue: actualSource,
  };

  it("compareMacroSourcePriority detects the conflict", () => {
    const diff = compareMacroSourcePriority(declaredSource, actualSource);
    expect(diff.equal).toBe(false);
  });

  it("diff.summary mentions both declared and actual source", () => {
    const diff = compareMacroSourcePriority(declaredSource, actualSource);
    expect(diff.summary).toContain("declared");
    expect(diff.summary).toContain("estimated");
  });

  it("result.satisfactionStatus is 'violated'", () => {
    const diff = compareMacroSourcePriority(declaredSource, actualSource);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.satisfactionStatus).toBe("violated");
  });

  it("result.decisiveVariable is 'macro source violation'", () => {
    const diff = compareMacroSourcePriority(declaredSource, actualSource);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.decisiveVariable).toBe("macro source violation");
  });

  it("result.variableName is 'macro source' — not 'macro source violation'", () => {
    const diff = compareMacroSourcePriority(declaredSource, actualSource);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.variableName).toBe("macro source");
    expect(result.variableName).not.toContain("violation");
  });

  it("result.explanation references 'macro source' and the conflict detail", () => {
    const diff = compareMacroSourcePriority(declaredSource, actualSource);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.explanation.toLowerCase()).toContain("macro source");
    expect(result.explanation).toContain(diff.summary);
  });

  it("result.explanation does not say 'was altered'", () => {
    const diff = compareMacroSourcePriority(declaredSource, actualSource);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.explanation.toLowerCase()).not.toContain("was altered");
  });

  it("result.suggestedRepair references 'macro source' and does not contain 'violation'", () => {
    const diff = compareMacroSourcePriority(declaredSource, actualSource);
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.suggestedRepair?.toLowerCase()).toContain("macro source");
    expect(result.suggestedRepair?.toLowerCase()).not.toContain("violation");
  });

  it("matching source → satisfied, null decisiveVariable", () => {
    const diff = compareMacroSourcePriority("declared", "declared");
    const result = buildConstraintCheckResult(expr, diff);
    expect(result.satisfactionStatus).toBe("satisfied");
    expect(result.decisiveVariable).toBeNull();
  });

  it("no invariant violations", () => {
    const diff = compareMacroSourcePriority(declaredSource, actualSource);
    const result = buildConstraintCheckResult(expr, diff);
    expect(assertConstraintCheckResultInvariants(result)).toHaveLength(0);
  });
});

/* =========================================================
   Cross-cutting: variableName invariant A1 fires when violated
   ========================================================= */

describe("Invariant A1 — variableName must never contain 'violation'", () => {
  it("A1 fires when variableName is set to violationLabel accidentally", () => {
    const result = buildConstraintCheckResult(
      {
        constraintId: "x",
        key: "x",
        variableName: "protein placement violation", // WRONG — bug under test
        violationLabel: "protein placement violation violation",
        operator: "MUST_EQUAL",
        baselineValue: {},
        candidateValue: {},
      },
      { equal: false, summary: "test diff" }
    );
    const violations = assertConstraintCheckResultInvariants(result);
    expect(violations.some((v) => v.invariant === "A1")).toBe(true);
  });

  it("A1 does NOT fire for a clean variableName", () => {
    const expr = makeProteinExpr({ "2": ["whey"] }, { "2": [] });
    const diff = compareProteinPlacementMap({ "2": ["whey"] }, { "2": [] });
    const result = buildConstraintCheckResult(expr, diff);
    const violations = assertConstraintCheckResultInvariants(result);
    expect(violations.some((v) => v.invariant === "A1")).toBe(false);
  });
});

/* =========================================================
   Meal count diff (standalone)
   ========================================================= */

describe("compareMealCount — standalone", () => {
  it("equal counts → equal: true, delta: 0", () => {
    const diff = compareMealCount(4, 4);
    expect(diff.equal).toBe(true);
    expect(diff.delta).toBe(0);
  });

  it("removed meal → equal: false, delta: -1", () => {
    const diff = compareMealCount(4, 3);
    expect(diff.equal).toBe(false);
    expect(diff.delta).toBe(-1);
    expect(diff.summary.toLowerCase()).toContain("removed");
  });

  it("added meal → equal: false, delta: +1", () => {
    const diff = compareMealCount(4, 5);
    expect(diff.equal).toBe(false);
    expect(diff.delta).toBe(1);
    expect(diff.summary.toLowerCase()).toContain("added");
  });
});
