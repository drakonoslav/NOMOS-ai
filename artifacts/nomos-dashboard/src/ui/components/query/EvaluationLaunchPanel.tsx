import React from "react";
import { NomosQuery } from "../../../query/query_types";

export interface EvaluationLaunchPanelProps {
  parsedQuery?: NomosQuery;
  previewAccepted: boolean;
  isEvaluating: boolean;
  canEvaluate: boolean;
  onEvaluate: () => void;
}

function getStatusMessage(
  parsedQuery: NomosQuery | undefined,
  previewAccepted: boolean
): { text: string; ready: boolean } {
  if (!parsedQuery) {
    return { text: "Parse a submission before evaluation.", ready: false };
  }
  if (parsedQuery.completeness === "INSUFFICIENT") {
    return {
      text: "Submission is insufficient for evaluation. Add constraints, candidates, or objective.",
      ready: false,
    };
  }
  if (!previewAccepted) {
    return {
      text: "Confirm the parsed query before evaluation.",
      ready: false,
    };
  }
  return { text: "Ready for NOMOS evaluation.", ready: true };
}

export function EvaluationLaunchPanel({
  parsedQuery,
  previewAccepted,
  isEvaluating,
  canEvaluate,
  onEvaluate,
}: EvaluationLaunchPanelProps) {
  const { text, ready } = getStatusMessage(parsedQuery, previewAccepted);

  return (
    <div className="panel evaluation-launch-panel">
      <div className="panel-header">Evaluation</div>

      <div className="launch-status">
        <div
          className={`launch-status__indicator ${
            ready ? "launch-status__indicator--ready" : ""
          }`}
        />
        <div
          className={`launch-status__message ${
            ready ? "launch-status__message--ready" : ""
          }`}
        >
          {text}
        </div>
      </div>

      <button
        type="button"
        className="button launch-button"
        onClick={onEvaluate}
        disabled={!canEvaluate || isEvaluating}
      >
        {isEvaluating ? "Evaluating Candidates..." : "Evaluate Candidates"}
      </button>
    </div>
  );
}
