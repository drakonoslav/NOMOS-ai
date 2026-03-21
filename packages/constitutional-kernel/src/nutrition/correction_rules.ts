/**
 * correction_rules.ts
 *
 * Reasoning preferences for NOMOS macro correction.
 *
 * Constitutional role:
 * - Defines HOW the correction engine should think about corrections,
 *   not just WHAT it is permitted to change (that is correction_constraints.ts).
 * - Encodes lever priority: which food to reach for first, second, and why.
 * - Encodes the reasoning behind each preference so corrections can be
 *   explained in plain language, not just applied silently.
 * - No correction logic here — these are declarative preferences that the
 *   correction engine reads and follows.
 *
 * Correction scenarios currently defined:
 *   CARBS_OVER_TARGET — prefer dextrin reduction, then oats
 *   FAT_UNDER_TARGET  — prefer egg increase, then flax
 *
 * These are not symmetric: there is no CARBS_UNDER or FAT_OVER rule,
 * because the current constraint set does not call for those corrections.
 * Add new scenarios here when the correction space is extended.
 */

/* =========================================================
   Types
   ========================================================= */

/**
 * Identifies a specific macro correction scenario.
 * Each scenario maps to one ordered list of LeverPriority entries.
 */
export type CorrectionScenario =
  | "CARBS_OVER_TARGET"
  | "FAT_UNDER_TARGET";

/**
 * One lever candidate within a correction scenario,
 * with its priority rank and full reasoning.
 */
export interface LeverPriority {
  /**
   * Priority rank within this scenario.
   * 1 = first choice, 2 = second choice, etc.
   * The correction engine must exhaust rank 1 before trying rank 2.
   */
  rank:    number;
  /** Registry foodId of this lever. */
  foodId:  string;
  /** Human-readable lever name. */
  label:   string;
  /**
   * Why this lever is preferred at this rank.
   * This text is included verbatim in correction explanations.
   */
  reason:  string;
  /**
   * Why other levers were skipped in favour of this one.
   * Included in the "skippedLevers" field of CorrectionAdjustment.
   * May be empty for rank-1 levers.
   */
  skippedRationale?: string;
  /**
   * Known side-effects of using this lever.
   * Included in correction notes so the user understands macro cross-effects.
   * Empty array means no meaningful side-effects.
   */
  sideEffects: string[];
}

/**
 * A named reasoning preference governing how the correction engine
 * approaches one class of correction.
 */
export interface ReasoningPreference {
  id:          string;
  description: string;
}

/**
 * Full correction rule set: one entry per scenario,
 * plus the set of global reasoning preferences that apply across all scenarios.
 */
export interface CorrectionRuleSet {
  /**
   * Ordered lever priorities per correction scenario.
   * Keys are CorrectionScenario values.
   */
  leverPriorities:      Record<CorrectionScenario, LeverPriority[]>;
  /**
   * Global reasoning preferences that the correction engine should
   * respect across all scenarios.
   */
  reasoningPreferences: ReasoningPreference[];
}

/* =========================================================
   DEFAULT_CORRECTION_RULES
   ========================================================= */

/**
 * DEFAULT_CORRECTION_RULES
 *
 * The standard reasoning preferences for NOMOS correction.
 *
 * CARBS_OVER_TARGET lever order:
 *   1. dextrin — clean carb lever; zero protein/fat side-effects
 *   2. oats    — secondary only; carries protein and fat that must be revalidated
 *
 * FAT_UNDER_TARGET lever order:
 *   1. egg     — highest fat-to-volume ratio; protein co-load is a benefit
 *   2. flax    — secondary only; low fat density; significant carb+protein side-load
 *
 * Global preferences:
 *   - flax is not a primary fat-restoration lever
 *   - lever use must be explained in plain language
 *   - corrections halt if the calorie ceiling would be breached
 */
