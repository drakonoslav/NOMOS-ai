import React, { useState } from "react";
import { useScenario } from "@/context/scenario-context";

function formatStage(stage: string): string {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function safeStringify(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export function AuditTimelinePanel() {
  const { auditEntries, clearAudit } = useScenario();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="panel audit-panel">
      <div className="panel-header" style={{ display: "flex", alignItems: "center" }}>
        <span style={{ flex: 1 }}>Audit Timeline</span>
        {auditEntries.length > 0 && (
          <button onClick={clearAudit} className="audit-clear">
            Clear
          </button>
        )}
      </div>

      <div className="audit-list">
        {auditEntries.length === 0 && (
          <div className="audit-empty">No audit entries. Run a live evaluation to begin.</div>
        )}

        {auditEntries.map((entry) => {
          const expanded = expandedId === entry.id;
          return (
            <div key={entry.id} className={`audit-item audit-item--${entry.stage}`}>
              <div
                className="audit-item__header"
                onClick={() => setExpandedId(expanded ? null : entry.id)}
              >
                <span className="audit-stage">{formatStage(entry.stage)}</span>
                <span className="audit-time">{formatTime(entry.timestamp)}</span>
              </div>
              {expanded && (
                <pre className="audit-payload">{safeStringify(entry.payload)}</pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
