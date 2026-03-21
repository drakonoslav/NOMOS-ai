import React from "react";
import { NomosQueryResponse } from "../../../query/query_types";

export interface EvaluationResultPanelProps {
  result?: NomosQueryResponse;
}

function statusClass(status: string): string {
  switch (status) {
    case "LAWFUL":   return "result-overall__status--lawful";
    case "DEGRADED": return "result-overall__status--degraded";
    case "INVALID":  return "result-overall__status--invalid";
    default:         return "";
  }
}

function evalClass(classification: string): string {
  switch (classification) {
    case "LAWFUL":   return "candidate-evaluation--lawful";
    case "DEGRADED": return "candidate-evaluation--degraded";
    case "INVALID":  return "candidate-evaluation--invalid";
    default:         return "";
  }
}

function evalStatusClass(classification: string): string {
  switch (classification) {
    case "LAWFUL":   return "candidate-eval-status--lawful";
    case "DEGRADED": return "candidate-eval-status--degraded";
    case "INVALID":  return "candidate-eval-status--invalid";
    default:         return "";
  }
}

/**
 * Render a reason with [VIOLATION] or [RISK] prefix styled distinctly.
 */
function ReasonLine({ reason }: { reason: string }) {
  if (reason.startsWith("[VIOLATION]")) {
    const body = reason.slice("[VIOLATION]".length).trim();
    return (
      <li>
        <span className="nm-violation-label">[VIOLATION]</span>{" "}
        {body}
      </li>
    );
  }
  if (reason.startsWith("[RISK]")) {
    const body = reason.slice("[RISK]".length).trim();
    return (
      <li>
        <span className="nm-risk-label">[RISK]</span>{" "}
        {body}
      </li>
    );
  }
  return <li>{reason}</li>;
}

export function EvaluationResultPanel({ result }: EvaluationResultPanelProps) {
  if (!result) return null;

  return (
    <div className="panel evaluation-result-panel">
      <div className="panel-header">
        <span>Evaluation Result</span>
        {result.evaluationMethod && (
          <span className="eval-method-badge">
            {result.evaluationMethod === "rule-based" ? "RULE-BASED" : "LLM"}
          </span>
        )}
      </div>

      {/* Overall status */}
      <div className="result-header">
        <div className="result-overall">
          <div className="result-overall__label">Overall Status</div>
          <div
            className={`result-overall__status ${statusClass(result.overallStatus)}`}
          >
            {result.overallStatus}
          </div>
        </div>
        <div>
          <div className="preview-label">Submission Quality</div>
          <div className="preview-value">{result.submissionQuality}</div>
        </div>
      </div>

      {/* Lawful set */}
      {result.lawfulSet.length > 0 && (
        <div className="preview-item" style={{ marginBottom: "0.75rem" }}>
          <div className="preview-label">Lawful Candidate Set</div>
          <div className="preview-value confidence-high">
            {result.lawfulSet.join(", ")}
          </div>
        </div>
      )}

      {/* Candidate evaluations */}
      <div style={{ marginBottom: "0.5rem" }}>
        <div className="preview-label" style={{ marginBottom: "0.5rem" }}>
          Candidate Evaluations
        </div>
        {result.candidateEvaluations.map((ev) => (
          <div
            key={ev.id}
            className={`candidate-evaluation ${evalClass(ev.classification)}`}
          >
            <div className="candidate-eval-header">
              <span className="preview-label">Candidate {ev.id}</span>
              <span
                className={`candidate-eval-status ${evalStatusClass(ev.classification)}`}
              >
                {ev.classification}
              </span>
            </div>

            {/* Violated / risk constraints — shown before reasons */}
            {ev.violatedConstraints && ev.violatedConstraints.length > 0 && (
              <div className={`violated-constraints-block violated-constraints-block--${ev.classification.toLowerCase()}`}>
                <div className="violated-constraints-label">
                  {ev.classification === "INVALID" ? "VIOLATED CONSTRAINTS" : "RISK CONSTRAINTS"}
                </div>
                {ev.violatedConstraints.map((vc, i) => (
                  <div key={i} className="violated-constraint-text">· {vc}</div>
                ))}
              </div>
            )}

            {ev.reasons.length > 0 && (
              <ul className="candidate-eval-reasons">
                {ev.reasons.map((r, i) => (
                  <ReasonLine key={i} reason={r} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Adjustments */}
      {result.adjustments && result.adjustments.length > 0 && (
        <div>
          <div className="preview-label" style={{ marginBottom: "0.5rem" }}>
            Adjustments to Achieve Lawfulness
          </div>
          {result.adjustments.map((adj) => (
            <div key={adj.candidateId} className="adjustment-block">
              <div className="preview-label">Candidate {adj.candidateId}</div>
              <ul className="preview-list" style={{ marginTop: "0.25rem" }}>
                {adj.actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {result.notes.length > 0 && (
        <div style={{ marginTop: "0.75rem", borderTop: "1px solid hsl(var(--border))", paddingTop: "0.5rem" }}>
          <div className="preview-label" style={{ marginBottom: "0.375rem" }}>
            Notes
          </div>
          <ul className="preview-list">
            {result.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
