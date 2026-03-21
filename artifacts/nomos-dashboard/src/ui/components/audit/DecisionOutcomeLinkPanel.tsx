/**
 * DecisionOutcomeLinkPanel.tsx
 *
 * Traces the full accountability chain for a governance decision:
 *   deliberation → decision → governance action → outcome review
 *
 * This panel is advisory and read-only.
 * It does not expose any action buttons.
 * No LLM generation is used.
 */

import React, { useState } from "react";
import type {
  DecisionOutcomeLink,
  DecisionOutcomeLinkReport,
} from "../../../audit/decision_outcome_link_types";

/* =========================================================
   Helpers
   ========================================================= */

const DECISION_CONFIG: Record<
  DecisionOutcomeLink["decision"],
  { label: string; color: string; bg: string }
> = {
  promote:  { label: "PROMOTE",  color: "#fff", bg: "var(--nm-lawful)"  },
  rollback: { label: "ROLLBACK", color: "#fff", bg: "var(--nm-invalid)" },
  hold:     { label: "HOLD",     color: "#fff", bg: "var(--nm-degraded)" },
};

const OUTCOME_CONFIG: Record<
  NonNullable<DecisionOutcomeLink["actualOutcomeClass"]>,
  { label: string; color: string }
> = {
  met_expectations:    { label: "MET EXPECTATIONS",   color: "var(--nm-lawful)"  },
  partially_met:       { label: "PARTIALLY MET",       color: "var(--nm-degraded)" },
  did_not_meet:        { label: "DID NOT MEET",        color: "var(--nm-invalid)" },
  insufficient_followup: { label: "INSUFFICIENT DATA", color: "#9ca3af"          },
};

function shortId(id: string | null): string {
  if (!id) return "—";
  return id.length > 12 ? `…${id.slice(-8)}` : id;
}

function LinkedId({
  label,
  id,
}: {
  label: string;
  id: string | null;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, minWidth: 140 }}>
        {label}
      </span>
      {id ? (
        <span
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            color: "#374151",
            background: "#f3f4f6",
            padding: "1px 6px",
            borderRadius: 3,
          }}
        >
          {shortId(id)}
        </span>
      ) : (
        <span style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
          not linked
        </span>
      )}
    </div>
  );
}

/* =========================================================
   DecisionOutcomeLinkCard
   ========================================================= */

