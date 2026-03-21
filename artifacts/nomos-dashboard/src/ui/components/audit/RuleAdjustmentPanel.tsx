/**
 * RuleAdjustmentPanel.tsx
 *
 * Renders the NOMOS bounded rule adjustment state for the current audit history.
 *
 * Accepts AuditRecord[] and computes the calibration report and rule adjustment
 * decision internally. Renders:
 *
 *   - Current adjustment state (confidenceBias, escalationBias, uncertaintyBias)
 *   - Signal summary (what inputs drove the adjustment)
 *   - Applied changes (labeled list)
 *   - Summary lines
 *
 * Applies adjustments ONLY to the displayed prediction — never to stored data.
 * All data is deterministic; no LLM generation is used.
 */

import React, { useState } from "react";
import type { AuditRecord } from "../../../audit/audit_types";
import type { RuleAdjustmentState, RuleAdjustmentSignal } from "../../../audit/rule_adjustment_types";
import { DEFAULT_ADJUSTMENT_STATE, ADJUSTMENT_BOUNDS } from "../../../audit/rule_adjustment_types";
import {
  buildRuleAdjustmentSignal,
  computeBoundedRuleAdjustment,
} from "../../../audit/bounded_rule_adjustment";
import { buildPredictionCalibrationReport } from "../../../audit/prediction_calibration";

/* =========================================================
   Bias gauge
   ========================================================= */

function biasBar(value: number, min: number, max: number): string {
  const range = max - min;
  const offset = (value - min) / range;
  const totalBlocks = 10;
  const filled = Math.round(offset * totalBlocks);
  return "█".repeat(filled) + "░".repeat(totalBlocks - filled);
}

function biasColour(
  value: number,
  field: "confidenceBias" | "escalationBias" | "uncertaintyBias"
): string {
  if (field === "uncertaintyBias") {
    if (value >= 0.7) return "nm-adj__bias--elevated";
    return "nm-adj__bias--neutral";
  }
  if (value <= -0.5) return "nm-adj__bias--reduced";
  if (value >= 0.2) return "nm-adj__bias--boosted";
  return "nm-adj__bias--neutral";
}

interface BiasRowProps {
  label: string;
  value: number;
  field: "confidenceBias" | "escalationBias" | "uncertaintyBias";
}

function BiasRow({ label, value, field }: BiasRowProps) {
  const bounds = ADJUSTMENT_BOUNDS[field];
  const bar = biasBar(value, bounds.min, bounds.max);
  const cls = biasColour(value, field);
  const sign = value > 0 ? "+" : "";
  return (
    <div className={`nm-adj__bias-row ${cls}`}>
      <span className="nm-adj__bias-label">{label}</span>
      <span className="nm-adj__bias-bar" aria-hidden="true">
        {bar}
      </span>
      <span className="nm-adj__bias-value">
        {sign}
        {value.toFixed(2)}
      </span>
    </div>
  );
}

/* =========================================================
   Adjustment state block
   ========================================================= */

