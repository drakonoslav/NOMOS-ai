/**
 * PolicyBenchPanel.tsx
 *
 * Counterfactual policy bench panel for NOMOS.
 *
 * Replays a set of saved audit runs across multiple frozen policy versions
 * and displays aggregate prediction accuracy and calibration metrics.
 *
 * Shows:
 *   1. Run selection (checkbox list by title + date)
 *   2. Policy selection (toggle buttons)
 *   3. Domain filter (optional)
 *   4. Metrics table (one row per policy)
 *   5. Best performer by key metric
 *   6. Summary lines
 *
 * Bench is analysis only. No policy is auto-promoted by this panel.
 * No LLM generation is used.
 */

import React, { useState } from "react";
import type { AuditRecord } from "../../../audit/audit_types";
import type { FrozenPolicySnapshot } from "../../../audit/policy_versioning_types";
import type {
  PolicyBenchRequest,
  PolicyBenchMetrics,
  PolicyBenchReport,
} from "../../../audit/policy_bench_types";
import {
  runCounterfactualBench,
  buildPolicyBenchReport,
} from "../../../audit/counterfactual_policy_bench";

/* =========================================================
   Formatting helpers
   ========================================================= */

function shortId(id: string): string {
  return id.length > 4 ? id.slice(4) : id;
}

