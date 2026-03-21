import { DomainTemplate, IntentType } from "./domain_templates";
import { ExtractedFields } from "./field_extractor";

export interface MissingField {
  key: string;
  reason: string;
  hint: string;
  severity: "required" | "optional";
}

export interface GapDetectionResult {
  intent: IntentType;
  isEvaluable: boolean;
  missingRequiredFields: MissingField[];
  missingOptionalFields: MissingField[];
  warnings: string[];
  notes: string[];
}

export function detectGaps(
  template: DomainTemplate,
  extracted: ExtractedFields
): GapDetectionResult {
  const missingRequiredFields: MissingField[] = [];
  const missingOptionalFields: MissingField[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  for (const field of template.requiredFields) {
    if (!isFieldSatisfied(field, extracted)) {
      missingRequiredFields.push({
        key: field,
        reason: requiredReason(field),
        hint: template.missingFieldHints[field] ?? "Add the missing required field.",
        severity: "required",
      });
    }
  }

  for (const field of template.optionalFields) {
    if (!isFieldSatisfied(field, extracted)) {
      missingOptionalFields.push({
        key: field,
        reason: optionalReason(field),
        hint: template.missingFieldHints[field] ?? "Optional field not yet provided.",
        severity: "optional",
      });
    }
  }

  if (!extracted.hasObjective) {
    warnings.push("No explicit objective detected.");
  }

  if (!extracted.hasConstraints) {
    warnings.push("No explicit constraints detected.");
  }

  if (template.intent === "NUTRITION_AUDIT") {
    if (extracted.hasMealSystem && !extracted.hasTargets) {
      warnings.push(
        "Meal system detected, but no target macro blocks were found."
      );
    }

    if (
      extracted.hasMealSystem &&
      extracted.detectedFoods.length === 0
    ) {
      warnings.push(
        "Meal system detected, but food references were not recognized."
      );
    }

    if (!extracted.hasLabels) {
      warnings.push("No food-label or source-truth references detected.");
    }
  }

  if (template.intent === "TRAINING_AUDIT") {
    if (!extracted.hasState) {
      warnings.push("Training state was not explicitly declared.");
    }
  }

  if (template.intent === "SCHEDULE_AUDIT") {
    if (!extracted.hasState) {
      warnings.push(
        "Planned schedule or anchor blocks were not explicitly declared."
      );
    }
  }

  notes.push(...extracted.notes);

  return {
    intent: template.intent,
    isEvaluable: missingRequiredFields.length === 0,
    missingRequiredFields,
    missingOptionalFields,
    warnings: uniqueStrings(warnings),
    notes: uniqueStrings(notes),
  };
}

function isFieldSatisfied(field: string, extracted: ExtractedFields): boolean {
  switch (field) {
    case "meal_system_or_phase_plan":
      return extracted.hasMealSystem;

    case "target_macros_or_goal":
      return extracted.hasTargets || extracted.hasObjective;

    case "food_source_truth_or_labels":
      return extracted.hasLabels;

    case "estimated_food_rules":
      return containsEstimatedFoodRule(extracted);

    case "fiber_handling_rule":
      return containsFiberRule(extracted);

    case "correction_mode":
      return extracted.hasCandidates;

    case "locked_food_placements":
      return containsLockedPlacementRule(extracted);

    case "training_program":
      return extracted.hasState || containsTrainingProgramSignals(extracted);

    case "primary_goal":
      return extracted.hasObjective;

    case "hard_constraints":
      return extracted.hasConstraints;

    case "recovery_data":
      return containsRecoverySignals(extracted);

    case "progression_logic":
      return containsProgressionSignals(extracted);

    case "locked_exercises_or_days":
      return containsLockedTrainingPlacementRule(extracted);

    case "fatigue_thresholds":
      return containsFatigueThresholds(extracted);

    case "planned_schedule":
      return extracted.hasState || containsScheduleSignals(extracted);

    case "anchor_constraints":
      return extracted.hasConstraints;

    case "objective_or_success_condition":
      return extracted.hasObjective;

    case "actual_schedule":
      return containsActualScheduleSignals(extracted);

    case "minimum_sleep_rule":
      return containsSleepRule(extracted);

    case "buffer_rules":
      return containsBufferRule(extracted);

    case "fixed_deadlines":
      return containsDeadlineRule(extracted);

    case "state_description":
      return extracted.hasState || extracted.rawInput.trim().length > 0;

    case "uncertainties":
      return extracted.hasUncertainties;

    case "candidates":
      return extracted.hasCandidates;

    case "source_truth":
      return extracted.hasLabels;

    case "objective":
      return extracted.hasObjective;

    default:
      return false;
  }
}

function requiredReason(field: string): string {
  switch (field) {
    case "meal_system_or_phase_plan":
      return "A nutrition audit requires a declared meal system or phase plan.";
    case "target_macros_or_goal":
      return "A nutrition audit requires targets or a clearly declared goal.";
    case "food_source_truth_or_labels":
      return "A nutrition audit requires source-truth food data or label references.";
    case "training_program":
      return "A training audit requires a declared training program.";
    case "primary_goal":
      return "A training audit requires a declared primary goal.";
    case "hard_constraints":
      return "The task requires explicit hard constraints before evaluation.";
    case "planned_schedule":
      return "A schedule audit requires a declared planned schedule.";
    case "anchor_constraints":
      return "A schedule audit requires declared anchor constraints.";
    case "objective_or_success_condition":
      return "A schedule audit requires a declared objective or success condition.";
    case "state_description":
      return "The task requires a declared current state.";
    case "objective":
      return "The task requires a declared objective.";
    default:
      return "Required field missing.";
  }
}

function optionalReason(field: string): string {
  switch (field) {
    case "estimated_food_rules":
      return "Estimated foods are not yet explicitly identified.";
    case "fiber_handling_rule":
      return "Fiber versus net-carb handling is not yet specified.";
    case "correction_mode":
      return "Correction mode has not yet been explicitly selected.";
    case "locked_food_placements":
      return "Locked food placements are not yet explicitly declared.";
    case "recovery_data":
      return "Recovery data is not yet attached.";
    case "progression_logic":
      return "Progression logic is not yet declared.";
    case "locked_exercises_or_days":
      return "Locked exercise or day placements are not yet declared.";
    case "fatigue_thresholds":
      return "Fatigue thresholds are not yet declared.";
    case "actual_schedule":
      return "Actual schedule data is not yet attached.";
    case "minimum_sleep_rule":
      return "Minimum sleep rule is not yet declared.";
    case "buffer_rules":
      return "Buffer rules are not yet declared.";
    case "fixed_deadlines":
      return "Fixed deadlines are not yet declared.";
    case "uncertainties":
      return "Explicit uncertainties were not declared.";
    case "candidates":
      return "Explicit candidate paths were not declared.";
    case "source_truth":
      return "Source-truth evidence was not declared.";
    default:
      return "Optional field missing.";
  }
}

function containsEstimatedFoodRule(extracted: ExtractedFields): boolean {
  const text = extracted.rawInput.toLowerCase();
  return (
    text.includes("banana macros are estimated") ||
    text.includes("egg macros are estimated") ||
    text.includes("estimated") ||
    extracted.uncertainties.some((u) => u.toLowerCase().includes("estimated"))
  );
}

function containsFiberRule(extracted: ExtractedFields): boolean {
  const text = extracted.rawInput.toLowerCase();
  return (
    text.includes("fiber") ||
    text.includes("net carb") ||
    extracted.uncertainties.some((u) => {
      const l = u.toLowerCase();
      return l.includes("fiber") || l.includes("net carb");
    })
  );
}

function containsLockedPlacementRule(extracted: ExtractedFields): boolean {
  const text = extracted.rawInput.toLowerCase();
  return (
    text.includes("do not move protein placements") ||
    text.includes("preserve protein placements") ||
    text.includes("without breaking timing or protein placement") ||
    text.includes("do not move protein")
  );
}

function containsTrainingProgramSignals(extracted: ExtractedFields): boolean {
  const text = extracted.rawInput.toLowerCase();
  return (
    text.includes("training program") ||
    text.includes("split") ||
    text.includes("hypertrophy") ||
    text.includes("volume") ||
    text.includes("progressive overload") ||
    text.includes("exercise")
  );
}

function containsRecoverySignals(extracted: ExtractedFields): boolean {
  const text = extracted.rawInput.toLowerCase();
  return (
    text.includes("sleep") ||
    text.includes("hrv") ||
    text.includes("soreness") ||
    text.includes("fatigue") ||
    text.includes("recovery")
  );
}

function containsProgressionSignals(extracted: ExtractedFields): boolean {
  const text = extracted.rawInput.toLowerCase();
  return (
    text.includes("progression") ||
    text.includes("linear") ||
    text.includes("increase load") ||
    text.includes("rep progression") ||
    text.includes("autoregulation")
  );
}

function containsLockedTrainingPlacementRule(
  extracted: ExtractedFields
): boolean {
  const text = extracted.rawInput.toLowerCase();
  return (
    text.includes("do not remove training days") ||
    text.includes("preserve training structure") ||
    text.includes("do not change exercise placement") ||
    text.includes("locked exercise") ||
    text.includes("locked day")
  );
}

function containsFatigueThresholds(extracted: ExtractedFields): boolean {
  const text = extracted.rawInput.toLowerCase();
  return (
    text.includes("maximum fatigue") ||
    text.includes("fatigue threshold") ||
    text.includes("maximum soreness") ||
    text.includes("recovery limit")
  );
}

function containsScheduleSignals(extracted: ExtractedFields): boolean {
  const text = extracted.rawInput.toLowerCase();
  return (
    text.includes("planned wake") ||
    text.includes("planned work") ||
    text.includes("planned bedtime") ||
    text.includes("schedule") ||
    text.includes("commute") ||
    text.includes("time block")
  );
}

function containsActualScheduleSignals(extracted: ExtractedFields): boolean {
  const text = extracted.rawInput.toLowerCase();
  return (
    text.includes("actual") ||
    text.includes("deviation") ||
    text.includes("occurred") ||
    text.includes("late") ||
    text.includes("early")
  );
}

function containsSleepRule(extracted: ExtractedFields): boolean {
  const text = extracted.rawInput.toLowerCase();
  return (
    text.includes("sleep must remain") ||
    text.includes("minimum sleep") ||
    text.includes("sleep ≥") ||
    text.includes("sleep >=")
  );
}

function containsBufferRule(extracted: ExtractedFields): boolean {
  const text = extracted.rawInput.toLowerCase();
  return (
    text.includes("buffer") ||
    text.includes("transition") ||
    text.includes("commute variability")
  );
}

function containsDeadlineRule(extracted: ExtractedFields): boolean {
  const text = extracted.rawInput.toLowerCase();
  return (
    text.includes("deadline") ||
    text.includes("must start by") ||
    text.includes("appointment") ||
    text.includes("fixed time")
  );
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
