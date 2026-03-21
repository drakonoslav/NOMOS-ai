/**
 * PolicyVisibilityPanel.tsx
 *
 * Renders a complete, inspectable view of the NOMOS prediction policy.
 *
 * Accepts AuditRecord[] plus the active prediction, adjustment state, and
 * calibration report. Computes a PredictionPolicySnapshot internally via
 * buildPredictionPolicySnapshot(). Renders four blocks:
 *
 *   1. Current prediction policy (version, rule descriptions)
 *   2. Calibration state (metrics from the current window)
 *   3. Bounded adjustment state (bias values)
 *   4. Why NOMOS speaks with its current confidence (explanation lines)
 *
 * Read-only. Does not modify any stored data or prediction.
 * All data is deterministic; no LLM generation is used.
 */

import React, { useState } from "react";
import type { AuditRecord } from "../../../audit/audit_types";
import type { FailurePrediction } from "../../../audit/prediction_types";
import type { RuleAdjustmentState } from "../../../audit/rule_adjustment_types";
import type { PredictionCalibrationReport } from "../../../audit/calibration_types";
import type { PredictionPolicySnapshot } from "../../../audit/policy_visibility_types";
import { buildPredictionPolicySnapshot } from "../../../audit/policy_visibility";
import { DEFAULT_ADJUSTMENT_STATE } from "../../../audit/rule_adjustment_types";
import { buildFailurePrediction } from "../../../audit/failure_prediction";
import { buildPredictionCalibrationReport } from "../../../audit/prediction_calibration";

/* =========================================================
   Helpers
   ========================================================= */

