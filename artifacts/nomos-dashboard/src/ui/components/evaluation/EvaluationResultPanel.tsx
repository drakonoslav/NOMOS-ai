import React from "react";
import { EvaluationResult } from "../../evaluation/eval_types";
import { mapEvaluationResultToViewModel } from "../../mappers/evaluation_mapper";
import { CandidateEvaluationCard } from "./CandidateEvaluationCard";
import { CompiledConstraint } from "../../../compiler/constraint_compiler";

export interface EvaluationResultPanelProps {
  result?: EvaluationResult;
  /** Optional compiled constraints — used to resolve decisive variables and
   *  show the unresolved-constraint warning correctly. */
  compiledConstraints?: CompiledConstraint[];
}

export function EvaluationResultPanel({ result, compiledConstraints }: EvaluationResultPanelProps) {
  if (!result) return null;

  const vm = mapEvaluationResultToViewModel(result, compiledConstraints);

  return (
    <div className="panel evaluation-result-panel">
      <div className="panel-header">Evaluation Result</div>

      <div className="evaluation-result-panel__summary-grid">
        <div className="evaluation-result-panel__summary-item">
          <div className="evaluation-result-panel__summary-label">Overall Status</div>
          <div className={`evaluation-result-panel__summary-value ${vm.overallToneClassName}`}>
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

        {vm.bestCandidateId && (
          <div className="evaluation-result-panel__summary-item">
            <div className="evaluation-result-panel__summary-label">Best Candidate</div>
            <div className="evaluation-result-panel__summary-value evaluation-result-panel__summary-value--mono">
              {vm.bestCandidateId}
            </div>
          </div>
        )}

        {vm.strongestMarginScore && (
          <div className="evaluation-result-panel__summary-item">
            <div className="evaluation-result-panel__summary-label">Strongest Margin</div>
            <div className="evaluation-result-panel__summary-value evaluation-result-panel__summary-value--mono">
              {vm.strongestMarginScore}
            </div>
          </div>
        )}

        {vm.weakestAdmissibleMarginScore && (
          <div className="evaluation-result-panel__summary-item evaluation-result-panel__summary-item--full">
            <div className="evaluation-result-panel__summary-label">Weakest Admissible Margin</div>
            <div className="evaluation-result-panel__summary-value evaluation-result-panel__summary-value--mono">
              {vm.weakestAdmissibleMarginScore}
            </div>
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
