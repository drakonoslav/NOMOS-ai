/**
 * meal_types.ts
 *
 * Structural types for encoding phase meal plans.
 *
 * These types are the input layer for the macro engine.
 * They carry no computed values — only the encoded plan structure.
 */

import { MacroProfile } from "./food_primitive.js";

/**
 * One food item within a meal, with its measured amount.
 */
export interface MealFoodEntry {
  /** Registry id of the food. Example: "oats", "whey", "dextrin" */
  foodId: string;
  /** Numeric amount. For "g" foods: grams. For "unit" foods: count. */
  amount: number;
  /** Measurement unit matching the food's registry unit. */
  unit: "g" | "unit";
}

/**
 * One meal within a phase day.
 */
export interface MealBlock {
  /** Position in the day. 1-indexed. */
  mealNumber: number;
  /** Human-readable meal label. Example: "Breakfast", "Pre-Lift", "Post-Lift" */
  label: string;
  /** Ordered list of foods in this meal. */
  foods: MealFoodEntry[];
}

/**
 * A complete phase plan covering one representative day.
 *
 * Contains the target macros and the full ordered meal structure.
 */
export interface PhasePlan {
  /** Stable identifier. Example: "phase_1", "phase_offseason" */
  phaseId: string;
  /** Target macros for the phase. Used for delta computation. */
  target: MacroProfile;
  /** Ordered meal blocks for one representative day. */
  meals: MealBlock[];
}
