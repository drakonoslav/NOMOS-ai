/**
 * governance_decision_support.ts
 *
 * Deterministic governance decision support for NOMOS.
 *
 * Compares the current active policy against the bench-recommended policy
 * to help a human decide whether to promote or roll back before any
 * governance action is taken.
 *
 * Functions:
 *   computeExpectedGains(currentMetrics, recommendedMetrics)
 *     Identifies bench metric improvements if the recommended policy is promoted.
 *
 *   computeExpectedTradeoffs(currentMetrics, recommendedMetrics)
 *     Identifies bench metric costs that accompany the expected gains.
 *
 *   computeExpectedRisks(benchReport, recommendation)
 *     Reflects uncertainty, shallow evidence, or mixed results.
 *
 *   buildGovernanceDecisionSupport(
 *     currentActivePolicyVersionId,
 *     recommendedPolicyVersionId,
 *     benchReport,
 *     recommendationReport
 *   )
 *     Orchestrates all three computations and produces a complete
 *     GovernanceDecisionSupport record.
 *
 * promoteSuggested = true when:
 *   - recommendationStrength is "moderate" or "strong"
 *   - confidence is "moderate" or "high"
 *   - recommendedPolicyVersionId differs from currentActivePolicyVersionId
 *   - at least one expected gain exists
 *
 * rollbackSuggested = true when:
 *   - current active policy exists AND its bench metrics show clearly poor
 *     performance (tooAggressiveRate > 0.4 OR unresolvedRate > 0.5)
 *   - AND at least one other candidate policy exists
 *
 * Advisory only. No policy assignment is changed by any function here.
 * No LLM generation is used.
 */

import type { PolicyBenchReport, PolicyBenchMetrics } from "./policy_bench_types";
import type {
  PolicyRecommendationReport,
} from "./policy_recommendation_types";
import type { GovernanceDecisionSupport } from "./governance_decision_support_types";

/* =========================================================
   Metric comparison threshold
   Improvements / regressions below this are considered negligible.
   ========================================================= */

const DELTA_THRESHOLD = 0.05;

/* =========================================================
   computeExpectedGains
   ========================================================= */

/**
 * Produces gain lines where the recommended policy is meaningfully better
 * than the current active policy across key bench metrics.
 *
 * "Meaningfully better" means the delta exceeds DELTA_THRESHOLD.
 * If currentMetrics is null (no active policy), all recommended metrics
 * are framed as absolute improvements from baseline.
 */
