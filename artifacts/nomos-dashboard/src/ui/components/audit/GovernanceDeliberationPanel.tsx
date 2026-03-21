/**
 * GovernanceDeliberationPanel.tsx
 *
 * The final advisory governance brief for NOMOS.
 *
 * Combines bench evidence, recommendation, gains/tradeoffs/risks, playbook
 * crosswalk, and synthesis into one coherent panel a human can read and act on.
 *
 * This panel is advisory only.
 * It does not expose any action buttons.
 * No LLM generation is used.
 */

import React, { useState } from "react";
import type { GovernanceDeliberationSummary } from "../../../audit/governance_deliberation_types";

/* =========================================================
   Helpers
   ========================================================= */

const REC_CONFIG: Record<
  GovernanceDeliberationSummary["recommendation"],
  { label: string; color: string; bg: string; border: string }
> = {
  promote:  { label: "PROMOTE",  color: "#fff", bg: "var(--nm-lawful)",  border: "var(--nm-lawful)"  },
  rollback: { label: "ROLLBACK", color: "#fff", bg: "var(--nm-invalid)", border: "var(--nm-invalid)" },
  hold:     { label: "HOLD",     color: "#fff", bg: "var(--nm-degraded)", border: "var(--nm-degraded)" },
};

const STRENGTH_COLOR: Record<string, string> = {
  strong:   "var(--nm-lawful)",
  moderate: "var(--nm-degraded)",
  weak:     "#9ca3af",
};

const CONFIDENCE_COLOR: Record<string, string> = {
  high:     "var(--nm-lawful)",
  moderate: "var(--nm-degraded)",
  low:      "#9ca3af",
};

/* =========================================================
   BulletList
   ========================================================= */

function BulletList({
  items,
  emptyText,
  accent,
}: {
  items: string[];
  emptyText: string;
  accent: string;
}) {
  if (items.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>
        {emptyText}
      </div>
    );
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            fontSize: 12,
            color: "#374151",
            marginBottom: 4,
            paddingLeft: 12,
            borderLeft: `2px solid ${accent}55`,
            lineHeight: 1.5,
          }}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

/* =========================================================
   Section
   ========================================================= */

