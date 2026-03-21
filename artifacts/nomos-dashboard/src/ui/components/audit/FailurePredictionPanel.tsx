/**
 * FailurePredictionPanel.tsx
 *
 * Renders the constrained failure prediction for the NOMOS audit history.
 *
 * Accepts AuditRecord[] and computes the FailurePrediction internally via
 * buildFailurePrediction(). Renders:
 *
 *   - Predicted next degradation mode (or "no dominant signal")
 *   - Confidence badge (low / moderate / high)
 *   - Risk direction badge (decreasing / stable / rising)
 *   - Explanation lines derived deterministically from history
 *   - Supporting signals table: variable | score | streak | recent share
 *
 * All data is deterministic — no LLM text is generated or displayed here.
 */

import React from "react";
import type { AuditRecord } from "../../../audit/audit_types";
import type { FailurePrediction, FailurePredictionSignal } from "../../../audit/prediction_types";
import { buildFailurePrediction } from "../../../audit/failure_prediction";

/* =========================================================
   Badge helpers
   ========================================================= */

function ConfidenceBadge({ confidence }: { confidence: FailurePrediction["confidence"] }) {
  const cls =
    confidence === "high"
      ? "nm-pred__badge nm-pred__badge--high"
      : confidence === "moderate"
      ? "nm-pred__badge nm-pred__badge--moderate"
      : "nm-pred__badge nm-pred__badge--low";
  return <span className={cls}>{confidence.toUpperCase()}</span>;
}

function RiskBadge({ direction }: { direction: FailurePrediction["riskDirection"] }) {
  const cls =
    direction === "rising"
      ? "nm-pred__badge nm-pred__badge--rising"
      : direction === "decreasing"
      ? "nm-pred__badge nm-pred__badge--decreasing"
      : "nm-pred__badge nm-pred__badge--stable";
  const label =
    direction === "rising" ? "↑ RISING" : direction === "decreasing" ? "↓ DECREASING" : "→ STABLE";
  return <span className={cls}>{label}</span>;
}

/* =========================================================
   Predicted variable block
   ========================================================= */

function PredictedVariableBlock({ prediction }: { prediction: FailurePrediction }) {
  const { predictedVariable, confidence, riskDirection } = prediction;

  return (
    <div className={`nm-pred__prediction-block nm-pred__prediction-block--${confidence}`}>
      <div className="nm-pred__prediction-label">NEXT LIKELY DEGRADATION MODE</div>
      <div className="nm-pred__prediction-value">
        {predictedVariable ?? (
          <span className="nm-pred__prediction-none">No dominant signal</span>
        )}
      </div>
      <div className="nm-pred__prediction-badges">
        <ConfidenceBadge confidence={confidence} />
        <RiskBadge direction={riskDirection} />
      </div>
    </div>
  );
}

/* =========================================================
   Explanation lines
   ========================================================= */

function ExplanationLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="nm-pred__explanation">
      {lines.map((line, i) => (
        <li key={i} className="nm-pred__explanation-line">
          {line}
        </li>
      ))}
    </ul>
  );
}

/* =========================================================
   Signals table
   ========================================================= */

function recentShareBar(share: number): string {
  const filled = Math.round(share * 5);
  return "█".repeat(filled) + "░".repeat(5 - filled);
}

function SignalsTable({ signals }: { signals: FailurePredictionSignal[] }) {
  if (signals.length === 0) {
    return (
      <div className="nm-pred__empty">
        No decisive variables recorded. Run evaluations to build prediction history.
      </div>
    );
  }

  const maxScore = signals[0]?.weightedRiskScore ?? 1;

  return (
    <table className="nm-pred__table">
      <thead>
        <tr>
          <th className="nm-pred__th nm-pred__th--variable">Variable</th>
          <th className="nm-pred__th nm-pred__th--score">Score</th>
          <th className="nm-pred__th nm-pred__th--streak">Streak</th>
          <th className="nm-pred__th nm-pred__th--recent">Recent</th>
          <th className="nm-pred__th nm-pred__th--bar">Risk</th>
        </tr>
      </thead>
      <tbody>
        {signals.map((sig, idx) => (
          <tr
            key={sig.variable}
            className={`nm-pred__row${idx === 0 ? " nm-pred__row--top" : ""}`}
          >
            <td className="nm-pred__td nm-pred__td--variable">{sig.variable}</td>
            <td className="nm-pred__td nm-pred__td--score">
              {sig.weightedRiskScore.toFixed(1)}
            </td>
            <td className="nm-pred__td nm-pred__td--streak">
              {sig.currentStreak > 0 ? (
                <span className="nm-pred__streak-badge">{sig.currentStreak}×</span>
              ) : (
                <span className="nm-pred__streak-zero">—</span>
              )}
            </td>
            <td className="nm-pred__td nm-pred__td--recent">
              {Math.round(sig.recentShare * 100)}%
            </td>
            <td className="nm-pred__td nm-pred__td--bar">
              <span
                className="nm-pred__bar"
                style={{
                  opacity: maxScore > 0 ? 0.4 + 0.6 * (sig.weightedRiskScore / maxScore) : 0.4,
                }}
                aria-hidden="true"
              >
                {recentShareBar(sig.recentShare)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* =========================================================
   FailurePredictionPanel — main export
   ========================================================= */

export interface FailurePredictionPanelProps {
  records: AuditRecord[];
}

export function FailurePredictionPanel({ records }: FailurePredictionPanelProps) {
  if (records.length === 0) {
    return (
      <div className="nm-pred">
        <div className="nm-pred__header">
          <div className="nm-pred__title">FAILURE PREDICTION</div>
        </div>
        <div className="nm-pred__empty">
          No audit history. Run evaluations to enable failure prediction.
        </div>
      </div>
    );
  }

  const prediction: FailurePrediction = buildFailurePrediction(records);

  return (
    <div className="nm-pred">
      <div className="nm-pred__header">
        <div className="nm-pred__title">FAILURE PREDICTION</div>
        <div className="nm-pred__meta">
          Based on {records.length} run{records.length !== 1 ? "s" : ""}
          {prediction.signals.length > 0
            ? `, ${prediction.signals.length} signal${prediction.signals.length !== 1 ? "s" : ""}`
            : ""}
        </div>
      </div>

      {/* Predicted variable + confidence + direction */}
      <PredictedVariableBlock prediction={prediction} />

      {/* Explanation lines */}
      <ExplanationLines lines={prediction.explanationLines} />

      {/* Supporting signals */}
      {prediction.signals.length > 0 && (
        <div className="nm-pred__section">
          <div className="nm-pred__section-label">Supporting signals</div>
          <SignalsTable signals={prediction.signals} />
        </div>
      )}
    </div>
  );
}
