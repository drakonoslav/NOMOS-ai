/**
 * PostGovernanceOutcomePanel.tsx
 *
 * Displays a post-governance outcome review, comparing what was expected
 * when a governance action was taken against actual post-action evaluation
 * outcomes.
 *
 * This panel is measurement and review only.
 * It does not expose any action buttons.
 * No LLM generation is used.
 */

import React, { useState } from "react";
import type {
  GovernanceOutcomeReview,
  GovernanceOutcomeReviewReport,
} from "../../../audit/post_governance_review_types";

/* =========================================================
   Helpers
   ========================================================= */

const OUTCOME_LABELS: Record<
  GovernanceOutcomeReview["outcomeClass"],
  string
> = {
  met_expectations: "Met expectations",
  partially_met: "Partially met",
  did_not_meet: "Did not meet",
  insufficient_followup: "Awaiting follow-up",
};

const OUTCOME_COLORS: Record<
  GovernanceOutcomeReview["outcomeClass"],
  string
> = {
  met_expectations: "var(--nm-lawful)",
  partially_met: "var(--nm-degraded)",
  did_not_meet: "var(--nm-invalid)",
  insufficient_followup: "#6b7280",
};

function formatDelta(delta: number | null): string {
  if (delta === null) return "—";
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${(delta * 100).toFixed(1)}%`;
}

function deltaColor(delta: number | null): string {
  if (delta === null) return "inherit";
  if (delta > 0.005) return "var(--nm-lawful)";
  if (delta < -0.005) return "var(--nm-invalid)";
  return "#6b7280";
}

/* =========================================================
   SingleReview
   ========================================================= */

interface SingleReviewProps {
  review: GovernanceOutcomeReview;
  defaultExpanded?: boolean;
}

function SingleReview({ review, defaultExpanded = false }: SingleReviewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { expectation, observed, outcomeClass } = review;

  const outcomeColor = OUTCOME_COLORS[outcomeClass];
  const outcomeLabel = OUTCOME_LABELS[outcomeClass];

  return (
    <div
      style={{
        border: `1px solid ${outcomeColor}`,
        borderRadius: 6,
        marginBottom: 12,
        overflow: "hidden",
      }}
    >
      {/* Header row */}
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
          color: "var(--nm-text, #1a1a1a)",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#fff",
            background: outcomeColor,
            padding: "2px 8px",
            borderRadius: 4,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {outcomeLabel.toUpperCase()}
        </span>

        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#6b7280", flexShrink: 0 }}>
          {review.actionId}
        </span>

        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: "capitalize",
            flexShrink: 0,
          }}
        >
          {review.action}
        </span>

        <span style={{ fontSize: 12, color: "#6b7280", flexShrink: 0 }}>
          {review.domain}
        </span>

        <span style={{ flex: 1 }} />

        <span style={{ fontSize: 13, color: "#9ca3af" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: "0 14px 14px" }}>
          {/* Policy IDs */}
          <div style={{ display: "flex", gap: 16, fontSize: 12, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ color: "#6b7280" }}>
              From:{" "}
              <span style={{ fontFamily: "monospace", color: "#374151" }}>
                {review.fromPolicyVersionId ?? "—"}
              </span>
            </span>
            <span style={{ color: "#6b7280" }}>
              To:{" "}
              <span style={{ fontFamily: "monospace", color: "#374151" }}>
                {review.toPolicyVersionId}
              </span>
            </span>
          </div>

          {/* Expectation */}
          {(expectation.expectedGains.length > 0 ||
            expectation.expectedTradeoffs.length > 0 ||
            expectation.expectedRisks.length > 0) && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: "0.05em", marginBottom: 4 }}>
                EXPECTATIONS AT DECISION TIME
              </div>
              {expectation.expectedGains.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--nm-lawful)" }}>
                    Gains:{" "}
                  </span>
                  {expectation.expectedGains.map((g, i) => (
                    <span key={i} style={{ fontSize: 12, color: "#374151" }}>
                      {g}
                      {i < expectation.expectedGains.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </div>
              )}
              {expectation.expectedTradeoffs.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--nm-degraded)" }}>
                    Tradeoffs:{" "}
                  </span>
                  {expectation.expectedTradeoffs.map((t, i) => (
                    <span key={i} style={{ fontSize: 12, color: "#374151" }}>
                      {t}
                      {i < expectation.expectedTradeoffs.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </div>
              )}
              {expectation.expectedRisks.length > 0 && (
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--nm-invalid)" }}>
                    Risks:{" "}
                  </span>
                  {expectation.expectedRisks.map((r, i) => (
                    <span key={i} style={{ fontSize: 12, color: "#374151" }}>
                      {r}
                      {i < expectation.expectedRisks.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Observed metric deltas */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: "0.05em", marginBottom: 6 }}>
              OBSERVED POST-ACTION METRICS
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 }}>
              {(
                [
                  { label: "Exact-match Δ", value: observed.exactMatchDelta },
                  { label: "Direction-match Δ", value: observed.directionMatchDelta },
                  { label: "Too-aggressive Δ", value: observed.tooAggressiveDelta },
                  { label: "Too-weak Δ", value: observed.tooWeakDelta },
                  { label: "Unresolved Δ", value: observed.unresolvedDelta },
                ] as { label: string; value: number | null }[]
              ).map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    borderRadius: 4,
                    padding: "6px 8px",
                  }}
                >
                  <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2, letterSpacing: "0.04em" }}>
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      fontFamily: "monospace",
                      color: deltaColor(value),
                    }}
                  >
                    {formatDelta(value)}
                  </div>
                </div>
              ))}
              <div
                style={{
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: 4,
                  padding: "6px 8px",
                }}
              >
                <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2, letterSpacing: "0.04em" }}>
                  Follow-up runs
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "monospace", color: "#374151" }}>
                  {observed.postActionRuns}
                </div>
              </div>
            </div>
          </div>

          {/* Observed summary lines */}
          {observed.summaryLines.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {observed.summaryLines.map((line, i) => (
                <div key={i} style={{ fontSize: 12, color: "#4b5563", marginBottom: 2 }}>
                  {line}
                </div>
              ))}
            </div>
          )}

          {/* Review verdict */}
          <div
            style={{
              borderTop: `1px solid ${outcomeColor}22`,
              paddingTop: 10,
              marginTop: 4,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: "0.05em", marginBottom: 4 }}>
              OUTCOME REVIEW
            </div>
            {review.reviewLines.map((line, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  color: i === 0 ? outcomeColor : "#4b5563",
                  fontWeight: i === 0 ? 600 : 400,
                  marginBottom: 2,
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
   PostGovernanceOutcomePanel
   ========================================================= */

interface PostGovernanceOutcomePanelProps {
  report: GovernanceOutcomeReviewReport;
}

export function PostGovernanceOutcomePanel({
  report,
}: PostGovernanceOutcomePanelProps) {
  const { totalGovernanceActions, reviewableActions, outcomeCounts, reviews, summaryLines } =
    report;

  return (
    <div
      className="nm-gov"
      style={{
        fontFamily: "system-ui, sans-serif",
        color: "var(--nm-text, #1a1a1a)",
        padding: 20,
      }}
    >
      {/* Panel header */}
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
          POST-GOVERNANCE OUTCOME REVIEW
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Measurement and review only — no automatic policy changes.
        </div>
      </div>

      {/* Aggregate summary */}
      <div
        style={{
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          padding: "12px 14px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 8 }}>
          {(
            [
              { label: "Total actions", value: totalGovernanceActions, color: "#374151" },
              { label: "Reviewable", value: reviewableActions, color: "#374151" },
              { label: "Met expectations", value: outcomeCounts.met_expectations, color: "var(--nm-lawful)" },
              { label: "Partially met", value: outcomeCounts.partially_met, color: "var(--nm-degraded)" },
              { label: "Did not meet", value: outcomeCounts.did_not_meet, color: "var(--nm-invalid)" },
              { label: "Awaiting follow-up", value: outcomeCounts.insufficient_followup, color: "#9ca3af" },
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
              <div style={{ fontSize: 10, color: "#9ca3af", letterSpacing: "0.04em" }}>
                {label.toUpperCase()}
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

      {/* Individual reviews */}
      {reviews.length === 0 ? (
        <div style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>
          No governance actions to review yet.
        </div>
      ) : (
        <div>
          {reviews.map((review) => (
            <SingleReview key={review.actionId} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}

export default PostGovernanceOutcomePanel;
