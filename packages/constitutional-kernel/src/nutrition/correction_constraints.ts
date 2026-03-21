/**
 * correction_constraints.ts
 *
 * Defines what NOMOS is permitted to change when correcting a meal plan.
 *
 * Constitutional role:
 * - Separates what is structurally locked (meal order, count, protein placement)
 *   from what is adjustable (gram amounts of specific carb and fat levers).
 * - Prohibited actions are explicit and enforced before any correction is attempted.
 * - No correction logic here — only the rules governing correction.
 */

/* =========================================================
   Types
   ========================================================= */

export type LockedRuleId =
  | "preserve_meal_order"
  | "preserve_meal_count"
  | "preserve_protein_placements"
  | "preserve_overall_dispersal"
  | "keep_calories_near_target";

export interface LockedRule {
  id: LockedRuleId;
  description: string;
}

export interface FoodLever {
  /** Registry foodId of the adjustable food. */
  foodId: string;
  /** Human-readable label. */
  label: string;
  /** Minimum amount to keep in any meal that contains this food. */
  minAmount: number;
  /** Unit matching the food registry. */
  unit: "g" | "unit";
  /** Optional condition that must be true for this lever to be used. */
  condition?: string;
}

export type ProhibitedActionId =
  | "move_whey_between_meals"
  | "remove_whey_from_meals"
  | "redesign_structure";

export interface ProhibitedAction {
  id: ProhibitedActionId;
  description: string;
  foodId?: string;
}

/**
 * Complete correction constraint set governing one correction pass.
 */
export interface CorrectionConstraints {
  /** Rules that must never be violated. */
  locked: LockedRule[];
  /** Foods whose gram amounts may be increased or decreased. */
  allowedLevers: FoodLever[];
  /**
   * Foods that may be used as levers only when already present in the plan.
   * NOMOS must not introduce these foods into a meal that does not already contain them.
   */
  optionalLevers: FoodLever[];
  /** Actions that are explicitly forbidden regardless of delta. */
  prohibited: ProhibitedAction[];
}

/* =========================================================
   Default constraint set
   ========================================================= */

/**
 * DEFAULT_CORRECTION_CONSTRAINTS — the standard ruleset for NOMOS meal plan correction.
 *
 * Locked rules:
 *   preserve meal order, count, protein placements, dispersal, calorie proximity.
 *
 * Allowed levers (carb and fat):
 *   oats, dextrin, flax, egg.
 *
 * Optional lever:
 *   yogurt — only if already present in the phase meal being corrected.
 *
 * Prohibited:
 *   do not move whey between meals, do not remove whey, do not redesign structure.
 */
export const DEFAULT_CORRECTION_CONSTRAINTS: CorrectionConstraints = {
  locked: [
    {
      id: "preserve_meal_order",
      description: "Meals must remain in their original numbered order. No resequencing.",
    },
    {
      id: "preserve_meal_count",
      description: "The number of meals per day must not change.",
    },
    {
      id: "preserve_protein_placements",
      description: "Protein sources must remain in the meals they are assigned to. Protein timing is not subject to correction.",
    },
    {
      id: "preserve_overall_dispersal",
      description: "The overall distribution of macros across meals must not collapse into fewer feeding windows.",
    },
    {
      id: "keep_calories_near_target",
      description: "Caloric adjustments from levers must keep total phase calories within ±5% of target.",
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
      id:          "redesign_structure",
      description: "The meal template structure must not be altered. No new meals may be added. No meals may be removed.",
    },
  ],
};
