import React from "react";
import { TargetMacrosEditor } from "./editors/TargetMacrosEditor";
import { CorrectionModeEditor } from "./editors/CorrectionModeEditor";
import { FoodSourceTruthEditor } from "./editors/FoodSourceTruthEditor";
import { LockedPlacementsEditor } from "./editors/LockedPlacementsEditor";
import { MissingFieldEditor } from "./MissingFieldEditor";

export interface FieldAwareEditorProps {
  fieldKey: string;
  onSave: (value: unknown) => void;
  onCancel: () => void;
}

export function FieldAwareEditor({
  fieldKey,
  onSave,
  onCancel,
}: FieldAwareEditorProps) {
  switch (fieldKey) {
    case "target_macros_or_goal":
      return <TargetMacrosEditor onSave={onSave} onCancel={onCancel} />;

    case "correction_mode":
      return <CorrectionModeEditor onSave={onSave} onCancel={onCancel} />;

    case "food_source_truth_or_labels":
      return <FoodSourceTruthEditor onSave={onSave} onCancel={onCancel} />;

    case "locked_food_placements":
      return <LockedPlacementsEditor onSave={onSave} onCancel={onCancel} />;

    default:
      return (
        <MissingFieldEditor
          fieldKey={fieldKey}
          onSave={(value) => onSave(value)}
          onCancel={onCancel}
        />
      );
  }
}
