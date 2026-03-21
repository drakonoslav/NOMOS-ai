/**
 * baseline_trace.ts
 *
 * Builds ConstraintTrace records from ConstraintCheckResult objects.
 *
 * A ConstraintTrace is a self-contained proof record for one evaluated constraint.
 * It holds:
 *   - baseline state (what was declared)
 *   - candidate state (what was evaluated)
 *   - diff summary (one sentence)
 *   - proof lines (explicit logical steps)
 *   - suggested repair (null when satisfied)
 *
 * Proof lines are derived from variable + diff data — never from violationLabel prose.
 *
 * Architecture:
 *   ConstraintCheckResult<T>  →  buildConstraintTrace()  →  ConstraintTrace
 *
 * Specialized builders exist for structured variable types:
 *   - buildProteinPlacementTrace   (ProteinPlacementMap, MUST_EQUAL)
 *   - buildMealOrderTrace          (MealOrder, MUST_EQUAL)
 *   - buildMealCountTrace          (number, MUST_EQUAL)
 *   - buildCalorieTrace            (number, MINIMIZE_ABS_DELTA)
 *   - buildFoodAdjustmentTrace     (string[], SUBSET_OF)
 *   - buildMacroSourceTrace        (string, SOURCE_PRIORITY)
 *
 * All others route through the generic buildConstraintTrace() which produces
 * proof lines from the diff summary and satisfaction status.
 */

import type { ConstraintCheckResult } from "./constraint_algebra";
import type { ConstraintTrace } from "../evaluation/evaluation_report_types";
import type { ProteinPlacementMap, MealOrder } from "./diff_engine";

/* =========================================================
   Generic entry point
   ========================================================= */

/**
 * Builds a ConstraintTrace from any ConstraintCheckResult.
 * For structured variable types, prefer the specialized builders below —
 * they produce more specific proof lines.
 */
export function buildConstraintTrace<T>(
  result: ConstraintCheckResult<T>
): ConstraintTrace {
  return {
    constraintId: result.constraintId,
    key: result.key,
    variableName: result.variableName,
    violationLabel: result.violationLabel,
    operator: result.operator,
    baselineState: result.baselineValue,
    candidateState: result.candidateValue,
    diffSummary: result.diff.summary,
    proofLines: buildGenericProofLines(result),
    suggestedRepair: result.suggestedRepair,
  };
}

function buildGenericProofLines<T>(result: ConstraintCheckResult<T>): string[] {
  const varName = result.variableName;
  const op = result.operator;
  const violated = result.satisfactionStatus === "violated";

  if (!violated) {
    return [
      "No violation detected.",
      result.diff.summary,
      `Constraint ${op} on ${varName} is satisfied.`,
    ];
  }

  return [
    result.diff.summary,
    `Constraint ${op} on ${varName} is violated.`,
  ];
}

/* =========================================================
   Specialized: protein placement
   ========================================================= */

/**
 * Builds a ConstraintTrace for a protein placement MUST_EQUAL constraint.
 *
 * Generates per-food movement proof lines:
 *   "Baseline meal 2 contains whey."
 *   "Candidate meal 2 does not contain whey."
 *   "Candidate meal 7 contains whey."
 *   "Therefore whey moved from meal 2 to meal 7."
 *   "Constraint MUST_EQUAL on protein placement is violated."
 */
export function buildProteinPlacementTrace(
  baseline: ProteinPlacementMap,
  candidate: ProteinPlacementMap,
  result: ConstraintCheckResult<ProteinPlacementMap>
): ConstraintTrace {
  return {
    constraintId: result.constraintId,
    key: result.key,
    variableName: result.variableName,
    violationLabel: result.violationLabel,
    operator: result.operator,
    baselineState: baseline,
    candidateState: candidate,
    diffSummary: result.diff.summary,
    proofLines: buildProteinPlacementProofLines(baseline, candidate, result),
    suggestedRepair: result.suggestedRepair,
  };
}

