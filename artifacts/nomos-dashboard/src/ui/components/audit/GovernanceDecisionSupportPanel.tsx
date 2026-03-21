/**
 * GovernanceDecisionSupportPanel.tsx
 *
 * Governance decision support panel for NOMOS.
 *
 * Displays a structured comparison of the current active policy vs the
 * bench-recommended policy to help a human decide whether to promote
 * or roll back before taking any governance action.
 *
 * This panel is advisory only.
 * It does not trigger promotions or rollbacks.
 * Governance action buttons are explicitly excluded.
 *
 * Shows:
 *   1. Policy comparison header (current vs recommended)
 *   2. Expected gains
 *   3. Expected tradeoffs
 *   4. Expected risks
 *   5. Suggestion flags (promote / rollback)
 *   6. Strength + confidence badges
 *   7. Summary lines
 *
 * No LLM generation is used.
 */

import React, { useState } from "react";
import type { PolicyBenchReport } from "../../../audit/policy_bench_types";
import type { PolicyRecommendationReport } from "../../../audit/policy_recommendation_types";
import type { GovernanceDecisionSupport } from "../../../audit/governance_decision_support_types";
import { buildGovernanceDecisionSupport } from "../../../audit/governance_decision_support";

/* =========================================================
   Helpers
   ========================================================= */

function shortId(id: string | null | undefined): string {
  if (!id) return "none";
  return id.length > 4 ? id.slice(4) : id;
}

const STRENGTH_CLASS: Record<string, string> = {
  weak: "nm-gds__badge--weak",
  moderate: "nm-gds__badge--moderate",
  strong: "nm-gds__badge--strong",
};

const CONFIDENCE_CLASS: Record<string, string> = {
  low: "nm-gds__badge--conf-low",
  moderate: "nm-gds__badge--conf-moderate",
  high: "nm-gds__badge--conf-high",
};

/* =========================================================
   Line list component
   ========================================================= */

