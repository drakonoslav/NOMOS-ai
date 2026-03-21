/**
 * meal_plan_parser.ts
 *
 * Converts raw phase meal declarations into validated PhasePlan objects.
 *
 * Constitutional role:
 * - Bridges the human-declared meal plan (numbers, food ids, amounts)
 *   into the typed PhasePlan shape the macro engine consumes.
 * - Validates all foodIds against the live food registry at parse time.
 *   An unknown foodId is a hard error — not silently ignored.
 * - Does not compute macros.
 * - Does not modify gram amounts.
 * - Does not reorder meals or foods.
 *
 * Usage:
 *   const plan = parsePhasePlan(rawPhase);
 *   const registry = parsePhaseRegistry(rawPhases);
 */

import { getFoodById } from "./food_registry.js";
import { MealFoodEntry, MealBlock, PhasePlan, PhaseTarget } from "./meal_types.js";

/* =========================================================
   Raw input types
   ========================================================= */

/**
 * A single food entry as declared in a raw phase plan.
 * Mirrors MealFoodEntry exactly — kept separate so the parser
 * can validate before producing the typed output.
 */
export interface RawMealFood {
  foodId: string;
  amount: number;
  unit:   "g" | "unit";
}

/**
 * A single meal as declared in a raw phase plan.
 */
export interface RawMeal {
  mealNumber: number;
  label:      string;
  foods:      RawMealFood[];
}

/**
 * A full phase plan as declared — one day of eating for this phase.
 */
export interface RawPhase {
  phaseId: string;
  target:  PhaseTarget;
  meals:   RawMeal[];
}

/* =========================================================
   Validation
   ========================================================= */

export interface ParseError {
  phaseId: string;
  meal:    number;
  foodId:  string;
  reason:  string;
}

function validateFoodEntry(
  phaseId: string,
  mealNumber: number,
  raw: RawMealFood
): ParseError | null {
  const food = getFoodById(raw.foodId);
  if (!food) {
    return {
      phaseId,
      meal:   mealNumber,
      foodId: raw.foodId,
      reason: `foodId "${raw.foodId}" is not registered in the food registry.`,
    };
  }
  if (food.unit !== raw.unit) {
    return {
      phaseId,
      meal:   mealNumber,
      foodId: raw.foodId,
      reason: `unit mismatch: registry expects "${food.unit}" but declaration uses "${raw.unit}".`,
    };
  }
  if (raw.amount <= 0) {
    return {
      phaseId,
      meal:   mealNumber,
      foodId: raw.foodId,
      reason: `amount must be > 0, got ${raw.amount}.`,
    };
  }
  return null;
}

/* =========================================================
   Parser
   ========================================================= */

/**
 * parsePhasePlan — converts one RawPhase into a validated PhasePlan.
 *
 * Throws if any foodId is not in the registry or unit does not match.
 * Preserves meal order, food order, and all amounts exactly as declared.
 */
export function parsePhasePlan(raw: RawPhase): PhasePlan {
  const errors: ParseError[] = [];

  const meals: MealBlock[] = raw.meals.map(rawMeal => {
    const foods: MealFoodEntry[] = rawMeal.foods.map(rawFood => {
      const err = validateFoodEntry(raw.phaseId, rawMeal.mealNumber, rawFood);
      if (err) errors.push(err);
      return {
        foodId: rawFood.foodId,
        amount: rawFood.amount,
        unit:   rawFood.unit,
      };
    });

    return {
      mealNumber: rawMeal.mealNumber,
      label:      rawMeal.label,
      foods,
    };
  });

  if (errors.length > 0) {
    const msg = errors
      .map(e => `  [${e.phaseId} meal${e.meal} ${e.foodId}] ${e.reason}`)
      .join("\n");
    throw new Error(`parsePhasePlan: validation errors in "${raw.phaseId}":\n${msg}`);
  }

  return {
    phaseId: raw.phaseId,
    target:  raw.target,
    meals,
  };
}

/**
 * parsePhaseRegistry — batch-parses an array of RawPhase declarations.
 *
 * Returns a Record keyed by phaseId for O(1) lookup.
 * Throws on the first phase with validation errors.
 */
export function parsePhaseRegistry(raws: RawPhase[]): Record<string, PhasePlan> {
  const result: Record<string, PhasePlan> = {};
  for (const raw of raws) {
    result[raw.phaseId] = parsePhasePlan(raw);
  }
  return result;
}