function AdjustmentStateBlock({ state }: { state: RuleAdjustmentState }) {
  return (
    <div className="nm-adj__state-block">
      <div className="nm-adj__state-label">CURRENT ADJUSTMENT STATE</div>
      <div className="nm-adj__state-rows">
        <BiasRow label="Confidence bias" value={state.confidenceBias} field="confidenceBias" />
        <BiasRow label="Escalation bias" value={state.escalationBias} field="escalationBias" />
        <BiasRow label="Uncertainty bias" value={state.uncertaintyBias} field="uncertaintyBias" />
      </div>
      <div className="nm-adj__state-meta">
        Calibration window: {state.calibrationWindow} run{state.calibrationWindow !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

/* =========================================================
   Signal summary
   ========================================================= */

function pct(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function SignalSummary({ signal }: { signal: RuleAdjustmentSignal }) {
  return (
    <div className="nm-adj__signal">
      <div className="nm-adj__section-label">Input signals</div>
      <table className="nm-adj__signal-table">
        <tbody>
          <tr>
            <td className="nm-adj__signal-td nm-adj__signal-td--label">Exact match rate</td>
            <td className="nm-adj__signal-td nm-adj__signal-td--value">
              {pct(signal.exactMatchRate)}
            </td>
          </tr>
          <tr>
            <td className="nm-adj__signal-td nm-adj__signal-td--label">Direction match rate</td>
            <td className="nm-adj__signal-td nm-adj__signal-td--value">
              {pct(signal.directionMatchRate)}
            </td>
          </tr>
          <tr>
            <td className="nm-adj__signal-td nm-adj__signal-td--label">Too-aggressive rate</td>
            <td
              className={`nm-adj__signal-td nm-adj__signal-td--value ${
                signal.tooAggressiveRate !== null && signal.tooAggressiveRate >= 0.4
                  ? "nm-adj__signal--warn"
                  : ""
              }`}
            >
              {pct(signal.tooAggressiveRate)}
            </td>
          </tr>
          <tr>
            <td className="nm-adj__signal-td nm-adj__signal-td--label">Too-weak rate</td>
            <td
              className={`nm-adj__signal-td nm-adj__signal-td--value ${
                signal.tooWeakRate !== null && signal.tooWeakRate >= 0.4
                  ? "nm-adj__signal--warn"
                  : ""
              }`}
            >
              {pct(signal.tooWeakRate)}
            </td>
          </tr>
          <tr>
            <td className="nm-adj__signal-td nm-adj__signal-td--label">Shallow history</td>
            <td className="nm-adj__signal-td nm-adj__signal-td--value">
              <span
                className={signal.shallowHistory ? "nm-adj__flag--yes" : "nm-adj__flag--no"}
              >
                {signal.shallowHistory ? "YES" : "no"}
              </span>
            </td>
          </tr>
          <tr>
            <td className="nm-adj__signal-td nm-adj__signal-td--label">Noisy history</td>
            <td className="nm-adj__signal-td nm-adj__signal-td--value">
              <span
                className={signal.noisyHistory ? "nm-adj__flag--yes" : "nm-adj__flag--no"}
              >
                {signal.noisyHistory ? "YES" : "no"}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================
   Applied changes
   ========================================================= */

const CHANGE_LABELS: Record<string, string> = {
  shallow_history_uncertainty: "Uncertainty raised (shallow history)",
  noisy_history_uncertainty: "Uncertainty raised (noisy history)",
  low_exact_match_confidence_reduction: "Confidence reduced (low exact-match rate)",
  moderate_exact_match_confidence_reduction: "Confidence reduced (moderate exact-match rate)",
  strong_calibration_confidence_boost: "Confidence slightly boosted (strong calibration)",
  weak_direction_match_confidence_reduction: "Confidence reduced (weak direction accuracy)",
  high_aggressive_rate_escalation_reduction: "Escalation softened (high too-aggressive rate)",
  moderate_aggressive_rate_escalation_reduction: "Escalation softened (moderate too-aggressive rate)",
  too_weak_uncertainty_increase: "Uncertainty raised (predictions too weak)",
};

function AppliedChanges({ changes }: { changes: string[] }) {
  if (changes.length === 0) {
    return (
      <div className="nm-adj__changes-empty">
        No adjustments applied — calibration is stable.
      </div>
    );
  }
  return (
    <ul className="nm-adj__changes">
      {changes.map((change) => (
        <li key={change} className="nm-adj__change">
          <span className="nm-adj__change-dot" />
          {CHANGE_LABELS[change] ?? change}
        </li>
      ))}
    </ul>
  );
}

/* =========================================================
   Summary lines
   ========================================================= */

function SummaryLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="nm-adj__summary">
      {lines.map((line, i) => (
        <li key={i} className="nm-adj__summary-line">
          {line}
        </li>
      ))}
    </ul>
  );
}

/* =========================================================
   RuleAdjustmentPanel — main export
   ========================================================= */

export interface RuleAdjustmentPanelProps {
  records: AuditRecord[];
  currentState?: RuleAdjustmentState;
}

export function RuleAdjustmentPanel({
  records,
  currentState = DEFAULT_ADJUSTMENT_STATE,
}: RuleAdjustmentPanelProps) {
  const [showSignals, setShowSignals] = useState(false);

  if (records.length === 0) {
    return (
      <div className="nm-adj">
        <div className="nm-adj__header">
          <div className="nm-adj__title">BOUNDED RULE ADJUSTMENT</div>
        </div>
        <div className="nm-adj__empty">
          No audit history. Run evaluations to enable rule adjustment.
        </div>
      </div>
    );
  }

  const calibrationReport = buildPredictionCalibrationReport(records);
  const signal = buildRuleAdjustmentSignal(calibrationReport, records);
  const decision = computeBoundedRuleAdjustment(currentState, signal);

  const hasChanges = decision.changes.length > 0;

  return (
    <div className="nm-adj">
      <div className="nm-adj__header">
        <div className="nm-adj__title">BOUNDED RULE ADJUSTMENT</div>
        <div className="nm-adj__meta">
          {records.length} run{records.length !== 1 ? "s" : ""} ·{" "}
          {calibrationReport.resolvedPredictions} resolved
        </div>
      </div>

      {/* Current state */}
      <AdjustmentStateBlock state={decision.nextState} />

      {/* Applied changes */}
      <div className="nm-adj__section">
        <div className="nm-adj__section-label">
          Applied adjustments
          {hasChanges && (
            <span className="nm-adj__change-count">
              {" "}({decision.changes.length})
            </span>
          )}
        </div>
        <AppliedChanges changes={decision.changes} />
      </div>

      {/* Summary lines */}
      <SummaryLines lines={decision.summaryLines} />

      {/* Signals (collapsible) */}
      <div className="nm-adj__section">
        <button
          className="nm-adj__signals-toggle"
          onClick={() => setShowSignals((v) => !v)}
          aria-expanded={showSignals}
        >
          {showSignals ? "▾" : "▸"} Input signals
        </button>
        {showSignals && <SignalSummary signal={signal} />}
      </div>

      {/* Invariant notice */}
      <div className="nm-adj__notice">
        Adjustments apply only to future prediction output. Core constraint logic,
        diff engine, and stored audit history are not modified.
      </div>
    </div>
  );
}
