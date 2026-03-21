/**
 * SessionWorklogPanel.tsx
 *
 * Displays the human operational trace for a NOMOS session:
 * session ID, role mode, ordered event timeline, final decision,
 * accepted rationales, rejected rationales, and notes.
 *
 * Read-only display only.
 * Does not infer human intent.
 * Only records explicit user actions (displayed here, not triggered here).
 * No LLM generation.
 */

import React, { useState } from "react";
import type { SessionWorklog } from "../../../worklog/worklog_types";

const EVENT_TYPE_LABEL: Record<string, string> = {
  workflow_started:     "Workflow started",
  workflow_step_opened: "Workflow step opened",
  panel_opened:         "Panel opened",
  panel_closed:         "Panel closed",
  decision_made:        "Decision recorded",
  rationale_accepted:   "Rationale accepted",
  rationale_rejected:   "Rationale rejected",
  note_added:           "Note added",
};

const EVENT_TYPE_COLOR: Record<string, string> = {
  workflow_started:     "var(--nm-lawful)",
  workflow_step_opened: "var(--nm-lawful)",
  panel_opened:         "#4b5563",
  panel_closed:         "#9ca3af",
  decision_made:        "#1d4ed8",
  rationale_accepted:   "var(--nm-lawful)",
  rationale_rejected:   "var(--nm-degraded)",
  note_added:           "#6b7280",
};

const DECISION_COLOR: Record<string, string> = {
  promote:  "var(--nm-lawful)",
  rollback: "var(--nm-degraded)",
  hold:     "#6b7280",
};

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

interface SessionWorklogPanelProps {
  worklog: SessionWorklog;
}

export function SessionWorklogPanel({ worklog }: SessionWorklogPanelProps) {
  const [open, setOpen] = useState(false);

  const hasEvents        = worklog.events.length > 0;
  const decisionColor    = worklog.finalDecision ? (DECISION_COLOR[worklog.finalDecision] ?? "#6b7280") : "#9ca3af";

  return (
    <div
      className="nm-gov"
      style={{
        fontFamily: "system-ui, sans-serif",
        color: "var(--nm-text, #1a1a1a)",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 18px",
          background: "#fff",
          borderBottom: open ? "1px solid #f3f4f6" : "none",
          cursor: "pointer",
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 3 }}>
            Session Worklog
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontFamily: "monospace", color: "#374151" }}>
              {worklog.sessionId}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", background: "#f3f4f6", padding: "1px 7px", borderRadius: 3 }}>
              {worklog.roleMode}
            </span>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              {worklog.events.length} event{worklog.events.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        {worklog.finalDecision && (
          <div style={{ fontSize: 12, fontWeight: 800, color: decisionColor, background: `${decisionColor}11`, border: `1px solid ${decisionColor}44`, padding: "3px 10px", borderRadius: 4 }}>
            {worklog.finalDecision.toUpperCase()}
          </div>
        )}
        <span style={{ fontSize: 11, color: "#9ca3af" }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div>
          {/* Event timeline */}
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 10 }}>
              Event Timeline
            </div>
            {!hasEvents ? (
              <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>No events recorded.</div>
            ) : (
              worklog.events.map((event, i) => {
                const color = EVENT_TYPE_COLOR[event.eventType] ?? "#6b7280";
                const label = EVENT_TYPE_LABEL[event.eventType] ?? event.eventType;
                return (
                  <div
                    key={event.eventId}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      marginBottom: i < worklog.events.length - 1 ? 8 : 0,
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 4 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
                        {event.targetId && (
                          <span style={{ fontSize: 10, fontFamily: "monospace", color: "#6b7280", background: "#f3f4f6", padding: "1px 5px", borderRadius: 3 }}>
                            {event.targetId}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: "auto" }}>
                          {formatTs(event.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Rationales */}
          {(worklog.acceptedRationales.length > 0 || worklog.rejectedRationales.length > 0) && (
            <div style={{ padding: "12px 18px", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 8 }}>
                Rationales
              </div>
              {worklog.acceptedRationales.map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: "var(--nm-lawful)", marginBottom: 4, display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <span>✓</span><span>{r}</span>
                </div>
              ))}
              {worklog.rejectedRationales.map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: "var(--nm-degraded)", marginBottom: 4, display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <span>✗</span><span>{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {worklog.notes.length > 0 && (
            <div style={{ padding: "12px 18px", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 8 }}>
                Notes
              </div>
              {worklog.notes.map((note, i) => (
                <div key={i} style={{ fontSize: 11, color: "#4b5563", background: "#f8f9fc", borderRadius: 4, padding: "6px 8px", marginBottom: 6, borderLeft: "2px solid #e5e7eb" }}>
                  {note}
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: "8px 18px", background: "#f8f9fc", fontSize: 10, color: "#9ca3af", fontStyle: "italic" }}>
            This worklog records explicit user actions only. No intent is inferred.
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionWorklogPanel;
