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

export function detectIntent(rawInput: string): IntentType {
  const lower = rawInput.toLowerCase().trim();

  if (!lower) return "UNKNOWN";

  const nutritionScore = countSignals(lower, NUTRITION_SIGNALS);
  const trainingScore = countSignals(lower, TRAINING_SIGNALS);
  const scheduleScore = countSignals(lower, SCHEDULE_SIGNALS);

  const maxScore = Math.max(nutritionScore, trainingScore, scheduleScore);

  if (maxScore === 0) return "GENERIC_CONSTRAINT_TASK";

  if (nutritionScore === maxScore) return "NUTRITION_AUDIT";
  if (trainingScore === maxScore) return "TRAINING_AUDIT";
  if (scheduleScore === maxScore) return "SCHEDULE_AUDIT";

  return "GENERIC_CONSTRAINT_TASK";
}

function countSignals(lower: string, signals: string[]): number {
  return signals.filter((signal) => lower.includes(signal)).length;
}
