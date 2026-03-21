/**
 * GovernancePlaybookPanel.tsx
 *
 * Displays the NOMOS governance playbook: heuristics extracted from repeated
 * reviewed governance outcomes, presented as human-readable doctrine.
 *
 * This panel is advisory only.
 * It does not expose any action buttons.
 * No LLM generation is used.
 */

import React, { useState } from "react";
import type {
  GovernanceHeuristic,
  GovernancePlaybook,
} from "../../../audit/governance_playbook_types";

/* =========================================================
   Helpers
   ========================================================= */

const CONFIDENCE_CONFIG: Record<
  GovernanceHeuristic["confidence"],
  { label: string; color: string; bg: string }
> = {
  high:     { label: "HIGH",     color: "#fff", bg: "var(--nm-lawful)"  },
  moderate: { label: "MODERATE", color: "#fff", bg: "var(--nm-degraded)" },
  low:      { label: "LOW",      color: "#fff", bg: "#9ca3af"            },
};

const DOMAIN_COLORS: Record<string, string> = {
  nutrition: "#0f766e",
  training:  "#1d4ed8",
  schedule:  "#7e22ce",
  generic:   "#374151",
  mixed:     "#92400e",
};

function ruleAccentColor(rule: string): string {
  const r = rule.toLowerCase();
  if (r.startsWith("prefer") || r.startsWith("in ")) return "var(--nm-lawful)";
  if (r.startsWith("use caution"))                    return "var(--nm-degraded)";
  if (r.startsWith("avoid") || r.startsWith("do not")) return "var(--nm-invalid)";
  return "#6b7280";
}

function ruleBadge(rule: string): string {
  const r = rule.toLowerCase();
  if (r.startsWith("prefer") || r.startsWith("in ")) return "PREFER";
  if (r.startsWith("use caution"))                    return "CAUTION";
  if (r.startsWith("avoid"))                          return "AVOID";
  if (r.startsWith("do not"))                         return "DO NOT";
  return "NOTE";
}

/* =========================================================
   HeuristicCard
   ========================================================= */

interface HeuristicCardProps {
  heuristic: GovernanceHeuristic;
}

