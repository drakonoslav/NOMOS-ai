/**
 * correction_result.ts
 *
 * Result types for the NOMOS macro correction engine.
 *
 * Separated from correction_engine.ts so other modules can import result
 * shapes — for rendering, pipeline orchestration, or testing — without
 * pulling in the full engine and its food registry dependencies.
 *
 * Relationship to other types:
 *   CorrectionAdjustment — one discrete lever change with full explanation
 *   CorrectionResult     — full output of one phase correction pass
 *
 * Invariants guaranteed by the engine:
 *   - correctedPlan preserves meal order from originalPlan
 *   - correctedPlan preserves protein placements (whey, yogurt, egg unchanged
 *     unless egg is an explicit fat lever and was already present)
 *   - macroAfter reflects the actual computed totals of correctedPlan —
 *     no theoretical projections
 *   - every adjustment has a reason and every skipped lever is named
 */

import { MacroProfile } from "./food_primitive.js";
import { MacroDelta } from "./macro_engine.js";
import { PhasePlan } from "./meal_types.js";

/* =========================================================
   CorrectionAdjustment
   ========================================================= */

/**
 * One discrete gram-level or unit-level adjustment applied during a correction pass.
 *
 * Every field is required except skippedLevers, which is only populated when
 * there were other levers the engine could have used but chose not to.
 */
export interface CorrectionAdjustment {
  /** Registry foodId of the food that was changed. */
  foodId:        string;

  /**
   * Meal number (1-indexed) where the change was applied.
   * Matches the mealNumber field of the MealBlock in the corrected plan.
   */
  mealNumber:    number;

  /** Amount before adjustment. In grams for "g" foods, count for "unit" foods. */
  beforeAmount:  number;

  /** Amount after adjustment. */
  afterAmount:   number;

  /** Unit, matching the food registry entry. */
  unit:          "g" | "unit";

  /**
   * Plain-language explanation of why this lever was chosen.
   * Includes:
   *   - the macro problem being addressed (carb excess or fat deficit)
   *   - why this food was the right tool (clean lever, fat density, etc.)
   *   - the macro impact of this specific adjustment
   */
  reason:        string;

  /**
   * Other levers that were available but not chosen first, and why.
   * Empty or absent when this was the only candidate.
   *
   * Examples:
   *   "Dextrin was preferred first because it has no protein or fat side-effects."
   *   "Eggs were preferred first; flax used only because egg ceiling was reached."
   */
  skippedLevers?: string[];
}

/* =========================================================
   CorrectionResult
   ========================================================= */

/**
 * Full output of one phase correction pass.
 *
 * Both originalPlan and correctedPlan are included so the caller can
 * show a before/after diff without recomputing anything.
 *
 * deltaBefore and deltaAfter are signed (positive = over target,
 * negative = under target), matching the convention in MacroDelta.
 */
export interface CorrectionResult {
  /** phaseId of the plan that was corrected. */
  phaseId:        string;

  /** The original plan, unmodified. */
  originalPlan:   PhasePlan;

  /** The corrected plan with lever amounts adjusted. */
  correctedPlan:  PhasePlan;

  /**
   * Actual macro totals computed from originalPlan before any correction.
   * This is not the target — it is the real computed value.
   */
  macroBefore:    MacroProfile;

  /**
   * Actual macro totals computed from correctedPlan after all corrections.
   */
  macroAfter:     MacroProfile;

  /**
   * Signed delta: macroBefore − target.
   * Positive means over target, negative means under.
   */
  deltaBefore:    MacroDelta;

  /**
   * Signed delta: macroAfter − target.
   * Positive means over target, negative means under.
   * Ideally closer to zero than deltaBefore on corrected macros.
   */
  deltaAfter:     MacroDelta;

  /** Every lever adjustment that was applied, in the order they were applied. */
  adjustments:    CorrectionAdjustment[];

  /**
   * Ordered plain-language notes describing what happened during the correction pass.
   * Includes:
   *   - which macro problems were detected
   *   - which levers were applied and why
   *   - which levers were skipped and why
   *   - whether any deficit or excess remains after correction
   *   - final calorie check
   */
  notes:          string[];
}
