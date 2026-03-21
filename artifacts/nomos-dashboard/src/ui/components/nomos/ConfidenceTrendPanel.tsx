import React from "react";
import { useScenario } from "@/context/scenario-context";
import { extractRunSummaries } from "../../audit/audit_timeseries";
import { confidenceToNumber, formatConfidenceTime } from "../../audit/confidence_utils";

export function ConfidenceTrendPanel() {
  const { auditEntries } = useScenario();

  const series = extractRunSummaries(auditEntries);

  const points = series.map((s) => ({
    t:          s.timestamp,
    raw:        confidenceToNumber(s.predictionConfidence),
    calibrated: confidenceToNumber(s.calibratedConfidence),
  }));

  if (points.length === 0) {
    return (
      <div className="panel confidence-panel">
        <div className="panel-header">Prediction Confidence Trend</div>
        <div className="prediction-empty">No data available.</div>
      </div>
    );
  }

  return (
    <div className="panel confidence-panel">
      <div className="panel-header">Prediction Confidence Trend</div>

      <div className="confidence-legend">
        <span className="confidence-legend-item confidence-legend-raw">raw</span>
        <span className="confidence-legend-item confidence-legend-calibrated">calibrated</span>
      </div>

      <div className="confidence-chart">
        {points.map((p, i) => (
          <div key={i} className="confidence-row">
            <div className="confidence-time">{formatConfidenceTime(p.t)}</div>

            <div className="confidence-bars">
              {p.raw !== null && (
                <div
                  className="confidence-bar raw"
                  style={{ width: `${p.raw * 100}%` }}
                />
              )}
              {p.calibrated !== null && (
                <div
                  className="confidence-bar calibrated"
                  style={{ width: `${p.calibrated * 100}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
