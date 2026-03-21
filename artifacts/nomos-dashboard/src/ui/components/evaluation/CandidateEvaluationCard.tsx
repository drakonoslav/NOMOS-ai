import React from "react";
import { CandidateEvaluationCardViewModel } from "../../mappers/evaluation_view_models";

export interface CandidateEvaluationCardProps {
  card: CandidateEvaluationCardViewModel;
}

export function CandidateEvaluationCard({ card }: CandidateEvaluationCardProps) {
  return (
    <div className={`panel candidate-evaluation-card ${card.toneClassName}`}>
      <div className="candidate-evaluation-card__header">
        <div className="candidate-evaluation-card__title">{card.title}</div>
        <div className={`status-badge ${card.toneClassName}`}>
          {card.statusLabel}
        </div>
      </div>

      {card.decisiveVariable && (
        <div className="candidate-evaluation-card__decisive">
          <div className="candidate-evaluation-card__label">Decisive Factor</div>
          <div className="candidate-evaluation-card__value">
            {card.decisiveVariable}
          </div>
        </div>
      )}

      <div className="candidate-evaluation-card__reason">{card.reason}</div>

      {card.adjustments.length > 0 && (
        <div className="candidate-evaluation-card__adjustments">
          <div className="candidate-evaluation-card__label">Adjustments</div>
          <ul className="candidate-evaluation-card__list">
            {card.adjustments.map((adjustment, i) => (
              <li key={i}>{adjustment}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