interface SectionProps {
  title: string;
  accent: string;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

function Section({ title, accent, defaultCollapsed = false, children }: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div style={{ marginBottom: 14 }}>
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0 0 5px",
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
   GovernanceDeliberationPanel
   ========================================================= */

interface GovernanceDeliberationPanelProps {
  summary: GovernanceDeliberationSummary;
}

export function GovernanceDeliberationPanel({
  summary,
}: GovernanceDeliberationPanelProps) {
  const {
    domain,
    currentPolicyVersionId,
    recommendedPolicyVersionId,
    recommendation,
    recommendationStrength,
    confidence,
    keyEvidenceLines,
    gainsLines,
    tradeoffLines,
    riskLines,
    supportingHeuristics,
    cautioningHeuristics,
    synthesisLines,
    finalDecisionPrompt,
  } = summary;

  const recConf = REC_CONFIG[recommendation];

  function shortId(id: string | null): string {
    if (!id) return "—";
    return id.length > 12 ? `…${id.slice(-8)}` : id;
  }

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
          GOVERNANCE DELIBERATION BRIEF
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Advisory only — final synthesis before human governance action. This panel does not commit any change.
        </div>
      </div>

      {/* Recommendation block */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 0,
          border: `1px solid ${recConf.border}44`,
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 18,
        }}
      >
        {/* Left accent */}
        <div
          style={{
            background: recConf.bg,
            width: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 900,
              color: recConf.color,
              letterSpacing: "0.08em",
              writing_mode: "vertical-rl",
              transform: "rotate(180deg)",
            } as React.CSSProperties}
          >
            {recConf.label}
          </span>
        </div>

        {/* Right body */}
        <div style={{ flex: 1, padding: "14px 16px" }}>
          {/* Policy IDs */}
          <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 8 }}>
            <span style={{ fontWeight: 700 }}>Domain:</span>{" "}
            <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{domain}</span>
            {"  ·  "}
            <span style={{ fontWeight: 700 }}>Current:</span>{" "}
            <span style={{ fontFamily: "monospace", fontSize: 11 }}>
              {shortId(currentPolicyVersionId)}
            </span>
            {"  →  "}
            <span style={{ fontWeight: 700 }}>Recommended:</span>{" "}
            <span style={{ fontFamily: "monospace", fontSize: 11 }}>
              {shortId(recommendedPolicyVersionId)}
            </span>
          </div>

          {/* Strength + confidence pills */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(
              [
                {
                  label: "Strength",
                  value: recommendationStrength,
                  color: STRENGTH_COLOR[recommendationStrength] ?? "#374151",
                },
                {
                  label: "Confidence",
                  value: confidence,
                  color: CONFIDENCE_COLOR[confidence] ?? "#374151",
                },
              ] as { label: string; value: string; color: string }[]
            ).map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color,
                  background: `${color}18`,
                  border: `1px solid ${color}44`,
                  padding: "3px 10px",
                  borderRadius: 4,
                }}
              >
                {label}: {value.toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Evidence */}
      <Section title="Key Evidence" accent="#374151">
        <BulletList
          items={keyEvidenceLines}
          emptyText="No bench evidence available."
          accent="#374151"
        />
      </Section>

      {/* Gains */}
      <Section title="Expected Gains" accent="var(--nm-lawful)">
        <BulletList
          items={gainsLines}
          emptyText="No gains declared."
          accent="var(--nm-lawful)"
        />
      </Section>

      {/* Tradeoffs */}
      <Section title="Tradeoffs" accent="var(--nm-degraded)">
        <BulletList
          items={tradeoffLines}
          emptyText="No tradeoffs declared."
          accent="var(--nm-degraded)"
        />
      </Section>

      {/* Risks */}
      <Section title="Risks" accent="var(--nm-invalid)">
        <BulletList
          items={riskLines}
          emptyText="No risks declared."
          accent="var(--nm-invalid)"
        />
      </Section>

      {/* Supporting doctrines */}
      <Section title="Supporting Doctrines" accent="var(--nm-lawful)" defaultCollapsed={false}>
        {supportingHeuristics.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>
            No playbook doctrines support this action under current conditions.
          </div>
        ) : (
          supportingHeuristics.map((title, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: "#374151",
                marginBottom: 4,
                paddingLeft: 12,
                borderLeft: "2px solid var(--nm-lawful)",
                lineHeight: 1.5,
              }}
            >
              {title}
            </div>
          ))
        )}
      </Section>

      {/* Cautioning doctrines */}
      <Section title="Caution Doctrines" accent="var(--nm-invalid)" defaultCollapsed={false}>
        {cautioningHeuristics.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>
            No playbook doctrines caution against this action.
          </div>
        ) : (
          cautioningHeuristics.map((title, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: "#374151",
                marginBottom: 4,
                paddingLeft: 12,
                borderLeft: "2px solid var(--nm-invalid)",
                lineHeight: 1.5,
              }}
            >
              {title}
            </div>
          ))
        )}
      </Section>

      {/* Synthesis */}
      <Section title="Synthesis" accent="#6b7280">
        {synthesisLines.map((line, i) => (
          <div
            key={i}
            style={{
              fontSize: 12,
              color: "#374151",
              marginBottom: 5,
              lineHeight: 1.6,
              paddingLeft: 12,
              borderLeft: "2px solid #e5e7eb",
            }}
          >
            {line}
          </div>
        ))}
      </Section>

      {/* Final decision prompt */}
      <div
        style={{
          marginTop: 6,
          padding: "14px 16px",
          background: "#f8f9fc",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          borderLeft: `4px solid ${recConf.border}`,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "#9ca3af",
            marginBottom: 6,
          }}
        >
          DECISION PROMPT
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#1f2937",
            lineHeight: 1.5,
          }}
        >
          {finalDecisionPrompt}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#9ca3af",
            marginTop: 8,
            fontStyle: "italic",
          }}
        >
          The human decides. NOMOS informs.
        </div>
      </div>
    </div>
  );
}

export default GovernanceDeliberationPanel;
