import { StructuredDraft } from "./auto_compiler";
import { IntentType } from "./domain_templates";

export function patchDraftField(
  draft: StructuredDraft,
  fieldKey: string,
  value: unknown
): StructuredDraft {
  const next: StructuredDraft = {
    ...draft,
    state: [...draft.state],
    constraints: [...draft.constraints],
    uncertainties: [...draft.uncertainties],
    candidates: [...draft.candidates],
    objective: [...draft.objective],
    missingRequiredFields: [...draft.missingRequiredFields],
    missingOptionalFields: [...draft.missingOptionalFields],
    warnings: [...draft.warnings],
    notes: [...draft.notes],
  };

  switch (fieldKey) {
    case "meal_system_or_phase_plan": {
      if (typeof value === "string" && value.trim()) {
        next.state = replaceOrAppend(
          next.state,
          "A declared multi-meal or multi-phase nutrition system is present."
        );
        next.notes = removeMatching(
          next.notes,
          "No computable meal system detected."
        );
        next.missingRequiredFields = removeKey(
          next.missingRequiredFields,
          fieldKey
        );
      }
      break;
    }

    case "target_macros_or_goal": {
      if (typeof value === "object" && value && "normalized" in value) {
        const v = value as { normalized: string };
        next.objective = replaceOrAppend(
          next.objective,
          `Target macros: ${v.normalized}`
        );
        next.state = replaceOrAppend(
          next.state,
          "Target macro blocks were detected."
        );
        next.missingRequiredFields = removeKey(
          next.missingRequiredFields,
          fieldKey
        );
      } else if (typeof value === "string" && value.trim()) {
        next.objective = replaceOrAppend(next.objective, value.trim());
        next.state = replaceOrAppend(
          next.state,
          "Target macro blocks were detected."
        );
        next.missingRequiredFields = removeKey(
          next.missingRequiredFields,
          fieldKey
        );
      }
      break;
    }

    case "food_source_truth_or_labels": {
      if (typeof value === "object" && value) {
        next.state = replaceOrAppend(
          next.state,
          "Food-label or source-truth references were detected."
        );
        next.constraints = replaceOrAppend(
          next.constraints,
          "Label truth overrides food assumptions where labels are provided."
        );
        next.uncertainties = replaceOrAppend(
          next.uncertainties,
          "Banana and egg values may remain estimated unless separately grounded."
        );
        next.missingRequiredFields = removeKey(
          next.missingRequiredFields,
          fieldKey
        );
      } else if (typeof value === "string" && value.trim()) {
        next.state = replaceOrAppend(
          next.state,
          "Food-label or source-truth references were detected."
        );
        next.constraints = replaceOrAppend(
          next.constraints,
          "Label truth overrides food assumptions where labels are provided."
        );
        next.missingRequiredFields = removeKey(
          next.missingRequiredFields,
          fieldKey
        );
      }
      break;
    }

    case "correction_mode": {
      if (typeof value === "object" && value && "label" in value) {
        const v = value as { label: string };
        next.candidates = [
          ...next.candidates,
          { id: "USER", text: v.label },
        ];
        next.missingOptionalFields = removeKey(
          next.missingOptionalFields,
          fieldKey
        );
      } else if (typeof value === "string" && value.trim()) {
        next.candidates = [
          ...next.candidates,
          { id: "USER", text: value.trim() },
        ];
        next.missingOptionalFields = removeKey(
          next.missingOptionalFields,
          fieldKey
        );
      }
      break;
    }

    case "locked_food_placements": {
      if (typeof value === "object" && value) {
        next.constraints = replaceOrAppend(
          next.constraints,
          "Protein placement should remain fixed unless explicitly released."
        );
        next.constraints = replaceOrAppend(
          next.constraints,
          "Meal order and dispersal should remain fixed unless explicitly released."
        );
        next.missingOptionalFields = removeKey(
          next.missingOptionalFields,
          fieldKey
        );
      } else if (typeof value === "string" && value.trim()) {
        next.constraints = replaceOrAppend(next.constraints, value.trim());
        next.missingOptionalFields = removeKey(
          next.missingOptionalFields,
          fieldKey
        );
      }
      break;
    }

    case "objective": {
      if (typeof value === "string" && value.trim()) {
        next.objective = replaceOrAppend(next.objective, value.trim());
        next.missingRequiredFields = removeKey(
          next.missingRequiredFields,
          fieldKey
        );
      }
      break;
    }

    case "hard_constraints": {
      if (typeof value === "string" && value.trim()) {
        next.constraints = replaceOrAppend(next.constraints, value.trim());
        next.missingRequiredFields = removeKey(
          next.missingRequiredFields,
          fieldKey
        );
      }
      break;
    }

    case "planned_schedule": {
      if (typeof value === "string" && value.trim()) {
        next.state = replaceOrAppend(
          next.state,
          "A schedule or time-block structure is present."
        );
        next.notes = removeMatching(
          next.notes,
          "Planned schedule or anchor blocks were not explicitly declared."
        );
        next.missingRequiredFields = removeKey(
          next.missingRequiredFields,
          fieldKey
        );
      }
      break;
    }

    default:
      break;
  }

  next.isEvaluable = next.missingRequiredFields.length === 0;
  return next;
}

export function revalidateDraft(
  draft: StructuredDraft,
  _intent: IntentType
): StructuredDraft {
  return {
    ...draft,
    isEvaluable: draft.missingRequiredFields.length === 0,
  };
}

function replaceOrAppend(list: string[], line: string): string[] {
  if (list.includes(line)) return list;
  return [...list, line];
}

function removeKey(list: string[], key: string): string[] {
  return list.filter((x) => x !== key);
}

function removeMatching(list: string[], match: string): string[] {
  return list.filter((x) => x !== match);
}
