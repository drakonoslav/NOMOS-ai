/**
 * GovernanceLearningSummaryPanel.tsx
 *
 * Displays the NOMOS governance learning summary: recurring patterns across
 * many reviewed governance decisions, organised by pattern type.
 *
 * This panel is observational and advisory only.
 * It does not expose any action buttons.
 * No LLM generation is used.
 */

import React, { useState } from "react";
import type {
  GovernanceLearningPattern,
  GovernanceLearningSummary,
} from "../../../audit/governance_learning_types";

/* =========================================================
   Helpers
   ========================================================= */

const DOMAIN_COLORS: Record<string, string> = {
  nutrition: "#0f766e",
  training:  "#1d4ed8",
  schedule:  "#7e22ce",
  generic:   "#374151",
  mixed:     "#92400e",
};

function domainPill(domain: string) {
  const color = DOMAIN_COLORS[domain] ?? "#374151";
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: "#fff",
        background: color,
        padding: "2px 7px",
        borderRadius: 4,
        letterSpacing: "0.05em",
        marginLeft: 6,
        verticalAlign: "middle",
      }}
    >
      {domain.toUpperCase()}
    </span>
  );
}

/* =========================================================
   PatternCard
   ========================================================= */

function PatternCard({ pattern }: { pattern: GovernanceLearningPattern }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        padding: "10px 14px",
        marginBottom: 8,
        background: "#fafafa",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: 4,
          flexWrap: "wrap",
          gap: 4,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1f2937" }}>
          {pattern.label}
        </span>
        {domainPill(pattern.domain)}
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "#6b7280",
            whiteSpace: "nowrap",
          }}
        >
          {pattern.supportingActionCount} action(s)
        </span>
      </div>
      <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.5 }}>
        {pattern.summary}
      </div>
    </div>
  );
}

/* =========================================================
   PatternSection
   ========================================================= */

interface PatternSectionProps {
  title: string;
  accent: string;
  patterns: GovernanceLearningPattern[];
  emptyText: string;
}

function PatternSection({ title, accent, patterns, emptyText }: PatternSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ marginBottom: 18 }}>
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
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
            width: 4,
            height: 14,
            background: accent,
            borderRadius: 2,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: accent,
          }}
        >
          {title}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            color: "#9ca3af",
            fontWeight: 600,
          }}
        >
          {patterns.length > 0 ? patterns.length : "—"}{" "}
          {collapsed ? "▲" : "▼"}
        </span>
      </button>

      {!collapsed && (
        <div>
          {patterns.length === 0 ? (
            <div
              style={{
                fontSize: 12,
                color: "#9ca3af",
                padding: "8px 0",
                fontStyle: "italic",
              }}
            >
              {emptyText}
            </div>
          ) : (
            patterns.map((p, i) => <PatternCard key={i} pattern={p} />)
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   GovernanceLearningSummaryPanel
   ========================================================= */

interface GovernanceLearningSummaryPanelProps {
  summary: GovernanceLearningSummary;
}

export function GovernanceLearningSummaryPanel({
  summary,
}: GovernanceLearningSummaryPanelProps) {
  const {
    totalGovernanceActions,
    reviewableActions,
    successfulPromotionPatterns,
    recurringTradeoffPatterns,
    recurringRiskPatterns,
    recurringGovernanceMistakes,
    summaryLines,
  } = summary;

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
          GOVERNANCE LEARNING SUMMARY
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Observational and advisory only — no policy changes are generated.
        </div>
      </div>

      {/* Stat bar */}
      <div
        style={{
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          padding: "12px 14px",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            marginBottom: summaryLines.length > 0 ? 10 : 0,
          }}
        >
          {(
            [
              { label: "Total actions", value: totalGovernanceActions },
              { label: "Reviewable", value: reviewableActions },
              {
                label: "Successful patterns",
                value: successfulPromotionPatterns.length,
                color: "var(--nm-lawful)",
              },
              {
                label: "Tradeoff patterns",
                value: recurringTradeoffPatterns.length,
                color: "var(--nm-degraded)",
              },
              {
                label: "Risk patterns",
                value: recurringRiskPatterns.length,
                color: "var(--nm-invalid)",
              },
              {
                label: "Mistake patterns",
                value: recurringGovernanceMistakes.length,
                color: "#6b7280",
              },
            ] as { label: string; value: number; color?: string }[]
          ).map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  fontFamily: "monospace",
                  color: color ?? "#374151",
                }}
              >
                {value}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#9ca3af",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>

        {summaryLines.map((line, i) => (
          <div
            key={i}
            style={{ fontSize: 12, color: "#4b5563", marginBottom: 2 }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* Pattern sections */}
      <PatternSection
        title="Successful Promotion Patterns"
        accent="var(--nm-lawful)"
        patterns={successfulPromotionPatterns}
        emptyText="No successful promotion patterns detected yet."
      />

      <PatternSection
        title="Recurring Tradeoff Patterns"
        accent="var(--nm-degraded)"
        patterns={recurringTradeoffPatterns}
        emptyText="No recurring tradeoff patterns detected yet."
      />

      <PatternSection
        title="Recurring Risk Patterns"
        accent="var(--nm-invalid)"
        patterns={recurringRiskPatterns}
        emptyText="No recurring risk patterns detected yet."
      />

      <PatternSection
        title="Recurring Governance Mistakes"
        accent="#6b7280"
        patterns={recurringGovernanceMistakes}
        emptyText="No recurring governance mistakes detected yet."
      />
    </div>
  );
}

export default GovernanceLearningSummaryPanel;
