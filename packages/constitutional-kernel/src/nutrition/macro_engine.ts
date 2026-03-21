/**
 * macro_engine.ts
 *
 * Deterministic macro computation engine for NOMOS nutrition.
 *
 * Constitutional role:
 * - Converts structured meal plan data (MealFoodEntry, MealBlock, PhasePlan)
 *   into exact macro totals using FoodPrimitive values from the registry.
 * - Label-sourced foods use label values. Estimated foods use estimated values.
 *   The registry is the single source of truth for all data — nothing is guessed.
 * - No rounding is applied to internal arithmetic.
 *   round2() is provided for UI display only.
 * - No correction recommendations — this layer computes only.
 *
 * Scaling rules:
 *   unit === "g"    and macrosPerGram exists → macrosPerGram × amount
 *   unit === "g"    and macrosPerGram absent  → (macrosPerRef / referenceAmount) × amount
 *   unit === "unit"                           → macrosPerRef × amount
 */

import { MacroProfile } from "./food_primitive.js";
import { getFoodById } from "./food_registry.js";
import { MealBlock, MealFoodEntry, PhasePlan } from "./meal_types.js";

/* =========================================================
   Result types
   ========================================================= */

/**
 * Signed macro delta: positive = over target, negative = under target.
 */
export interface MacroDelta {
  calories: number;
  protein:  number;
  carbs:    number;
  fat:      number;
}

/**
 * Full computation result for one food entry.
 */
export interface FoodMacroResult {
  foodId:   string;
  amount:   number;
  unit:     "g" | "unit";
  source:   "label" | "estimated";
  macros:   MacroProfile;
}

/**
 * Full computation result for one meal block.
 */
export interface MealMacroResult {
  mealNumber: number;
  label:      string;
  foods:      FoodMacroResult[];
  totals:     MacroProfile;
}

/**
 * Full computation result for one phase plan.
 */
export interface PhaseMacroResult {
  phaseId: string;
  target:  MacroProfile;
  meals:   MealMacroResult[];
  totals:  MacroProfile;
  delta:   MacroDelta;
}

/* =========================================================
   Core functions
   ========================================================= */

/**
 * computeFoodMacros — scales a food's registry macros to the given amount.
 *
 * Throws if the food id is not found in the registry.
 */
export function computeFoodMacros(
  foodId: string,
  amount: number,
  unit: "g" | "unit"
): FoodMacroResult {
  const food = getFoodById(foodId);

  if (!food) {
    throw new Error(
      `computeFoodMacros: food "${foodId}" not found in registry. ` +
      `Add it to food_registry.ts before computing macros.`
    );
  }

  let macros: MacroProfile;

  if (unit === "g") {
    if (food.macrosPerGram) {
      // Fast path: pre-computed per-gram breakdown
      const pg = food.macrosPerGram;
      macros = {
        calories: pg.calories * amount,
        protein:  pg.protein  * amount,
        carbs:    pg.carbs    * amount,
        fat:      pg.fat      * amount,
      };
    } else {
      // Fallback: scale from reference amount
      const ratio = amount / food.referenceAmount;
      macros = {
        calories: food.macrosPerRef.calories * ratio,
        protein:  food.macrosPerRef.protein  * ratio,
        carbs:    food.macrosPerRef.carbs    * ratio,
        fat:      food.macrosPerRef.fat      * ratio,
      };
    }
  } else {
    // unit === "unit": multiply per-unit macros by count
    macros = {
      calories: food.macrosPerRef.calories * amount,
      protein:  food.macrosPerRef.protein  * amount,
      carbs:    food.macrosPerRef.carbs    * amount,
      fat:      food.macrosPerRef.fat      * amount,
    };
  }

  return { foodId, amount, unit, source: food.source, macros };
}

/**
 * computeMealMacros — sums macros for every food in a MealBlock.
 */
export function computeMealMacros(meal: MealBlock): MealMacroResult {
  const foods = meal.foods.map(entry =>
    computeFoodMacros(entry.foodId, entry.amount, entry.unit)
  );

  const totals = sumMacros(foods.map(f => f.macros));

  return {
    mealNumber: meal.mealNumber,
    label:      meal.label,
    foods,
    totals,
  };
}

/**
 * computePhaseMacros — sums macros across all meals in a PhasePlan
 * and computes the delta against the phase target.
 */
export function computePhaseMacros(plan: PhasePlan): PhaseMacroResult {
  const meals  = plan.meals.map(computeMealMacros);
  const totals = sumMacros(meals.map(m => m.totals));
  const delta  = computePhaseDelta(totals, plan.target);

  return {
    phaseId: plan.phaseId,
    target:  plan.target,
    meals,
    totals,
    delta,
  };
}

/**
 * computePhaseDelta — signed difference between actual and target macros.
 *
 * positive → over target
 * negative → under target
 * zero     → exact
 */
export function computePhaseDelta(actual: MacroProfile, target: MacroProfile): MacroDelta {
  return {
    calories: actual.calories - target.calories,
    protein:  actual.protein  - target.protein,
    carbs:    actual.carbs    - target.carbs,
    fat:      actual.fat      - target.fat,
  };
}

/* =========================================================
   UI display helper
   ========================================================= */

/**
 * round2 — rounds a MacroProfile to 2 decimal places for display.
 * Do not use for internal arithmetic.
 */
export function round2(profile: MacroProfile): MacroProfile {
  return {
    calories: r2(profile.calories),
    protein:  r2(profile.protein),
    carbs:    r2(profile.carbs),
    fat:      r2(profile.fat),
  };
}

/**
 * roundDelta2 — rounds a MacroDelta to 2 decimal places for display.
 */
export function roundDelta2(delta: MacroDelta): MacroDelta {
  return {
    calories: r2(delta.calories),
    protein:  r2(delta.protein),
    carbs:    r2(delta.carbs),
    fat:      r2(delta.fat),
  };
}

/* =========================================================
   Internal utilities
   ========================================================= */

function sumMacros(profiles: MacroProfile[]): MacroProfile {
  return profiles.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein:  acc.protein  + m.protein,
      carbs:    acc.carbs    + m.carbs,
      fat:      acc.fat      + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
