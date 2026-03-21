import React from "react";
import { FieldAwareEditor } from "./FieldAwareEditor";

export interface FieldPatchPanelProps {
  activeField: string | null;
  onSave: (fieldKey: string, value: unknown) => void;
  onCancel: () => void;
}

export function FieldPatchPanel({
  activeField,
  onSave,
  onCancel,
}: FieldPatchPanelProps) {
  if (!activeField) return null;

  return (
    <div className="nm-field-patch-panel">
      <FieldAwareEditor
        fieldKey={activeField}
        onSave={(value) => onSave(activeField, value)}
        onCancel={onCancel}
      />
    </div>
  );
}
