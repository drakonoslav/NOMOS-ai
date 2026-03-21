/**
 * phase_registry.ts
 *
 * NOMOS phase registry — all 8 declared training phases encoded as PhasePlan objects.
 *
 * Constitutional role:
 * - This is the single source of truth for the user's declared meal plans.
 * - All 8 phases are encoded exactly as declared: meal order, meal count,
 *   food placement, protein placement, and gram amounts are preserved verbatim.
 * - Targets are declared per-day totals for the phase.
 * - All foodIds must match the food registry (validated at parse time).
 * - No macro computation here — PhasePlan objects are pure structural data.
 *
 * Phases:
 *   BASE        — balanced maintenance baseline
 *   CARB_UP     — elevated carbohydrate intake for muscle glycogen
 *   CARB_CUT    — reduced carbohydrate intake, fat maintained
 *   FAT_CUT     — reduced fat intake, carbs maintained
 *   RECOMP      — protein-forward recomposition
 *   DELOAD      — recovery week, moderate across all macros
 *   DIET_BREAK  — planned diet break, above maintenance
 *   PEAK_BULK   — maximum mass gain, high carb + fat
 */

import { PhasePlan } from "./meal_types.js";
import { RawPhase, parsePhaseRegistry } from "./meal_plan_parser.js";

/* =========================================================
   Raw phase declarations
   ========================================================= */

