import React from "react";
import { useScenario } from "@/context/scenario-context";
import { extractRunSummaries } from "../../audit/audit_timeseries";
import { predictNextFailure } from "../../audit/failure_prediction";
import type { FailurePrediction } from "../../audit/failure_prediction";

export function FailurePredictionPanel() {
  const { auditEntries } = useScenario();

  const series     = extractRunSummaries(auditEntries);
  const prediction = predictNextFailure(series);

  return (
    <div className="panel prediction-panel">
      <div className="panel-header">Failure Forecast</div>

      {!prediction && (
        <div className="prediction-empty">
          Not enough data. At least 3 evaluations required.
        </div>
      )}

      {prediction && <PredictionBody prediction={prediction} />}
    </div>
  );
}

function PredictionBody({ prediction }: { prediction: FailurePrediction }) {
  return (
    <div className="prediction-body">
      <div className="prediction-main">{prediction.nextFailure}</div>
      <div className="prediction-driver">Driver: {prediction.driver}</div>
      <div className={`prediction-confidence prediction-${prediction.confidence}`}>
        Confidence: {prediction.confidence}
      </div>
    </div>
  );
}
