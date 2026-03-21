/**
 * PlaybookDecisionCrosswalkPanel.tsx
 *
 * Shows which extracted governance playbook heuristics support, caution against,
 * or are neutral toward a live governance decision.
 *
 * This panel is advisory only.
 * It does not expose any action buttons.
 * No LLM generation is used.
 */

import React, { useState } from "react";
import type {
  HeuristicCrosswalkEntry,
  PlaybookDecisionCrosswalk,
} from "../../../audit/playbook_crosswalk_types";

/* =========================================================
   Helpers
   ========================================================= */

const RELEVANCE_CONFIG: Record<
  HeuristicCrosswalkEntry["relevance"],
  { label: string; accent: string; bg: string }
> = {
  supports:     { label: "SUPPORTS",  accent: "var(--nm-lawful)",  bg: "#f0fdf4" },
  cautions:     { label: "CAUTIONS",  accent: "var(--nm-invalid)", bg: "#fef2f2" },
  neutral:      { label: "NEUTRAL",   accent: "#9ca3af",           bg: "#f9fafb" },
  not_relevant: { label: "N/A",       accent: "#d1d5db",           bg: "#f9fafb" },
};

const DOMAIN_COLORS: Record<string, string> = {
  nutrition: "#0f766e",
  training:  "#1d4ed8",
  schedule:  "#7e22ce",
  generic:   "#374151",
  mixed:     "#92400e",
};

/* =========================================================
   CrosswalkEntryCard
   ========================================================= */

interface CrosswalkEntryCardProps {
  entry: HeuristicCrosswalkEntry;
}

function CrosswalkEntryCard({ entry }: CrosswalkEntryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const conf = RELEVANCE_CONFIG[entry.relevance];
  const domainColor = DOMAIN_COLORS[entry.domain] ?? "#374151";

  return (
    <div
      style={{
        border: `1px solid ${conf.accent}55`,
        borderLeft: `4px solid ${conf.accent}`,
        borderRadius: 6,
        marginBottom: 8,
        background: conf.bg,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          width: "100%",
          padding: "10px 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Domain pill */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#fff",
            background: domainColor,
            padding: "2px 6px",
            borderRadius: 4,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {entry.domain.toUpperCase()}
        </span>

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1f2937", marginBottom: 2 }}>
            {entry.title}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic", lineHeight: 1.4 }}>
            {entry.rule}
          </div>
        </div>

        {/* Expand toggle */}
        <span style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0, paddingTop: 2 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div
          style={{
            borderTop: `1px solid ${conf.accent}22`,
            padding: "8px 12px 12px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#9ca3af",
              letterSpacing: "0.05em",
              marginBottom: 4,
            }}
          >
            REASON
          </div>
          {entry.reasonLines.map((line, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: "#374151",
                marginBottom: 3,
                lineHeight: 1.5,
                paddingLeft: 8,
                borderLeft: `2px solid ${conf.accent}55`,
              }}
            >
              {line}
            </div>
          ))}
          <div
            style={{
              fontSize: 10,
              color: "#9ca3af",
              fontFamily: "monospace",
              marginTop: 8,
            }}
          >
            {entry.heuristicId}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   CrosswalkSection
   ========================================================= */

interface CrosswalkSectionProps {
  title: string;
  accent: string;
  entries: HeuristicCrosswalkEntry[];
  emptyText: string;
  defaultCollapsed?: boolean;
}

function CrosswalkSection({
  title,
  accent,
  entries,
  emptyText,
  defaultCollapsed = false,
}: CrosswalkSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div style={{ marginBottom: 16 }}>
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
          {entries.length > 0 ? entries.length : "—"}{" "}
          {collapsed ? "▲" : "▼"}
        </span>
      </button>

      {!collapsed && (
        <div>
          {entries.length === 0 ? (
            <div
              style={{
                fontSize: 12,
                color: "#9ca3af",
                padding: "6px 0",
                fontStyle: "italic",
              }}
            >
              {emptyText}
            </div>
          ) : (
            entries.map((e) => (
              <CrosswalkEntryCard key={e.heuristicId} entry={e} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   PlaybookDecisionCrosswalkPanel
   ========================================================= */

interface PlaybookDecisionCrosswalkPanelProps {
  crosswalk: PlaybookDecisionCrosswalk;
}

export function PlaybookDecisionCrosswalkPanel({
  crosswalk,
}: PlaybookDecisionCrosswalkPanelProps) {
  const {
    domain,
    supportingHeuristics,
    cautioningHeuristics,
    neutralHeuristics,
    summaryLines,
  } = crosswalk;

  const total =
    supportingHeuristics.length +
    cautioningHeuristics.length +
    neutralHeuristics.length;

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
      <div style={{ marginBottom: 14 }}>
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
          PLAYBOOK · DECISION CROSSWALK
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Advisory only — shows which learned governance doctrines apply to this decision.
          Domain:{" "}
          <span
            style={{
              fontWeight: 700,
              color: DOMAIN_COLORS[domain] ?? "#374151",
            }}
          >
            {domain}
          </span>
        </div>
      </div>

      {/* Stat bar */}
      <div
        style={{
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          padding: "10px 14px",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            marginBottom: summaryLines.length > 0 ? 8 : 0,
          }}
        >
          {(
            [
              { label: "Total relevant", value: total,                            color: "#374151"           },
              { label: "Supporting",     value: supportingHeuristics.length,      color: "var(--nm-lawful)"  },
              { label: "Cautioning",     value: cautioningHeuristics.length,      color: "var(--nm-invalid)" },
              { label: "Neutral",        value: neutralHeuristics.length,          color: "#9ca3af"           },
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

      {/* Sections */}
      <CrosswalkSection
        title="Supporting Doctrines"
        accent="var(--nm-lawful)"
        entries={supportingHeuristics}
        emptyText="No playbook doctrines support this action under current conditions."
      />

      <CrosswalkSection
        title="Cautioning Doctrines"
        accent="var(--nm-invalid)"
        entries={cautioningHeuristics}
        emptyText="No playbook doctrines caution against this action under current conditions."
      />

      <CrosswalkSection
        title="Neutral Doctrines"
        accent="#9ca3af"
        entries={neutralHeuristics}
        emptyText="No neutral doctrines identified."
        defaultCollapsed={true}
      />
    </div>
  );
}

export default PlaybookDecisionCrosswalkPanel;
