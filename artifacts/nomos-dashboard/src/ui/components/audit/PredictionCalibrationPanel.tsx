/**
 * PredictionCalibrationPanel.tsx
 *
 * Renders the NOMOS prediction calibration report from audit history.
 *
 * Accepts AuditRecord[] and computes the PredictionCalibrationReport
 * internally via buildPredictionCalibrationReport(). Renders:
 *
 *   - Exact match rate and direction match rate
 *   - Calibration class counts (well_calibrated / too_aggressive / too_weak / unresolved)
 *   - Summary lines derived deterministically from calibration outcomes
 *   - Recent prediction outcomes table (newest first)
 *
 * Measurement only — prediction rules are not modified here.
 * All data is deterministic; no LLM generation is used.
 */

import React, { useState } from "react";
import type { AuditRecord } from "../../../audit/audit_types";
import type {
  PredictionCalibrationReport,
  PredictionOutcomeRecord,
} from "../../../audit/calibration_types";
import { buildPredictionCalibrationReport } from "../../../audit/prediction_calibration";

/* =========================================================
   Rate display
   ========================================================= */

function RateBar({ label, rate }: { label: string; rate: number | null }) {
  if (rate === null) return null;
  const pct = Math.round(rate * 100);
  const filled = Math.round(rate * 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  return (
    <div className="nm-cal__rate-row">
      <span className="nm-cal__rate-label">{label}</span>
      <span className="nm-cal__rate-bar" aria-hidden="true">
        {bar}
      </span>
      <span className="nm-cal__rate-value">{pct}%</span>
    </div>
  );
}

/* =========================================================
   Calibration class counts
   ========================================================= */

const CLASS_LABELS: Record<string, string> = {
  well_calibrated: "Well calibrated",
  too_aggressive: "Too aggressive",
  too_weak: "Too weak",
  unresolved: "Unresolved",
};

const CLASS_MOD: Record<string, string> = {
  well_calibrated: "nm-cal__class--good",
  too_aggressive: "nm-cal__class--aggressive",
  too_weak: "nm-cal__class--weak",
  unresolved: "nm-cal__class--pending",
};

function CalibrationClassCounts({
  counts,
}: {
  counts: PredictionCalibrationReport["calibrationCounts"];
}) {
  const entries = (
    ["well_calibrated", "too_aggressive", "too_weak", "unresolved"] as const
  ).map((cls) => ({ cls, count: counts[cls] }));

  return (
    <div className="nm-cal__classes">
      {entries.map(({ cls, count }) => (
        <div key={cls} className={`nm-cal__class ${CLASS_MOD[cls]}`}>
          <span className="nm-cal__class-count">{count}</span>
          <span className="nm-cal__class-label">{CLASS_LABELS[cls]}</span>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   Summary lines
   ========================================================= */

function SummaryLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="nm-cal__summary">
      {lines.map((line, i) => (
        <li key={i} className="nm-cal__summary-line">
          {line}
        </li>
      ))}
    </ul>
  );
}

/* =========================================================
   Outcome row
   ========================================================= */

function calClassBadge(cls: PredictionOutcomeRecord["calibrationClass"]): React.ReactNode {
  const modMap: Record<string, string> = {
    well_calibrated: "nm-cal__badge--good",
    too_aggressive: "nm-cal__badge--aggressive",
    too_weak: "nm-cal__badge--weak",
    unresolved: "nm-cal__badge--pending",
  };
  const labelMap: Record<string, string> = {
    well_calibrated: "OK",
    too_aggressive: "AGGR",
    too_weak: "WEAK",
    unresolved: "…",
  };
  return (
    <span className={`nm-cal__badge ${modMap[cls]}`}>{labelMap[cls]}</span>
  );
}

function OutcomeRow({ outcome }: { outcome: PredictionOutcomeRecord }) {
  const [expanded, setExpanded] = useState(false);
  const predicted = outcome.predictedVariable ?? "none";
  const actual = outcome.actualNextVariable ?? "none";
  const ts = new Date(
    outcome.sourceVersionId.includes("T")
      ? outcome.sourceVersionId
      : Date.now()
  ).toISOString();

  return (
    <>
      <tr
        className={`nm-cal__outcome-row${expanded ? " nm-cal__outcome-row--open" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="nm-cal__td nm-cal__td--badge">
          {calClassBadge(outcome.calibrationClass)}
        </td>
        <td className="nm-cal__td nm-cal__td--predicted">{predicted}</td>
        <td className="nm-cal__td nm-cal__td--actual">{actual}</td>
        <td className="nm-cal__td nm-cal__td--dir">
          <span className="nm-cal__dir">{outcome.predictedRiskDirection}</span>
          {outcome.actualRiskDirection && (
            <>
              <span className="nm-cal__dir-arrow">→</span>
              <span className="nm-cal__dir">{outcome.actualRiskDirection}</span>
            </>
          )}
        </td>
        <td className="nm-cal__td nm-cal__td--match">
          <span className={outcome.exactMatch ? "nm-cal__match--yes" : "nm-cal__match--no"}>
            {outcome.exactMatch ? "✓" : "–"}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="nm-cal__outcome-detail">
          <td colSpan={5} className="nm-cal__detail-cell">
            <div className="nm-cal__detail-summary">{outcome.summary}</div>
            <div className="nm-cal__detail-meta">
              Confidence: <strong>{outcome.confidence}</strong>
              {outcome.resolvedVersionId && (
                <>
                  {" · "}Resolved at:{" "}
                  <span className="nm-cal__mono">
                    {outcome.resolvedVersionId.slice(0, 12)}…
                  </span>
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* =========================================================
   Outcomes table
   ========================================================= */

function OutcomesTable({ outcomes }: { outcomes: PredictionOutcomeRecord[] }) {
  if (outcomes.length === 0) {
    return (
      <div className="nm-cal__empty">
        No prediction outcomes to display.
      </div>
    );
  }

  return (
    <table className="nm-cal__table">
      <thead>
        <tr>
          <th className="nm-cal__th">Class</th>
          <th className="nm-cal__th">Predicted</th>
          <th className="nm-cal__th">Actual</th>
          <th className="nm-cal__th">Direction</th>
          <th className="nm-cal__th">Exact</th>
        </tr>
      </thead>
      <tbody>
        {outcomes.map((o, i) => (
          <OutcomeRow key={`${o.sourceVersionId}-${i}`} outcome={o} />
        ))}
      </tbody>
    </table>
  );
}

/* =========================================================
   PredictionCalibrationPanel — main export
   ========================================================= */

export interface PredictionCalibrationPanelProps {
  records: AuditRecord[];
}

export function PredictionCalibrationPanel({
  records,
}: PredictionCalibrationPanelProps) {
  if (records.length === 0) {
    return (
      <div className="nm-cal">
        <div className="nm-cal__header">
          <div className="nm-cal__title">PREDICTION CALIBRATION</div>
        </div>
        <div className="nm-cal__empty">
          No audit history. Run evaluations to enable prediction calibration.
        </div>
      </div>
    );
  }

  const report: PredictionCalibrationReport =
    buildPredictionCalibrationReport(records);

  return (
    <div className="nm-cal">
      <div className="nm-cal__header">
        <div className="nm-cal__title">PREDICTION CALIBRATION</div>
        <div className="nm-cal__meta">
          {report.totalPredictions} prediction
          {report.totalPredictions !== 1 ? "s" : ""} ·{" "}
          {report.resolvedPredictions} resolved
          {report.unresolvedPredictions > 0
            ? ` · ${report.unresolvedPredictions} pending`
            : ""}
        </div>
      </div>

      {/* Match rates */}
      {(report.exactMatchRate !== null || report.directionMatchRate !== null) && (
        <div className="nm-cal__rates">
          <RateBar label="Exact match" rate={report.exactMatchRate} />
          <RateBar label="Direction match" rate={report.directionMatchRate} />
        </div>
      )}

      {/* Class counts */}
      <CalibrationClassCounts counts={report.calibrationCounts} />

      {/* Summary lines */}
      <SummaryLines lines={report.summaryLines} />

      {/* Outcomes table */}
      {report.outcomes.length > 0 && (
        <div className="nm-cal__section">
          <div className="nm-cal__section-label">
            Prediction outcomes{" "}
            <span className="nm-cal__section-hint">(click a row to expand)</span>
          </div>
          <OutcomesTable outcomes={report.outcomes} />
        </div>
      )}
    </div>
  );
}
