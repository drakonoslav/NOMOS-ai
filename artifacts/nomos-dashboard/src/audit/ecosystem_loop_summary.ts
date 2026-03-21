/**
 * ecosystem_loop_summary.ts
 *
 * Deterministic functions for building the NOMOS ecosystem loop summary.
 *
 * Functions:
 *   buildPredictionToDecisionPatterns   — prediction/risk contexts → decisions
 *   buildGovernanceChoiceOutcomePatterns — decision types → outcome classes
 *   buildDoctrineEmergencePatterns       — playbook heuristics with meaningful support
 *   buildEcosystemChangeSummary          — stabilizing / drifting / overcorrecting
 *   buildEcosystemLoopSummary            — full system-level reflective summary
 *
 * All logic is purely deterministic — same inputs produce the same outputs.
 * No LLM generation is used.
 *
 * This layer is reflective and read-only.
 * It does not generate policy actions, auto-promote, or self-modify anything.
 */

import type { GovernanceAuditRecord } from "./governance_audit_types";
import type { GovernanceOutcomeReview } from "./post_governance_review_types";
import type { GovernancePlaybook } from "./governance_playbook_types";
import type { DecisionOutcomeLink } from "./decision_outcome_link_types";
import type {
  PredictionToDecisionPattern,
  GovernanceChoiceOutcomePattern,
  DoctrineEmergencePattern,
  EcosystemChangeSummary,
  EcosystemLoopSummary,
} from "./ecosystem_loop_types";

/* =========================================================
   buildPredictionToDecisionPatterns
   ========================================================= */

/**
 * Extracts recurring patterns linking prediction/risk context to governance
 * decision type, using the decision outcome links as the source.
 *
 * Pattern classification per link (mutually exclusive, first match wins):
 *   "Risk-driven rollback"          — decision=rollback AND expectedRisks.length > 0
 *   "Risk-acknowledged promotion"   — decision=promote  AND expectedRisks.length > 0
 *   "Gains-first promotion"         — decision=promote  AND expectedRisks.length = 0
 *                                     AND expectedGains.length > 0
 *   "Tradeoff-driven hold"          — decision=hold     AND expectedTradeoffs.length > 0
 *   "Evidence-limited hold"         — decision=hold     AND expectedGains.length = 0
 *   "Tradeoff-accepted rollback"    — decision=rollback AND expectedTradeoffs.length > 0
 *
 * Only patterns with count >= 1 are returned. Results sorted by count descending.
 */
export function buildPredictionToDecisionPatterns(
  links: DecisionOutcomeLink[]
): PredictionToDecisionPattern[] {
  const counts = new Map<string, number>();

  function classify(link: DecisionOutcomeLink): string {
    const { decision, expectedRisks, expectedGains, expectedTradeoffs } = link;
    if (decision === "rollback" && expectedRisks.length > 0) {
      return "Risk-driven rollback";
    }
    if (decision === "rollback" && expectedTradeoffs.length > 0) {
      return "Tradeoff-accepted rollback";
    }
    if (decision === "rollback") {
      return "Evidence-driven rollback";
    }
    if (decision === "promote" && expectedRisks.length > 0) {
      return "Risk-acknowledged promotion";
    }
    if (decision === "promote" && expectedGains.length > 0) {
      return "Gains-first promotion";
    }
    if (decision === "promote") {
      return "Bench-driven promotion";
    }
    if (decision === "hold" && expectedTradeoffs.length > 0) {
      return "Tradeoff-driven hold";
    }
    return "Evidence-limited hold";
  }

  for (const link of links) {
    const key = classify(link);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const SUMMARIES: Record<string, string> = {
    "Risk-driven rollback":
      "Rollback decisions occurred most often when acknowledged risks were elevated at decision time.",
    "Tradeoff-accepted rollback":
      "Rollback decisions occurred alongside acknowledged tradeoffs suggesting the previous promotion underdelivered.",
    "Evidence-driven rollback":
      "Rollback decisions were made without a specific risk flag — likely driven by declining bench metrics.",
    "Risk-acknowledged promotion":
      "Promotions proceeded despite acknowledged risks — human judgment accepted the risk profile.",
    "Gains-first promotion":
      "Promotions were made when expected gains were present and risks were not flagged.",
    "Bench-driven promotion":
      "Promotions were driven by bench evidence without declared gains or risks — metric improvement was the primary signal.",
    "Tradeoff-driven hold":
      "Hold decisions occurred when tradeoffs were acknowledged but the gain case was not sufficiently strong.",
    "Evidence-limited hold":
      "Hold decisions were made under limited evidence — no clear gains were declared to justify action.",
  };

  return Array.from(counts.entries())
    .filter(([, c]) => c >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      count,
      summary: SUMMARIES[label] ?? `${label} occurred ${count} time(s).`,
    }));
}

/* =========================================================
   buildGovernanceChoiceOutcomePatterns
   ========================================================= */

