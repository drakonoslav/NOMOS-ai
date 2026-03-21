import React from "react";
import { NomosQuery } from "../../../query/query_types";

export interface ParsePreviewPanelProps {
  parsedQuery?: NomosQuery;
  parseErrors: string[];
  parseWarnings: string[];
  previewAccepted: boolean;
  onAcceptPreview: (accepted: boolean) => void;
}

function confidenceClass(confidence?: string): string {
  switch (confidence) {
    case "HIGH":   return "confidence-high";
    case "MEDIUM": return "confidence-medium";
    default:       return "confidence-low";
  }
}

function completenessClass(completeness?: string): string {
  switch (completeness) {
    case "COMPLETE":     return "status-complete";
    case "PARTIAL":      return "status-partial";
    case "INSUFFICIENT": return "status-insufficient";
    default:             return "status-unparsed";
  }
}

export function ParsePreviewPanel({
  parsedQuery,
  parseErrors,
  parseWarnings,
  previewAccepted,
  onAcceptPreview,
}: ParsePreviewPanelProps) {
  return (
    <div className="panel parse-preview-panel">
      <div className="panel-header">Parse Preview</div>

      {parseErrors.length > 0 && (
        <div className="message-block message-block--error">
          {parseErrors.map((err, i) => (
            <div key={i}>{err}</div>
          ))}
        </div>
      )}

      {parseWarnings.length > 0 && !parsedQuery && (
        <div className="message-block message-block--warning">
          {parseWarnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      {!parsedQuery && parseErrors.length === 0 && (
        <p className="preview-value preview-value--empty">
          No parsed query yet. Submit input and click Parse.
        </p>
      )}

      {parsedQuery && (
        <>
          {/* State */}
          <div className="preview-section">
            <div className="preview-section__title">— Parsed State —</div>

            {parsedQuery.state.description && (
              <div className="preview-item">
                <div className="preview-label">Description</div>
                <div className="preview-value">{parsedQuery.state.description}</div>
              </div>
            )}

            <PreviewList label="Facts" items={parsedQuery.state.facts} />
            <PreviewList label="Constraints" items={parsedQuery.state.constraints} />
            <PreviewList label="Uncertainties" items={parsedQuery.state.uncertainties} />
          </div>

          {/* Candidates */}
          <div className="preview-section">
            <div className="preview-section__title">— Parsed Candidates —</div>
            {parsedQuery.candidates.length === 0 ? (
              <span className="preview-value preview-value--empty">
                No candidates detected.
              </span>
            ) : (
              parsedQuery.candidates.map((c) => (
                <div key={c.id} className="candidate-preview-row">
                  <span className="candidate-preview-row__id">{c.id}:</span>
                  <span className="candidate-preview-row__description">
                    {c.description}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Objective */}
          <div className="preview-section">
            <div className="preview-section__title">— Parsed Objective —</div>
            {parsedQuery.objective ? (
              <div className="preview-value">{parsedQuery.objective.description}</div>
            ) : (
              <span className="preview-value preview-value--empty">
                No objective detected.
              </span>
            )}
          </div>

          {/* Diagnostics */}
          <div className="preview-section">
            <div className="preview-section__title">— Parser Diagnostics —</div>
            <div className="diagnostics-grid">
              <div className="diagnostic-item">
                <div className="diagnostic-label">Parser Confidence</div>
                <div
                  className={`diagnostic-value ${confidenceClass(parsedQuery.parserConfidence)}`}
                >
                  {parsedQuery.parserConfidence}
                </div>
              </div>
              <div className="diagnostic-item">
                <div className="diagnostic-label">Submission Quality</div>
                <div
                  className={`diagnostic-value ${completenessClass(parsedQuery.completeness)}`}
                >
                  {parsedQuery.completeness}
                </div>
              </div>
            </div>

            {parsedQuery.notes.length > 0 && (
              <div className="preview-item">
                <div className="preview-label">Findings</div>
                <ul className="preview-list">
                  {parsedQuery.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Confirmation */}
          <div className="preview-acceptance">
            <input
              id="preview-accept-checkbox"
              type="checkbox"
              className="preview-acceptance__checkbox"
              checked={previewAccepted}
              onChange={(e) => onAcceptPreview(e.target.checked)}
            />
            <label
              htmlFor="preview-accept-checkbox"
              className="preview-acceptance__label"
            >
              I confirm this structured query matches my intended submission.
            </label>
          </div>
        </>
      )}
    </div>
  );
}

function PreviewList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="preview-item">
      <div className="preview-label">{label}</div>
      {items.length === 0 ? (
        <span className="preview-value preview-value--empty">None detected.</span>
      ) : (
        <ul className="preview-list">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
