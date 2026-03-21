import { IntentType } from "./domain_templates";

const NUTRITION_SIGNALS = [
  "meal plan",
  "meal system",
  "macro",
  "macros",
  "nutrition",
  "calories",
  "calorie",
  "protein",
  "carb",
  "fat",
  "food label",
  "food labels",
  "phase plan",
  "audit my meal",
  "fix my meal",
  "correct my meal",
  "whey",
  "flax",
  "oat",
  "dextrin",
  "yogurt",
  "banana",
];

/**
 * NUTRITION_TEMPORAL_FUELING signals — must match before falling through to
 * NUTRITION_AUDIT. Any nutrition query that contains timed candidate actions
 * plus a temporal threshold constraint belongs to this family, not the
 * meal-audit family.
 *
 * Routing rule: if the query scores ≥ 2 temporal fueling signals, it routes to
 * NUTRITION_TEMPORAL_FUELING regardless of meal-audit signal count.
 */
const TEMPORAL_FUELING_SIGNALS = [
  "minutes before lifting",
  "minutes before training",
  "minutes before workout",
  "minutes before",
  "within 90 minutes",
  "within 60 minutes",
  "within 30 minutes",
  "within 45 minutes",
  "within 120 minutes",
  "before lifting",
  "pre-lift",
  "pre lift",
  "post-lift",
  "post lift",
  "pre-workout",
  "post-workout",
  "fueling",
  "timing window",
  "admissibility",
  "strongest margin",
  "carb timing",
  "caffeine timing",
  "protein window",
];

/**
 * NUTRITION_LABEL_AUDIT signals — nutrition queries centered on verifying,
 * comparing, or correcting food data against declared label evidence.
 *
 * Routing rule: if the query scores ≥ 2 label audit signals AND scores fewer
 * temporal fueling signals than the label audit threshold, it routes to
 * NUTRITION_LABEL_AUDIT.
 */
const LABEL_AUDIT_SIGNALS = [
  "food label",
  "nutrition facts",
  "compare foods",
  "verify label",
  "label audit",
  "per serving",
  "per 100g",
  "label data",
  "source truth",
  "serving size",
  "nutrition label",
];

const TRAINING_SIGNALS = [
  "training program",
  "workout",
  "exercise",
  "split",
  "hypertrophy",
  "strength training",
  "progressive overload",
  "volume",
  "deload",
  "recovery",
  "hrv",
  "soreness",
  "fatigue",
  "lift",
  "gym",
  "training days",
  "sets",
  "reps",
];

const SCHEDULE_SIGNALS = [
  "schedule",
  "time block",
  "time blocks",
  "wake time",
  "bedtime",
  "commute",
  "planned wake",
  "planned work",
  "sleep minimums",
  "daily plan",
  "time audit",
  "anchor block",
  "appointments",
  "deadlines",
];

/** Minimum signal count to sub-route within the nutrition family. */
const TEMPORAL_FUELING_THRESHOLD = 1;
const LABEL_AUDIT_THRESHOLD = 2;

export function detectIntent(rawInput: string): IntentType {
  const lower = rawInput.toLowerCase().trim();

  if (!lower) return "UNKNOWN";

  const nutritionScore = countSignals(lower, NUTRITION_SIGNALS);
  const trainingScore  = countSignals(lower, TRAINING_SIGNALS);
  const scheduleScore  = countSignals(lower, SCHEDULE_SIGNALS);

  const maxScore = Math.max(nutritionScore, trainingScore, scheduleScore);

  if (maxScore === 0) return "GENERIC_CONSTRAINT_TASK";

  if (nutritionScore === maxScore) {
    return routeNutritionSubFamily(lower);
  }

  if (trainingScore === maxScore) return "TRAINING_AUDIT";
  if (scheduleScore === maxScore) return "SCHEDULE_AUDIT";

  return "GENERIC_CONSTRAINT_TASK";
}

/**
 * routeNutritionSubFamily — deterministic sub-router for the nutrition domain.
 *
 * Priority order (first match wins):
 *   1. NUTRITION_TEMPORAL_FUELING — timed candidate-action query with threshold
 *      constraints. Recognized by temporal timing phrases plus admissibility
 *      or margin language.
 *   2. NUTRITION_LABEL_TRUTH — label verification or food-source-truth audit.
 *      Recognized by label-reference phrases.
 *   3. NUTRITION_MEAL_AUDIT (meal audit) — default fallback for the nutrition family.
 *
 * NOTE: This function is a display-hint only (used to pre-populate the dropdown).
 * Authoritative sub-family routing is done by query_family_classifier.ts inside
 * autoCompile(), which operates on extracted fields, not raw text signals.
 */
function routeNutritionSubFamily(lower: string): IntentType {
  const temporalScore   = countSignals(lower, TEMPORAL_FUELING_SIGNALS);
  const labelAuditScore = countSignals(lower, LABEL_AUDIT_SIGNALS);

  if (temporalScore >= TEMPORAL_FUELING_THRESHOLD) {
    return "NUTRITION_TEMPORAL_FUELING";
  }

  if (labelAuditScore >= LABEL_AUDIT_THRESHOLD) {
    return "NUTRITION_LABEL_TRUTH";
  }

  return "NUTRITION_MEAL_AUDIT";
}

function countSignals(lower: string, signals: string[]): number {
  return signals.filter((signal) => lower.includes(signal)).length;
}
