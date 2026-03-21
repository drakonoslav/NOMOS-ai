/**
 * food_primitive.ts
 *
 * Core type definitions for the NOMOS nutrition module.
 *
 * A FoodPrimitive is the atomic unit of nutritional data.
 * It represents one food with a verified or estimated macro profile
 * anchored to a specific reference amount (serving size or unit).
 *
 * No correction logic here — this is pure data shape.
 */

/* =========================================================
   Macro profile types
   ========================================================= */

/**
 * Macronutrient values for a specific amount of food.
 */
export interface MacroProfile {
  /** Kilocalories. */
  calories: number;
  /** Protein in grams. */
  protein: number;
  /** Total carbohydrates in grams. */
  carbs: number;
  /** Total fat in grams. */
  fat: number;
}

/**
 * Per-gram macro breakdown, derived from the label serving.
 * Only populated for gram-measured foods (unit === "g").
 *
 * Each value is macros per 1 gram.
 * Example: protein 0.757 means 0.757g of protein per gram of food.
 */
export interface MacrosPerGram {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/* =========================================================
   FoodPrimitive
   ========================================================= */

/**
 * The atomic unit of nutritional data in NOMOS.
 *
 * Represents one food with a verified or estimated macro profile
 * anchored to a specific reference amount.
 */
export interface FoodPrimitive {
  /**
   * Stable identifier used throughout NOMOS evaluation and registry queries.
   * Examples: "whey", "oats", "dextrin", "yogurt", "banana", "egg"
   */
  id: string;

  /**
   * Human-readable name.
   */
  name: string;

  /**
   * How this food is measured:
   *   "g"    — by weight in grams (e.g. protein powder, oats, flax)
   *   "unit" — by count (e.g. yogurt cup, banana, egg)
   */
  unit: "g" | "unit";

  /**
   * Amount of food the macrosPerRef values are anchored to.
   *   For "g" foods:    serving weight in grams (e.g. 37, 14, 32, 30)
   *   For "unit" foods: 1 (one serving unit)
   */
  referenceAmount: number;

  /**
   * Macronutrient profile for exactly referenceAmount of this food.
   */
  macrosPerRef: MacroProfile;

  /**
   * Per-gram macro breakdown for scaling to arbitrary weights.
   * Computed as macrosPerRef / referenceAmount.
   * Undefined for "unit" foods where gram precision is not meaningful.
   */
  macrosPerGram?: MacrosPerGram;

  /**
   * Provenance of the macro data.
   *   "label"     — taken directly from a verified product nutrition label.
   *   "estimated" — derived from standard reference databases or estimates.
   */
  source: "label" | "estimated";
}
