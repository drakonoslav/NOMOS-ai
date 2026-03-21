/**
 * SessionReplayPanel.tsx
 *
 * Displays a human-readable session narrative reconstructed from a worklog.
 *
 * Shows:
 *   - role mode
 *   - ordered replay steps (chronological)
 *   - final decision
 *   - accepted / rejected rationales
 *   - summary lines
 *
 * Read-only reconstruction from recorded events only.
 * Does not invent or infer steps not present in the worklog.
 * No LLM generation.
 */

import React from "react";
import type { SessionNarrative } from "../../../worklog/session_replay_types";

const DECISION_COLOR: Record<string, string> = {
  promote:  "var(--nm-lawful)",
  rollback: "var(--nm-degraded)",
  hold:     "#6b7280",
};

const EVENT_ICON: Record<string, string> = {
  workflow_started:     "⚑",
  workflow_step_opened: "→",
  panel_opened:         "□",
  panel_closed:         "×",
  decision_made:        "✦",
  rationale_accepted:   "✓",
  rationale_rejected:   "✗",
  note_added:           "✎",
};

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

interface SessionReplayPanelProps {
  narrative: SessionNarrative;
}

export function SessionReplayPanel({ narrative }: SessionReplayPanelProps) {
  const decisionColor = narrative.finalDecision
    ? (DECISION_COLOR[narrative.finalDecision] ?? "#6b7280")
    : "#9ca3af";

  return (
    <div
      className="nm-gov"
      style={{
        fontFamily: "system-ui, sans-serif",
        color: "var(--nm-text, #1a1a1a)",
        padding: 20,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--nm-lawful)", marginBottom: 4 }}>
          SESSION REPLAY
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontFamily: "monospace", color: "#374151" }}>{narrative.sessionId}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", background: "#f3f4f6", padding: "2px 8px", borderRadius: 3 }}>
            {narrative.roleMode}
          </span>
          {narrative.finalDecision && (
            <span style={{ fontSize: 11, fontWeight: 800, color: decisionColor, background: `${decisionColor}11`, border: `1px solid ${decisionColor}44`, padding: "2px 10px", borderRadius: 4 }}>
              {narrative.finalDecision.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Summary */}
      <div style={{ background: "#f8f9fc", border: "1px solid #e5e7eb", borderRadius: 6, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 8 }}>
          Session Summary
        </div>
        {narrative.summaryLines.map((line, i) => (
          <div key={i} style={{ fontSize: 12, color: "#4b5563", marginBottom: 5, lineHeight: 1.5, paddingLeft: 8, borderLeft: "2px solid #e5e7eb" }}>
            {line}
          </div>
        ))}
      </div>

      {/* Ordered steps */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 10 }}>
          Replay Steps ({narrative.orderedSteps.length})
        </div>
        {narrative.orderedSteps.length === 0 ? (
          <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>No events were recorded.</div>
        ) : (
          narrative.orderedSteps.map((step) => (
            <div
              key={step.stepNumber}
              style={{
                display: "flex",
                gap: 12,
                padding: "10px 12px",
                background: "#fff",
                border: "1px solid #f3f4f6",
                borderRadius: 6,
                marginBottom: 6,
              }}
            >
              {/* Step number */}
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#f3f4f6", fontSize: 10, fontWeight: 800, color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {step.stepNumber}
              </div>

              {/* Icon + content */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 12 }}>{EVENT_ICON[step.eventType] ?? "·"}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1f2937" }}>{step.title}</span>
                  <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: "auto", flexShrink: 0 }}>
                    {formatTs(step.timestamp)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4, paddingLeft: 20 }}>
                  {step.description}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Rationales */}
      {(narrative.acceptedRationales.length > 0 || narrative.rejectedRationales.length > 0) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 8 }}>
            Rationales
          </div>
          {narrative.acceptedRationales.map((r, i) => (
            <div key={`a-${i}`} style={{ fontSize: 11, color: "var(--nm-lawful)", marginBottom: 4, display: "flex", gap: 8, alignItems: "flex-start", background: "#2e6a4f10", padding: "5px 10px", borderRadius: 4 }}>
              <span style={{ fontWeight: 800, flexShrink: 0 }}>ACCEPTED</span>
              <span>{r}</span>
            </div>
          ))}
          {narrative.rejectedRationales.map((r, i) => (
            <div key={`r-${i}`} style={{ fontSize: 11, color: "var(--nm-degraded)", marginBottom: 4, display: "flex", gap: 8, alignItems: "flex-start", background: "#a56a1e10", padding: "5px 10px", borderRadius: 4 }}>
              <span style={{ fontWeight: 800, flexShrink: 0 }}>REJECTED</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {narrative.notes.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 8 }}>
            Notes
          </div>
          {narrative.notes.map((note, i) => (
            <div key={i} style={{ fontSize: 11, color: "#4b5563", background: "#f8f9fc", borderRadius: 4, padding: "6px 10px", marginBottom: 6, borderLeft: "2px solid #e5e7eb" }}>
              {note}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
        Session replay is reconstructed strictly from recorded worklog events.
        No steps are inferred or invented.
      </div>
    </div>
  );
}

export default SessionReplayPanel;
