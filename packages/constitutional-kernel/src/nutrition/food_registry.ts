/**
 * food_registry.ts
 *
 * NOMOS food registry — a queryable map of FoodPrimitive objects.
 *
 * Constitutional role:
 * - Provides a single source of truth for verified and estimated food data.
 * - Label-sourced entries (source: "label") are populated from verified
 *   product nutrition labels and must not be modified without re-verification.
 * - Estimated entries (source: "estimated") use standard reference values and
 *   are clearly separated from label-verified data.
 * - No correction logic here — queries return data exactly as registered.
 *
 * Registry is keyed by foodId for O(1) lookup.
 */

import { FoodPrimitive } from "./food_primitive.js";
import { NutritionLabelEntry, parseLabelEntries } from "./label_parser.js";

/* =========================================================
   Label-verified foods
   Source: product nutrition panels (read directly from label)
   ========================================================= */

const LABEL_ENTRIES: NutritionLabelEntry[] = [
  {
    id:            "whey",
    name:          "Whey Protein",
    unit:          "g",
    servingAmount: 37,
    calories:      140,
    protein:       28,
    carbs:         3,
    fat:           1,
    source:        "label",
  },
  {
    id:            "flax",
    name:          "Ground Flaxseed",
    unit:          "g",
    servingAmount: 14,
    calories:      60,
    protein:       4,
    carbs:         6,
    fat:           1.5,
    source:        "label",
  },
  {
    id:            "oats",
    name:          "Rolled Oats",
    unit:          "g",
    servingAmount: 32,
    calories:      120,
    protein:       4,
    carbs:         22,
    fat:           2,
    source:        "label",
  },
  {
    id:            "dextrin",
    name:          "Cyclic Dextrin",
    unit:          "g",
    servingAmount: 30,
    calories:      120,
    protein:       0,
    carbs:         29,
    fat:           0,
    source:        "label",
  },
  {
    id:            "yogurt",
    name:          "Greek Yogurt",
    unit:          "unit",
    servingAmount: 1,
    calories:      130,
    protein:       20,
    carbs:         6,
    fat:           3,
    source:        "label",
  },
];

/* =========================================================
   Estimated foods
   Source: standard nutritional reference values
   These are not label-verified and are clearly marked.
   ========================================================= */

const ESTIMATED_ENTRIES: NutritionLabelEntry[] = [
  {
    id:            "banana",
    name:          "Banana (medium)",
    unit:          "unit",
    servingAmount: 1,
    calories:      105,
    protein:       1.3,
    carbs:         27,
    fat:           0.4,
    source:        "estimated",
  },
  {
    id:            "egg",
    name:          "Egg (large)",
    unit:          "unit",
    servingAmount: 1,
    calories:      70,
    protein:       6,
    carbs:         0.5,
    fat:           5,
    source:        "estimated",
  },
];

/* =========================================================
   Registry construction
   ========================================================= */

const ALL_PRIMITIVES: FoodPrimitive[] = [
  ...parseLabelEntries(LABEL_ENTRIES),
  ...parseLabelEntries(ESTIMATED_ENTRIES),
];

/**
 * FOOD_REGISTRY — immutable map from foodId → FoodPrimitive.
 *
 * Query using getFoodById() rather than accessing this map directly.
 */
export const FOOD_REGISTRY: Readonly<Record<string, FoodPrimitive>> = Object.freeze(
  Object.fromEntries(ALL_PRIMITIVES.map(f => [f.id, f]))
);

/* =========================================================
   Query API
   ========================================================= */

/**
 * getFoodById — returns the FoodPrimitive for the given id, or undefined
 * if the food is not in the registry.
 */
export function getFoodById(id: string): FoodPrimitive | undefined {
  return FOOD_REGISTRY[id];
}

/**
 * listFoods — returns all registered FoodPrimitive objects.
 * Label-verified foods appear first.
 */
export function listFoods(): FoodPrimitive[] {
  return ALL_PRIMITIVES;
}

/**
 * listLabelFoods — returns only label-verified FoodPrimitive objects.
 */
export function listLabelFoods(): FoodPrimitive[] {
  return ALL_PRIMITIVES.filter(f => f.source === "label");
}

/**
 * listEstimatedFoods — returns only estimated FoodPrimitive objects.
 */
export function listEstimatedFoods(): FoodPrimitive[] {
  return ALL_PRIMITIVES.filter(f => f.source === "estimated");
}