const RAW_PHASES: RawPhase[] = [

  /* ----------------------------------------------------------
     BASE — balanced maintenance
     4 meals, even dispersal
     Protein anchors: whey (M1, M3), yogurt (M4)
     Carb levers: oats (M1, M3), dextrin (M2)
     Fat levers: flax (M1), egg (M4)
     ---------------------------------------------------------- */
  {
    phaseId: "BASE",
    target:  { calories: 2200, protein: 170, carbs: 220, fat: 75 },
    meals: [
      {
        mealNumber: 1,
        label: "Breakfast",
        foods: [
          { foodId: "oats",  amount: 96,  unit: "g" },
          { foodId: "whey",  amount: 37,  unit: "g" },
          { foodId: "flax",  amount: 14,  unit: "g" },
        ],
      },
      {
        mealNumber: 2,
        label: "Pre-Lift",
        foods: [
          { foodId: "banana",  amount: 1,  unit: "unit" },
          { foodId: "dextrin", amount: 45, unit: "g"    },
        ],
      },
      {
        mealNumber: 3,
        label: "Post-Lift",
        foods: [
          { foodId: "whey", amount: 37, unit: "g" },
          { foodId: "oats", amount: 64, unit: "g" },
          { foodId: "egg",  amount: 1,  unit: "unit" },
        ],
      },
      {
        mealNumber: 4,
        label: "Evening",
        foods: [
          { foodId: "yogurt", amount: 1, unit: "unit" },
          { foodId: "egg",    amount: 2, unit: "unit" },
        ],
      },
    ],
  },

  /* ----------------------------------------------------------
     CARB_UP — elevated carbohydrate
     4 meals, carb-loaded peri-workout
     Protein anchors: whey (M1, M3), yogurt (M4)
     Carb levers: oats (M1, M2, M3), dextrin (M2, M3), banana (M2)
     Fat levers: flax (M4) — reduced vs BASE
     ---------------------------------------------------------- */
  {
    phaseId: "CARB_UP",
    target:  { calories: 2600, protein: 165, carbs: 320, fat: 60 },
    meals: [
      {
        mealNumber: 1,
        label: "Breakfast",
        foods: [
          { foodId: "oats",   amount: 128, unit: "g" },
          { foodId: "whey",   amount: 37,  unit: "g" },
          { foodId: "banana", amount: 1,   unit: "unit" },
        ],
      },
      {
        mealNumber: 2,
        label: "Pre-Lift",
        foods: [
          { foodId: "dextrin", amount: 60, unit: "g" },
          { foodId: "oats",    amount: 32, unit: "g" },
        ],
      },
      {
        mealNumber: 3,
        label: "Post-Lift",
        foods: [
          { foodId: "whey",    amount: 74, unit: "g" },
          { foodId: "dextrin", amount: 60, unit: "g" },
          { foodId: "oats",    amount: 32, unit: "g" },
        ],
      },
      {
        mealNumber: 4,
        label: "Evening",
        foods: [
          { foodId: "yogurt", amount: 1, unit: "unit" },
          { foodId: "egg",    amount: 1, unit: "unit" },
          { foodId: "flax",   amount: 7, unit: "g"    },
        ],
      },
    ],
  },

  /* ----------------------------------------------------------
     CARB_CUT — reduced carbohydrate
     4 meals, dextrin and oats reduced; fat levers up
     Protein anchors: whey (M1, M3), yogurt (M4), egg (M1, M4)
     Carb levers: oats (M1, M3), dextrin (M2) — smaller servings
     Fat levers: flax (M1, M4), egg (M1, M4)
     ---------------------------------------------------------- */
  {
    phaseId: "CARB_CUT",
    target:  { calories: 1900, protein: 175, carbs: 120, fat: 80 },
    meals: [
      {
        mealNumber: 1,
        label: "Breakfast",
        foods: [
          { foodId: "oats", amount: 64,  unit: "g"    },
          { foodId: "whey", amount: 37,  unit: "g"    },
          { foodId: "flax", amount: 28,  unit: "g"    },
          { foodId: "egg",  amount: 1,   unit: "unit" },
        ],
      },
      {
        mealNumber: 2,
        label: "Pre-Lift",
        foods: [
          { foodId: "dextrin", amount: 30, unit: "g" },
        ],
      },
      {
        mealNumber: 3,
        label: "Post-Lift",
        foods: [
          { foodId: "whey", amount: 74, unit: "g" },
          { foodId: "oats", amount: 32, unit: "g" },
        ],
      },
      {
        mealNumber: 4,
        label: "Evening",
        foods: [
          { foodId: "yogurt", amount: 1, unit: "unit" },
          { foodId: "egg",    amount: 3, unit: "unit" },
          { foodId: "flax",   amount: 14, unit: "g"  },
        ],
      },
    ],
  },

  /* ----------------------------------------------------------
     FAT_CUT — reduced fat
     4 meals, flax and egg reduced; carbs maintained
     Protein anchors: whey (M1, M3), yogurt (M4)
     Carb levers: oats (M1, M3), dextrin (M2), banana (M2)
     Fat levers: flax (M4 only, small) — egg removed
     ---------------------------------------------------------- */
  {
    phaseId: "FAT_CUT",
    target:  { calories: 2000, protein: 175, carbs: 220, fat: 45 },
    meals: [
      {
        mealNumber: 1,
        label: "Breakfast",
        foods: [
          { foodId: "oats", amount: 96, unit: "g" },
          { foodId: "whey", amount: 37, unit: "g" },
        ],
      },
      {
        mealNumber: 2,
        label: "Pre-Lift",
        foods: [
          { foodId: "banana",  amount: 1,  unit: "unit" },
          { foodId: "dextrin", amount: 45, unit: "g"    },
        ],
      },
      {
        mealNumber: 3,
        label: "Post-Lift",
        foods: [
          { foodId: "whey", amount: 74, unit: "g" },
          { foodId: "oats", amount: 64, unit: "g" },
        ],
      },
      {
        mealNumber: 4,
        label: "Evening",
        foods: [
          { foodId: "yogurt", amount: 1, unit: "unit" },
          { foodId: "flax",   amount: 7, unit: "g"    },
        ],
      },
    ],
  },

  /* ----------------------------------------------------------
     RECOMP — protein-forward body recomposition
     4 meals, elevated protein at all feeding windows
     Protein anchors: whey (M1 double, M3 double), yogurt (M4), egg (M3, M4)
     Carb levers: oats (M1, M3), dextrin (M2), banana (M2)
     Fat levers: flax (M1), egg (M3, M4)
     ---------------------------------------------------------- */
  {
    phaseId: "RECOMP",
    target:  { calories: 2100, protein: 190, carbs: 175, fat: 65 },
    meals: [
      {
        mealNumber: 1,
        label: "Breakfast",
        foods: [
          { foodId: "oats", amount: 64, unit: "g" },
          { foodId: "whey", amount: 74, unit: "g" },
          { foodId: "flax", amount: 14, unit: "g" },
        ],
      },
      {
        mealNumber: 2,
        label: "Pre-Lift",
        foods: [
          { foodId: "dextrin", amount: 30, unit: "g"    },
          { foodId: "banana",  amount: 1,  unit: "unit" },
        ],
      },
      {
        mealNumber: 3,
        label: "Post-Lift",
        foods: [
          { foodId: "whey", amount: 74, unit: "g"    },
          { foodId: "oats", amount: 64, unit: "g"    },
          { foodId: "egg",  amount: 1,  unit: "unit" },
        ],
      },
      {
        mealNumber: 4,
        label: "Evening",
        foods: [
          { foodId: "yogurt", amount: 2, unit: "unit" },
          { foodId: "egg",    amount: 1, unit: "unit" },
        ],
      },
    ],
  },

  /* ----------------------------------------------------------
     DELOAD — recovery week
     4 meals, moderate across all macros, reduced training volume
     Protein anchors: whey (M1, M3), yogurt (M4)
     Carb levers: oats (M1, M3), dextrin (M2), banana (M1)
     Fat levers: flax (M1), egg (M4)
     ---------------------------------------------------------- */
  {
    phaseId: "DELOAD",
    target:  { calories: 2000, protein: 155, carbs: 200, fat: 70 },
    meals: [
      {
        mealNumber: 1,
        label: "Breakfast",
        foods: [
          { foodId: "oats",   amount: 64, unit: "g"    },
          { foodId: "whey",   amount: 37, unit: "g"    },
          { foodId: "flax",   amount: 14, unit: "g"    },
          { foodId: "banana", amount: 1,  unit: "unit" },
        ],
      },
      {
        mealNumber: 2,
        label: "Pre-Lift",
        foods: [
          { foodId: "dextrin", amount: 30, unit: "g" },
        ],
      },
      {
        mealNumber: 3,
        label: "Post-Lift",
        foods: [
          { foodId: "whey", amount: 37, unit: "g" },
          { foodId: "oats", amount: 32, unit: "g" },
        ],
      },
      {
        mealNumber: 4,
        label: "Evening",
        foods: [
          { foodId: "yogurt", amount: 1, unit: "unit" },
          { foodId: "egg",    amount: 2, unit: "unit" },
        ],
      },
    ],
  },

  /* ----------------------------------------------------------
     DIET_BREAK — planned diet break
     4 meals, above maintenance, metabolic reset
     Protein anchors: whey (M1, M3 double), yogurt (M4), egg (M4)
     Carb levers: oats (M1, M3), dextrin (M2, M3), banana (M1, M2)
     Fat levers: flax (M1, M4), egg (M4)
     ---------------------------------------------------------- */
  {
    phaseId: "DIET_BREAK",
    target:  { calories: 2300, protein: 165, carbs: 255, fat: 78 },
    meals: [
      {
        mealNumber: 1,
        label: "Breakfast",
        foods: [
          { foodId: "oats",   amount: 96,  unit: "g"    },
          { foodId: "whey",   amount: 37,  unit: "g"    },
          { foodId: "flax",   amount: 14,  unit: "g"    },
          { foodId: "banana", amount: 1,   unit: "unit" },
        ],
      },
      {
        mealNumber: 2,
        label: "Pre-Lift",
        foods: [
          { foodId: "dextrin", amount: 60, unit: "g"    },
          { foodId: "banana",  amount: 1,  unit: "unit" },
        ],
      },
      {
        mealNumber: 3,
        label: "Post-Lift",
        foods: [
          { foodId: "whey",    amount: 74, unit: "g" },
          { foodId: "oats",    amount: 64, unit: "g" },
          { foodId: "dextrin", amount: 30, unit: "g" },
        ],
      },
      {
        mealNumber: 4,
        label: "Evening",
        foods: [
          { foodId: "yogurt", amount: 1,  unit: "unit" },
          { foodId: "egg",    amount: 2,  unit: "unit" },
          { foodId: "flax",   amount: 14, unit: "g"    },
        ],
      },
    ],
  },

  /* ----------------------------------------------------------
     PEAK_BULK — maximum mass gain
     4 meals, highest carb and calorie load
     Protein anchors: whey (M1, M3 double), yogurt (M4 double), egg (M4)
     Carb levers: oats (M1, M2, M3), dextrin (M2, M3), banana (M1, M2)
     Fat levers: flax (M1, M4), egg (M4)
     ---------------------------------------------------------- */
  {
    phaseId: "PEAK_BULK",
    target:  { calories: 2800, protein: 195, carbs: 330, fat: 95 },
    meals: [
      {
        mealNumber: 1,
        label: "Breakfast",
        foods: [
          { foodId: "oats",   amount: 128, unit: "g"    },
          { foodId: "whey",   amount: 37,  unit: "g"    },
          { foodId: "flax",   amount: 14,  unit: "g"    },
          { foodId: "banana", amount: 1,   unit: "unit" },
        ],
      },
      {
        mealNumber: 2,
        label: "Pre-Lift",
        foods: [
          { foodId: "dextrin", amount: 90, unit: "g"    },
          { foodId: "banana",  amount: 1,  unit: "unit" },
          { foodId: "oats",    amount: 32, unit: "g"    },
        ],
      },
      {
        mealNumber: 3,
        label: "Post-Lift",
        foods: [
          { foodId: "whey",    amount: 74, unit: "g" },
          { foodId: "dextrin", amount: 90, unit: "g" },
          { foodId: "oats",    amount: 64, unit: "g" },
        ],
      },
      {
        mealNumber: 4,
        label: "Evening",
        foods: [
          { foodId: "yogurt", amount: 2,  unit: "unit" },
          { foodId: "egg",    amount: 3,  unit: "unit" },
          { foodId: "flax",   amount: 28, unit: "g"    },
        ],
      },
    ],
  },

];