export function computeExpectedGains(
  currentMetrics: PolicyBenchMetrics | null,
  recommendedMetrics: PolicyBenchMetrics | null
): string[] {
  if (!recommendedMetrics) return [];

  const gains: string[] = [];

  if (!currentMetrics) {
    // No current policy — establishing a baseline
    if (recommendedMetrics.exactMatchRate !== null && recommendedMetrics.exactMatchRate > 0) {
      gains.push(
        `Introduces a tracked exact-match rate of ${pct(recommendedMetrics.exactMatchRate)}.`
      );
    }
    if (recommendedMetrics.directionMatchRate !== null && recommendedMetrics.directionMatchRate > 0) {
      gains.push(
        `Establishes a direction-match rate of ${pct(recommendedMetrics.directionMatchRate)}.`
      );
    }
    if (recommendedMetrics.tooAggressiveRate !== null && recommendedMetrics.tooAggressiveRate < 0.2) {
      gains.push("Aggressiveness is within acceptable bounds from the start.");
    }
    return gains;
  }

  // Exact match improvement
  if (
    recommendedMetrics.exactMatchRate !== null &&
    currentMetrics.exactMatchRate !== null &&
    recommendedMetrics.exactMatchRate - currentMetrics.exactMatchRate > DELTA_THRESHOLD
  ) {
    gains.push(
      `Exact-match performance is likely to improve (${pct(currentMetrics.exactMatchRate)} → ${pct(recommendedMetrics.exactMatchRate)}).`
    );
  }

  // Direction match improvement
  if (
    recommendedMetrics.directionMatchRate !== null &&
    currentMetrics.directionMatchRate !== null &&
    recommendedMetrics.directionMatchRate - currentMetrics.directionMatchRate > DELTA_THRESHOLD
  ) {
    gains.push(
      `Direction-match rate is expected to increase (${pct(currentMetrics.directionMatchRate)} → ${pct(recommendedMetrics.directionMatchRate)}).`
    );
  }

  // Aggressiveness reduction
  if (
    recommendedMetrics.tooAggressiveRate !== null &&
    currentMetrics.tooAggressiveRate !== null &&
    currentMetrics.tooAggressiveRate - recommendedMetrics.tooAggressiveRate > DELTA_THRESHOLD
  ) {
    gains.push(
      `Over-aggressive forecasts are likely to decrease (${pct(currentMetrics.tooAggressiveRate)} → ${pct(recommendedMetrics.tooAggressiveRate)}).`
    );
  }

  // Too-weak improvement
  if (
    recommendedMetrics.tooWeakRate !== null &&
    currentMetrics.tooWeakRate !== null &&
    currentMetrics.tooWeakRate - recommendedMetrics.tooWeakRate > DELTA_THRESHOLD
  ) {
    gains.push(
      `Missed violations may decrease (too-weak rate: ${pct(currentMetrics.tooWeakRate)} → ${pct(recommendedMetrics.tooWeakRate)}).`
    );
  }

  // Unresolved rate improvement
  if (
    recommendedMetrics.unresolvedRate !== null &&
    currentMetrics.unresolvedRate !== null &&
    currentMetrics.unresolvedRate - recommendedMetrics.unresolvedRate > DELTA_THRESHOLD
  ) {
    gains.push(
      `Unresolved prediction rate may decline (${pct(currentMetrics.unresolvedRate)} → ${pct(recommendedMetrics.unresolvedRate)}).`
    );
  }

  return gains;
}

/* =========================================================
   computeExpectedTradeoffs
   ========================================================= */

/**
 * Produces tradeoff lines where the recommended policy is meaningfully worse
 * than the current policy on specific metrics — costs that accompany gains.
 */
export function computeExpectedTradeoffs(
  currentMetrics: PolicyBenchMetrics | null,
  recommendedMetrics: PolicyBenchMetrics | null
): string[] {
  if (!recommendedMetrics || !currentMetrics) return [];

  const tradeoffs: string[] = [];

  // Direction match regression
  if (
    currentMetrics.directionMatchRate !== null &&
    recommendedMetrics.directionMatchRate !== null &&
    currentMetrics.directionMatchRate - recommendedMetrics.directionMatchRate > DELTA_THRESHOLD
  ) {
    tradeoffs.push(
      `Direction-match rate may decrease (${pct(currentMetrics.directionMatchRate)} → ${pct(recommendedMetrics.directionMatchRate)}).`
    );
  }

  // Confidence conservatism (higher low-confidence rate)
  if (
    currentMetrics.lowConfidenceRate !== null &&
    recommendedMetrics.lowConfidenceRate !== null &&
    recommendedMetrics.lowConfidenceRate - currentMetrics.lowConfidenceRate > DELTA_THRESHOLD
  ) {
    tradeoffs.push(
      "Confidence outputs may become slightly more conservative (higher low-confidence rate)."
    );
  }

  // Too-weak increase
  if (
    currentMetrics.tooWeakRate !== null &&
    recommendedMetrics.tooWeakRate !== null &&
    recommendedMetrics.tooWeakRate - currentMetrics.tooWeakRate > DELTA_THRESHOLD
  ) {
    tradeoffs.push(
      `Missed violations may increase (too-weak rate: ${pct(currentMetrics.tooWeakRate)} → ${pct(recommendedMetrics.tooWeakRate)}).`
    );
  }

  // Aggressiveness increase
  if (
    currentMetrics.tooAggressiveRate !== null &&
    recommendedMetrics.tooAggressiveRate !== null &&
    recommendedMetrics.tooAggressiveRate - currentMetrics.tooAggressiveRate > DELTA_THRESHOLD
  ) {
    tradeoffs.push(
      `Over-aggressive forecasts may increase (${pct(currentMetrics.tooAggressiveRate)} → ${pct(recommendedMetrics.tooAggressiveRate)}).`
    );
  }

  // Unresolved rate increase
  if (
    currentMetrics.unresolvedRate !== null &&
    recommendedMetrics.unresolvedRate !== null &&
    recommendedMetrics.unresolvedRate - currentMetrics.unresolvedRate > DELTA_THRESHOLD
  ) {
    tradeoffs.push(
      `Unresolved prediction rate may rise (${pct(currentMetrics.unresolvedRate)} → ${pct(recommendedMetrics.unresolvedRate)}).`
    );
  }

  return tradeoffs;
}