function buildProteinPlacementProofLines(
  baseline: ProteinPlacementMap,
  candidate: ProteinPlacementMap,
  result: ConstraintCheckResult<ProteinPlacementMap>
): string[] {
  const violated = result.satisfactionStatus === "violated";

  if (!violated) {
    return [
      "No violation detected.",
      "Protein placement matches baseline across all meals.",
      `Constraint ${result.operator} on protein placement is satisfied.`,
    ];
  }

  const lines: string[] = [];
  const allMeals = new Set([...Object.keys(baseline), ...Object.keys(candidate)]);

  // Build food → meals maps to detect cross-meal movement
  const baselineByFood = new Map<string, string[]>();
  const candidateByFood = new Map<string, string[]>();

  for (const meal of allMeals) {
    for (const food of baseline[meal] ?? []) {
      if (!baselineByFood.has(food)) baselineByFood.set(food, []);
      baselineByFood.get(food)!.push(meal);
    }
    for (const food of candidate[meal] ?? []) {
      if (!candidateByFood.has(food)) candidateByFood.set(food, []);
      candidateByFood.get(food)!.push(meal);
    }
  }

  // Per-food proof lines for foods that changed meals
  const allFoods = new Set([...baselineByFood.keys(), ...candidateByFood.keys()]);

  for (const food of [...allFoods].sort()) {
    const bMeals = (baselineByFood.get(food) ?? []).sort(numerically);
    const cMeals = (candidateByFood.get(food) ?? []).sort(numerically);

    // Check if this food's meal set changed
    const bStr = bMeals.join(",");
    const cStr = cMeals.join(",");
    if (bStr === cStr) continue;

    const cap = capitalize(food);

    // Meals where food was removed (in baseline, not in candidate)
    const removedFrom = bMeals.filter((m) => !cMeals.includes(m));
    // Meals where food was added (in candidate, not in baseline)
    const addedTo = cMeals.filter((m) => !bMeals.includes(m));

    for (const meal of removedFrom) {
      lines.push(`Baseline meal ${meal} contains ${food}.`);
      lines.push(`Candidate meal ${meal} does not contain ${food}.`);
    }

    for (const meal of addedTo) {
      lines.push(`Candidate meal ${meal} contains ${food}.`);
    }

    // Movement summary
    if (removedFrom.length > 0 && addedTo.length > 0) {
      lines.push(
        `Therefore ${food} moved from meal ${removedFrom.join(", ")} to meal ${addedTo.join(", ")}.`
      );
    } else if (removedFrom.length > 0) {
      lines.push(`Therefore ${food} was removed from meal ${removedFrom.join(", ")}.`);
    } else if (addedTo.length > 0) {
      lines.push(`Therefore ${cap} was added to meal ${addedTo.join(", ")} without baseline precedent.`);
    }
  }

  lines.push(`Constraint ${result.operator} on protein placement is violated.`);
  return lines;
}

/* =========================================================
   Specialized: meal order
   ========================================================= */

/**
 * Builds a ConstraintTrace for a meal order MUST_EQUAL constraint.
 *
 * Proof lines show baseline order, candidate order, and first differing position:
 *   "Baseline order: meal1, meal2, meal3."
 *   "Candidate order: meal1, meal3, meal2."
 *   "First differing position: index 1 — expected meal2, found meal3."
 *   "Constraint MUST_EQUAL on meal order is violated."
 */
export function buildMealOrderTrace(
  baseline: MealOrder,
  candidate: MealOrder,
  result: ConstraintCheckResult<MealOrder>
): ConstraintTrace {
  return {
    constraintId: result.constraintId,
    key: result.key,
    variableName: result.variableName,
    violationLabel: result.violationLabel,
    operator: result.operator,
    baselineState: baseline,
    candidateState: candidate,
    diffSummary: result.diff.summary,
    proofLines: buildMealOrderProofLines(baseline, candidate, result),
    suggestedRepair: result.suggestedRepair,
  };
}

