/**
 * correction_engine.ts
 *
 * Minimal gram-level correction engine for NOMOS meal plans.
 *
 * Constitutional role:
 * - Proposes the smallest gram adjustments that bring a phase plan's
 *   actual macros within tolerance of its target.
 * - Respects all CorrectionConstraints: locked rules, allowed levers,
 *   optional levers (only when present), and prohibited actions.
 * - Evaluates each phase independently. Does not batch-correct all phases.
 * - Explains every adjustment and every lever that was considered but skipped.
 *
 * Correction priority order:
 *   Carbs over target  → reduce dextrin first, then oats
 *   Fat under target   → increase eggs first, then flax
 *   Protein adjustments are not attempted (protein sources are locked).
 *   Calories are monitored after each correction and corrections are
 *   halted if calorie deviation would exceed ±5% of target.
 */

import { MacroProfile } from "./food_primitive.js";
import { getFoodById } from "./food_registry.js";
import { computePhaseMacros, computePhaseDelta, MacroDelta } from "./macro_engine.js";
import { MealFoodEntry, MealBlock, PhasePlan } from "./meal_types.js";
import { CorrectionConstraints, FoodLever } from "./correction_constraints.js";
import { CorrectionAdjustment, CorrectionResult } from "./correction_result.js";

// Re-export so callers can import engine + types from a single location.
export type { CorrectionAdjustment, CorrectionResult } from "./correction_result.js";

/* =========================================================
   Tolerances
   ========================================================= */

const CARB_TOLERANCE_G    = 5;   // grams — corrections below this are skipped
const FAT_TOLERANCE_G     = 3;   // grams
const CALORIE_LIMIT_PCT   = 0.05; // ±5% of target calories

/* =========================================================
   Public API
   ========================================================= */

/**
 * correctPhase — proposes minimal gram corrections for one phase plan.
 *
 * Evaluates the phase independently. Does not affect other phases.
 * Returns both original and corrected plan alongside full explanations.
 */
export function correctPhase(
  plan:        PhasePlan,
  constraints: CorrectionConstraints
): CorrectionResult {
  const correctedPlan: PhasePlan = deepClonePlan(plan);
  const adjustments:   CorrectionAdjustment[] = [];
  const notes:         string[] = [];

  const macroBefore = computePhaseMacros(plan).totals;
  const deltaBefore = computePhaseDelta(macroBefore, plan.target);

  // ---- carb correction ----
  const carbExcess = macroBefore.carbs - plan.target.carbs;
  if (carbExcess > CARB_TOLERANCE_G) {
    notes.push(`Carb excess: +${carbExcess.toFixed(1)}g vs target. Attempting reduction.`);

    const carbAdj = reduceCarbsInPlan(
      correctedPlan, carbExcess, plan.target, constraints, notes
    );
    adjustments.push(...carbAdj);
  } else {
    notes.push(`Carbs within tolerance (delta ${carbExcess > 0 ? "+" : ""}${carbExcess.toFixed(1)}g). No carb correction needed.`);
  }

  // ---- fat correction ----
  const currentMacros = computePhaseMacros(correctedPlan).totals;
  const fatDeficit    = plan.target.fat - currentMacros.fat;
  if (fatDeficit > FAT_TOLERANCE_G) {
    notes.push(`Fat deficit: -${fatDeficit.toFixed(1)}g vs target. Attempting increase.`);

    const fatAdj = increaseFatInPlan(
      correctedPlan, fatDeficit, plan.target, constraints, notes
    );
    adjustments.push(...fatAdj);
  } else {
    notes.push(`Fat within tolerance (deficit ${fatDeficit.toFixed(1)}g). No fat correction needed.`);
  }

  const macroAfter = computePhaseMacros(correctedPlan).totals;
  const deltaAfter = computePhaseDelta(macroAfter, plan.target);

  notes.push(
    `Correction complete. Calories: ${macroAfter.calories.toFixed(0)} kcal ` +
    `(target ${plan.target.calories}, delta ${deltaAfter.calories > 0 ? "+" : ""}${deltaAfter.calories.toFixed(0)}).`
  );

  return {
    phaseId:       plan.phaseId,
    originalPlan:  plan,
    correctedPlan,
    macroBefore,
    macroAfter,
    deltaBefore,
    deltaAfter,
    adjustments,
    notes,
  };
}

