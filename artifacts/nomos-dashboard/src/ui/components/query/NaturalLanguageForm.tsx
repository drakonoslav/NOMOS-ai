import React from "react";

export interface NaturalLanguageFormProps {
  value: string;
  onChange: (next: string) => void;
  onParse: () => void;
  onReset: () => void;
  canParse: boolean;
  isParsing: boolean;
}

export function NaturalLanguageForm({
  value,
  onChange,
  onParse,
  onReset,
  canParse,
  isParsing,
}: NaturalLanguageFormProps) {
  return (
    <div className="natural-language-form">
      <div className="panel">
        <div className="panel-header">Natural Language Submission</div>

        <label className="form-field">
          <span className="form-label">Raw Input</span>
          <textarea
            className="form-textarea form-textarea--large"
            rows={16}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`STATE:
- Describe the current situation

CONSTRAINTS:
- List hard limits

UNCERTAINTIES:
- List unknowns

CANDIDATES:
A: ...
B: ...

OBJECTIVE:
...`}
          />
        </label>
      </div>

      <div className="panel">
        <div className="panel-header">Prompt Hints</div>
        <ul className="hint-list">
          <li>State the current situation clearly.</li>
          <li>Name hard constraints explicitly.</li>
          <li>Provide at least two candidate actions.</li>
          <li>State the objective separately from the constraints.</li>
        </ul>
      </div>

      <div className="panel form-actions-panel">
        <div className="form-actions">
          <button
            type="button"
            className="button"
            onClick={onParse}
            disabled={!canParse || isParsing}
          >
            {isParsing ? "Parsing..." : "Parse"}
          </button>

          <button
            type="button"
            className="button button-secondary"
            onClick={onReset}
            disabled={isParsing}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