export const DEFAULT_CORRECTION_RULES: CorrectionRuleSet = {

  leverPriorities: {

    /* -------------------------------------------------------
       CARBS_OVER_TARGET
       When actual carbs exceed target beyond tolerance,
       reduce carb levers in this order.
       ------------------------------------------------------- */
    CARBS_OVER_TARGET: [
      {
        rank:   1,
        foodId: "dextrin",
        label:  "Cyclic Dextrin",
        reason:
          "Dextrin is a clean carb lever: it contributes only carbs and calories. " +
          "Reducing dextrin removes carbs with zero protein or fat side-effects, " +
          "making it the most precise carb correction tool available. " +
          "It should always be the first carb lever reached for.",
        skippedRationale: undefined,
        sideEffects: [],
      },
      {
        rank:   2,
        foodId: "oats",
        label:  "Rolled Oats",
        reason:
          "Oats are the secondary carb lever, used only when dextrin has been exhausted " +
          "or is not present in the phase. Oats carry protein and fat alongside carbs " +
          "(4g protein and 2g fat per 32g serving), so reducing oats affects all three " +
          "macros. The correction must be validated across protein and fat after any " +
          "oats adjustment.",
        skippedRationale:
          "Dextrin was preferred first because it has zero protein and fat side-effects. " +
          "Oats are used only after dextrin capacity is exhausted.",
        sideEffects: [
          "Reducing oats by 32g removes approximately 4g protein and 2g fat in addition to 22g carbs.",
          "After an oats reduction, re-check protein and fat deltas before declaring the phase corrected.",
        ],
      },
    ],

    /* -------------------------------------------------------
       FAT_UNDER_TARGET
       When actual fat falls below target beyond tolerance,
       increase fat levers in this order.
       ------------------------------------------------------- */
    FAT_UNDER_TARGET: [
      {
        rank:   1,
        foodId: "egg",
        label:  "Egg",
        reason:
          "Eggs provide 5g fat per unit — the highest fat-to-volume ratio of any food in this registry. " +
          "The protein co-load (6g per egg) is beneficial rather than problematic in most phases. " +
          "Eggs should always be the first fat lever when a fat deficit needs to be closed.",
        skippedRationale: undefined,
        sideEffects: [
          "Each egg adds 6g protein and 0.5g carbs alongside 5g fat.",
          "In phases with protein already at or above target, egg additions must respect the protein ceiling.",
        ],
      },
      {
        rank:   2,
        foodId: "flax",
        label:  "Ground Flaxseed",
        reason:
          "Flax is a secondary fat lever, used only when eggs alone cannot close the fat deficit " +
          "(e.g. calorie ceiling is reached or protein ceiling is reached). " +
          "Flax fat density is approximately 10.7% by weight (1.5g fat per 14g serving), " +
          "which means large gram amounts are required to deliver meaningful fat — and those " +
          "gram amounts bring carb and protein side-load.",
        skippedRationale:
          "Eggs were preferred first because they deliver 5g fat per unit versus 1.5g per 14g flax. " +
          "Flax requires roughly 5× the gram volume to deliver the same fat as one egg.",
        sideEffects: [
          "Each additional 14g flax adds 6g carbs and 4g protein alongside 1.5g fat.",
          "High flax additions to close a fat gap will meaningfully raise carbs and protein.",
          "Flax is classified as a mixed-macro adjustment, not a pure fat correction tool.",
        ],
      },
    ],

  },

  /* -------------------------------------------------------
     Global reasoning preferences
     These apply across all correction scenarios.
     ------------------------------------------------------- */
  reasoningPreferences: [
    {
      id:          "dextrin_first_for_carbs",
      description:
        "When carbs are over target, always reach for dextrin before oats. " +
        "Dextrin is the only clean carb lever — it carries no protein or fat. " +
        "Oats carry all three macros and require cross-validation.",
    },
    {
      id:          "eggs_first_for_fat",
      description:
        "When fat is under target, always reach for eggs before flax. " +
        "Eggs provide 5g fat per unit; flax provides only 1.5g per 14g serving. " +
        "Flax requires far more gram volume to deliver equivalent fat restoration.",
    },
    {
      id:          "flax_is_secondary_only",
      description:
        "Flax must never be automatically selected as the primary fat-restoration lever. " +
        "Its low fat density and mixed macro profile make it a secondary adjustment tool. " +
        "Treat flax as a fine-tuning lever after eggs have been used to the extent possible.",
    },
    {
      id:          "explain_every_lever",
      description:
        "Every correction adjustment must be accompanied by a plain-language explanation " +
        "of why that lever was chosen and why other available levers were not used first. " +
        "NOMOS must not make silent corrections.",
    },
    {
      id:          "halt_at_calorie_ceiling",
      description:
        "All corrections must halt if the next lever adjustment would push total " +
        "phase calories beyond ±5% of the declared target. " +
        "A partial correction with an explanation is preferable to a correction " +
        "that fixes one macro by breaking caloric integrity.",
    },
    {
      id:          "no_whey_moves",
      description:
        "Whey protein amounts and meal assignments are invariant. " +
        "The correction engine must not reduce, increase, move, or remove whey " +
        "regardless of what the delta calculation might suggest. " +
        "Whey placement is a training protocol decision, not a correction target.",
    },
  ],

};