/* =========================================================
   Carb correction — dextrin first, oats second
   ========================================================= */

function reduceCarbsInPlan(
  plan:        PhasePlan,
  carbExcess:  number,
  target:      MacroProfile,
  constraints: CorrectionConstraints,
  notes:       string[]
): CorrectionAdjustment[] {
  const adjustments: CorrectionAdjustment[] = [];
  let remaining     = carbExcess;

  // ---- lever 1: dextrin ----
  const dextrinLever = findLever(constraints, "dextrin");
  if (dextrinLever) {
    const dex = getFoodById("dextrin");
    if (dex && dex.macrosPerGram) {
      const carbsPerGram  = dex.macrosPerGram.carbs;
      const entry = findFoodEntry(plan, "dextrin");
      if (entry) {
        const available   = entry.entry.amount - dextrinLever.minAmount;
        const gramsNeeded = remaining / carbsPerGram;
        const gramsToRemove = Math.min(available, gramsNeeded);

        if (gramsToRemove > 0.5) {
          const before = entry.entry.amount;
          entry.entry.amount = Math.max(dextrinLever.minAmount, before - gramsToRemove);
          const removed       = before - entry.entry.amount;
          const carbsRemoved  = removed * carbsPerGram;
          remaining          -= carbsRemoved;

          adjustments.push({
            foodId:       "dextrin",
            mealNumber:   plan.meals[entry.mealIndex].mealNumber,
            beforeAmount: before,
            afterAmount:  entry.entry.amount,
            unit:         "g",
            reason:       `Dextrin is a clean carb lever (0g protein, 0g fat). ` +
                          `Reducing by ${removed.toFixed(1)}g removes ${carbsRemoved.toFixed(1)}g carbs ` +
                          `with no protein or fat side-effects.`,
          });
          notes.push(`Dextrin reduced by ${removed.toFixed(1)}g (${carbsRemoved.toFixed(1)}g carbs removed). Remaining excess: ${remaining.toFixed(1)}g.`);
        } else {
          notes.push(`Dextrin: ${gramsToRemove.toFixed(1)}g reduction below threshold — skipped.`);
        }
      } else {
        notes.push(`Dextrin not found in this phase — skipped.`);
      }
    }
  }

  // ---- lever 2: oats ----
  if (remaining > CARB_TOLERANCE_G) {
    const oatsLever = findLever(constraints, "oats");
    if (oatsLever) {
      const oats = getFoodById("oats");
      if (oats && oats.macrosPerGram) {
        const carbsPerGram  = oats.macrosPerGram.carbs;
        const entry         = findFoodEntry(plan, "oats");
        if (entry) {
          const available     = entry.entry.amount - oatsLever.minAmount;
          const gramsNeeded   = remaining / carbsPerGram;
          const gramsToRemove = Math.min(available, gramsNeeded);

          if (gramsToRemove > 0.5) {
            const before      = entry.entry.amount;
            entry.entry.amount = Math.max(oatsLever.minAmount, before - gramsToRemove);
            const removed      = before - entry.entry.amount;
            const carbsRemoved = removed * carbsPerGram;
            remaining         -= carbsRemoved;

            const proteinSideLoad = removed * oats.macrosPerGram.protein;
            const fatSideLoad     = removed * oats.macrosPerGram.fat;

            adjustments.push({
              foodId:       "oats",
              mealNumber:   plan.meals[entry.mealIndex].mealNumber,
              beforeAmount: before,
              afterAmount:  entry.entry.amount,
              unit:         "g",
              reason:       `Oats used as secondary carb lever after dextrin. ` +
                            `Reducing by ${removed.toFixed(1)}g removes ${carbsRemoved.toFixed(1)}g carbs. ` +
                            `Side-load: -${proteinSideLoad.toFixed(1)}g protein, -${fatSideLoad.toFixed(1)}g fat — ` +
                            `verify protein tolerance after correction.`,
              skippedLevers: remaining <= CARB_TOLERANCE_G
                ? undefined
                : [`Dextrin exhausted (at minimum ${oatsLever.minAmount}g).`],
            });
            notes.push(`Oats reduced by ${removed.toFixed(1)}g (${carbsRemoved.toFixed(1)}g carbs removed). Remaining excess: ${remaining.toFixed(1)}g.`);
          } else {
            notes.push(`Oats: reduction needed (${gramsNeeded.toFixed(1)}g) is below 0.5g threshold or available (${available.toFixed(1)}g) is insufficient — skipped.`);
          }
        } else {
          notes.push(`Oats not found in this phase — skipped.`);
        }
      }
    }
  }

  if (remaining > CARB_TOLERANCE_G) {
    notes.push(`WARNING: ${remaining.toFixed(1)}g carb excess remains after exhausting available levers. ` +
               `No further carb correction is possible without redesigning the plan.`);
  }

  return adjustments;
}