function buildMealOrderProofLines(
  baseline: MealOrder,
  candidate: MealOrder,
  result: ConstraintCheckResult<MealOrder>
): string[] {
  const violated = result.satisfactionStatus === "violated";

  if (!violated) {
    return [
      "No violation detected.",
      `Meal order matches baseline: ${baseline.join(", ")}.`,
      `Constraint ${result.operator} on meal order is satisfied.`,
    ];
  }

  const lines: string[] = [
    `Baseline order: ${baseline.join(", ")}.`,
    `Candidate order: ${candidate.join(", ")}.`,
  ];

  // Find first differing position
  const maxLen = Math.max(baseline.length, candidate.length);
  for (let i = 0; i < maxLen; i++) {
    const b = baseline[i];
    const c = candidate[i];
    if (b !== c) {
      if (b === undefined) {
        lines.push(`Index ${i}: candidate has extra meal "${c}".`);
      } else if (c === undefined) {
        lines.push(`Index ${i}: candidate is missing meal "${b}".`);
      } else {
        lines.push(`First differing position: index ${i} — expected "${b}", found "${c}".`);
      }
      break;
    }
  }

  if (result.diff.changed && Array.isArray(result.diff.changed) && (result.diff.changed as string[]).length > 0) {
    lines.push(`Reordered meals: ${(result.diff.changed as string[]).join(", ")}.`);
  }

  lines.push(`Constraint ${result.operator} on meal order is violated.`);
  return lines;
}

/* =========================================================
   Specialized: meal count
   ========================================================= */

/**
 * Builds a ConstraintTrace for a meal count MUST_EQUAL constraint.
 *
 * Proof lines:
 *   "Baseline meal count: 4."
 *   "Candidate meal count: 3."
 *   "1 meal removed."
 *   "Constraint MUST_EQUAL on meal count is violated."
 */
export function buildMealCountTrace(
  baseline: number,
  candidate: number,
  result: ConstraintCheckResult<number>
): ConstraintTrace {
  return {
    constraintId: result.constraintId,
    key: result.key,
    variableName: result.variableName,
    violationLabel: result.violationLabel,
    operator: result.operator,
    baselineState: baseline,
    candidateState: candidate,
    diffSummary: result.diff.summary,
    proofLines: buildMealCountProofLines(baseline, candidate, result),
    suggestedRepair: result.suggestedRepair,
  };
}

function buildMealCountProofLines(
  baseline: number,
  candidate: number,
  result: ConstraintCheckResult<number>
): string[] {
  const violated = result.satisfactionStatus === "violated";

  if (!violated) {
    return [
      "No violation detected.",
      `Meal count is ${baseline} — matches baseline.`,
      `Constraint ${result.operator} on meal count is satisfied.`,
    ];
  }

  const delta = result.diff.delta ?? (candidate - baseline);
  const direction = delta < 0 ? "removed" : "added";
  const count = Math.abs(delta);

  return [
    `Baseline meal count: ${baseline}.`,
    `Candidate meal count: ${candidate}.`,
    `${count} meal${count > 1 ? "s" : ""} ${direction}.`,
    `Constraint ${result.operator} on meal count is violated.`,
  ];
}

/* =========================================================
   Specialized: calorie delta
   ========================================================= */

/**
 * Builds a ConstraintTrace for a calorie lockdown MINIMIZE_ABS_DELTA constraint.
 *
 * Proof lines:
 *   "Calorie target: 2000 kcal."
 *   "Candidate calories: 2150 kcal."
 *   "Absolute delta: 150 kcal above target."
 *   "Constraint MINIMIZE_ABS_DELTA on calorie delta is violated."
 */
export function buildCalorieTrace(
  target: number,
  actual: number,
  result: ConstraintCheckResult<number>
): ConstraintTrace {
  return {
    constraintId: result.constraintId,
    key: result.key,
    variableName: result.variableName,
    violationLabel: result.violationLabel,
    operator: result.operator,
    baselineState: target,
    candidateState: actual,
    diffSummary: result.diff.summary,
    proofLines: buildCalorieProofLines(target, actual, result),
    suggestedRepair: result.suggestedRepair,
  };
}

function buildCalorieProofLines(
  target: number,
  actual: number,
  result: ConstraintCheckResult<number>
): string[] {
  const violated = result.satisfactionStatus === "violated";

  if (!violated) {
    return [
      "No violation detected.",
      `Calories match target: ${target} kcal.`,
      `Constraint ${result.operator} on calorie delta is satisfied.`,
    ];
  }

  const delta = result.diff.delta ?? (actual - target);
  const absDelta = Math.abs(delta);
  const direction = delta > 0 ? "above" : "below";

  return [
    `Calorie target: ${target} kcal.`,
    `Candidate calories: ${actual} kcal.`,
    `Absolute delta: ${absDelta} kcal ${direction} target.`,
    `Constraint ${result.operator} on calorie delta is violated.`,
  ];
}