function DecisionOutcomeLinkCard({ link }: { link: DecisionOutcomeLink }) {
  const [expanded, setExpanded] = useState(false);
  const decConf = DECISION_CONFIG[link.decision];
  const outcomeConf = link.actualOutcomeClass
    ? OUTCOME_CONFIG[link.actualOutcomeClass]
    : null;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderLeft: `4px solid ${decConf.bg}`,
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
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "10px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Decision badge */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: decConf.color,
            background: decConf.bg,
            padding: "3px 8px",
            borderRadius: 4,
            letterSpacing: "0.06em",
            flexShrink: 0,
          }}
        >
          {decConf.label}
        </span>

        {/* Policy */}
        <span style={{ fontSize: 12, color: "#4b5563", flex: 1 }}>
          Policy:{" "}
          <span style={{ fontFamily: "monospace", color: "#1f2937" }}>
            {shortId(link.chosenPolicyVersionId)}
          </span>
        </span>

        {/* Outcome class badge */}
        {outcomeConf && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: outcomeConf.color,
              border: `1px solid ${outcomeConf.color}55`,
              background: `${outcomeConf.color}12`,
              padding: "2px 7px",
              borderRadius: 4,
              flexShrink: 0,
            }}
          >
            {outcomeConf.label}
          </span>
        )}
        {!outcomeConf && (
          <span
            style={{
              fontSize: 10,
              color: "#9ca3af",
              fontStyle: "italic",
              flexShrink: 0,
            }}
          >
            awaiting review
          </span>
        )}

        <span style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid #f3f4f6",
            padding: "12px 14px",
          }}
        >
          {/* Chain IDs */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#9ca3af",
                letterSpacing: "0.06em",
                marginBottom: 6,
              }}
            >
              ACCOUNTABILITY CHAIN
            </div>
            <LinkedId label="Decision ID"           id={link.decisionId} />
            <LinkedId label="Deliberation Brief"    id={link.deliberationSummaryId} />
            <LinkedId label="Governance Action"     id={link.governanceActionId} />
            <LinkedId label="Outcome Review"        id={link.governanceOutcomeReviewId} />
          </div>

          {/* Expected gains */}
          {link.expectedGains.length > 0 && (
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
                EXPECTED GAINS
              </div>
              {link.expectedGains.map((g, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    color: "#374151",
                    paddingLeft: 8,
                    borderLeft: "2px solid var(--nm-lawful)",
                    marginBottom: 2,
                  }}
                >
                  {g}
                </div>
              ))}
            </div>
          )}

          {/* Expected tradeoffs */}
          {link.expectedTradeoffs.length > 0 && (
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
                EXPECTED TRADEOFFS
              </div>
              {link.expectedTradeoffs.map((t, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    color: "#374151",
                    paddingLeft: 8,
                    borderLeft: "2px solid var(--nm-degraded)",
                    marginBottom: 2,
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
          )}

          {/* Expected risks */}
          {link.expectedRisks.length > 0 && (
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
                EXPECTED RISKS
              </div>
              {link.expectedRisks.map((r, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    color: "#374151",
                    paddingLeft: 8,
                    borderLeft: "2px solid var(--nm-invalid)",
                    marginBottom: 2,
                  }}
                >
                  {r}
                </div>
              ))}
            </div>
          )}

          {/* Actual outcome */}
          {link.actualOutcomeLines.length > 0 && (
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
                ACTUAL OUTCOMES
              </div>
              {link.actualOutcomeLines.map((line, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    color: "#374151",
                    paddingLeft: 8,
                    borderLeft: "2px solid #e5e7eb",
                    marginBottom: 2,
                    lineHeight: 1.5,
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
          )}

          {/* Linkage summary */}
          <div
            style={{
              background: "#f8f9fc",
              border: "1px solid #e5e7eb",
              borderRadius: 4,
              padding: "8px 10px",
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
              LINKAGE SUMMARY
            </div>
            {link.linkageSummaryLines.map((line, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  color: "#4b5563",
                  marginBottom: 3,
                  lineHeight: 1.5,
                }}
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
   DecisionOutcomeLinkPanel
   ========================================================= */

interface DecisionOutcomeLinkPanelProps {
  report: DecisionOutcomeLinkReport;
}

export function DecisionOutcomeLinkPanel({ report }: DecisionOutcomeLinkPanelProps) {
  const { totalLinkedDecisions, links, summaryLines } = report;

  const withOutcome = links.filter((l) => l.actualOutcomeClass !== null).length;
  const pending     = totalLinkedDecisions - withOutcome;

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
          DECISION → OUTCOME LINKAGE
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Full accountability chain: deliberation → decision → governance action → observed outcome.
        </div>
      </div>

      {/* Aggregate bar */}
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
              { label: "Total decisions", value: totalLinkedDecisions, color: "#374151" },
              { label: "With outcome",    value: withOutcome,          color: "var(--nm-lawful)"  },
              { label: "Pending review",  value: pending,              color: "var(--nm-degraded)" },
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

      {/* Decision links */}
      {links.length === 0 ? (
        <div
          style={{
            fontSize: 13,
            color: "#9ca3af",
            textAlign: "center",
            padding: "24px 0",
            fontStyle: "italic",
          }}
        >
          No governance decision records have been linked yet. Records appear as humans
          review deliberation briefs and commit governance actions.
        </div>
      ) : (
        <div>
          {links.map((link) => (
            <DecisionOutcomeLinkCard key={link.decisionId} link={link} />
          ))}
        </div>
      )}
    </div>
  );
}

export default DecisionOutcomeLinkPanel;
