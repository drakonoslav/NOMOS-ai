import React, { useState } from "react";

type LockedPlacementState = {
  preserveMealOrder: boolean;
  preserveMealCount: boolean;
  preserveProteinPlacement: boolean;
  preserveWheyPlacement: boolean;
  preserveMealDispersal: boolean;
};

const ITEMS: { key: keyof LockedPlacementState; label: string }[] = [
  { key: "preserveMealOrder", label: "Preserve meal order" },
  { key: "preserveMealCount", label: "Preserve meal count" },
  { key: "preserveProteinPlacement", label: "Preserve protein placement by meal" },
  { key: "preserveWheyPlacement", label: "Preserve whey placement" },
  { key: "preserveMealDispersal", label: "Preserve meal dispersal" },
];

export function LockedPlacementsEditor({
  onSave,
  onCancel,
}: {
  onSave: (value: LockedPlacementState) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<LockedPlacementState>({
    preserveMealOrder: true,
    preserveMealCount: true,
    preserveProteinPlacement: true,
    preserveWheyPlacement: true,
    preserveMealDispersal: true,
  });

  function toggle(key: keyof LockedPlacementState) {
    setState((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="nm-structured-editor">
      <div className="nm-structured-editor__title">Locked Placements</div>

      <div className="nm-checkbox-list">
        {ITEMS.map(({ key, label }) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={state[key]}
              onChange={() => toggle(key)}
            />
            {label}
          </label>
        ))}
      </div>

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
          onClick={() => onSave(state)}
        >
          Save Field
        </button>
      </div>
    </div>
  );
}
