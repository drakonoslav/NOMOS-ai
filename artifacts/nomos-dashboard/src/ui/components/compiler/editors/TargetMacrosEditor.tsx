import React, { useState } from "react";

export function TargetMacrosEditor({
  onSave,
  onCancel,
}: {
  onSave: (value: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    normalized: string;
  }) => void;
  onCancel: () => void;
}) {
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  const valid =
    calories !== "" && protein !== "" && carbs !== "" && fat !== "";

  return (
    <div className="nm-structured-editor">
      <div className="nm-structured-editor__title">Target Macros</div>

      <div className="nm-form-grid">
        <label>
          <span>Calories</span>
          <input
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            type="number"
            min="0"
          />
        </label>
        <label>
          <span>Protein (g)</span>
          <input
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            type="number"
            min="0"
          />
        </label>
        <label>
          <span>Carbs (g)</span>
          <input
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
            type="number"
            min="0"
          />
        </label>
        <label>
          <span>Fat (g)</span>
          <input
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            type="number"
            min="0"
          />
        </label>
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
          disabled={!valid}
          onClick={() =>
            onSave({
              calories: Number(calories),
              protein: Number(protein),
              carbs: Number(carbs),
              fat: Number(fat),
              normalized: `${calories} / ${protein}p / ${carbs}c / ${fat}f`,
            })
          }
        >
          Save Field
        </button>
      </div>
    </div>
  );
}
