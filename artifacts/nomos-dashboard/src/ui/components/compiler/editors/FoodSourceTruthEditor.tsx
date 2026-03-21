import React, { useState } from "react";

type FoodSourceState = {
  whey: boolean;
  flax: boolean;
  oats: boolean;
  dextrin: boolean;
  yogurt: boolean;
  bananaEstimated: boolean;
  eggEstimated: boolean;
};

const ITEMS: { key: keyof FoodSourceState; label: string }[] = [
  { key: "whey", label: "Whey label attached" },
  { key: "flax", label: "Flax label attached" },
  { key: "oats", label: "Oat label attached" },
  { key: "dextrin", label: "Dextrin label attached" },
  { key: "yogurt", label: "Yogurt label attached" },
  { key: "bananaEstimated", label: "Banana estimated" },
  { key: "eggEstimated", label: "Egg estimated" },
];

export function FoodSourceTruthEditor({
  onSave,
  onCancel,
}: {
  onSave: (value: FoodSourceState) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<FoodSourceState>({
    whey: true,
    flax: true,
    oats: true,
    dextrin: true,
    yogurt: true,
    bananaEstimated: true,
    eggEstimated: true,
  });

  function toggle(key: keyof FoodSourceState) {
    setState((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="nm-structured-editor">
      <div className="nm-structured-editor__title">Food Source Truth</div>

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
