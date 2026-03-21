/**
 * DecisiveVariableTrendPanel.tsx
 *
 * Renders the decisive-variable trend report for the NOMOS audit history.
 *
 * Accepts AuditRecord[] and computes the DecisiveVariableTrendReport internally
 * via buildDecisiveVariableTrendReport(). Renders:
 *
 *   - DriftSummary block: most frequent, most recent, summary lines
 *   - Per-variable trend table: variable | count | streak | longest streak
 *   - Chronological occurrence timeline (newest first)
 *
 * All data is deterministic — no LLM text is generated or displayed here.
 */

import React, { useState } from "react";
import type { AuditRecord } from "../../../audit/audit_types";
import type {
  DecisiveVariableTrendReport,
  DecisiveVariableTrend,
  DecisiveVariableOccurrence,
} from "../../../audit/trend_types";
import { buildDecisiveVariableTrendReport } from "../../../audit/decisive_variable_trends";

/* =========================================================
   Helpers
   ========================================================= */

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function statusClass(status: string | null): string {
  if (!status) return "nm-trend__status--unknown";
  if (status === "LAWFUL") return "nm-trend__status--lawful";
  if (status === "DEGRADED") return "nm-trend__status--degraded";
  if (status === "INVALID") return "nm-trend__status--invalid";
  return "nm-trend__status--unknown";
}

function streakBar(length: number, max: number): string {
  if (max === 0 || length === 0) return "";
  const filled = Math.round((length / max) * 8);
  return "█".repeat(filled) + "░".repeat(8 - filled);
}

/* =========================================================
   Drift summary block
   ========================================================= */

