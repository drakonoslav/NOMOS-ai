import React from "react";
import { EvaluationResult } from "../../evaluation/eval_types";
import { mapEvaluationResultToViewModel } from "../../mappers/evaluation_mapper";
import { CandidateEvaluationCard } from "./CandidateEvaluationCard";

export interface EvaluationResultPanelProps {
  result?: EvaluationResult;
}

export function EvaluationResultPanel({ result }: EvaluationResultPanelProps) {
  if (!result) return null;

  const vm = mapEvaluationResultToViewModel(result);

  return (
    <div className="panel evaluation-result-panel">
      <div className="panel-header">Evaluation Result</div>

      <div className="evaluation-result-panel__summary-grid">
        <div className="evaluation-result-panel__summary-item">
          <div className="evaluation-result-panel__summary-label">Overall Status</div>
          <div
            className={`evaluation-result-panel__summary-value ${vm.overallToneClassName}`}
          >
            {vm.overallStatusLabel}
          </div>
        </div>

        <div className="evaluation-result-panel__summary-item">
          <div className="evaluation-result-panel__summary-label">Lawful Candidate Set</div>
          <div className="evaluation-result-panel__summary-value">{vm.lawfulSetLabel}</div>
        </div>

        {vm.decisiveVariable && (
          <div className="evaluation-result-panel__summary-item evaluation-result-panel__summary-item--full">
            <div className="evaluation-result-panel__summary-label">Decisive Variable</div>
            <div className="evaluation-result-panel__summary-value">{vm.decisiveVariable}</div>
          </div>
        )}
      </div>

      <div className="evaluation-result-panel__cards">
        {vm.candidateCards.map((card) => (
          <CandidateEvaluationCard key={card.id} card={card} />
        ))}
      </div>

      {vm.notes.length > 0 && (
        <div className="evaluation-result-panel__notes">
          <div className="evaluation-result-panel__notes-title">Notes</div>
          <ul>
            {vm.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
