/**
 * constraint_report.ts
 *
 * Builds ConstraintCheckResult from a ConstraintExpression + DiffResult.
 *
 * This is the single place that produces:
 *   - satisfactionStatus  (from evaluateSatisfaction)
 *   - decisiveVariable    (violationLabel when violated, null when satisfied)
 *   - explanation         (from variableName + diff — never from violationLabel)
 *   - suggestedRepair     (variable-level repair — never from violationLabel)
 *
 * Law:
 *   Correct:   "Protein placement differs from baseline. Whey moved from meal 2 to meal 7."
 *   Incorrect: "protein placement violation was altered"
 *
 *   Correct:   "Restore whey to meal 2."
 *   Incorrect: "Restore protein placement violation to its declared state."
 */

import type {
  AlgebraOperator,
  AlgebraInvariantViolation,
  ConstraintCheckResult,
  ConstraintExpression,
  DiffResult,
} from "./constraint_algebra";
import {
  assertConstraintCheckResultInvariants,
  evaluateSatisfaction,
} from "./constraint_algebra";

/* =========================================================
   Entry point
   ========================================================= */

/**
 * Builds a ConstraintCheckResult from a ConstraintExpression and a DiffResult.
 *
 * Produces explanation and suggestedRepair from the variable + diff data.
 * Violations labels are used ONLY for decisiveVariable when violated.
 */
export function buildConstraintCheckResult<T>(
  expr: ConstraintExpression<T>,
  diff: DiffResult<T>
): ConstraintCheckResult<T> {
  const satisfactionStatus = evaluateSatisfaction(expr.operator, diff as DiffResult);
  const violated = satisfactionStatus === "violated";

  return {
    constraintId: expr.constraintId,
    key: expr.key,
    variableName: expr.variableName,
    violationLabel: expr.violationLabel,
    operator: expr.operator,
    baselineValue: expr.baselineValue,
    candidateValue: expr.candidateValue,
    diff,
    satisfactionStatus,
    decisiveVariable: violated ? expr.violationLabel : null,
    explanation: buildExplanation(expr.variableName, expr.operator, diff as DiffResult, violated),
    suggestedRepair: violated ? buildSuggestedRepair(expr.variableName, expr.operator, diff as DiffResult) : null,
  };
}

/**
 * Builds and asserts invariants on the result.
 * Logs invariant violations and returns them alongside the result.
 */
export function buildAndAssertConstraintCheckResult<T>(
  expr: ConstraintExpression<T>,
  diff: DiffResult<T>
): { result: ConstraintCheckResult<T>; violations: AlgebraInvariantViolation[] } {
  const result = buildConstraintCheckResult(expr, diff);
  const violations = assertConstraintCheckResultInvariants(result);
  for (const v of violations) {
    console.error(`[NOMOS:ALGEBRA] Invariant ${v.invariant} violated:`, v.detail);
  }
  return { result, violations };
}

/* =========================================================
   Explanation builder
   Derives text from variableName + operator + diff.
   NEVER embeds violationLabel in prose.
   ========================================================= */

function buildExplanation(
  variableName: string,
  operator: AlgebraOperator,
  diff: DiffResult,
  violated: boolean
): string {
  const varLabel = capitalize(variableName);

  if (!violated) {
    switch (operator) {
      case "MUST_EQUAL":
        return `${varLabel} matches baseline. Structural lock satisfied.`;
      case "SUBSET_OF":
        return `All adjustments are within the declared scope for ${variableName}.`;
      case "MINIMIZE_ABS_DELTA":
        return `${varLabel} is at target. Tolerance satisfied.`;
      case "SOURCE_PRIORITY":
        return `${varLabel} uses the declared source as required.`;
    }
  }

  // Violated — derive explanation from variableName + diff summary
  // Never use violationLabel in the explanation body
  switch (operator) {
    case "MUST_EQUAL":
      return `${varLabel} differs from baseline. ${diff.summary}`;
    case "SUBSET_OF":
      return `${varLabel} exceeds declared adjustment scope. ${diff.summary}`;
    case "MINIMIZE_ABS_DELTA":
      return `${varLabel} deviates from target. ${diff.summary}`;
    case "SOURCE_PRIORITY":
      return `${varLabel} has a source priority conflict. ${diff.summary}`;
  }
}

/* =========================================================
   Repair builder
   Derives repairs from variableName + diff data.
   NEVER uses violationLabel in repair text.
   ========================================================= */

function buildSuggestedRepair(
  variableName: string,
  operator: AlgebraOperator,
  diff: DiffResult
): string {
  switch (operator) {
    case "MUST_EQUAL":
      return buildMustEqualRepair(variableName, diff);

    case "SUBSET_OF": {
      const outOfScope = Array.isArray(diff.added) ? (diff.added as string[]) : [];
      if (outOfScope.length > 0) {
        return (
          `Remove adjustments to out-of-scope ` +
          `food${outOfScope.length > 1 ? "s" : ""}: ${outOfScope.join(", ")}.`
        );
      }
      return `Restrict adjustments to foods declared in the baseline plan.`;
    }

    case "MINIMIZE_ABS_DELTA": {
      if (typeof diff.delta === "number" && diff.delta !== 0) {
        const direction = diff.delta > 0 ? "Reduce" : "Increase";
        return `${direction} ${variableName} by ${Math.abs(diff.delta)} to reach target.`;
      }
      return `Minimize ${variableName} deviation from target.`;
    }

    case "SOURCE_PRIORITY":
      return `Use the declared source for ${variableName} as specified.`;
  }
}

/**
 * Derives a MUST_EQUAL repair from the diff's removed data.
 *
 * If removed is a ProteinPlacementMap-shaped object { mealNumber: food[] }:
 *   → "Restore whey to meal 2. Restore yogurt to meal 3."
 *
 * If removed is a string array:
 *   → "Restore removed items to baseline: meal2, meal3."
 *
 * Fallback uses variableName only — never violationLabel.
 */
function buildMustEqualRepair(variableName: string, diff: DiffResult): string {
  const removed = diff.removed;

  // ProteinPlacementMap shape: { mealNumber: string[] }
  if (
    removed &&
    typeof removed === "object" &&
    !Array.isArray(removed) &&
    Object.values(removed as object).every(Array.isArray)
  ) {
    const mealMap = removed as Record<string, string[]>;
    const repairs: string[] = [];
    for (const [meal, foods] of Object.entries(mealMap).sort(
      ([a], [b]) => Number(a) - Number(b) || a.localeCompare(b)
    )) {
      for (const food of foods) {
        repairs.push(`Restore ${food} to meal ${meal}.`);
      }
    }
    if (repairs.length > 0) return repairs.join(" ");
  }

  // String array: meal identifiers or other ordered items
  if (Array.isArray(removed) && (removed as unknown[]).length > 0) {
    const items = (removed as string[]).join(", ");
    return `Restore removed items to their baseline positions: ${items}.`;
  }

  // Numeric: meal count or other scalar
  if (typeof diff.delta === "number" && diff.delta < 0) {
    return `Restore ${Math.abs(diff.delta)} removed meal${Math.abs(diff.delta) > 1 ? "s" : ""} to the plan.`;
  }

  // Generic fallback — uses variableName, never violationLabel
  return `Restore ${variableName} to its baseline state.`;
}

/* =========================================================
   Helper
   ========================================================= */

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
