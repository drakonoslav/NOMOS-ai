import React, { useState } from "react";

type CorrectionMode = "audit_only" | "audit_and_correct" | "derive_global_bias";

export function CorrectionModeEditor({
  onSave,
  onCancel,
}: {
  onSave: (value: { mode: CorrectionMode; label: string }) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<CorrectionMode>("audit_only");

  const labels: Record<CorrectionMode, string> = {
    audit_only: "Audit only",
    audit_and_correct: "Audit + minimal correction",
    derive_global_bias: "Derive global bias",
  };

  return (
    <div className="nm-structured-editor">
      <div className="nm-structured-editor__title">Correction Mode</div>

      <label>
        <span>Mode</span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as CorrectionMode)}
        >
          <option value="audit_only">Audit only</option>
          <option value="audit_and_correct">Audit + minimal correction</option>
          <option value="derive_global_bias">Derive global bias</option>
        </select>
      </label>

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
          onClick={() => onSave({ mode, label: labels[mode] })}
        >
          Save Field
        </button>
      </div>
    </div>
  );
}
