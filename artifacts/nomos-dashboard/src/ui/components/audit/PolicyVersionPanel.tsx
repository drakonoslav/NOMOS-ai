/**
 * PolicyVersionPanel.tsx
 *
 * Displays a FrozenPredictionRecord with full policy provenance.
 *
 * Shows:
 *   1. Policy version ID + frozen timestamp
 *   2. Calibration window
 *   3. Bounded adjustment state (bias values)
 *   4. Compact summary of active policy rules (4 rows)
 *   5. Explanation lines (numbered)
 *   6. Calibration state at freeze time (collapsible)
 *   7. Comparison with a prior record, if provided (collapsible)
 *
 * Accepts either a FrozenPredictionRecord (single frozen record with all
 * provenance) or a plain FrozenPolicySnapshot (for displaying policy state
 * without a specific prediction).
 *
 * Read-only. Does not modify any stored record.
 * All data is deterministic; no LLM generation is used.
 */

import React, { useState } from "react";
import type { FrozenPredictionRecord, FrozenPolicySnapshot, PolicyComparisonResult } from "../../../audit/policy_versioning_types";
import { compareFrozenPolicies } from "../../../audit/policy_versioning";

/* =========================================================
   Helpers
   ========================================================= */

function biasLabel(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function biasClass(value: number): string {
  if (value <= -0.5) return "nm-ver__bias--reduced";
  if (value >= 0.2) return "nm-ver__bias--boosted";
  if (value !== 0) return "nm-ver__bias--slight";
  return "nm-ver__bias--neutral";
}

function pct(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function confidenceClass(c: string): string {
  if (c === "high") return "nm-ver__conf--high";
  if (c === "moderate") return "nm-ver__conf--moderate";
  return "nm-ver__conf--low";
}

function directionSymbol(d: string): string {
  if (d === "rising") return "↑";
  if (d === "decreasing") return "↓";
  return "→";
}

/* =========================================================
   Policy version header
   ========================================================= */

function VersionHeader({ snapshot }: { snapshot: FrozenPolicySnapshot }) {
  return (
    <div className="nm-ver__header-block">
      <div className="nm-ver__version-id">
        <span className="nm-ver__version-label">Policy version</span>
        <code className="nm-ver__version-code">{snapshot.policyVersionId}</code>
      </div>
      <div className="nm-ver__meta-row">
        <span className="nm-ver__meta">
          Frozen: {formatTimestamp(snapshot.createdAt)}
        </span>
        <span className="nm-ver__meta">
          Calibration window: {snapshot.calibrationWindow} run{snapshot.calibrationWindow !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

/* =========================================================
   Prediction context (from FrozenPredictionRecord)
   ========================================================= */

function PredictionContext({ record }: { record: FrozenPredictionRecord }) {
  return (
    <div className="nm-ver__prediction">
      <div className="nm-ver__section-label">FROZEN PREDICTION</div>
      <div className="nm-ver__pred-variable">
        {record.predictedVariable ?? (
          <span className="nm-ver__pred-none">no dominant signal</span>
        )}
      </div>
      <div className="nm-ver__pred-badges">
        <span className={`nm-ver__conf-badge ${confidenceClass(record.confidence)}`}>
          {record.confidence.toUpperCase()}
        </span>
        <span className="nm-ver__dir-badge">
          {directionSymbol(record.riskDirection)} {record.riskDirection}
        </span>
        <span className="nm-ver__source">
          src: <code>{record.sourceVersionId}</code>
        </span>
      </div>
    </div>
  );
}

/* =========================================================
   Adjustment state block
   ========================================================= */

function AdjustmentBlock({ adj }: { adj: FrozenPolicySnapshot["boundedAdjustmentState"] }) {
  return (
    <div className="nm-ver__block">
      <div className="nm-ver__section-label">BOUNDED ADJUSTMENT STATE</div>
      <table className="nm-ver__table">
        <tbody>
          {[
            ["Confidence bias", adj.confidenceBias],
            ["Escalation bias", adj.escalationBias],
            ["Uncertainty bias", adj.uncertaintyBias],
          ].map(([label, value]) => (
            <tr key={label as string}>
              <td className="nm-ver__td-label">{label}</td>
              <td className={`nm-ver__td-value nm-ver__mono ${biasClass(value as number)}`}>
                {biasLabel(value as number)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================
   Rule summary
   ========================================================= */

function RuleSummary({ snapshot }: { snapshot: FrozenPolicySnapshot }) {
  return (
    <div className="nm-ver__block">
      <div className="nm-ver__section-label">ACTIVE POLICY RULES</div>
      <table className="nm-ver__rule-table">
        <tbody>
          {[
            ["Base", snapshot.basePredictionRule],
            ["Confidence", snapshot.confidenceRule],
            ["Escalation", snapshot.escalationRule],
            ["Uncertainty", snapshot.uncertaintyRule],
          ].map(([label, value]) => (
            <tr key={label}>
              <td className="nm-ver__rule-label">{label}</td>
              <td className="nm-ver__rule-value">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================
   Explanation lines
   ========================================================= */

function ExplanationBlock({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="nm-ver__block">
      <div className="nm-ver__section-label">POLICY EXPLANATION AT FREEZE TIME</div>
      <ol className="nm-ver__explanation">
        {lines.map((line, i) => (
          <li key={i} className="nm-ver__explanation-line">
            {line}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* =========================================================
   Calibration state at freeze time (collapsible)
   ========================================================= */

function CalibrationBlock({ cal }: { cal: FrozenPolicySnapshot["calibrationState"] }) {
  return (
    <div className="nm-ver__block">
      <div className="nm-ver__section-label">CALIBRATION AT FREEZE TIME</div>
      <table className="nm-ver__table">
        <tbody>
          <tr>
            <td className="nm-ver__td-label">Total predictions</td>
            <td className="nm-ver__td-value">{cal.totalPredictions}</td>
          </tr>
          <tr>
            <td className="nm-ver__td-label">Resolved</td>
            <td className="nm-ver__td-value">{cal.resolvedPredictions}</td>
          </tr>
          <tr>
            <td className="nm-ver__td-label">Exact match</td>
            <td className="nm-ver__td-value">{pct(cal.exactMatchRate)}</td>
          </tr>
          <tr>
            <td className="nm-ver__td-label">Direction match</td>
            <td className="nm-ver__td-value">{pct(cal.directionMatchRate)}</td>
          </tr>
          <tr>
            <td className="nm-ver__td-label">Too-aggressive</td>
            <td
              className={`nm-ver__td-value ${
                cal.tooAggressiveRate !== null && cal.tooAggressiveRate >= 0.4
                  ? "nm-ver__warn"
                  : ""
              }`}
            >
              {pct(cal.tooAggressiveRate)}
            </td>
          </tr>
          <tr>
            <td className="nm-ver__td-label">Too-weak</td>
            <td
              className={`nm-ver__td-value ${
                cal.tooWeakRate !== null && cal.tooWeakRate >= 0.4
                  ? "nm-ver__warn"
                  : ""
              }`}
            >
              {pct(cal.tooWeakRate)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================
   Policy comparison (collapsible)
   ========================================================= */

const FIELD_LABELS: Record<string, string> = {
  basePredictionRule: "Base prediction rule",
  confidenceRule: "Confidence rule",
  escalationRule: "Escalation rule",
  uncertaintyRule: "Uncertainty rule",
  calibrationWindow: "Calibration window",
  confidenceBias: "Confidence bias",
  escalationBias: "Escalation bias",
  uncertaintyBias: "Uncertainty bias",
};

function ComparisonBlock({
  result,
  beforeId,
  afterId,
}: {
  result: PolicyComparisonResult;
  beforeId: string;
  afterId: string;
}) {
  if (!result.changed) {
    return (
      <div className="nm-ver__comparison nm-ver__comparison--same">
        <span className="nm-ver__comp-icon">≡</span>
        Policy regime unchanged from <code>{beforeId}</code> to{" "}
        <code>{afterId}</code>.
      </div>
    );
  }
  return (
    <div className="nm-ver__comparison nm-ver__comparison--changed">
      <div className="nm-ver__comp-title">
        <span className="nm-ver__comp-icon">≠</span>
        Policy regime changed from <code>{beforeId}</code> to{" "}
        <code>{afterId}</code>.
      </div>
      <ul className="nm-ver__comp-fields">
        {result.changedFields.map((f) => (
          <li key={f} className="nm-ver__comp-field">
            <span className="nm-ver__comp-dot" />
            {FIELD_LABELS[f] ?? f}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* =========================================================
   PolicyVersionPanel — main export
   ========================================================= */

export interface PolicyVersionPanelProps {
  /** A frozen prediction record (full provenance). */
  record: FrozenPredictionRecord;
  /** Optional prior frozen record to diff against. */
  priorRecord?: FrozenPredictionRecord;
}

export function PolicyVersionPanel({ record, priorRecord }: PolicyVersionPanelProps) {
  const [showCalibration, setShowCalibration] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const snapshot = record.frozenPolicySnapshot;

  const comparison: PolicyComparisonResult | null = priorRecord
    ? compareFrozenPolicies(priorRecord.frozenPolicySnapshot, snapshot)
    : null;

  return (
    <div className="nm-ver">
      <div className="nm-ver__panel-header">
        <div className="nm-ver__panel-title">POLICY VERSION</div>
        <div className="nm-ver__panel-meta">read-only · frozen at prediction time</div>
      </div>

      {/* Version ID + timestamps */}
      <VersionHeader snapshot={snapshot} />

      {/* Prediction context */}
      <PredictionContext record={record} />

      {/* Bounded adjustments */}
      <AdjustmentBlock adj={snapshot.boundedAdjustmentState} />

      {/* Explanation lines */}
      <ExplanationBlock lines={snapshot.explanationLines} />

      {/* Collapsible: policy rules */}
      <div className="nm-ver__collapsible">
        <button
          className="nm-ver__toggle"
          onClick={() => setShowRules((v) => !v)}
          aria-expanded={showRules}
        >
          {showRules ? "▾" : "▸"} Active policy rules
        </button>
        {showRules && <RuleSummary snapshot={snapshot} />}
      </div>

      {/* Collapsible: calibration state */}
      <div className="nm-ver__collapsible">
        <button
          className="nm-ver__toggle"
          onClick={() => setShowCalibration((v) => !v)}
          aria-expanded={showCalibration}
        >
          {showCalibration ? "▾" : "▸"} Calibration at freeze time
        </button>
        {showCalibration && <CalibrationBlock cal={snapshot.calibrationState} />}
      </div>

      {/* Collapsible: policy comparison (only if prior provided) */}
      {comparison && (
        <div className="nm-ver__collapsible">
          <button
            className="nm-ver__toggle"
            onClick={() => setShowComparison((v) => !v)}
            aria-expanded={showComparison}
          >
            {showComparison ? "▾" : "▸"} Policy regime comparison
            {comparison.changed && (
              <span className="nm-ver__comp-badge">changed</span>
            )}
          </button>
          {showComparison && (
            <ComparisonBlock
              result={comparison}
              beforeId={priorRecord!.frozenPolicySnapshot.policyVersionId}
              afterId={snapshot.policyVersionId}
            />
          )}
        </div>
      )}

      {/* Immutability notice */}
      <div className="nm-ver__notice">
        This frozen policy snapshot was recorded at prediction time and is permanently
        attached to this prediction. Historical snapshots are never modified.
      </div>
    </div>
  );
}
