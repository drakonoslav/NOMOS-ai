import React from "react";
import { StructuredDraft } from "../../../compiler/auto_compiler";

export interface CompiledDraftPanelProps {
  draft: StructuredDraft | null;
  isConfirmed: boolean;
  onConfirm: () => void;
  onRevise: () => void;
}

function SectionList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className="nm-compiled-section">
      <div className="nm-compiled-section__title">{title}</div>
      <ul className="nm-compiled-section__list">
        {items.map((item, i) => (
          <li key={`${title}-${i}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function CandidateList({ items }: { items: { id: string; text: string }[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="nm-compiled-section">
      <div className="nm-compiled-section__title">CANDIDATES</div>
      <div className="nm-compiled-candidates">
        {items.map((item) => (
          <div key={item.id} className="nm-compiled-candidate">
            <div className="nm-compiled-candidate__id">{item.id}</div>
            <div className="nm-compiled-candidate__text">{item.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "required" | "optional" | "warning" | "note";
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className={`nm-compiled-meta nm-compiled-meta--${tone}`}>
      <div className="nm-compiled-meta__title">{title}</div>
      <ul className="nm-compiled-meta__list">
        {items.map((item, i) => (
          <li key={`${title}-${i}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function CompiledDraftPanel({
  draft,
  isConfirmed,
  onConfirm,
  onRevise,
}: CompiledDraftPanelProps) {
  if (!draft) return null;

  return (
    <div className="nm-compiled-panel">
      <div className="nm-compiled-panel__header">
        <div>
          <div className="nm-compiled-panel__eyebrow">COMPILED DRAFT</div>
          <div className="nm-compiled-panel__title">{draft.title}</div>
        </div>

        <div
          className={`nm-compiled-status ${
            draft.isEvaluable
              ? "nm-compiled-status--evaluable"
              : "nm-compiled-status--blocked"
          }`}
        >
          {draft.isEvaluable ? "EVALUABLE" : "INCOMPLETE"}
        </div>
      </div>

      <div className="nm-compiled-panel__body">
        <SectionList title="STATE" items={draft.state} />
        <SectionList title="CONSTRAINTS" items={draft.constraints} />
        <SectionList title="UNCERTAINTIES" items={draft.uncertainties} />
        <CandidateList items={draft.candidates} />
        <SectionList title="OBJECTIVE" items={draft.objective} />

        <div className="nm-compiled-grid">
          <FieldList
            title="MISSING REQUIRED FIELDS"
            items={draft.missingRequiredFields}
            tone="required"
          />

          <FieldList
            title="MISSING OPTIONAL FIELDS"
            items={draft.missingOptionalFields}
            tone="optional"
          />

          <FieldList title="WARNINGS" items={draft.warnings} tone="warning" />

          <FieldList title="NOTES" items={draft.notes} tone="note" />
        </div>
      </div>

      <div className="nm-compiled-panel__footer">
        <button
          type="button"
          className="nm-btn nm-btn--secondary"
          onClick={onRevise}
        >
          Revise Draft
        </button>

        <button
          type="button"
          className="nm-btn nm-btn--primary"
          onClick={onConfirm}
          disabled={!draft.isEvaluable}
        >
          {isConfirmed ? "Draft Confirmed" : "Confirm Draft"}
        </button>
      </div>
    </div>
  );
}