function pct(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(0)}%`;
}

type Domain = "nutrition" | "training" | "schedule" | "generic";
const DOMAINS: Array<Domain | "all"> = ["all", "nutrition", "training", "schedule", "generic"];

/* =========================================================
   Metrics table row
   ========================================================= */

function MetricsRow({
  metrics,
  bestByExactMatch,
  bestByDirectionMatch,
  lowestAggressiveRate,
  lowestUnresolvedRate,
}: {
  metrics: PolicyBenchMetrics;
  bestByExactMatch: string | null;
  bestByDirectionMatch: string | null;
  lowestAggressiveRate: string | null;
  lowestUnresolvedRate: string | null;
}) {
  const id = metrics.policyVersionId;
  const isBestExact = id === bestByExactMatch;
  const isBestDir = id === bestByDirectionMatch;
  const isLowestAgg = id === lowestAggressiveRate;
  const isLowestUnres = id === lowestUnresolvedRate;

  return (
    <tr className="nm-bench__row">
      <td className="nm-bench__cell nm-bench__cell--id">
        <code>{shortId(id)}</code>
      </td>
      <td className="nm-bench__cell nm-bench__cell--num">{metrics.totalRuns}</td>
      <td className="nm-bench__cell nm-bench__cell--num">{metrics.resolvedRuns}</td>
      <td className={`nm-bench__cell nm-bench__cell--rate ${isBestExact ? "nm-bench__cell--best" : ""}`}>
        {pct(metrics.exactMatchRate)}{isBestExact && <span className="nm-bench__best-star">★</span>}
      </td>
      <td className={`nm-bench__cell nm-bench__cell--rate ${isBestDir ? "nm-bench__cell--best" : ""}`}>
        {pct(metrics.directionMatchRate)}{isBestDir && <span className="nm-bench__best-star">★</span>}
      </td>
      <td className={`nm-bench__cell nm-bench__cell--rate nm-bench__cell--agg ${isLowestAgg ? "nm-bench__cell--best-low" : ""}`}>
        {pct(metrics.tooAggressiveRate)}{isLowestAgg && <span className="nm-bench__best-star">★</span>}
      </td>
      <td className="nm-bench__cell nm-bench__cell--rate nm-bench__cell--weak">
        {pct(metrics.tooWeakRate)}
      </td>
      <td className={`nm-bench__cell nm-bench__cell--rate ${isLowestUnres ? "nm-bench__cell--best-low" : ""}`}>
        {pct(metrics.unresolvedRate)}{isLowestUnres && <span className="nm-bench__best-star">★</span>}
      </td>
      <td className="nm-bench__cell nm-bench__cell--conf">
        <span className="nm-bench__conf-bar">
          <span className="nm-bench__conf-low">{pct(metrics.lowConfidenceRate)}</span>
          <span className="nm-bench__conf-mod">{pct(metrics.moderateConfidenceRate)}</span>
          <span className="nm-bench__conf-high">{pct(metrics.highConfidenceRate)}</span>
        </span>
      </td>
    </tr>
  );
}

/* =========================================================
   PolicyBenchPanel — main export
   ========================================================= */

export interface PolicyBenchPanelProps {
  auditRecords: AuditRecord[];
  frozenPolicies: FrozenPolicySnapshot[];
}

export function PolicyBenchPanel({
  auditRecords,
  frozenPolicies,
}: PolicyBenchPanelProps) {
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<string[]>([]);
  const [domain, setDomain] = useState<Domain | "all">("all");
  const [report, setReport] = useState<PolicyBenchReport | null>(null);

  function toggleRecord(id: string) {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setReport(null);
  }

  function toggleAllRecords() {
    if (selectedRecordIds.size === auditRecords.length) {
      setSelectedRecordIds(new Set());
    } else {
      setSelectedRecordIds(new Set(auditRecords.map((r) => r.id)));
    }
    setReport(null);
  }

  function togglePolicy(id: string) {
    setSelectedPolicyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setReport(null);
  }

  function handleRunBench() {
    if (selectedRecordIds.size === 0 || selectedPolicyIds.length === 0) return;

    const request: PolicyBenchRequest = {
      auditRecordIds: [...selectedRecordIds],
      policyVersionIds: selectedPolicyIds,
      domain: domain === "all" ? null : domain,
    };

    const runResults = runCounterfactualBench(request, auditRecords, frozenPolicies);
    const r = buildPolicyBenchReport(request, runResults);
    setReport(r);
  }

  const canRun = selectedRecordIds.size > 0 && selectedPolicyIds.length > 0;
  const allSelected = selectedRecordIds.size === auditRecords.length;

  return (
    <div className="nm-bench">
      <div className="nm-bench__header">
        <div className="nm-bench__title">POLICY BENCH</div>
        <div className="nm-bench__meta">
          batch replay · analysis only · no policy auto-promoted
        </div>
      </div>

      {/* Domain filter */}
      <div className="nm-bench__block">
        <div className="nm-bench__section-label">DOMAIN FILTER</div>
        <div className="nm-bench__domain-row">
          {DOMAINS.map((d) => (
            <button
              key={d}
              className={`nm-bench__domain-btn ${domain === d ? "nm-bench__domain-btn--selected" : ""}`}
              onClick={() => { setDomain(d); setReport(null); }}
              type="button"
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Run selector */}
      <div className="nm-bench__block">
        <div className="nm-bench__section-label">
          SELECT RUNS ({selectedRecordIds.size} / {auditRecords.length})
        </div>
        {auditRecords.length === 0 ? (
          <div className="nm-bench__empty">No audit records available.</div>
        ) : (
          <>
            <button
              className="nm-bench__select-all-btn"
              onClick={toggleAllRecords}
              type="button"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            <div className="nm-bench__record-list">
              {auditRecords.map((r) => {
                const checked = selectedRecordIds.has(r.id);
                return (
                  <label key={r.id} className={`nm-bench__record-item ${checked ? "nm-bench__record-item--checked" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRecord(r.id)}
                      className="nm-bench__record-cb"
                    />
                    <span className="nm-bench__record-title">{r.title}</span>
                    <span className="nm-bench__record-meta">
                      {r.intent} · {r.timestamp.slice(0, 10)}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Policy selector */}
      <div className="nm-bench__block">
        <div className="nm-bench__section-label">
          BENCH POLICIES ({selectedPolicyIds.length} selected)
        </div>
        {frozenPolicies.length === 0 ? (
          <div className="nm-bench__empty">No frozen policies available.</div>
        ) : (
          <div className="nm-bench__policy-row">
            {frozenPolicies.map((p) => {
              const selected = selectedPolicyIds.includes(p.policyVersionId);
              return (
                <button
                  key={p.policyVersionId}
                  className={`nm-bench__policy-btn ${selected ? "nm-bench__policy-btn--selected" : ""}`}
                  onClick={() => togglePolicy(p.policyVersionId)}
                  type="button"
                >
                  <code>{shortId(p.policyVersionId)}</code>
                  {selected && <span className="nm-bench__policy-check">✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Run bench button */}
      <button
        className="nm-bench__run-btn"
        onClick={handleRunBench}
        disabled={!canRun}
        type="button"
      >
        Run bench ({selectedRecordIds.size} run{selectedRecordIds.size !== 1 ? "s" : ""} × {selectedPolicyIds.length} polic{selectedPolicyIds.length !== 1 ? "ies" : "y"})
      </button>

      {/* Report */}
      {report && (
        <>
          {/* Metrics table */}
          <div className="nm-bench__block">
            <div className="nm-bench__section-label">METRICS BY POLICY</div>
            <div className="nm-bench__table-wrap">
              <table className="nm-bench__table">
                <thead>
                  <tr>
                    <th className="nm-bench__th">policy</th>
                    <th className="nm-bench__th nm-bench__th--num">runs</th>
                    <th className="nm-bench__th nm-bench__th--num">resolved</th>
                    <th className="nm-bench__th">exact match</th>
                    <th className="nm-bench__th">dir match</th>
                    <th className="nm-bench__th">too aggr</th>
                    <th className="nm-bench__th">too weak</th>
                    <th className="nm-bench__th">unresolved</th>
                    <th className="nm-bench__th">confidence (L/M/H)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.metricsByPolicy.map((m) => (
                    <MetricsRow
                      key={m.policyVersionId}
                      metrics={m}
                      bestByExactMatch={report.bestByExactMatch}
                      bestByDirectionMatch={report.bestByDirectionMatch}
                      lowestAggressiveRate={report.lowestAggressiveRate}
                      lowestUnresolvedRate={report.lowestUnresolvedRate}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Best-in-class summary */}
          <div className="nm-bench__block">
            <div className="nm-bench__section-label">BEST IN CLASS</div>
            <div className="nm-bench__bic-grid">
              {report.bestByExactMatch && (
                <div className="nm-bench__bic-item">
                  <div className="nm-bench__bic-label">exact match</div>
                  <code className="nm-bench__bic-id">{shortId(report.bestByExactMatch)}</code>
                </div>
              )}
              {report.bestByDirectionMatch && (
                <div className="nm-bench__bic-item">
                  <div className="nm-bench__bic-label">direction match</div>
                  <code className="nm-bench__bic-id">{shortId(report.bestByDirectionMatch)}</code>
                </div>
              )}
              {report.lowestAggressiveRate && (
                <div className="nm-bench__bic-item">
                  <div className="nm-bench__bic-label">lowest aggressive</div>
                  <code className="nm-bench__bic-id">{shortId(report.lowestAggressiveRate)}</code>
                </div>
              )}
              {report.lowestUnresolvedRate && (
                <div className="nm-bench__bic-item">
                  <div className="nm-bench__bic-label">lowest unresolved</div>
                  <code className="nm-bench__bic-id">{shortId(report.lowestUnresolvedRate)}</code>
                </div>
              )}
              {!report.bestByExactMatch && !report.bestByDirectionMatch && (
                <div className="nm-bench__empty">No resolved runs — best-in-class unavailable.</div>
              )}
            </div>
          </div>

          {/* Summary lines */}
          <div className="nm-bench__block">
            <div className="nm-bench__section-label">SUMMARY</div>
            <ul className="nm-bench__summary-lines">
              {report.summaryLines.map((line, i) => (
                <li key={i} className="nm-bench__summary-line">{line}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Notice */}
      <div className="nm-bench__notice">
        Bench is analysis only. No policy is auto-promoted by these results.
        Promote policies manually via the governance panel.
      </div>
    </div>
  );
}
