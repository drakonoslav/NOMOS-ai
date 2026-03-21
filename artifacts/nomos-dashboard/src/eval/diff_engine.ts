/**
 * diff_engine.ts
 *
 * Per-variable diff functions for the NOMOS constraint algebra.
 *
 * Each function compares a baseline state to a candidate state for a single
 * variable and returns a DiffResult<T> with:
 *   - equal: boolean
 *   - added / removed / changed: typed structural diff data
 *   - delta: numeric difference (MINIMIZE_ABS_DELTA only)
 *   - summary: human-readable diff description
 *
 * Summaries are derived from diff data — never from violation labels.
 *
 * Correct:   "Whey moved from meal 2 to meal 7."
 * Incorrect: "protein placement violation was altered"
 */

import type { DiffResult } from "./constraint_algebra";

/* =========================================================
   Named types for each variable domain
   ========================================================= */

/**
 * Protein placement map: mealNumber → protein-bearing food names present in that meal.
 * Example: { "2": ["whey"], "3": ["yogurt", "whey"], "4": ["whey"] }
 */
export type ProteinPlacementMap = Record<string, string[]>;

/**
 * Ordered list of meal identifiers (e.g. ["meal1", "meal2", "meal3"]).
 */
export type MealOrder = string[];

/**
 * Meal dispersal map: mealNumber → time-block label.
 * Example: { "1": "morning", "2": "midday", "3": "evening" }
 */
export type MealDispersal = Record<string, string>;

/* =========================================================
   1. Protein placement map diff
   ========================================================= */

/**
 * Compares two protein placement maps.
 * Detects which protein-bearing foods moved between meals.
 *
 * Produces movement-aware summaries:
 *   "Whey moved from meal 2 to meal 7."
 *   "Yogurt removed from meal 3."
 *   "Whey added to meal 5."
 */
export function compareProteinPlacementMap(
  baseline: ProteinPlacementMap,
  candidate: ProteinPlacementMap
): DiffResult<ProteinPlacementMap> {
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

  // Per-meal additions and removals
  const added: Record<string, string[]> = {};
  const removed: Record<string, string[]> = {};

  for (const meal of allMeals) {
    const baselineFoods = new Set(baseline[meal] ?? []);
    const candidateFoods = new Set(candidate[meal] ?? []);

    for (const food of baselineFoods) {
      if (!candidateFoods.has(food)) {
        (removed[meal] ??= []).push(food);
      }
    }
    for (const food of candidateFoods) {
      if (!baselineFoods.has(food)) {
        (added[meal] ??= []).push(food);
      }
    }
  }

  const hasAdded = Object.keys(added).length > 0;
  const hasRemoved = Object.keys(removed).length > 0;

  if (!hasAdded && !hasRemoved) {
    return { equal: true, summary: "Protein placement unchanged." };
  }

  // Build movement-aware summary
  const summaryParts: string[] = [];
  const allFoods = new Set([...baselineByFood.keys(), ...candidateByFood.keys()]);

  for (const food of [...allFoods].sort()) {
    const bMeals = (baselineByFood.get(food) ?? []).sort(numerically);
    const cMeals = (candidateByFood.get(food) ?? []).sort(numerically);
    const bStr = bMeals.join(", ");
    const cStr = cMeals.join(", ");
    if (bStr === cStr) continue;

    const label = capitalize(food);
    if (bMeals.length > 0 && cMeals.length > 0) {
      summaryParts.push(`${label} moved from meal ${bStr} to meal ${cStr}.`);
    } else if (bMeals.length > 0) {
      summaryParts.push(`${label} removed from meal ${bStr}.`);
    } else {
      summaryParts.push(`${label} added to meal ${cStr}.`);
    }
  }

  return {
    equal: false,
    added: hasAdded ? added : undefined,
    removed: hasRemoved ? removed : undefined,
    summary: summaryParts.join(" ") || "Protein placement differs from baseline.",
  };
}

/* =========================================================
   2. Meal order diff
   ========================================================= */

/**
 * Compares two ordered meal sequences.
 * Detects reorderings, additions, and removals.
 */
