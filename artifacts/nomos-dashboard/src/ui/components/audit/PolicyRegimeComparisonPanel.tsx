/**
 * PolicyRegimeComparisonPanel.tsx
 *
 * Renders a full cross-regime comparison report from FrozenPredictionRecord[].
 *
 * Builds the report via buildPolicyRegimeComparisonReport() internally.
 *
 * Shows four sections:
 *   1. Best-in-class summary (exactMatch, directionMatch, lowestAggressive)
 *   2. Per-regime metrics table (one row per policy version)
 *   3. Pairwise deltas (consecutive regime comparisons)
 *   4. Overall summary lines
 *
 * Comparison only — no policy is promoted or rolled back here.
 * Read-only. All data is deterministic; no LLM generation is used.
 */

import React, { useState } from "react";
import type { FrozenPredictionRecord } from "../../../audit/policy_versioning_types";
import type {
  PolicyRegimeMetrics,
  PolicyRegimeComparison,
  PolicyRegimeComparisonReport,
} from "../../../audit/policy_regime_comparison_types";
import { buildPolicyRegimeComparisonReport } from "../../../audit/policy_regime_comparison";

/* =========================================================
   Helpers
   ========================================================= */

function pct(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function score(s: number | null): string {
  if (s === null) return "—";
  return s.toFixed(2);
}

function bias(b: number | null): string {
  if (b === null) return "—";
  const sign = b > 0 ? "+" : "";
  return `${sign}${b.toFixed(2)}`;
}

function shortId(id: string): string {
  return id.length > 4 ? id.slice(4) : id;
}

function deltaClass(d: number | null, higherIsBetter: boolean): string {
  if (d === null) return "";
  if (higherIsBetter) {
    if (d > 0.02) return "nm-rcp__delta--positive";
    if (d < -0.02) return "nm-rcp__delta--negative";
  } else {
    if (d < -0.02) return "nm-rcp__delta--positive"; // lower aggressive rate is better
    if (d > 0.02) return "nm-rcp__delta--negative";
  }
  return "nm-rcp__delta--neutral";
}

function deltaLabel(d: number | null): string {
  if (d === null) return "—";
  const sign = d > 0 ? "+" : "";
  return `${sign}${Math.round(d * 100)}pp`;
}

/* =========================================================
   Best-in-class banner
   ========================================================= */

interface BestBannerProps {
  report: PolicyRegimeComparisonReport;
}

function BestBanner({ report }: BestBannerProps) {
  const items = [
    {
      label: "Best exact match",
      id: report.bestByExactMatch,
      metric: report.regimes.find((r) => r.policyVersionId === report.bestByExactMatch)?.exactMatchRate,
      metricLabel: "exact",
    },
    {
      label: "Best direction match",
      id: report.bestByDirectionMatch,
      metric: report.regimes.find((r) => r.policyVersionId === report.bestByDirectionMatch)?.directionMatchRate,
      metricLabel: "direction",
    },
    {
      label: "Lowest aggressive rate",
      id: report.lowestAggressiveRate,
      metric: report.regimes.find((r) => r.policyVersionId === report.lowestAggressiveRate)?.tooAggressiveRate,
      metricLabel: "aggressive",
      lowerIsBetter: true,
    },
  ];

  return (
    <div className="nm-rcp__best-row">
      {items.map(({ label, id, metric }) => (
        <div key={label} className="nm-rcp__best-card">
          <div className="nm-rcp__best-label">{label}</div>
          {id ? (
            <>
              <code className="nm-rcp__best-id">{shortId(id)}</code>
              <div className="nm-rcp__best-metric">{pct(metric ?? null)}</div>
            </>
          ) : (
            <div className="nm-rcp__best-none">—</div>
          )}
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   Per-regime metrics table
   ========================================================= */

function RegimeTable({ regimes }: { regimes: PolicyRegimeMetrics[] }) {
  return (
    <div className="nm-rcp__block">
      <div className="nm-rcp__section-label">METRICS BY POLICY VERSION</div>
      <div className="nm-rcp__table-wrap">
        <table className="nm-rcp__table">
          <thead>
            <tr className="nm-rcp__thead-row">
              <th className="nm-rcp__th nm-rcp__th--id">Version</th>
              <th className="nm-rcp__th">Predictions</th>
              <th className="nm-rcp__th">Resolved</th>
              <th className="nm-rcp__th">Exact</th>
              <th className="nm-rcp__th">Direction</th>
              <th className="nm-rcp__th">Aggressive</th>
              <th className="nm-rcp__th">Weak</th>
              <th className="nm-rcp__th">Conf.</th>
              <th className="nm-rcp__th">Esc.</th>
              <th className="nm-rcp__th">Unc.</th>
            </tr>
          </thead>
          <tbody>
            {regimes.map((r) => (
              <tr key={r.policyVersionId} className="nm-rcp__row">
                <td className="nm-rcp__td nm-rcp__td--id">
                  <code>{shortId(r.policyVersionId)}</code>
                </td>
                <td className="nm-rcp__td nm-rcp__td--num">{r.totalPredictions}</td>
                <td className="nm-rcp__td nm-rcp__td--num">{r.resolvedPredictions}</td>
                <td className="nm-rcp__td nm-rcp__td--num">{pct(r.exactMatchRate)}</td>
                <td className="nm-rcp__td nm-rcp__td--num">{pct(r.directionMatchRate)}</td>
                <td
                  className={`nm-rcp__td nm-rcp__td--num ${
                    r.tooAggressiveRate !== null && r.tooAggressiveRate >= 0.4
                      ? "nm-rcp__td--warn"
                      : ""
                  }`}
                >
                  {pct(r.tooAggressiveRate)}
                </td>
                <td className="nm-rcp__td nm-rcp__td--num">{pct(r.tooWeakRate)}</td>
                <td className="nm-rcp__td nm-rcp__td--num">{score(r.averageConfidenceScore)}</td>
                <td className="nm-rcp__td nm-rcp__td--num nm-rcp__mono">{bias(r.averageEscalationBias)}</td>
                <td className="nm-rcp__td nm-rcp__td--num nm-rcp__mono">{bias(r.averageUncertaintyBias)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Domain breakdown */}
      {regimes.some(
        (r) =>
          r.nutritionPredictionCount > 0 ||
          r.trainingPredictionCount > 0 ||
          r.schedulePredictionCount > 0
      ) && (
        <div className="nm-rcp__domain-row">
          {regimes.map((r) => (
            <div key={r.policyVersionId} className="nm-rcp__domain-card">
              <div className="nm-rcp__domain-id">{shortId(r.policyVersionId)}</div>
              <div className="nm-rcp__domain-counts">
                <span className="nm-rcp__domain-tag nm-rcp__domain-tag--nutrition">
                  N:{r.nutritionPredictionCount}
                </span>
                <span className="nm-rcp__domain-tag nm-rcp__domain-tag--training">
                  T:{r.trainingPredictionCount}
                </span>
                <span className="nm-rcp__domain-tag nm-rcp__domain-tag--schedule">
                  S:{r.schedulePredictionCount}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Pairwise comparison cards
   ========================================================= */

function PairwiseCard({ comp }: { comp: PolicyRegimeComparison }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="nm-rcp__pair-card">
      <div className="nm-rcp__pair-header">
        <div className="nm-rcp__pair-ids">
          <code className="nm-rcp__pair-id">{shortId(comp.beforePolicyVersionId)}</code>
          <span className="nm-rcp__pair-arrow">→</span>
          <code className="nm-rcp__pair-id">{shortId(comp.afterPolicyVersionId)}</code>
        </div>
        <div className="nm-rcp__pair-deltas">
          <span className={`nm-rcp__delta ${deltaClass(comp.exactMatchDelta, true)}`}>
            exact {deltaLabel(comp.exactMatchDelta)}
          </span>
          <span className={`nm-rcp__delta ${deltaClass(comp.directionMatchDelta, true)}`}>
            dir {deltaLabel(comp.directionMatchDelta)}
          </span>
          <span className={`nm-rcp__delta ${deltaClass(comp.tooAggressiveDelta, false)}`}>
            agg {deltaLabel(comp.tooAggressiveDelta)}
          </span>
        </div>
        <button
          className="nm-rcp__pair-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "▾" : "▸"}
        </button>
      </div>
      {expanded && (
        <ul className="nm-rcp__pair-lines">
          {comp.summaryLines.map((line, i) => (
            <li key={i} className="nm-rcp__pair-line">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* =========================================================
   Summary lines
   ========================================================= */

function SummaryBlock({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="nm-rcp__block">
      <div className="nm-rcp__section-label">OVERALL ASSESSMENT</div>
      <ul className="nm-rcp__summary">
        {lines.map((line, i) => (
          <li key={i} className="nm-rcp__summary-line">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* =========================================================
   PolicyRegimeComparisonPanel — main export
   ========================================================= */

export interface PolicyRegimeComparisonPanelProps {
  frozenRecords: FrozenPredictionRecord[];
}

export function PolicyRegimeComparisonPanel({
  frozenRecords,
}: PolicyRegimeComparisonPanelProps) {
  if (frozenRecords.length === 0) {
    return (
      <div className="nm-rcp">
        <div className="nm-rcp__header">
          <div className="nm-rcp__title">POLICY REGIME COMPARISON</div>
        </div>
        <div className="nm-rcp__empty">
          No frozen predictions. Run evaluations to enable regime comparison.
        </div>
      </div>
    );
  }

  const report: PolicyRegimeComparisonReport = buildPolicyRegimeComparisonReport(frozenRecords);
  const multipleRegimes = report.regimes.length > 1;

  return (
    <div className="nm-rcp">
      <div className="nm-rcp__header">
        <div className="nm-rcp__title">POLICY REGIME COMPARISON</div>
        <div className="nm-rcp__meta">
          {report.regimes.length} regime{report.regimes.length !== 1 ? "s" : ""} · {frozenRecords.length} prediction{frozenRecords.length !== 1 ? "s" : ""} · comparison only
        </div>
      </div>

      {/* Best-in-class (only when multiple regimes) */}
      {multipleRegimes && <BestBanner report={report} />}

      {/* Metrics table */}
      <RegimeTable regimes={report.regimes} />

      {/* Pairwise comparisons */}
      {report.pairwiseComparisons.length > 0 && (
        <div className="nm-rcp__block">
          <div className="nm-rcp__section-label">
            PAIRWISE REGIME COMPARISONS ({report.pairwiseComparisons.length})
          </div>
          <div className="nm-rcp__pairs">
            {report.pairwiseComparisons.map((comp) => (
              <PairwiseCard
                key={`${comp.beforePolicyVersionId}-${comp.afterPolicyVersionId}`}
                comp={comp}
              />
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <SummaryBlock lines={report.summaryLines} />

      {/* Notice */}
      <div className="nm-rcp__notice">
        Policy regime comparison is read-only. No regime is promoted or rolled
        back by this view.
      </div>
    </div>
  );
}
