/**
 * EcosystemLoopSummaryPanel.tsx
 *
 * Top-level reflective dashboard for the NOMOS governance ecosystem.
 *
 * Shows how prediction patterns, governance choices, outcomes, and doctrines
 * interact at system scale — across the full governance lifecycle.
 *
 * This panel is descriptive and read-only.
 * It does not expose any action buttons.
 * No LLM generation is used.
 */

import React, { useState } from "react";
import type {
  EcosystemLoopSummary,
  PredictionToDecisionPattern,
  GovernanceChoiceOutcomePattern,
  DoctrineEmergencePattern,
  EcosystemChangeSummary,
} from "../../../audit/ecosystem_loop_types";

/* =========================================================
   Helpers
   ========================================================= */

function PatternRow({
  label,
  count,
  summary,
  accent,
}: {
  label: string;
  count: number;
  summary: string;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        borderLeft: `3px solid ${accent}`,
        paddingLeft: 10,
        marginBottom: 8,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 0,
          width: "100%",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: "#1f2937", flex: 1 }}>
          {label}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "monospace",
            color: accent,
          }}
        >
          ×{count}
        </span>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4, lineHeight: 1.5 }}>
          {summary}
        </div>
      )}
    </div>
  );
}

function DoctrineRow({ pattern }: { pattern: DoctrineEmergencePattern }) {
  const CONF_COLOR: Record<string, string> = {
    high:     "var(--nm-lawful)",
    moderate: "var(--nm-degraded)",
    low:      "#9ca3af",
  };
  const color = CONF_COLOR[pattern.confidence] ?? "#374151";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        marginBottom: 8,
        paddingLeft: 10,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#1f2937" }}>
          {pattern.title}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
          {pattern.summary}
        </div>
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color,
          background: `${color}18`,
          border: `1px solid ${color}44`,
          padding: "2px 6px",
          borderRadius: 4,
          flexShrink: 0,
        }}
      >
        {pattern.confidence.toUpperCase()}
      </span>
    </div>
  );
}

function ChangeFlag({
  active,
  label,
  color,
}: {
  active: boolean;
  label: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 4,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: active ? color : "#e5e7eb",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 12,
          fontWeight: active ? 700 : 400,
          color: active ? color : "#9ca3af",
        }}
      >
        {label}
      </span>
    </div>
  );
}

/* =========================================================
   Section wrapper
   ========================================================= */

function Section({
  title,
  accent,
  children,
  defaultCollapsed = false,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div style={{ marginBottom: 18 }}>
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0 0 6px",
          width: "100%",
          textAlign: "left",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 3,
            height: 12,
            background: accent,
            borderRadius: 2,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: accent,
          }}
        >
          {title}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af" }}>
          {collapsed ? "▲" : "▼"}
        </span>
      </button>
      {!collapsed && <div style={{ paddingLeft: 9 }}>{children}</div>}
    </div>
  );
}

/* =========================================================
   EcosystemLoopSummaryPanel
   ========================================================= */

interface EcosystemLoopSummaryPanelProps {
  summary: EcosystemLoopSummary;
}

export function EcosystemLoopSummaryPanel({ summary }: EcosystemLoopSummaryPanelProps) {
  const {
    totalAuditRuns,
    totalPredictions,
    totalGovernanceActions,
    totalOutcomeReviews,
    predictionToDecisionPatterns,
    governanceChoiceOutcomePatterns,
    doctrineEmergencePatterns,
    ecosystemChangeSummary,
    summaryLines,
  } = summary;

  const { stabilizing, drifting, overcorrecting } = ecosystemChangeSummary;

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
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--nm-lawful)",
            marginBottom: 4,
          }}
        >
          ECOSYSTEM LOOP SUMMARY
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Reflective and read-only — system-level view of how prediction, governance, and outcome interact across time.
        </div>
      </div>

      {/* Totals bar */}
      <div
        style={{
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          padding: "10px 14px",
          marginBottom: 18,
        }}
      >
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: summaryLines.length > 0 ? 10 : 0 }}>
          {(
            [
              { label: "Audit runs",         value: totalAuditRuns,         color: "#374151" },
              { label: "Predictions tracked", value: totalPredictions,       color: "#374151" },
              { label: "Gov actions",         value: totalGovernanceActions, color: "var(--nm-degraded)" },
              { label: "Outcome reviews",     value: totalOutcomeReviews,    color: "var(--nm-lawful)"  },
            ] as { label: string; value: number; color: string }[]
          ).map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color }}>
                {value}
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {label}
              </div>
            </div>
          ))}
        </div>
        {summaryLines.map((line, i) => (
          <div key={i} style={{ fontSize: 12, color: "#4b5563", marginBottom: 2 }}>
            {line}
          </div>
        ))}
      </div>

      {/* Ecosystem change status */}
      <div
        style={{
          background: "#f8f9fc",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          padding: "12px 14px",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "#9ca3af",
            marginBottom: 8,
          }}
        >
          ECOSYSTEM STATUS
        </div>
        <ChangeFlag active={stabilizing}    label="Stabilizing"    color="var(--nm-lawful)"  />
        <ChangeFlag active={drifting}       label="Drifting"       color="var(--nm-invalid)" />
        <ChangeFlag active={overcorrecting} label="Overcorrecting" color="var(--nm-degraded)" />
        {ecosystemChangeSummary.summaryLines.map((line, i) => (
          <div key={i} style={{ fontSize: 12, color: "#4b5563", marginTop: 8 }}>
            {line}
          </div>
        ))}
      </div>

      {/* Prediction → decision patterns */}
      <Section title="Prediction → Decision Patterns" accent="#374151">
        {predictionToDecisionPatterns.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>
            No recurring patterns yet.
          </div>
        ) : (
          predictionToDecisionPatterns.map((p) => (
            <PatternRow key={p.label} {...p} accent="#374151" />
          ))
        )}
      </Section>

      {/* Governance choice → outcome patterns */}
      <Section title="Governance Choice → Outcome Patterns" accent="var(--nm-degraded)">
        {governanceChoiceOutcomePatterns.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>
            No outcome patterns linked yet.
          </div>
        ) : (
          governanceChoiceOutcomePatterns.map((p) => (
            <PatternRow key={p.label} {...p} accent="var(--nm-degraded)" />
          ))
        )}
      </Section>

      {/* Doctrine emergence */}
      <Section title="Emerging Doctrine" accent="var(--nm-lawful)">
        {doctrineEmergencePatterns.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>
            No moderate- or high-confidence doctrines have emerged yet.
          </div>
        ) : (
          doctrineEmergencePatterns.map((p) => (
            <DoctrineRow key={p.heuristicId} pattern={p} />
          ))
        )}
      </Section>
    </div>
  );
}

export default EcosystemLoopSummaryPanel;
