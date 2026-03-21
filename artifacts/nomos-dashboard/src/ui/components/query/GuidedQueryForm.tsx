import React from "react";
import {
  GuidedCandidateDraft,
  GuidedQueryDraft,
} from "../../pages/query/QueryBuilderPage";

export interface GuidedQueryFormProps {
  value: GuidedQueryDraft;
  onChange: (next: GuidedQueryDraft) => void;
  onParse: () => void;
  onEvaluate: () => void;
  onReset: () => void;
  canParse: boolean;
  canEvaluate: boolean;
  isParsing: boolean;
  isEvaluating: boolean;
}

function updateArrayAt<T>(arr: T[], index: number, next: T): T[] {
  return arr.map((item, i) => (i === index ? next : item));
}

function removeArrayAt<T>(arr: T[], index: number): T[] {
  return arr.filter((_, i) => i !== index);
}

export function GuidedQueryForm({
  value,
  onChange,
  onParse,
  onEvaluate,
  onReset,
  canParse,
  canEvaluate,
  isParsing,
  isEvaluating,
}: GuidedQueryFormProps) {
  const setSituation = (situation: string) => onChange({ ...value, situation });
  const setObjective = (objective: string) => onChange({ ...value, objective });
  const setFacts = (facts: string[]) => onChange({ ...value, facts });
  const setConstraints = (constraints: string[]) => onChange({ ...value, constraints });
  const setUncertainties = (uncertainties: string[]) => onChange({ ...value, uncertainties });
  const setCandidates = (candidates: GuidedCandidateDraft[]) =>
    onChange({ ...value, candidates });

  return (
    <div className="guided-query-form">
      <div className="panel">
        <div className="panel-header">State</div>

        <label className="form-field">
          <span className="form-label">Situation</span>
          <textarea
            className="form-textarea"
            rows={5}
            value={value.situation}
            onChange={(e) => setSituation(e.target.value)}
            placeholder="Describe the current situation in plain terms."
          />
        </label>

        <ListEditor
          label="Facts"
          values={value.facts}
          onChange={setFacts}
          placeholder="Enter a factual condition."
        />

        <ListEditor
          label="Constraints"
          values={value.constraints}
          onChange={setConstraints}
          placeholder="Enter a hard limit or requirement."
        />

        <ListEditor
          label="Uncertainties"
          values={value.uncertainties}
          onChange={setUncertainties}
          placeholder="Enter an unknown or unresolved factor."
        />
      </div>

      <div className="panel">
        <div className="panel-header">Candidates</div>

        <div className="candidate-list">
          {value.candidates.map((candidate, index) => (
            <CandidateRow
              key={`${candidate.id}-${index}`}
              value={candidate}
              onChange={(next) =>
                setCandidates(updateArrayAt(value.candidates, index, next))
              }
              onRemove={() => setCandidates(removeArrayAt(value.candidates, index))}
            />
          ))}
        </div>

        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            const nextId = String.fromCharCode(65 + value.candidates.length);
            setCandidates([
              ...value.candidates,
              { id: nextId, description: "", notes: "" },
            ]);
          }}
        >
          Add Candidate
        </button>
      </div>

      <div className="panel">
        <div className="panel-header">Objective</div>

        <label className="form-field">
          <span className="form-label">Objective</span>
          <textarea
            className="form-textarea"
            rows={4}
            value={value.objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Describe the outcome that matters most."
          />
        </label>
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
            disabled={isParsing || isEvaluating}
          >
            Reset
          </button>

          <button
            type="button"
            className="button button-accent"
            onClick={onEvaluate}
            disabled={!canEvaluate || isEvaluating}
          >
            {isEvaluating ? "Evaluating..." : "Evaluate"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ListEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="list-editor">
      <div className="form-label">{label}</div>

      {values.map((item, index) => (
        <div className="list-editor__row" key={`${label}-${index}`}>
          <input
            className="form-input"
            value={item}
            onChange={(e) =>
              onChange(updateArrayAt(values, index, e.target.value))
            }
            placeholder={placeholder}
          />
          <button
            type="button"
            className="button button-ghost"
            onClick={() => onChange(removeArrayAt(values, index))}
            disabled={values.length <= 1}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        className="button button-secondary"
        onClick={() => onChange([...values, ""])}
        style={{ marginTop: "0.375rem" }}
      >
        Add {label.slice(0, -1)}
      </button>
    </div>
  );
}

function CandidateRow({
  value,
  onChange,
  onRemove,
}: {
  value: GuidedCandidateDraft;
  onChange: (next: GuidedCandidateDraft) => void;
  onRemove: () => void;
}) {
  return (
    <div className="candidate-row">
      <div className="candidate-row__meta">
        <label className="form-field candidate-row__id">
          <span className="form-label">ID</span>
          <input
            className="form-input"
            value={value.id}
            onChange={(e) => onChange({ ...value, id: e.target.value })}
          />
        </label>
      </div>

      <label className="form-field">
        <span className="form-label">Description</span>
        <textarea
          className="form-textarea"
          rows={3}
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          placeholder="Describe the candidate action."
        />
      </label>

      <label className="form-field">
        <span className="form-label">Notes (optional)</span>
        <input
          className="form-input"
          value={value.notes ?? ""}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          placeholder="Optional supporting note."
        />
      </label>

      <div className="candidate-row__actions">
        <button
          type="button"
          className="button button-ghost"
          onClick={onRemove}
        >
          Remove Candidate
        </button>
      </div>
    </div>
  );
}
