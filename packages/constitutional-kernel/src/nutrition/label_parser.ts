/**
 * label_parser.ts
 *
 * Converts structured nutrition label data into FoodPrimitive objects.
 *
 * Constitutional role:
 * - Bridges raw label readings (serving size, gram amounts, macro values)
 *   into the typed FoodPrimitive shape used throughout NOMOS.
 * - Computes macrosPerGram for gram-measured foods automatically.
 * - Does not estimate, interpolate, or correct values — source data is
 *   passed in exactly as read from the label.
 * - No image parsing here: the caller supplies the already-read label values.
 */

import { FoodPrimitive, MacroProfile, MacrosPerGram } from "./food_primitive.js";

/* =========================================================
   Raw label input types
   ========================================================= */

/**
 * Structured data as read from a nutrition label for one food.
 */
export interface NutritionLabelEntry {
  /** Stable food identifier. */
  id: string;
  /** Human-readable food name. */
  name: string;
  /**
   * How this food is measured.
   * "g" for gram-measured (powder, grain, seed).
   * "unit" for count-measured (yogurt cup, banana, egg).
   */
  unit: "g" | "unit";
  /**
   * Serving size in grams (for "g" foods) or 1 (for "unit" foods).
   */
  servingAmount: number;
  /** Kilocalories per serving. */
  calories: number;
  /** Protein in grams per serving. */
  protein: number;
  /** Total carbohydrates in grams per serving. */
  carbs: number;
  /** Total fat in grams per serving. */
  fat: number;
  /**
   * Data provenance — pass "label" for verified product labels,
   * "estimated" for values derived from reference databases.
   */
  source: "label" | "estimated";
}

/* =========================================================
   Parser
   ========================================================= */

/**
 * parseLabelEntry — converts one NutritionLabelEntry into a FoodPrimitive.
 *
 * For "g" foods, macrosPerGram is computed by dividing each macro value
 * by the serving size so NOMOS can scale to arbitrary gram amounts.
 *
 * For "unit" foods, macrosPerGram is omitted.
 */
export function parseLabelEntry(entry: NutritionLabelEntry): FoodPrimitive {
  const macrosPerRef: MacroProfile = {
    calories: entry.calories,
    protein:  entry.protein,
    carbs:    entry.carbs,
    fat:      entry.fat,
  };

  let macrosPerGram: MacrosPerGram | undefined;

  if (entry.unit === "g" && entry.servingAmount > 0) {
    const s = entry.servingAmount;
    macrosPerGram = {
      calories: round4(entry.calories / s),
      protein:  round4(entry.protein  / s),
      carbs:    round4(entry.carbs    / s),
      fat:      round4(entry.fat      / s),
    };
  }

  return {
    id:              entry.id,
    name:            entry.name,
    unit:            entry.unit,
    referenceAmount: entry.servingAmount,
    macrosPerRef,
    macrosPerGram,
    source:          entry.source,
  };
}

/**
 * parseLabelEntries — batch version of parseLabelEntry.
 */
export function parseLabelEntries(entries: NutritionLabelEntry[]): FoodPrimitive[] {
  return entries.map(parseLabelEntry);
}

/* =========================================================
   Utility
   ========================================================= */

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