/* =========================================================
   Specialized: food adjustment scope
   ========================================================= */

/**
 * Builds a ConstraintTrace for a food adjustment scope SUBSET_OF constraint.
 *
 * Proof lines:
 *   "Declared baseline foods: chicken, rice, broccoli."
 *   "Candidate adjusted foods: chicken, rice, broccoli, pasta."
 *   "Out-of-scope additions: pasta."
 *   "Pasta is not declared in the baseline plan."
 *   "Constraint SUBSET_OF on adjustment scope is violated."
 */
export function buildFoodAdjustmentTrace(
  allowed: string[],
  adjusted: string[],
  result: ConstraintCheckResult<string[]>
): ConstraintTrace {
  return {
    constraintId: result.constraintId,
    key: result.key,
    variableName: result.variableName,
    violationLabel: result.violationLabel,
    operator: result.operator,
    baselineState: allowed,
    candidateState: adjusted,
    diffSummary: result.diff.summary,
    proofLines: buildFoodAdjustmentProofLines(allowed, adjusted, result),
    suggestedRepair: result.suggestedRepair,
  };
}

function buildFoodAdjustmentProofLines(
  allowed: string[],
  adjusted: string[],
  result: ConstraintCheckResult<string[]>
): string[] {
  const violated = result.satisfactionStatus === "violated";

  if (!violated) {
    return [
      "No violation detected.",
      "All adjusted foods are within the declared baseline scope.",
      `Constraint ${result.operator} on adjustment scope is satisfied.`,
    ];
  }

  const outOfScope = Array.isArray(result.diff.added)
    ? (result.diff.added as string[])
    : [];

  const lines: string[] = [
    `Declared baseline foods: ${allowed.join(", ") || "(none)"}.`,
    `Candidate adjusted foods: ${adjusted.join(", ") || "(none)"}.`,
    `Out-of-scope additions: ${outOfScope.join(", ") || "(none)"}.`,
  ];

  for (const food of outOfScope) {
    lines.push(`${capitalize(food)} is not declared in the baseline plan.`);
  }

  lines.push(`Constraint ${result.operator} on adjustment scope is violated.`);
  return lines;
}

/* =========================================================
   Specialized: macro source priority
   ========================================================= */

/**
 * Builds a ConstraintTrace for a macro source SOURCE_PRIORITY constraint.
 *
 * Proof lines:
 *   "Declared macro source: declared."
 *   "Candidate macro source: estimated."
 *   "Source conflict: expected 'declared', found 'estimated'."
 *   "Constraint SOURCE_PRIORITY on macro source is violated."
 */
export function buildMacroSourceTrace(
  declared: string,
  actual: string,
  result: ConstraintCheckResult<string>
): ConstraintTrace {
  return {
    constraintId: result.constraintId,
    key: result.key,
    variableName: result.variableName,
    violationLabel: result.violationLabel,
    operator: result.operator,
    baselineState: declared,
    candidateState: actual,
    diffSummary: result.diff.summary,
    proofLines: buildMacroSourceProofLines(declared, actual, result),
    suggestedRepair: result.suggestedRepair,
  };
}

function buildMacroSourceProofLines(
  declared: string,
  actual: string,
  result: ConstraintCheckResult<string>
): string[] {
  const violated = result.satisfactionStatus === "violated";

  if (!violated) {
    return [
      "No violation detected.",
      `Macro source is "${declared}" as declared.`,
      `Constraint ${result.operator} on macro source is satisfied.`,
    ];
  }

  return [
    `Declared macro source: "${declared}".`,
    `Candidate macro source: "${actual}".`,
    `Source conflict: expected "${declared}", found "${actual}".`,
    `Constraint ${result.operator} on macro source is violated.`,
  ];
}

/* =========================================================
   Helpers
   ========================================================= */

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function numerically(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}
