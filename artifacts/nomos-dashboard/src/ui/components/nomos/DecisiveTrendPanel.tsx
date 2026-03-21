import React from "react";
import { useScenario } from "@/context/scenario-context";
import { extractRunSummaries, analyzeDrift } from "../../audit/audit_timeseries";
import type { RunSummary } from "../../audit/audit_timeseries";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function DecisiveTrendPanel() {
  const { auditEntries } = useScenario();

  const series  = extractRunSummaries(auditEntries);
  const drift   = analyzeDrift(series);

  return (
    <div className="panel trend-panel">
      <div className="panel-header">Decisive Variable Trend</div>

      {series.length === 0 && (
        <div className="audit-empty">No run history. Submit a live evaluation to begin.</div>
      )}

      {series.length > 0 && (
        <>
          <div className="trend-status-line">
            {drift.drift ? (
              <span className={`trend-drift-label${drift.direction ? ` trend-drift-${drift.direction}` : ""}`}>
                {drift.direction === "improving"
                  ? "Drift detected — improving"
                  : drift.direction === "degrading"
                  ? "Drift detected — degrading"
                  : "Drift detected"}
              </span>
            ) : (
              <span className="trend-stable-label">Stable</span>
            )}

            {drift.variableChanged && (
              <span className="trend-tag">decisive variable changed</span>
            )}
            {drift.statusChanged && (
              <span className="trend-tag">status changed</span>
            )}
          </div>

          <div className="trend-list">
            {series.map((point, i) => (
              <TrendRow key={`${point.runId}-${i}`} point={point} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TrendRow({ point }: { point: RunSummary }) {
  return (
    <div className="trend-item">
      <div className="trend-time">{formatTime(point.timestamp)}</div>
      <div className="trend-variable">{point.decisiveVariable}</div>
      <div className={`trend-status-pill trend-status-${point.status.toLowerCase()}`}>
        {point.status}
      </div>
    </div>
  );
}