/**
 * Extracts recurring patterns linking governance choice type to observed
 * outcome class, using the decision outcome links as the source.
 *
 * Only links with a non-null actualOutcomeClass are used.
 * Results sorted by count descending.
 */
export function buildGovernanceChoiceOutcomePatterns(
  links: DecisionOutcomeLink[]
): GovernanceChoiceOutcomePattern[] {
  const counts = new Map<string, number>();

  for (const link of links) {
    if (!link.actualOutcomeClass) continue;
    const key = `${link.decision}→${link.actualOutcomeClass}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  function labelFor(key: string): string {
    const [decision, outcome] = key.split("→");
    const decLabel =
      decision === "promote"
        ? "Promotion"
        : decision === "rollback"
        ? "Rollback"
        : "Hold";
    const outLabel = outcome.replace(/_/g, " ");
    return `${decLabel} → ${outLabel}`;
  }

  function summaryFor(key: string, count: number): string {
    const [decision, outcome] = key.split("→");
    const decDesc =
      decision === "promote"
        ? "Promotion decisions"
        : decision === "rollback"
        ? "Rollback decisions"
        : "Hold decisions";
    const outDesc =
      outcome === "met_expectations"
        ? "met expectations"
        : outcome === "partially_met"
        ? "partially met expectations"
        : outcome === "did_not_meet"
        ? "did not meet expectations"
        : "had insufficient follow-up to classify";
    return `${decDesc} most often ${outDesc} (${count} instance(s)).`;
  }

  return Array.from(counts.entries())
    .filter(([, c]) => c >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({
      label:   labelFor(key),
      count,
      summary: summaryFor(key, count),
    }));
}

/* =========================================================
   buildDoctrineEmergencePatterns
   ========================================================= */

/**
 * Extracts doctrine emergence patterns from the governance playbook.
 *
 * Only heuristics with confidence "moderate" or "high" are included.
 * Results sorted by supportCount descending, then confidence (high first).
 */
export function buildDoctrineEmergencePatterns(
  playbook: GovernancePlaybook
): DoctrineEmergencePattern[] {
  const CONF_ORDER = { high: 0, moderate: 1, low: 2 };

  return playbook.heuristics
    .filter((h) => h.confidence === "moderate" || h.confidence === "high")
    .sort(
      (a, b) =>
        b.supportCount - a.supportCount ||
        CONF_ORDER[a.confidence] - CONF_ORDER[b.confidence]
    )
    .map((h) => ({
      heuristicId:  h.id,
      title:        h.title,
      supportCount: h.supportCount,
      confidence:   h.confidence,
      summary:
        `A doctrine "${h.title}" has emerged with ${h.supportCount} supporting instance(s) ` +
        `and ${h.confidence} confidence.`,
    }));
}

/* =========================================================
   buildEcosystemChangeSummary
   ========================================================= */

/**
 * Characterises the current governance trajectory as stabilizing, drifting,
 * or overcorrecting based on outcome review data and audit record counts.
 *
 * Rules (applied to reviewable outcomes — excludes insufficient_followup):
 *
 *   stabilizing:
 *     — At least one reviewable outcome exists AND
 *       met_expectations count > did_not_meet count.
 *
 *   drifting:
 *     — At least one reviewable outcome exists AND
 *       did_not_meet count >= met_expectations count AND
 *       did_not_meet count > 0.
 *
 *   overcorrecting:
 *     — At least 3 governance audit records exist AND
 *       met_expectations count = 0 AND
 *       reviewable count >= 1.
 *
 * Flags are not mutually exclusive — a system can be drifting and
 * overcorrecting simultaneously. All three may be false when data is
 * insufficient to characterise the trajectory.
 */
export function buildEcosystemChangeSummary(
  outcomeReviews: GovernanceOutcomeReview[],
  auditRecords: GovernanceAuditRecord[]
): EcosystemChangeSummary {
  const reviewable = outcomeReviews.filter(
    (r) => r.outcomeClass !== "insufficient_followup"
  );
  const met    = reviewable.filter((r) => r.outcomeClass === "met_expectations").length;
  const didNot = reviewable.filter((r) => r.outcomeClass === "did_not_meet").length;

  const stabilizing    = reviewable.length >= 1 && met > didNot;
  const drifting       = reviewable.length >= 1 && didNot >= met && didNot > 0;
  const overcorrecting =
    auditRecords.length >= 3 && met === 0 && reviewable.length >= 1;

  const summaryLines = buildChangeSummaryLines(
    stabilizing,
    drifting,
    overcorrecting,
    reviewable.length,
    met,
    didNot,
    auditRecords.length
  );

  return { stabilizing, drifting, overcorrecting, summaryLines };
}

function buildChangeSummaryLines(
  stabilizing: boolean,
  drifting: boolean,
  overcorrecting: boolean,
  reviewable: number,
  met: number,
  didNot: number,
  totalActions: number
): string[] {
  const lines: string[] = [];

  if (reviewable === 0) {
    lines.push(
      "Insufficient outcome review data to characterise the ecosystem trajectory."
    );
    if (totalActions > 0) {
      lines.push(
        `${totalActions} governance action(s) have been taken but none have completed outcome reviews yet.`
      );
    }
    return lines;
  }

  if (stabilizing) {
    lines.push(
      `Recent governance patterns suggest stabilization — ${met} of ${reviewable} reviewed action(s) met expectations.`
    );
  }
  if (drifting) {
    lines.push(
      `Recent governance outcomes suggest drift — ${didNot} of ${reviewable} reviewed action(s) did not meet expectations.`
    );
  }
  if (overcorrecting) {
    lines.push(
      "Recent policy churn suggests possible overcorrection — multiple governance actions have been taken without a met-expectations outcome."
    );
  }
  if (!stabilizing && !drifting && !overcorrecting) {
    lines.push(
      "Current governance patterns are mixed — no clear stabilization, drift, or overcorrection signal yet."
    );
  }

  return lines;
}

/* =========================================================
   buildEcosystemLoopSummary
   ========================================================= */

/**
 * Builds the full EcosystemLoopSummary from all available system data.
 *
 * Parameters:
 *   auditRecords      — governance audit records (promote/rollback actions).
 *   outcomeReviews    — completed outcome reviews for governance actions.
 *   playbook          — extracted governance playbook with heuristics.
 *   links             — decision → outcome links (one per human decision).
 *   totalAuditRuns    — optional: total eval/prediction runs processed.
 *                       Defaults to auditRecords.length when not provided.
 *   totalPredictions  — optional: total prediction events.
 *                       Defaults to links.length when not provided.
 *
 * No inputs are mutated.
 */
export function buildEcosystemLoopSummary(
  auditRecords: GovernanceAuditRecord[],
  outcomeReviews: GovernanceOutcomeReview[],
  playbook: GovernancePlaybook,
  links: DecisionOutcomeLink[],
  totalAuditRuns?: number,
  totalPredictions?: number
): EcosystemLoopSummary {
  const predictionToDecisionPatterns  = buildPredictionToDecisionPatterns(links);
  const governanceChoiceOutcomePatterns = buildGovernanceChoiceOutcomePatterns(links);
  const doctrineEmergencePatterns      = buildDoctrineEmergencePatterns(playbook);
  const ecosystemChangeSummary         = buildEcosystemChangeSummary(
    outcomeReviews,
    auditRecords
  );

  const summaryLines = buildTopLevelSummaryLines(
    auditRecords,
    outcomeReviews,
    predictionToDecisionPatterns,
    governanceChoiceOutcomePatterns,
    doctrineEmergencePatterns,
    ecosystemChangeSummary
  );

  return {
    totalAuditRuns:         totalAuditRuns   ?? auditRecords.length,
    totalPredictions:       totalPredictions ?? links.length,
    totalGovernanceActions: auditRecords.length,
    totalOutcomeReviews:    outcomeReviews.length,
    predictionToDecisionPatterns,
    governanceChoiceOutcomePatterns,
    doctrineEmergencePatterns,
    ecosystemChangeSummary,
    summaryLines,
  };
}

/* =========================================================
   Internal: top-level summary
   ========================================================= */

function buildTopLevelSummaryLines(
  auditRecords: GovernanceAuditRecord[],
  outcomeReviews: GovernanceOutcomeReview[],
  predPatterns: PredictionToDecisionPattern[],
  choicePatterns: GovernanceChoiceOutcomePattern[],
  doctrines: DoctrineEmergencePattern[],
  change: EcosystemChangeSummary
): string[] {
  if (auditRecords.length === 0) {
    return [
      "No governance actions have been recorded yet.",
      "Ecosystem loop summary will become available as governance actions accumulate.",
    ];
  }

  const lines: string[] = [];

  // Dominant prediction→decision pattern
  if (predPatterns.length > 0) {
    const top = predPatterns[0];
    lines.push(
      `Dominant decision pattern: "${top.label}" (${top.count} instance(s)).`
    );
  }

  // Dominant governance choice→outcome pattern
  if (choicePatterns.length > 0) {
    const top = choicePatterns[0];
    lines.push(
      `${top.summary}`
    );
  }

  // Doctrine emergence
  if (doctrines.length > 0) {
    const top = doctrines[0];
    lines.push(
      `A doctrine favouring "${top.title}" has emerged with ${top.confidence} confidence.`
    );
  }

  // Change summary
  lines.push(...change.summaryLines);

  // Fallback if only audit records, no reviews
  if (
    outcomeReviews.length === 0 &&
    auditRecords.length > 0 &&
    lines.length < 2
  ) {
    lines.push(
      `${auditRecords.length} governance action(s) recorded. Outcome reviews will provide further ecosystem insight as follow-up runs accumulate.`
    );
  }

  return lines;
}