function HeuristicCard({ heuristic }: HeuristicCardProps) {
  const [expanded, setExpanded] = useState(false);

  const confConf   = CONFIDENCE_CONFIG[heuristic.confidence];
  const accentColor = ruleAccentColor(heuristic.rule);
  const badge       = ruleBadge(heuristic.rule);
  const domainColor = DOMAIN_COLORS[heuristic.domain] ?? "#374151";

  return (
    <div
      style={{
        border: `1px solid ${accentColor}44`,
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: 6,
        marginBottom: 12,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          width: "100%",
          padding: "12px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Type badge */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: accentColor,
            background: `${accentColor}18`,
            border: `1px solid ${accentColor}55`,
            padding: "2px 7px",
            borderRadius: 4,
            letterSpacing: "0.06em",
            whiteSpace: "nowrap",
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {badge}
        </span>

        {/* Title + rule */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#1f2937",
              marginBottom: 3,
            }}
          >
            {heuristic.title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#4b5563",
              lineHeight: 1.5,
              fontStyle: "italic",
            }}
          >
            {heuristic.rule}
          </div>
        </div>

        {/* Meta */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 4,
            flexShrink: 0,
          }}
        >
          {/* Confidence badge */}
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: confConf.color,
              background: confConf.bg,
              padding: "2px 7px",
              borderRadius: 4,
              letterSpacing: "0.05em",
            }}
          >
            {confConf.label}
          </span>

          {/* Domain pill */}
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#fff",
              background: domainColor,
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            {heuristic.domain.toUpperCase()}
          </span>

          {/* Expand toggle */}
          <span style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div
          style={{
            padding: "0 14px 14px",
            borderTop: `1px solid ${accentColor}22`,
          }}
        >
          {/* Support count + id */}
          <div
            style={{
              display: "flex",
              gap: 16,
              fontSize: 11,
              color: "#6b7280",
              padding: "8px 0 10px",
              flexWrap: "wrap",
            }}
          >
            <span>
              Support:{" "}
              <span style={{ fontWeight: 700, color: "#374151" }}>
                {heuristic.supportCount}
              </span>{" "}
              pattern(s)
            </span>
            <span>
              ID:{" "}
              <span style={{ fontFamily: "monospace", color: "#374151" }}>
                {heuristic.id}
              </span>
            </span>
          </div>

          {/* Source patterns */}
          {heuristic.sourcePatternLabels.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#9ca3af",
                  letterSpacing: "0.05em",
                  marginBottom: 4,
                }}
              >
                SOURCE PATTERNS
              </div>
              {heuristic.sourcePatternLabels.map((label, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    color: "#4b5563",
                    padding: "2px 0",
                    borderLeft: `2px solid ${accentColor}55`,
                    paddingLeft: 8,
                    marginBottom: 2,
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          )}

          {/* Rationale */}
          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#9ca3af",
                letterSpacing: "0.05em",
                marginBottom: 4,
              }}
            >
              RATIONALE
            </div>
            {heuristic.rationaleLines.map((line, i) => (
              <div
                key={i}
                style={{ fontSize: 12, color: "#374151", marginBottom: 3, lineHeight: 1.5 }}
              >
                {line}
              </div>
            ))}
          </div>

          {/* Caution */}
          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 4,
              padding: "8px 10px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#92400e",
                letterSpacing: "0.05em",
                marginBottom: 4,
              }}
            >
              CAUTION
            </div>
            {heuristic.cautionLines.map((line, i) => (
              <div
                key={i}
                style={{ fontSize: 12, color: "#78350f", marginBottom: 3, lineHeight: 1.5 }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   GovernancePlaybookPanel
   ========================================================= */

interface GovernancePlaybookPanelProps {
  playbook: GovernancePlaybook;
}

export function GovernancePlaybookPanel({ playbook }: GovernancePlaybookPanelProps) {
  const { totalHeuristics, heuristics, summaryLines } = playbook;

  const high = heuristics.filter((h) => h.confidence === "high").length;
  const mod  = heuristics.filter((h) => h.confidence === "moderate").length;
  const low  = heuristics.filter((h) => h.confidence === "low").length;

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
          GOVERNANCE PLAYBOOK
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Advisory only — doctrine extracted from reviewed governance history. No policy changes are generated.
        </div>
      </div>

      {/* Aggregate bar */}
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
            gap: 20,
            flexWrap: "wrap",
            marginBottom: summaryLines.length > 0 ? 10 : 0,
          }}
        >
          {(
            [
              { label: "Total heuristics", value: totalHeuristics, color: "#374151" },
              { label: "High confidence",  value: high, color: "var(--nm-lawful)"   },
              { label: "Moderate",         value: mod,  color: "var(--nm-degraded)" },
              { label: "Low confidence",   value: low,  color: "#9ca3af"            },
            ] as { label: string; value: number; color: string }[]
          ).map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  fontFamily: "monospace",
                  color,
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
          <div key={i} style={{ fontSize: 12, color: "#4b5563", marginBottom: 2 }}>
            {line}
          </div>
        ))}
      </div>

      {/* Heuristics */}
      {heuristics.length === 0 ? (
        <div
          style={{
            fontSize: 13,
            color: "#9ca3af",
            textAlign: "center",
            padding: "24px 0",
            fontStyle: "italic",
          }}
        >
          No governance heuristics have been extracted yet. Heuristics are generated as
          governance outcomes accumulate and patterns recur.
        </div>
      ) : (
        <div>
          {heuristics.map((h) => (
            <HeuristicCard key={h.id} heuristic={h} />
          ))}
        </div>
      )}
    </div>
  );
}

export default GovernancePlaybookPanel;