/* =========================================================
   Registry construction — validated at module load time
   ========================================================= */

/**
 * PHASE_REGISTRY — all 8 phases parsed and validated.
 *
 * Query using getPhaseById() rather than accessing this map directly.
 * Throws at module load time if any foodId or unit is invalid.
 */
export const PHASE_REGISTRY: Readonly<Record<string, PhasePlan>> = Object.freeze(
  parsePhaseRegistry(RAW_PHASES)
);

/* =========================================================
   Query API
   ========================================================= */

/**
 * getPhaseById — returns the PhasePlan for the given phaseId,
 * or undefined if the phase is not in the registry.
 */
export function getPhaseById(phaseId: string): PhasePlan | undefined {
  return PHASE_REGISTRY[phaseId];
}

/**
 * listPhases — returns all registered PhasePlan objects in declaration order.
 */
export function listPhases(): PhasePlan[] {
  return Object.values(PHASE_REGISTRY);
}

/**
 * PHASE_IDS — stable list of all registered phase identifiers.
 */
export const PHASE_IDS = [
  "BASE",
  "CARB_UP",
  "CARB_CUT",
  "FAT_CUT",
  "RECOMP",
  "DELOAD",
  "DIET_BREAK",
  "PEAK_BULK",
] as const;

export type PhaseId = typeof PHASE_IDS[number];
