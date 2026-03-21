/**
 * correction_constraints.ts
 *
 * Defines what NOMOS is permitted to change when correcting a meal plan.
 *
 * Constitutional role:
 * - Separates what is structurally locked from what is adjustable.
 * - Prohibited actions are explicit and enforced before any correction
 *   is attempted — there is no implicit fallback behavior.
 * - No correction logic here — only the constraint space that governs it.
 *
 * See correction_rules.ts for reasoning preferences (lever priority order).
 */

/* =========================================================
   Locked rule types
   ========================================================= */

/**
 * Identifies an invariant structural rule.
 * These must never be violated — they are not preferences, they are constraints.
 */
export type LockedRuleId =
  | "preserve_meal_order"
  | "preserve_meal_count"
  | "preserve_protein_placements"
  | "preserve_meal_dispersal"
  | "keep_calories_near_target"
  | "do_not_redesign_structure";

export interface LockedRule {
  id:          LockedRuleId;
  description: string;
}

/* =========================================================
   Food lever types
   ========================================================= */

/**
 * A food whose gram or unit amount may be increased or decreased
 * by the correction engine within the bounds declared here.
 */
export interface FoodLever {
  /** Registry foodId of the adjustable food. */
  foodId:     string;
  /** Human-readable label. */
  label:      string;
  /**
   * Minimum amount allowed in any meal that contains this food after correction.
   * Zero means the food may be removed entirely.
   */
  minAmount:  number;
  /** Unit matching the food registry entry. */
  unit:       "g" | "unit";
  /**
   * Optional condition string that must be satisfied before this lever is used.
   * "present_in_phase" means the food must already appear somewhere in the plan.
   */
  condition?: string;
}

/* =========================================================
   Prohibited action types
   ========================================================= */

/**
 * Identifies an action that NOMOS must never take during a correction pass,
 * regardless of macro delta.
 */
export type ProhibitedActionId =
  | "move_whey_between_meals"
  | "remove_whey_from_meals"
  | "introduce_new_foods"
  | "merge_or_collapse_meals"
  | "redesign_meal_structure";

export interface ProhibitedAction {
  id:          ProhibitedActionId;
  description: string;
  /** The specific foodId this prohibition applies to, if food-specific. */
  foodId?:     string;
}

/* =========================================================
   CorrectionConstraints
   ========================================================= */

/**
 * Complete correction constraint set governing one correction pass.
 *
 * All three layers are enforced:
 *   locked    — structurally invariant; violations abort the correction
 *   allowedLevers / optionalLevers — the only foods whose amounts may change
 *   prohibited — actions that must never be taken regardless of delta
 */
export interface CorrectionConstraints {
  /** Structural rules that must never be violated. */
  locked:          LockedRule[];
  /**
   * Foods whose gram or unit amounts may be freely adjusted
   * (within minAmount bounds) to close a macro gap.
   */
  allowedLevers:   FoodLever[];
  /**
   * Foods that may be adjusted only if already present in the plan being corrected.
   * NOMOS must not introduce these foods into a meal that does not currently contain them.
   */
  optionalLevers:  FoodLever[];
  /** Actions that are explicitly forbidden during any correction pass. */
  prohibited:      ProhibitedAction[];
}

/* =========================================================
   DEFAULT_CORRECTION_CONSTRAINTS
   ========================================================= */

/**
 * DEFAULT_CORRECTION_CONSTRAINTS
 *
 * The standard constraint set for NOMOS meal plan correction.
 * Used by the correction engine unless the caller supplies a custom set.
 *
 * Locked rules (6):
 *   preserve_meal_order         — no resequencing of meals
 *   preserve_meal_count         — no adding or removing meals
 *   preserve_protein_placements — protein sources stay where they are
 *   preserve_meal_dispersal     — feeding windows must not collapse
 *   keep_calories_near_target   — total calories must stay within ±5%
 *   do_not_redesign_structure   — the template shape is invariant
 *
 * Allowed levers (4):
 *   oats (min 30g), dextrin (min 0g), flax (min 0g), egg (min 0 units)
 *
 * Optional lever (1):
 *   yogurt — only if already present in the phase being corrected
 *
 * Prohibited actions (5):
 *   move_whey_between_meals     — whey stays in its assigned meals
 *   remove_whey_from_meals      — whey cannot be removed
 *   introduce_new_foods         — no foods outside the current plan may be added
 *   merge_or_collapse_meals     — meals may not be combined
 *   redesign_meal_structure     — the template structure is invariant
 *
 * For lever priority and reasoning preferences, see DEFAULT_CORRECTION_RULES
 * in correction_rules.ts.
 */