/* =========================================================
   computeExpectedRisks
   ========================================================= */

/**
 * Produces risk lines reflecting uncertainty, shallow evidence, or
 * ambiguity in the bench results.
 *
 * Uses benchReport and the primary recommendation to assess risks.
 */
export function computeExpectedRisks(
  benchReport: PolicyBenchReport,
  recommendation: PolicyRecommendationReport
): string[] {
  const risks: string[] = [];
  const primary = recommendation.recommendations[0];

  // Shallow evidence risk
  const minResolved = benchReport.metricsByPolicy.reduce(
    (min, m) => Math.min(min, m.resolvedRuns),
    Infinity
  );
  if (minResolved !== Infinity && minResolved < 3) {
    risks.push(
      `Bench evidence is limited to a shallow ${recommendation.domain} window (${minResolved} resolved run${minResolved === 1 ? "" : "s"}).`
    );
  }

  // Low recommendation confidence
  if (primary?.confidence === "low") {
    risks.push(
      "Recommendation confidence is low — additional bench runs are needed before acting."
    );
  }

  // Weak recommendation strength
  if (primary?.recommendationStrength === "weak") {
    risks.push(
      "Policy differences are modest; practical gains may be small or inconsistent."
    );
  }

  // High unresolved rate on recommended policy
  if (primary?.basis?.unresolvedRate !== null && (primary?.basis?.unresolvedRate ?? 0) > 0.4) {
    risks.push(
      "High unresolved rate on the recommended policy — many outcomes are still unverified."
    );
  }

  // Mixed results across bench (if some policies have very different performance)
  const exactRates = benchReport.metricsByPolicy
    .map((m) => m.exactMatchRate)
    .filter((r): r is number => r !== null);
  if (exactRates.length >= 2) {
    const spread = Math.max(...exactRates) - Math.min(...exactRates);
    if (spread < 0.1) {
      risks.push(
        "All evaluated policies perform similarly — the bench does not strongly differentiate them."
      );
    }
  }

  // No current active policy
  if (!benchReport.request.policyVersionIds.length) {
    risks.push("No policies were evaluated — bench results cannot support a recommendation.");
  }

  return risks;
}

/* =========================================================
   Helpers
   ========================================================= */

function pct(rate: number | null): string {
  if (rate === null) return "unknown";
  return `${(rate * 100).toFixed(0)}%`;
}

function shortId(id: string | null): string {
  if (!id) return "none";
  return id.length > 4 ? id.slice(4) : id;
}

function findMetrics(
  benchReport: PolicyBenchReport,
  policyVersionId: string | null
): PolicyBenchMetrics | null {
  if (!policyVersionId) return null;
  return benchReport.metricsByPolicy.find((m) => m.policyVersionId === policyVersionId) ?? null;
}

/* =========================================================
   buildGovernanceDecisionSupport
   ========================================================= */

/**
 * Orchestrates all computations and produces a complete GovernanceDecisionSupport.
 *
 * Parameters:
 *   currentActivePolicyVersionId:  the currently active policy (may be null).
 *   recommendedPolicyVersionId:    the bench-recommended policy (may be null).
 *   benchReport:                   the bench report containing per-policy metrics.
 *   recommendationReport:          the recommendation report for context.
 *
 * Steps:
 *   1. Resolve metrics for current and recommended policies from benchReport.
 *   2. computeExpectedGains.
 *   3. computeExpectedTradeoffs.
 *   4. computeExpectedRisks.
 *   5. Classify promoteSuggested and rollbackSuggested.
 *   6. Build summaryLines.
 *
 * Does not mutate any input.
 */