export function compareMealOrder(
  baseline: MealOrder,
  candidate: MealOrder
): DiffResult<MealOrder> {
  const same =
    baseline.length === candidate.length && baseline.every((m, i) => m === candidate[i]);

  if (same) return { equal: true, summary: "Meal order unchanged." };

  const added: string[] = candidate.filter((m) => !baseline.includes(m));
  const removed: string[] = baseline.filter((m) => !candidate.includes(m));
  const reordered: string[] = candidate.filter(
    (m, i) => baseline.includes(m) && baseline.indexOf(m) !== i
  );

  const parts: string[] = [];
  if (reordered.length > 0) parts.push(`Meals reordered: ${reordered.join(", ")}.`);
  if (added.length > 0) parts.push(`Meals added: ${added.join(", ")}.`);
  if (removed.length > 0) parts.push(`Meals removed: ${removed.join(", ")}.`);

  return {
    equal: false,
    added: added.length > 0 ? added : undefined,
    removed: removed.length > 0 ? removed : undefined,
    changed: reordered.length > 0 ? reordered : undefined,
    summary: parts.join(" ") || "Meal order altered.",
  };
}

/* =========================================================
   3. Meal count diff
   ========================================================= */

/**
 * Compares baseline meal count to candidate meal count.
 * Returns a signed delta (candidate − baseline).
 */
export function compareMealCount(
  baseline: number,
  candidate: number
): DiffResult<number> {
  if (baseline === candidate) {
    return { equal: true, delta: 0, summary: "Meal count unchanged." };
  }
  const delta = candidate - baseline;
  const direction = delta < 0 ? "removed" : "added";
  return {
    equal: false,
    delta,
    summary: `${Math.abs(delta)} meal${Math.abs(delta) > 1 ? "s" : ""} ${direction}. Baseline: ${baseline}, candidate: ${candidate}.`,
  };
}

/* =========================================================
   4. Meal dispersal diff
   ========================================================= */

/**
 * Compares meal dispersal (time-block) patterns.
 * Detects meals whose time-block label changed.
 */
export function compareMealDispersal(
  baseline: MealDispersal,
  candidate: MealDispersal
): DiffResult<MealDispersal> {
  const allMeals = new Set([...Object.keys(baseline), ...Object.keys(candidate)]);
  const changed: Record<string, { baseline: string; candidate: string }> = {};

  for (const meal of allMeals) {
    const b = baseline[meal] ?? "(none)";
    const c = candidate[meal] ?? "(none)";
    if (b !== c) changed[meal] = { baseline: b, candidate: c };
  }

  if (Object.keys(changed).length === 0) {
    return { equal: true, summary: "Meal dispersal unchanged." };
  }

  const parts = Object.entries(changed)
    .sort(([a], [b]) => numerically(a, b))
    .map(([meal, { baseline: b, candidate: c }]) =>
      `Meal ${meal} timeblock changed from "${b}" to "${c}".`
    );

  return {
    equal: false,
    changed,
    summary: parts.join(" "),
  };
}

/* =========================================================
   5. Food adjustment scope diff
   ========================================================= */

/**
 * Compares food adjustment scope.
 * baseline: allowed food ids (declared as present in the baseline plan).
 * candidate: food ids that were actually adjusted.
 * Returns added = foods adjusted but outside the declared scope.
 */
export function compareFoodAdjustmentScope(
  baseline: string[],
  candidate: string[]
): DiffResult<string[]> {
  const baselineSet = new Set(baseline);
  const outOfScope = candidate.filter((f) => !baselineSet.has(f));

  if (outOfScope.length === 0) {
    return { equal: true, summary: "All adjusted foods are within the declared scope." };
  }

  return {
    equal: false,
    added: outOfScope,
    summary: `Foods adjusted outside declared scope: ${outOfScope.join(", ")}.`,
  };
}

/* =========================================================
   6. Calorie diff
   ========================================================= */

/**
 * Compares calorie target to actual value.
 * delta = actual − target (positive = over, negative = under).
 */
export function compareCalories(
  target: number,
  actual: number
): DiffResult<number> {
  const delta = actual - target;
  if (delta === 0) {
    return { equal: true, delta: 0, summary: "Calories match target exactly." };
  }
  const direction = delta > 0 ? "above" : "below";
  return {
    equal: false,
    delta,
    summary: `Calories ${Math.abs(delta)} ${direction} target (target: ${target}, actual: ${actual}).`,
  };
}

/* =========================================================
   7. Macro source priority diff
   ========================================================= */

/**
 * Compares macro source priority.
 * baseline: the declared/required source (e.g. "declared", "label", "estimated").
 * candidate: the actual source used.
 */
export function compareMacroSourcePriority(
  baseline: string,
  candidate: string
): DiffResult<string> {
  if (baseline === candidate) {
    return { equal: true, summary: `Macro source is "${baseline}" as declared.` };
  }
  return {
    equal: false,
    changed: { from: baseline, to: candidate },
    summary: `Source conflict: expected "${baseline}", found "${candidate}".`,
  };
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