function LineList({
  label,
  lines,
  variant,
}: {
  label: string;
  lines: string[];
  variant: "gains" | "tradeoffs" | "risks";
}) {
  if (lines.length === 0) {
    return (
      <div className={`nm-gds__section nm-gds__section--${variant}`}>
        <div className="nm-gds__section-label">{label}</div>
        <div className="nm-gds__empty-section">None identified from bench evidence.</div>
      </div>
    );
  }

  return (
    <div className={`nm-gds__section nm-gds__section--${variant}`}>
      <div className="nm-gds__section-label">{label}</div>
      <ul className="nm-gds__lines">
        {lines.map((line, i) => (
          <li key={i} className={`nm-gds__line nm-gds__line--${variant}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/* =========================================================
   Suggestion flag
   ========================================================= */

function SuggestionFlag({
  label,
  suggested,
  reason,
}: {
  label: string;
  suggested: boolean;
  reason: string;
}) {
  return (
    <div className={`nm-gds__flag ${suggested ? "nm-gds__flag--on" : "nm-gds__flag--off"}`}>
      <div className="nm-gds__flag-indicator">
        {suggested ? "✓" : "—"}
      </div>
      <div className="nm-gds__flag-body">
        <div className="nm-gds__flag-label">{label}</div>
        <div className="nm-gds__flag-reason">{suggested ? reason : "Not suggested by current evidence."}</div>
      </div>
    </div>
  );
}

/* =========================================================
   GovernanceDecisionSupportPanel — main export
   ========================================================= */

export interface GovernanceDecisionSupportPanelProps {
  /** ID of the currently active policy for this domain. Null = no active assignment. */
  currentActivePolicyVersionId: string | null;
  /** Bench report produced by runCounterfactualBench + buildPolicyBenchReport. */
  benchReport: PolicyBenchReport | null;
  /** Recommendation report produced by buildPolicyRecommendationReport. */
  recommendationReport: PolicyRecommendationReport | null;
}

export function GovernanceDecisionSupportPanel({
  currentActivePolicyVersionId,
  benchReport,
  recommendationReport,
}: GovernanceDecisionSupportPanelProps) {
  const [support, setSupport] = useState<GovernanceDecisionSupport | null>(null);

  const primary = recommendationReport?.recommendations[0] ?? null;
  const recommendedId = primary?.recommendedPolicyVersionId ?? null;

  function handleAnalyse() {
    if (!benchReport || !recommendationReport) return;
    const result = buildGovernanceDecisionSupport(
      currentActivePolicyVersionId,
      recommendedId,
      benchReport,
      recommendationReport
    );
    setSupport(result);
  }

  const canAnalyse = !!benchReport && !!recommendationReport;

  return (
    <div className="nm-gds">
      <div className="nm-gds__header">
        <div className="nm-gds__title">GOVERNANCE DECISION SUPPORT</div>
        <div className="nm-gds__meta">
          advisory only · no promotion or rollback executed here
        </div>
      </div>

      {/* Advisory notice */}
      <div className="nm-gds__advisory">
        This panel is read-only decision support. It does not execute governance
        actions. Promotion and rollback remain exclusive manual governance decisions.
      </div>

      {/* Inputs summary */}
      <div className="nm-gds__block">
        <div className="nm-gds__section-label">INPUTS</div>
        <div className="nm-gds__input-grid">
          <div className="nm-gds__input-item">
            <div className="nm-gds__input-label">current active policy</div>
            <code className="nm-gds__policy-id nm-gds__policy-id--current">
              {shortId(currentActivePolicyVersionId)}
            </code>
          </div>
          <div className="nm-gds__input-arrow">→</div>
          <div className="nm-gds__input-item">
            <div className="nm-gds__input-label">recommended policy</div>
            <code className="nm-gds__policy-id nm-gds__policy-id--recommended">
              {shortId(recommendedId)}
            </code>
          </div>
        </div>
      </div>

      {/* Source info */}
      <div className="nm-gds__block">
        <div className="nm-gds__section-label">SOURCES</div>
        <div className="nm-gds__source-grid">
          <div className="nm-gds__source-item">
            <span className="nm-gds__source-label">bench</span>
            {benchReport ? (
              <span className="nm-gds__source-value">
                {benchReport.metricsByPolicy.length} polic{benchReport.metricsByPolicy.length !== 1 ? "ies" : "y"} · {benchReport.request.auditRecordIds.length} runs
              </span>
            ) : (
              <span className="nm-gds__source-missing">not available</span>
            )}
          </div>
          <div className="nm-gds__source-item">
            <span className="nm-gds__source-label">recommendation</span>
            {recommendationReport ? (
              <span className="nm-gds__source-value">
                {recommendationReport.domain} · {recommendationReport.recommendations.length} candidate{recommendationReport.recommendations.length !== 1 ? "s" : ""}
              </span>
            ) : (
              <span className="nm-gds__source-missing">not available</span>
            )}
          </div>
        </div>
      </div>

      {/* Analyse button */}
      <button
        className="nm-gds__analyse-btn"
        onClick={handleAnalyse}
        disabled={!canAnalyse}
        type="button"
      >
        Analyse governance decision
      </button>

      {/* Support output */}
      {support && (
        <>
          {/* Strength + confidence badges */}
          <div className="nm-gds__badges">
            <span className={`nm-gds__badge ${STRENGTH_CLASS[support.recommendationStrength]}`}>
              {support.recommendationStrength} recommendation
            </span>
            <span className={`nm-gds__badge ${CONFIDENCE_CLASS[support.confidence]}`}>
              {support.confidence} confidence
            </span>
          </div>

          {/* Expected gains */}
          <LineList
            label="EXPECTED GAINS"
            lines={support.expectedGains}
            variant="gains"
          />

          {/* Expected tradeoffs */}
          <LineList
            label="EXPECTED TRADEOFFS"
            lines={support.expectedTradeoffs}
            variant="tradeoffs"
          />

          {/* Expected risks */}
          <LineList
            label="EXPECTED RISKS"
            lines={support.expectedRisks}
            variant="risks"
          />

          {/* Suggestion flags */}
          <div className="nm-gds__block">
            <div className="nm-gds__section-label">SUGGESTION FLAGS</div>
            <div className="nm-gds__flags">
              <SuggestionFlag
                label="PROMOTE SUGGESTED"
                suggested={support.promoteSuggested}
                reason={`Promoting ${shortId(support.recommendedPolicyVersionId)} over ${shortId(support.currentActivePolicyVersionId)} is supported by the bench evidence.`}
              />
              <SuggestionFlag
                label="ROLLBACK SUGGESTED"
                suggested={support.rollbackSuggested}
                reason={`Current policy ${shortId(support.currentActivePolicyVersionId)} shows poor performance — consider reverting even without a strong replacement candidate.`}
              />
            </div>
            <div className="nm-gds__flags-notice">
              Suggestion flags are advisory. They do not trigger any governance action.
            </div>
          </div>

          {/* Summary */}
          <div className="nm-gds__block">
            <div className="nm-gds__section-label">SUMMARY</div>
            <ul className="nm-gds__lines">
              {support.summaryLines.map((line, i) => (
                <li key={i} className="nm-gds__line nm-gds__line--summary">{line}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="nm-gds__footer">
        All promotion and rollback decisions remain exclusive manual governance
        actions taken via the governance panel.
      </div>
    </div>
  );
}