export const DEFAULT_CORRECTION_CONSTRAINTS: CorrectionConstraints = {

  locked: [
    {
      id:          "preserve_meal_order",
      description: "Meals must remain in their original numbered order. Resequencing is not permitted.",
    },
    {
      id:          "preserve_meal_count",
      description: "The number of meals per day must not change. No meals may be added or removed.",
    },
    {
      id:          "preserve_protein_placements",
      description:
        "Protein sources (whey, yogurt, egg) must remain in the meals they are currently assigned to. " +
        "Protein timing drives training adaptation and is not subject to macro correction.",
    },
    {
      id:          "preserve_meal_dispersal",
      description:
        "The overall macro distribution across meals must not collapse into fewer feeding windows. " +
        "Corrections must maintain the existing dispersal pattern — no consolidating meals " +
        "or moving food from one window to another.",
    },
    {
      id:          "keep_calories_near_target",
      description:
        "All lever adjustments combined must keep total phase calories within ±5% of the declared target. " +
        "Corrections that fix one macro by introducing a large caloric deviation are not acceptable.",
    },
    {
      id:          "do_not_redesign_structure",
      description:
        "The meal structure template is invariant. NOMOS must not alter meal labels, reorder foods " +
        "within meals, or change the fundamental character of any meal (e.g. converting a pre-lift " +
        "carb meal into a protein meal). Only gram amounts of allowed levers may change.",
    },
  ],

  allowedLevers: [
    {
      foodId:    "oats",
      label:     "Rolled Oats",
      minAmount: 30,
      unit:      "g",
    },
    {
      foodId:    "dextrin",
      label:     "Cyclic Dextrin",
      minAmount: 0,
      unit:      "g",
    },
    {
      foodId:    "flax",
      label:     "Ground Flaxseed",
      minAmount: 0,
      unit:      "g",
    },
    {
      foodId:    "egg",
      label:     "Egg",
      minAmount: 0,
      unit:      "unit",
    },
  ],

  optionalLevers: [
    {
      foodId:    "yogurt",
      label:     "Greek Yogurt",
      minAmount: 1,
      unit:      "unit",
      condition: "present_in_phase",
    },
  ],

  prohibited: [
    {
      id:          "move_whey_between_meals",
      description: "Whey protein must not be redistributed across different meal slots.",
      foodId:      "whey",
    },
    {
      id:          "remove_whey_from_meals",
      description: "Whey protein must not be removed from any meal it is currently assigned to.",
      foodId:      "whey",
    },
    {
      id:          "introduce_new_foods",
      description:
        "NOMOS must not introduce any food that does not already appear in the phase plan. " +
        "Corrections are limited to adjusting amounts of foods already present. " +
        "The only exception is egg, which may be added to a meal that does not already " +
        "contain it, provided it is in the allowedLevers list and a calorie budget exists.",
    },
    {
      id:          "merge_or_collapse_meals",
      description:
        "Meals may not be merged or collapsed. If a correction reduces a food to 0g, " +
        "the meal slot itself must remain in the plan with its remaining foods. " +
        "Removing the last food from a meal is not permitted.",
    },
    {
      id:          "redesign_meal_structure",
      description:
        "The structural template of the meal plan may not be altered. " +
        "No new meals may be added, no meals may be removed, no meal labels may change, " +
        "and the correction must not alter which training window a meal belongs to.",
    },
  ],

};
