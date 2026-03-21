import React, { useState } from "react";

export interface MissingFieldEditorProps {
  fieldKey: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

function getFieldLabel(fieldKey: string): string {
  switch (fieldKey) {
    case "meal_system_or_phase_plan":
      return "Meal System / Phase Plan";
    case "target_macros_or_goal":
      return "Target Macros or Goal";
    case "food_source_truth_or_labels":
      return "Food Source Truth / Labels";
    case "correction_mode":
      return "Correction Mode";
    case "locked_food_placements":
      return "Locked Food Placements";
    case "objective":
      return "Objective";
    case "hard_constraints":
      return "Hard Constraints";
    case "planned_schedule":
      return "Planned Schedule";
    default:
      return fieldKey;
  }
}

function getPlaceholder(fieldKey: string): string {
  switch (fieldKey) {
    case "meal_system_or_phase_plan":
      return "Paste the declared meal system or phase plan...";
    case "target_macros_or_goal":
      return "e.g. 2695 / 174p / 331c / 54f";
    case "food_source_truth_or_labels":
      return "e.g. Whey, Flax, Oat, Dextrin, Yogurt labels attached";
    case "correction_mode":
      return "e.g. Audit + minimal correction";
    case "locked_food_placements":
      return "e.g. Preserve whey placement by meal";
    case "objective":
      return "State what outcome matters most...";
    case "hard_constraints":
      return "State the hard non-negotiables...";
    case "planned_schedule":
      return "Paste the declared schedule...";
    default:
      return "Enter value...";
  }
}

export function MissingFieldEditor({
  fieldKey,
  onSave,
  onCancel,
}: MissingFieldEditorProps) {
  const [value, setValue] = useState("");

  return (
    <div className="nm-missing-editor">
      <div className="nm-missing-editor__title">
        Fix: {getFieldLabel(fieldKey)}
      </div>

      <textarea
        className="nm-missing-editor__input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={getPlaceholder(fieldKey)}
      />

      <div className="nm-missing-editor__actions">
        <button
          type="button"
          className="nm-btn nm-btn--secondary"
          onClick={onCancel}
        >
          Cancel
        </button>

        <button
          type="button"
          className="nm-btn nm-btn--primary"
          disabled={!value.trim()}
          onClick={() => onSave(value)}
        >
          Save Field
        </button>
      </div>
    </div>
  );
}