export function buildGovernanceDecisionSupport(
  currentActivePolicyVersionId: string | null,
  recommendedPolicyVersionId: string | null,
  benchReport: PolicyBenchReport,
  recommendationReport: PolicyRecommendationReport
): GovernanceDecisionSupport {
  const domain = recommendationReport.domain;
  const primary = recommendationReport.recommendations[0] ?? null;

  const strength: GovernanceDecisionSupport["recommendationStrength"] =
    primary?.recommendationStrength ?? "weak";
  const confidence: GovernanceDecisionSupport["confidence"] =
    primary?.confidence ?? "low";

  const currentMetrics = findMetrics(benchReport, currentActivePolicyVersionId);
  const recommendedMetrics = findMetrics(benchReport, recommendedPolicyVersionId);

  const expectedGains = computeExpectedGains(currentMetrics, recommendedMetrics);
  const expectedTradeoffs = computeExpectedTradeoffs(currentMetrics, recommendedMetrics);
  const expectedRisks = computeExpectedRisks(benchReport, recommendationReport);

  // promoteSuggested: strong-enough evidence, meaningful difference, known target
  const promoteSuggested =
    (strength === "moderate" || strength === "strong") &&
    (confidence === "moderate" || confidence === "high") &&
    !!recommendedPolicyVersionId &&
    recommendedPolicyVersionId !== currentActivePolicyVersionId &&
    expectedGains.length > 0;

  // rollbackSuggested: current policy is clearly problematic and alternatives exist
  const rollbackSuggested =
    !promoteSuggested &&
    !!currentActivePolicyVersionId &&
    !!currentMetrics &&
    benchReport.metricsByPolicy.length > 1 &&
    (
      (currentMetrics.tooAggressiveRate ?? 0) > 0.4 ||
      (currentMetrics.unresolvedRate ?? 0) > 0.5
    );

  // Summary lines
  const summaryLines: string[] = [];

  const currentLabel = currentActivePolicyVersionId
    ? shortId(currentActivePolicyVersionId)
    : "none";
  const recommendedLabel = recommendedPolicyVersionId
    ? shortId(recommendedPolicyVersionId)
    : "none";

  summaryLines.push(
    `Domain: ${domain}. Active policy: ${currentLabel}. Recommended policy: ${recommendedLabel}.`
  );

  if (promoteSuggested) {
    summaryLines.push(
      `Promoting ${recommendedLabel} over ${currentLabel} is supported by bench evidence (strength: ${strength}, confidence: ${confidence}).`
    );
  } else if (rollbackSuggested) {
    summaryLines.push(
      `Current policy ${currentLabel} shows poor bench performance. Consider rollback even without a strong replacement candidate.`
    );
  } else if (currentActivePolicyVersionId === recommendedPolicyVersionId) {
    summaryLines.push(
      `Current active policy ${currentLabel} is already the bench recommendation — no action needed.`
    );
  } else {
    summaryLines.push(
      `Evidence is not yet sufficient to recommend promotion. Gather more bench runs before deciding.`
    );
  }

  if (expectedGains.length > 0) {
    summaryLines.push(`Expected gains if promoted: ${expectedGains.length} identified.`);
  }
  if (expectedTradeoffs.length > 0) {
    summaryLines.push(`Expected tradeoffs: ${expectedTradeoffs.length} identified.`);
  }
  if (expectedRisks.length > 0) {
    summaryLines.push(`Risks: ${expectedRisks.length} flagged — review before acting.`);
  }

  summaryLines.push(
    "All promotion and rollback decisions remain exclusive manual governance actions."
  );

  return {
    domain,
    currentActivePolicyVersionId,
    recommendedPolicyVersionId,
    expectedGains,
    expectedTradeoffs,
    expectedRisks,
    recommendationStrength: strength,
    confidence,
    promoteSuggested,
    rollbackSuggested,
    summaryLines,
  };
}
