/**
 * PolicyRecommendationPanel.tsx
 *
 * Advisory policy recommendation panel for NOMOS.
 *
 * Displays policy recommendations derived from counterfactual bench evidence.
 * This panel is advisory only — it must not trigger governance actions.
 *
 * Shows:
 *   1. Domain context
 *   2. Primary recommendation: recommended policy + strength + confidence
 *   3. Basis metrics (the evidence behind the recommendation)
 *   4. Rationale lines (why this policy)
 *   5. Tradeoff lines (vs runner-ups)
 *   6. Runner-up policies (collapsed, expandable)
 *   7. Summary lines
 *
 * Visually separated from governance panels to signal read-only, advisory status.
 * No LLM generation is used.
 */

import React, { useState } from "react";
import type { PolicyBenchReport } from "../../../audit/policy_bench_types";
import type {
  PolicyRecommendation,
  PolicyRecommendationReport,
} from "../../../audit/policy_recommendation_types";
import {
  buildPolicyRecommendationReport,
} from "../../../audit/policy_recommendation";

/* =========================================================
   Helpers
   ========================================================= */

function shortId(id: string): string {
  return id.length > 4 ? id.slice(4) : id;
}

function pct(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(0)}%`;
}

const STRENGTH_CLASS: Record<string, string> = {
  weak: "nm-rec__strength--weak",
  moderate: "nm-rec__strength--moderate",
  strong: "nm-rec__strength--strong",
};

const CONFIDENCE_CLASS: Record<string, string> = {
  low: "nm-rec__conf--low",
  moderate: "nm-rec__conf--moderate",
  high: "nm-rec__conf--high",
};

/* =========================================================
   Basis metrics row
   ========================================================= */

function BasisRow({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div className="nm-rec__basis-row">
      <span className="nm-rec__basis-label">{label}</span>
      <span className={`nm-rec__basis-value ${positive ? "nm-rec__basis-value--pos" : "nm-rec__basis-value--neg"}`}>
        {value}
      </span>
    </div>
  );
}

/* =========================================================
   Single recommendation card
   ========================================================= */

function RecommendationCard({
  rec,
  isPrimary,
}: {
  rec: PolicyRecommendation;
  isPrimary: boolean;
}) {
  const [showTradeoffs, setShowTradeoffs] = useState(false);

  const id = rec.recommendedPolicyVersionId
    ? shortId(rec.recommendedPolicyVersionId)
    : null;

  return (
    <div className={`nm-rec__card ${isPrimary ? "nm-rec__card--primary" : "nm-rec__card--runner"}`}>
      {/* Card header */}
      <div className="nm-rec__card-header">
        {isPrimary && <div className="nm-rec__primary-tag">RECOMMENDED</div>}
        {!isPrimary && <div className="nm-rec__runner-tag">RUNNER-UP</div>}

        <div className="nm-rec__card-id-row">
          {id ? (
            <code className="nm-rec__card-id">{id}</code>
          ) : (
            <span className="nm-rec__card-none">no recommendation</span>
          )}
        </div>

        <div className="nm-rec__badges">
          <span className={`nm-rec__badge nm-rec__strength ${STRENGTH_CLASS[rec.recommendationStrength]}`}>
            {rec.recommendationStrength}
          </span>
          <span className={`nm-rec__badge nm-rec__conf ${CONFIDENCE_CLASS[rec.confidence]}`}>
            {rec.confidence} confidence
          </span>
        </div>
      </div>

      {/* Basis metrics */}
      {isPrimary && (
        <div className="nm-rec__basis">
          <div className="nm-rec__sub-label">EVIDENCE BASIS</div>
          <BasisRow label="exact match"     value={pct(rec.basis.exactMatchRate)}    positive={true} />
          <BasisRow label="direction match" value={pct(rec.basis.directionMatchRate)} positive={true} />
          <BasisRow label="too aggressive"  value={pct(rec.basis.tooAggressiveRate)}  positive={false} />
          <BasisRow label="too weak"        value={pct(rec.basis.tooWeakRate)}        positive={false} />
          <BasisRow label="unresolved"      value={pct(rec.basis.unresolvedRate)}     positive={false} />
        </div>
      )}

      {/* Rationale lines */}
      <div className="nm-rec__section">
        <div className="nm-rec__sub-label">RATIONALE</div>
        <ul className="nm-rec__lines">
          {rec.rationaleLines.map((line, i) => (
            <li key={i} className="nm-rec__line">{line}</li>
          ))}
        </ul>
      </div>

      {/* Tradeoff lines */}
      {rec.tradeoffLines.length > 0 && (
        <div className="nm-rec__section">
          <button
            className="nm-rec__toggle"
            onClick={() => setShowTradeoffs((v) => !v)}
            aria-expanded={showTradeoffs}
          >
            {showTradeoffs ? "▾ tradeoffs" : "▸ tradeoffs"}
          </button>
          {showTradeoffs && (
            <ul className="nm-rec__lines nm-rec__lines--trade">
              {rec.tradeoffLines.map((line, i) => (
                <li key={i} className="nm-rec__line nm-rec__line--trade">{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   PolicyRecommendationPanel — main export
   ========================================================= */

export type RecommendationDomain = "nutrition" | "training" | "schedule" | "generic";
const DOMAINS: RecommendationDomain[] = ["nutrition", "training", "schedule", "generic"];

export interface PolicyRecommendationPanelProps {
  /** Bench report produced by buildPolicyBenchReport. */
  benchReport: PolicyBenchReport | null;
}

export function PolicyRecommendationPanel({
  benchReport,
}: PolicyRecommendationPanelProps) {
  const [domain, setDomain] = useState<RecommendationDomain>("nutrition");
  const [report, setReport] = useState<PolicyRecommendationReport | null>(null);
  const [showRunners, setShowRunners] = useState(false);

  function handleGenerate() {
    if (!benchReport) return;
    const r = buildPolicyRecommendationReport(domain, benchReport);
    setReport(r);
    setShowRunners(false);
  }

  const primary = report?.recommendations[0] ?? null;
  const runners = report?.recommendations.slice(1) ?? [];

  return (
    <div className="nm-rec">
      <div className="nm-rec__header">
        <div className="nm-rec__title">POLICY RECOMMENDATION</div>
        <div className="nm-rec__meta">
          advisory only · no auto-promotion · based on bench evidence
        </div>
      </div>

      {/* Advisory notice */}
      <div className="nm-rec__advisory">
        This panel is advisory only. Recommendations do not change active
        policy assignments. All promotions require manual governance action.
      </div>

      {/* Domain selector */}
      <div className="nm-rec__block">
        <div className="nm-rec__section-label">DOMAIN</div>
        <div className="nm-rec__domain-row">
          {DOMAINS.map((d) => (
            <button
              key={d}
              className={`nm-rec__domain-btn ${domain === d ? "nm-rec__domain-btn--selected" : ""}`}
              onClick={() => { setDomain(d); setReport(null); }}
              type="button"
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Source bench info */}
      <div className="nm-rec__block">
        <div className="nm-rec__section-label">BENCH SOURCE</div>
        {benchReport ? (
          <div className="nm-rec__bench-info">
            {benchReport.metricsByPolicy.length} polic{benchReport.metricsByPolicy.length !== 1 ? "ies" : "y"} evaluated
            {benchReport.request.domain ? ` · domain: ${benchReport.request.domain}` : ""}
            {benchReport.request.auditRecordIds.length > 0
              ? ` · ${benchReport.request.auditRecordIds.length} run${benchReport.request.auditRecordIds.length !== 1 ? "s" : ""}`
              : ""}
          </div>
        ) : (
          <div className="nm-rec__empty">No bench report available. Run a bench first.</div>
        )}
      </div>

      {/* Generate button */}
      <button
        className="nm-rec__generate-btn"
        onClick={handleGenerate}
        disabled={!benchReport}
        type="button"
      >
        Generate recommendation for {domain}
      </button>

      {/* Report output */}
      {report && (
        <>
          {/* Primary recommendation */}
          {primary && (
            <div className="nm-rec__block">
              <RecommendationCard rec={primary} isPrimary={true} />
            </div>
          )}

          {/* Runner-ups */}
          {runners.length > 0 && (
            <div className="nm-rec__block">
              <button
                className="nm-rec__toggle nm-rec__runners-toggle"
                onClick={() => setShowRunners((v) => !v)}
                aria-expanded={showRunners}
              >
                {showRunners
                  ? `▾ hide ${runners.length} runner-up${runners.length !== 1 ? "s" : ""}`
                  : `▸ show ${runners.length} runner-up${runners.length !== 1 ? "s" : ""}`}
              </button>
              {showRunners && (
                <div className="nm-rec__runners">
                  {runners.map((rec) => (
                    <RecommendationCard
                      key={rec.recommendedPolicyVersionId}
                      rec={rec}
                      isPrimary={false}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Summary */}
          <div className="nm-rec__block">
            <div className="nm-rec__section-label">SUMMARY</div>
            <ul className="nm-rec__lines">
              {report.summaryLines.map((line, i) => (
                <li key={i} className="nm-rec__line">{line}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="nm-rec__footer">
        NOMOS may recommend, but does not authorize itself.
        Final promotion decisions remain with manual governance.
      </div>
    </div>
  );
}