function pct(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function confidenceColour(c: string): string {
  if (c === "high") return "nm-pol__conf--high";
  if (c === "moderate") return "nm-pol__conf--moderate";
  return "nm-pol__conf--low";
}

function directionColour(d: string): string {
  if (d === "rising") return "nm-pol__dir--rising";
  if (d === "decreasing") return "nm-pol__dir--decreasing";
  return "nm-pol__dir--stable";
}

function biasLabel(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function biasClass(value: number, field: "confidence" | "escalation" | "uncertainty"): string {
  if (field === "uncertainty") {
    if (value >= 0.5) return "nm-pol__bias--elevated";
    return "nm-pol__bias--neutral";
  }
  if (value <= -0.5) return "nm-pol__bias--reduced";
  if (value >= 0.2) return "nm-pol__bias--boosted";
  return "nm-pol__bias--neutral";
}

/* =========================================================
   Block: Policy rules
   ========================================================= */

function PolicyRulesBlock({ snapshot }: { snapshot: PredictionPolicySnapshot }) {
  return (
    <div className="nm-pol__block">
      <div className="nm-pol__block-header">
        <span className="nm-pol__block-title">PREDICTION POLICY</span>
        <span className="nm-pol__version">{snapshot.policyVersion}</span>
      </div>
      <table className="nm-pol__rule-table">
        <tbody>
          {[
            ["Base rule", snapshot.basePredictionRule],
            ["Confidence rule", snapshot.confidenceRule],
            ["Escalation rule", snapshot.escalationRule],
            ["Uncertainty rule", snapshot.uncertaintyRule],
          ].map(([label, value]) => (
            <tr key={label} className="nm-pol__rule-row">
              <td className="nm-pol__rule-label">{label}</td>
              <td className="nm-pol__rule-value">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================
   Block: Calibration state
   ========================================================= */

function CalibrationStateBlock({
  state,
}: {
  state: PredictionPolicySnapshot["calibrationState"];
}) {
  return (
    <div className="nm-pol__block">
      <div className="nm-pol__block-header">
        <span className="nm-pol__block-title">CALIBRATION STATE</span>
      </div>
      <table className="nm-pol__metrics-table">
        <tbody>
          <tr>
            <td className="nm-pol__metric-label">Total predictions</td>
            <td className="nm-pol__metric-value">{state.totalPredictions}</td>
          </tr>
          <tr>
            <td className="nm-pol__metric-label">Resolved predictions</td>
            <td className="nm-pol__metric-value">{state.resolvedPredictions}</td>
          </tr>
          <tr>
            <td className="nm-pol__metric-label">Exact match rate</td>
            <td className="nm-pol__metric-value">{pct(state.exactMatchRate)}</td>
          </tr>
          <tr>
            <td className="nm-pol__metric-label">Direction match rate</td>
            <td className="nm-pol__metric-value">{pct(state.directionMatchRate)}</td>
          </tr>
          <tr>
            <td
              className={`nm-pol__metric-label`}
            >
              Too-aggressive rate
            </td>
            <td
              className={`nm-pol__metric-value ${
                state.tooAggressiveRate !== null && state.tooAggressiveRate >= 0.4
                  ? "nm-pol__metric--warn"
                  : ""
              }`}
            >
              {pct(state.tooAggressiveRate)}
            </td>
          </tr>
          <tr>
            <td className="nm-pol__metric-label">Too-weak rate</td>
            <td
              className={`nm-pol__metric-value ${
                state.tooWeakRate !== null && state.tooWeakRate >= 0.4
                  ? "nm-pol__metric--warn"
                  : ""
              }`}
            >
              {pct(state.tooWeakRate)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================
   Block: Bounded adjustment state
   ========================================================= */

function AdjustmentStateBlock({
  adj,
}: {
  adj: PredictionPolicySnapshot["boundedAdjustmentState"];
}) {
  return (
    <div className="nm-pol__block">
      <div className="nm-pol__block-header">
        <span className="nm-pol__block-title">BOUNDED ADJUSTMENTS</span>
        <span className="nm-pol__meta">window: {adj.calibrationWindow} runs</span>
      </div>
      <table className="nm-pol__metrics-table">
        <tbody>
          <tr>
            <td className="nm-pol__metric-label">Confidence bias</td>
            <td className={`nm-pol__metric-value nm-pol__mono ${biasClass(adj.confidenceBias, "confidence")}`}>
              {biasLabel(adj.confidenceBias)}
            </td>
          </tr>
          <tr>
            <td className="nm-pol__metric-label">Escalation bias</td>
            <td className={`nm-pol__metric-value nm-pol__mono ${biasClass(adj.escalationBias, "escalation")}`}>
              {biasLabel(adj.escalationBias)}
            </td>
          </tr>
          <tr>
            <td className="nm-pol__metric-label">Uncertainty bias</td>
            <td className={`nm-pol__metric-value nm-pol__mono ${biasClass(adj.uncertaintyBias, "uncertainty")}`}>
              {biasLabel(adj.uncertaintyBias)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================
   Block: Current prediction context
   ========================================================= */

function PredictionContextBlock({
  ctx,
}: {
  ctx: PredictionPolicySnapshot["currentPredictionContext"];
}) {
  return (
    <div className="nm-pol__block nm-pol__block--prediction">
      <div className="nm-pol__block-header">
        <span className="nm-pol__block-title">CURRENT PREDICTION</span>
      </div>
      <div className="nm-pol__prediction-row">
        <span className="nm-pol__prediction-label">Predicted variable</span>
        <span className="nm-pol__prediction-value">
          {ctx.predictedVariable ?? (
            <span className="nm-pol__prediction-none">none</span>
          )}
        </span>
      </div>
      <div className="nm-pol__prediction-badges">
        <span className={`nm-pol__conf-badge ${confidenceColour(ctx.confidence)}`}>
          {ctx.confidence.toUpperCase()} CONFIDENCE
        </span>
        <span className={`nm-pol__dir-badge ${directionColour(ctx.riskDirection)}`}>
          {ctx.riskDirection === "rising"
            ? "↑ RISING"
            : ctx.riskDirection === "decreasing"
            ? "↓ DECREASING"
            : "→ STABLE"}
        </span>
      </div>
    </div>
  );
}

/* =========================================================
   Block: Why NOMOS speaks this way
   ========================================================= */

function ExplanationBlock({ lines }: { lines: string[] }) {
  return (
    <div className="nm-pol__block">
      <div className="nm-pol__block-header">
        <span className="nm-pol__block-title">WHY NOMOS SPEAKS THIS WAY</span>
      </div>
      <ol className="nm-pol__explanation">
        {lines.map((line, i) => (
          <li key={i} className="nm-pol__explanation-line">
            {line}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* =========================================================
   PolicyVisibilityPanel — main export
   ========================================================= */

export interface PolicyVisibilityPanelProps {
  records: AuditRecord[];
  currentPrediction?: FailurePrediction;
  adjustmentState?: RuleAdjustmentState;
  calibrationReport?: PredictionCalibrationReport;
}

export function PolicyVisibilityPanel({
  records,
  currentPrediction,
  adjustmentState = DEFAULT_ADJUSTMENT_STATE,
  calibrationReport,
}: PolicyVisibilityPanelProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (records.length === 0) {
    return (
      <div className="nm-pol">
        <div className="nm-pol__header">
          <div className="nm-pol__title">POLICY VISIBILITY</div>
        </div>
        <div className="nm-pol__empty">
          No audit history. Run evaluations to enable policy visibility.
        </div>
      </div>
    );
  }

  const prediction = currentPrediction ?? buildFailurePrediction(records);
  const calReport = calibrationReport ?? buildPredictionCalibrationReport(records);
  const snapshot = buildPredictionPolicySnapshot(
    records,
    prediction,
    adjustmentState,
    calReport
  );

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isOpen(key: string) {
    return !collapsed.has(key);
  }

  return (
    <div className="nm-pol">
      <div className="nm-pol__header">
        <div className="nm-pol__title">POLICY VISIBILITY</div>
        <div className="nm-pol__meta">
          {records.length} run{records.length !== 1 ? "s" : ""} · read-only
        </div>
      </div>

      {/* Current prediction (always visible) */}
      <PredictionContextBlock ctx={snapshot.currentPredictionContext} />

      {/* Why NOMOS speaks this way (always visible) */}
      <ExplanationBlock lines={snapshot.explanationLines} />

      {/* Collapsible: Policy rules */}
      <div className="nm-pol__collapsible">
        <button
          className="nm-pol__toggle"
          onClick={() => toggle("policy")}
          aria-expanded={isOpen("policy")}
        >
          {isOpen("policy") ? "▾" : "▸"} Prediction policy rules
        </button>
        {isOpen("policy") && <PolicyRulesBlock snapshot={snapshot} />}
      </div>

      {/* Collapsible: Calibration state */}
      <div className="nm-pol__collapsible">
        <button
          className="nm-pol__toggle"
          onClick={() => toggle("calibration")}
          aria-expanded={isOpen("calibration")}
        >
          {isOpen("calibration") ? "▾" : "▸"} Calibration state
        </button>
        {isOpen("calibration") && (
          <CalibrationStateBlock state={snapshot.calibrationState} />
        )}
      </div>

      {/* Collapsible: Bounded adjustments */}
      <div className="nm-pol__collapsible">
        <button
          className="nm-pol__toggle"
          onClick={() => toggle("adjustments")}
          aria-expanded={isOpen("adjustments")}
        >
          {isOpen("adjustments") ? "▾" : "▸"} Bounded adjustments
        </button>
        {isOpen("adjustments") && (
          <AdjustmentStateBlock adj={snapshot.boundedAdjustmentState} />
        )}
      </div>

      {/* Read-only notice */}
      <div className="nm-pol__notice">
        Policy visibility is read-only. No stored predictions, calibration records,
        or adjustment states are modified by this panel.
      </div>
    </div>
  );
}