function DriftSummaryBlock({ report }: { report: DecisiveVariableTrendReport }) {
  const { driftSummary } = report;

  return (
    <div
      className={`nm-trend__drift${driftSummary.drifting ? " nm-trend__drift--drifting" : driftSummary.stabilizing ? " nm-trend__drift--stabilizing" : ""}`}
    >
      <div className="nm-trend__drift-row">
        <span className="nm-trend__drift-label">Most frequent</span>
        <span className="nm-trend__drift-value">
          {driftSummary.mostFrequentVariable ?? "—"}
        </span>
      </div>
      <div className="nm-trend__drift-row">
        <span className="nm-trend__drift-label">Most recent</span>
        <span className="nm-trend__drift-value">
          {driftSummary.mostRecentVariable ?? "none (lawful)"}
        </span>
      </div>
      {driftSummary.recurringViolations.length > 0 && (
        <div className="nm-trend__drift-row">
          <span className="nm-trend__drift-label">Recurring</span>
          <span className="nm-trend__drift-value nm-trend__drift-recurring">
            {driftSummary.recurringViolations.join(", ")}
          </span>
        </div>
      )}
      {(driftSummary.drifting || driftSummary.stabilizing) && (
        <div className="nm-trend__drift-row">
          <span className="nm-trend__drift-label">Trajectory</span>
          <span
            className={`nm-trend__drift-badge ${driftSummary.drifting ? "nm-trend__drift-badge--drift" : "nm-trend__drift-badge--stable"}`}
          >
            {driftSummary.drifting ? "DRIFTING" : "STABILIZING"}
          </span>
        </div>
      )}

      {driftSummary.summaryLines.length > 0 && (
        <ul className="nm-trend__summary-lines">
          {driftSummary.summaryLines.map((line, i) => (
            <li key={i} className="nm-trend__summary-line">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* =========================================================
   Per-variable trend table
   ========================================================= */

function TrendTable({ variables }: { variables: DecisiveVariableTrend[] }) {
  if (variables.length === 0) {
    return (
      <div className="nm-trend__empty">
        No decisive variables recorded yet. Run more evaluations to populate trends.
      </div>
    );
  }

  const maxCount = variables[0]?.count ?? 1;

  return (
    <table className="nm-trend__table">
      <thead>
        <tr>
          <th className="nm-trend__th nm-trend__th--variable">Variable</th>
          <th className="nm-trend__th nm-trend__th--count">Count</th>
          <th className="nm-trend__th nm-trend__th--streak">Cur. streak</th>
          <th className="nm-trend__th nm-trend__th--longest">Max streak</th>
          <th className="nm-trend__th nm-trend__th--bar">Frequency</th>
        </tr>
      </thead>
      <tbody>
        {variables.map((trend) => (
          <tr
            key={trend.variable}
            className={`nm-trend__row${trend.currentStreak >= 2 ? " nm-trend__row--recurring" : ""}`}
          >
            <td className="nm-trend__td nm-trend__td--variable">{trend.variable}</td>
            <td className="nm-trend__td nm-trend__td--count">{trend.count}</td>
            <td className="nm-trend__td nm-trend__td--streak">
              {trend.currentStreak > 0 ? (
                <span className="nm-trend__streak-badge">{trend.currentStreak}×</span>
              ) : (
                <span className="nm-trend__streak-zero">—</span>
              )}
            </td>
            <td className="nm-trend__td nm-trend__td--longest">{trend.longestStreak}</td>
            <td className="nm-trend__td nm-trend__td--bar">
              <span className="nm-trend__bar" aria-hidden="true">
                {streakBar(trend.count, maxCount)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* =========================================================
   Occurrence timeline
   ========================================================= */

function OccurrenceTimeline({
  occurrences,
}: {
  occurrences: DecisiveVariableOccurrence[];
}) {
  const reversed = [...occurrences].reverse();

  return (
    <div className="nm-trend__timeline">
      {reversed.map((occ, i) => (
        <div key={`${occ.versionId}-${i}`} className="nm-trend__timeline-row">
          <span className={`nm-trend__timeline-status ${statusClass(occ.overallStatus)}`}>
            {occ.overallStatus ?? "—"}
          </span>
          <span className="nm-trend__timeline-var">
            {occ.decisiveVariable ?? <span className="nm-trend__timeline-lawful">lawful</span>}
          </span>
          <span className="nm-trend__timeline-time">
            {formatTimestamp(occ.timestamp)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   DecisiveVariableTrendPanel — main export
   ========================================================= */

export interface DecisiveVariableTrendPanelProps {
  records: AuditRecord[];
}

export function DecisiveVariableTrendPanel({
  records,
}: DecisiveVariableTrendPanelProps) {
  const [timelineExpanded, setTimelineExpanded] = useState(false);

  if (records.length === 0) {
    return (
      <div className="nm-trend">
        <div className="nm-trend__header">
          <div className="nm-trend__title">DECISIVE VARIABLE TRENDS</div>
        </div>
        <div className="nm-trend__empty">
          No audit history. Run evaluations and save results to begin trend tracking.
        </div>
      </div>
    );
  }

  const report: DecisiveVariableTrendReport = buildDecisiveVariableTrendReport(records);

  return (
    <div className="nm-trend">
      <div className="nm-trend__header">
        <div className="nm-trend__title">DECISIVE VARIABLE TRENDS</div>
        <div className="nm-trend__meta">
          {report.totalRuns} run{report.totalRuns !== 1 ? "s" : ""}
          {report.variables.length > 0
            ? `, ${report.variables.length} variable${report.variables.length !== 1 ? "s" : ""}`
            : ""}
        </div>
      </div>

      {/* Drift summary */}
      <DriftSummaryBlock report={report} />

      {/* Per-variable trend table */}
      <div className="nm-trend__section">
        <div className="nm-trend__section-label">Variable breakdown</div>
        <TrendTable variables={report.variables} />
      </div>

      {/* Occurrence timeline (collapsible) */}
      <div className="nm-trend__section">
        <button
          type="button"
          className="nm-trend__timeline-toggle"
          onClick={() => setTimelineExpanded((v) => !v)}
          aria-expanded={timelineExpanded}
        >
          <span>Occurrence timeline</span>
          <span className="nm-trend__timeline-count">
            ({report.occurrenceTimeline.length})
          </span>
          <span className="nm-trend__timeline-chevron">
            {timelineExpanded ? "▴" : "▾"}
          </span>
        </button>

        {timelineExpanded && (
          <OccurrenceTimeline occurrences={report.occurrenceTimeline} />
        )}
      </div>
    </div>
  );
}
