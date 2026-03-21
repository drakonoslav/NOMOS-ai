/**
 * RoleWorkflowPanel.tsx
 *
 * Displays the guided workflow for the current role mode.
 *
 * Shows a title, summary, and ordered steps.  Each step has a title,
 * description, and a "Go to panel" link that calls onNavigate.
 *
 * This is guidance only — not automation.  The cockpit does not
 * complete steps on behalf of the user or infer intent.
 *
 * Read-only and advisory. No LLM generation. No state mutation.
 */

import React, { useState } from "react";
import type { RoleWorkflow } from "../../cockpit/workflow_types";
import type { CockpitSection } from "../pages/EcosystemCockpitPage";

const STEP_COLOR_MAP: Record<number, string> = {
  0: "var(--nm-lawful)",
  1: "#4b5563",
  2: "#6b7280",
  3: "#9ca3af",
};

function stepColor(i: number): string {
  return STEP_COLOR_MAP[Math.min(i, 3)];
}

interface RoleWorkflowPanelProps {
  workflow: RoleWorkflow;
  onNavigate?: (section: CockpitSection) => void;
}

export function RoleWorkflowPanel({ workflow, onNavigate }: RoleWorkflowPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "12px 18px",
          background: open ? "#f8f9fc" : "#fff",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--nm-lawful)", letterSpacing: "0.04em" }}>
            {workflow.title}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
            {workflow.summary}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
          {workflow.steps.length} steps {open ? "▲" : "▼"}
        </div>
      </button>

      {/* Steps */}
      {open && (
        <div style={{ borderTop: "1px solid #f3f4f6" }}>
          {workflow.steps.map((step, i) => (
            <div
              key={step.id}
              style={{
                display: "flex",
                gap: 14,
                padding: "12px 18px",
                borderBottom: i < workflow.steps.length - 1 ? "1px solid #f3f4f6" : "none",
                background: "#fff",
              }}
            >
              {/* Step number */}
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: stepColor(i),
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {i + 1}
              </div>

              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1f2937", marginBottom: 3 }}>
                  {step.title}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5, marginBottom: 6 }}>
                  {step.description}
                </div>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate(step.targetCardId as CockpitSection)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 11,
                      color: "var(--nm-lawful)",
                      padding: 0,
                      textDecoration: "underline",
                    }}
                  >
                    Go to {step.targetCardId} →
                  </button>
                )}
              </div>
            </div>
          ))}

          <div style={{ padding: "10px 18px", background: "#f8f9fc", fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
            This workflow is guidance only. Steps are not completed automatically.
          </div>
        </div>
      )}
    </div>
  );
}

export default RoleWorkflowPanel;