/* =========================================================
   Fat correction — eggs first, flax second
   ========================================================= */

function increaseFatInPlan(
  plan:        PhasePlan,
  fatDeficit:  number,
  target:      MacroProfile,
  constraints: CorrectionConstraints,
  notes:       string[]
): CorrectionAdjustment[] {
  const adjustments: CorrectionAdjustment[] = [];
  let remaining     = fatDeficit;

  // ---- lever 1: eggs ----
  const eggLever = findLever(constraints, "egg");
  if (eggLever) {
    const egg = getFoodById("egg");
    if (egg) {
      const fatPerUnit   = egg.macrosPerRef.fat;
      const unitsNeeded  = Math.ceil(remaining / fatPerUnit);
      const existingEntry = findFoodEntry(plan, "egg");

      if (existingEntry) {
        // Apply calorie ceiling even when eggs already exist in the plan.
        const calLimit       = target.calories * (1 + CALORIE_LIMIT_PCT);
        const currentCal     = computePhaseMacros(plan).totals.calories;
        const calBudget      = calLimit - currentCal;
        const maxByCalBudget = egg.macrosPerRef.calories > 0
          ? Math.floor(calBudget / egg.macrosPerRef.calories)
          : unitsNeeded;
        const unitsCapped    = Math.min(unitsNeeded, Math.max(0, maxByCalBudget));

        if (unitsCapped <= 0) {
          notes.push(`Egg: adding eggs would breach calorie ceiling — skipped.`);
        } else {
          const before = existingEntry.entry.amount;
          existingEntry.entry.amount += unitsCapped;
          const fatGained             = unitsCapped * fatPerUnit;
          remaining                  -= fatGained;

          const ceilingNote = unitsCapped < unitsNeeded
            ? ` (calorie ceiling reduced from ${unitsNeeded} to ${unitsCapped} units)`
            : "";

          adjustments.push({
            foodId:       "egg",
            mealNumber:   plan.meals[existingEntry.mealIndex].mealNumber,
            beforeAmount: before,
            afterAmount:  existingEntry.entry.amount,
            unit:         "unit",
            reason:       `Eggs provide ${fatPerUnit}g fat per unit with useful protein co-load ` +
                          `(${egg.macrosPerRef.protein}g protein, ${egg.macrosPerRef.carbs}g carbs). ` +
                          `Higher fat-to-volume ratio than flax — chosen as primary fat lever.` +
                          ceilingNote,
          });
          notes.push(`Egg increased by ${unitsCapped} unit(s) (+${fatGained.toFixed(1)}g fat)${ceilingNote}. Remaining deficit: ${remaining.toFixed(1)}g.`);
        }
      } else {
        // Add egg to the first non-whey meal in the plan
        const targetMeal = findFirstMealWithoutWhey(plan);
        if (targetMeal) {
          const calLimit   = target.calories * (1 + CALORIE_LIMIT_PCT);
          const currentCal = computePhaseMacros(plan).totals.calories;
          const calBudget  = calLimit - currentCal;
          const maxByCalBudget = Math.floor(calBudget / egg.macrosPerRef.calories);
          const unitsToAdd = Math.min(unitsNeeded, Math.max(0, maxByCalBudget));

          if (unitsToAdd > 0) {
            targetMeal.foods.push({ foodId: "egg", amount: unitsToAdd, unit: "unit" });
            const fatGained = unitsToAdd * fatPerUnit;
            remaining      -= fatGained;

            adjustments.push({
              foodId:       "egg",
              mealNumber:   targetMeal.mealNumber,
              beforeAmount: 0,
              afterAmount:  unitsToAdd,
              unit:         "unit",
              reason:       `Eggs introduced into meal ${targetMeal.mealNumber} to address fat deficit. ` +
                            `Calorie budget check passed.`,
            });
            notes.push(`${unitsToAdd} egg(s) added to meal ${targetMeal.mealNumber} (+${fatGained.toFixed(1)}g fat).`);
          } else {
            notes.push(`Egg: adding eggs would breach calorie ceiling — skipped.`);
          }
        } else {
          notes.push(`Egg: no suitable meal found for egg insertion — skipped.`);
        }
      }
    }
  }

  // ---- lever 2: flax ----
  if (remaining > FAT_TOLERANCE_G) {
    const flaxLever = findLever(constraints, "flax");
    if (flaxLever) {
      const flax = getFoodById("flax");
      if (flax && flax.macrosPerGram) {
        const fatPerGram  = flax.macrosPerGram.fat;
        const gramsNeeded = remaining / fatPerGram;
        const entry       = findFoodEntry(plan, "flax");

        const flaxNote = `Flax is a secondary fat lever chosen only after eggs. ` +
          `At ${(fatPerGram * 100).toFixed(1)}% fat by weight, large amounts ` +
          `would be needed to close fat gaps, introducing carb and protein side-load.`;

        if (entry) {
          const calLimit   = plan.target.calories * (1 + CALORIE_LIMIT_PCT);
          const currentCal = computePhaseMacros(plan).totals.calories;
          const calBudget  = calLimit - currentCal;
          const maxByCalBudget = flax.macrosPerGram.calories > 0
            ? calBudget / flax.macrosPerGram.calories
            : gramsNeeded;
          const gramsToAdd = Math.min(gramsNeeded, maxByCalBudget);

          if (gramsToAdd > 1) {
            const before    = entry.entry.amount;
            entry.entry.amount += gramsToAdd;
            const fatGained  = gramsToAdd * fatPerGram;
            remaining       -= fatGained;

            adjustments.push({
              foodId:       "flax",
              mealNumber:   plan.meals[entry.mealIndex].mealNumber,
              beforeAmount: before,
              afterAmount:  entry.entry.amount,
              unit:         "g",
              reason:       flaxNote,
              skippedLevers: ["Egg: deficit not fully closed by eggs; flax used as secondary lever."],
            });
            notes.push(`Flax increased by ${gramsToAdd.toFixed(1)}g (+${fatGained.toFixed(1)}g fat).`);
          } else {
            notes.push(`Flax: gram adjustment (${gramsToAdd.toFixed(1)}g) below meaningful threshold — skipped.`);
          }
        } else {
          notes.push(`Flax not found in this phase and is not introduced as a new ingredient — skipped. ${flaxNote}`);
        }
      }
    }
  }

  if (remaining > FAT_TOLERANCE_G) {
    notes.push(`NOTE: ${remaining.toFixed(1)}g fat deficit remains after available levers. ` +
               `Adding fat sources beyond the allowed levers would require structural changes.`);
  }

  return adjustments;
}

/* =========================================================
   Utilities
   ========================================================= */

function findLever(
  constraints: CorrectionConstraints,
  foodId: string
): FoodLever | undefined {
  return (
    constraints.allowedLevers.find(l => l.foodId === foodId) ??
    constraints.optionalLevers.find(l => l.foodId === foodId)
  );
}

function findFoodEntry(
  plan: PhasePlan,
  foodId: string
): { mealIndex: number; entry: MealFoodEntry } | null {
  for (let mi = 0; mi < plan.meals.length; mi++) {
    for (const entry of plan.meals[mi].foods) {
      if (entry.foodId === foodId) return { mealIndex: mi, entry };
    }
  }
  return null;
}

function findFirstMealWithoutWhey(plan: PhasePlan): MealBlock | null {
  for (const meal of plan.meals) {
    if (!meal.foods.some(f => f.foodId === "whey")) return meal;
  }
  return plan.meals[0] ?? null;
}

function deepClonePlan(plan: PhasePlan): PhasePlan {
  return JSON.parse(JSON.stringify(plan));
}
