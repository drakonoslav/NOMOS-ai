/**
 * policy_recommendation.ts
 *
 * Deterministic policy recommendation layer for NOMOS.
 *
 * Derives advisory policy recommendations from PolicyBenchReport evidence.
 * This layer is advisory only — no active policy assignment is changed.
 *
 * Functions:
 *   rankPoliciesFromBench(benchReport)
 *     Scores each policy by a weighted composite formula and returns them
 *     in descending rank order.
 *
 *   buildPolicyRecommendation(domain, benchReport)
 *     Picks the top-ranked policy as the recommendation, computes confidence
 *     and recommendation strength, and builds rationale/tradeoff lines.
 *
 *   buildPolicyRecommendationReport(domain, benchReport)
 *     Returns one PolicyRecommendation per ranked candidate (top first) plus
 *     top-level summary lines.
 *
 * Scoring formula (higher = better):
 *   score =
 *     (exactMatchRate    ?? 0) * 2.0    // exact match weighted highest
 *   + (directionMatchRate ?? 0) * 1.0   // direction match secondary
 *   - (tooAggressiveRate  ?? 0) * 1.5   // aggressiveness penalised heavily
 *   - (tooWeakRate        ?? 0) * 1.0   // weakness penalised
 *   - (unresolvedRate     ?? 0) * 0.8   // high unresolved dampens score
 *
 * Recommendation strength (score gap between top and second):
 *   "strong"   — gap > 0.15
 *   "moderate" — gap > 0.05
 *   "weak"     — gap ≤ 0.05, single candidate, or no resolved runs
 *
 * Confidence (from top policy's resolved-run depth):
 *   "low"      — resolvedRuns < 3 or unresolvedRate > 0.5
 *   "moderate" — resolvedRuns 3–7
 *   "high"     — resolvedRuns ≥ 8 and unresolvedRate ≤ 0.25
 *
 * No LLM generation is used.
 */

import type { PolicyBenchReport, PolicyBenchMetrics } from "./policy_bench_types";
import type {
  PolicyRecommendation,
  PolicyRecommendationReport,
} from "./policy_recommendation_types";

/* =========================================================
   Constants
   ========================================================= */

const WEIGHT_EXACT_MATCH   =  2.0;
const WEIGHT_DIR_MATCH     =  1.0;
const PENALTY_AGGRESSIVE   =  1.5;
const PENALTY_WEAK         =  1.0;
const PENALTY_UNRESOLVED   =  0.8;

const GAP_STRONG   = 0.15;
const GAP_MODERATE = 0.05;

const SHALLOW_THRESHOLD = 3;
const DEEP_THRESHOLD    = 8;
const HIGH_UNRES_RATE   = 0.5;
const LOW_UNRES_RATE    = 0.25;

/* =========================================================
   Scoring
   ========================================================= */

export interface PolicyRankEntry {
  policyVersionId: string;
  score: number;
  metrics: PolicyBenchMetrics;
}

/**
 * Computes a composite score for one set of bench metrics.
 * Null rates are treated as 0 (no evidence for that metric).
 */
function scoreMetrics(m: PolicyBenchMetrics): number {
  return (
    (m.exactMatchRate    ?? 0) * WEIGHT_EXACT_MATCH
  + (m.directionMatchRate ?? 0) * WEIGHT_DIR_MATCH
  - (m.tooAggressiveRate  ?? 0) * PENALTY_AGGRESSIVE
  - (m.tooWeakRate        ?? 0) * PENALTY_WEAK
  - (m.unresolvedRate     ?? 0) * PENALTY_UNRESOLVED
  );
}

/* =========================================================
   rankPoliciesFromBench
   ========================================================= */

/**
 * Ranks all policies in the bench report by composite score, descending.
 *
 * Returns an empty array when benchReport.metricsByPolicy is empty.
 * Tie-breaking is deterministic: alphabetical by policyVersionId.
 */
export function rankPoliciesFromBench(
  benchReport: PolicyBenchReport
): PolicyRankEntry[] {
  return [...benchReport.metricsByPolicy]
    .map((m) => ({ policyVersionId: m.policyVersionId, score: scoreMetrics(m), metrics: m }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.policyVersionId.localeCompare(b.policyVersionId);
    });
}

/* =========================================================
   Confidence classification
   ========================================================= */

function classifyConfidence(
  topMetrics: PolicyBenchMetrics
): "low" | "moderate" | "high" {
  if (
    topMetrics.resolvedRuns < SHALLOW_THRESHOLD ||
    (topMetrics.unresolvedRate ?? 0) > HIGH_UNRES_RATE
  ) {
    return "low";
  }
  if (
    topMetrics.resolvedRuns >= DEEP_THRESHOLD &&
    (topMetrics.unresolvedRate ?? 1) <= LOW_UNRES_RATE
  ) {
    return "high";
  }
  return "moderate";
}

/* =========================================================
   Recommendation strength
   ========================================================= */

function classifyStrength(
  ranked: PolicyRankEntry[]
): "weak" | "moderate" | "strong" {
  if (ranked.length < 2) return "weak";
  const top = ranked[0]!;
  const second = ranked[1]!;
  if (top.metrics.resolvedRuns === 0) return "weak";
  const gap = top.score - second.score;
  if (gap > GAP_STRONG) return "strong";
  if (gap > GAP_MODERATE) return "moderate";
  return "weak";
}

/* =========================================================
   Formatting helpers
   ========================================================= */

function shortId(id: string): string {
  return id.length > 4 ? id.slice(4) : id;
}

function pctStr(rate: number | null): string {
  if (rate === null) return "unknown";
  return `${(rate * 100).toFixed(0)}%`;
}

/* =========================================================
   Rationale line builder
   ========================================================= */

function buildRationaleLines(
  domain: PolicyRecommendation["domain"],
  top: PolicyRankEntry,
  confidence: "low" | "moderate" | "high",
  strength: "weak" | "moderate" | "strong"
): string[] {
  const lines: string[] = [];
  const id = shortId(top.policyVersionId);
  const m = top.metrics;

  if (top.metrics.resolvedRuns === 0) {
    lines.push(
      `No resolved runs available — no evidence-based recommendation for ${domain}.`
    );
    return lines;
  }

  // Primary rationale
  const reasons: string[] = [];
  if (m.exactMatchRate !== null && m.exactMatchRate > 0) {
    reasons.push(`exact-match rate of ${pctStr(m.exactMatchRate)}`);
  }
  if (m.directionMatchRate !== null && m.directionMatchRate > 0) {
    reasons.push(`direction-match rate of ${pctStr(m.directionMatchRate)}`);
  }
  if (m.tooAggressiveRate !== null && m.tooAggressiveRate < 0.2) {
    reasons.push(`acceptable aggressiveness (${pctStr(m.tooAggressiveRate)})`);
  }

  if (reasons.length > 0) {
    lines.push(
      `Policy ${id} is recommended for ${domain} based on ${reasons.join(", ")}.`
    );
  } else {
    lines.push(
      `Policy ${id} is the highest-scoring candidate for ${domain} with the available evidence.`
    );
  }

  // Depth note
  lines.push(
    `Evaluated over ${m.resolvedRuns} resolved run${m.resolvedRuns === 1 ? "" : "s"} (${m.totalRuns} total).`
  );

  // Confidence note
  if (confidence === "low") {
    lines.push(
      "Recommendation confidence is low because the evaluation window is shallow or highly unresolved."
    );
  } else if (confidence === "moderate") {
    lines.push(
      "Recommendation confidence is moderate because the evaluation window is limited."
    );
  } else {
    lines.push(
      "Recommendation confidence is high based on sufficient resolved evaluation depth."
    );
  }

  // Strength note
  if (strength === "weak") {
    lines.push(
      "Recommendation strength is weak — competing policies score closely. Review bench metrics carefully before promoting."
    );
  } else if (strength === "moderate") {
    lines.push(
      "Recommendation strength is moderate — the gap is meaningful but not decisive."
    );
  }

  return lines;
}

/* =========================================================
   Tradeoff line builder
   ========================================================= */

function buildTradeoffLines(
  top: PolicyRankEntry,
  ranked: PolicyRankEntry[]
): string[] {
  const lines: string[] = [];
  const runners = ranked.slice(1, 3); // compare vs top 2 runner-ups

  for (const runner of runners) {
    const tid = shortId(top.policyVersionId);
    const rid = shortId(runner.policyVersionId);
    const tm = top.metrics;
    const rm = runner.metrics;

    // Direction match: if runner is better
    if (
      rm.directionMatchRate !== null &&
      tm.directionMatchRate !== null &&
      rm.directionMatchRate > tm.directionMatchRate + 0.05
    ) {
      lines.push(
        `Policy ${rid} has a stronger direction-match rate (${pctStr(rm.directionMatchRate)}) than ${tid} (${pctStr(tm.directionMatchRate)}), but weaker exact-match performance.`
      );
    }

    // Aggressiveness: if runner is less aggressive
    if (
      rm.tooAggressiveRate !== null &&
      tm.tooAggressiveRate !== null &&
      rm.tooAggressiveRate < tm.tooAggressiveRate - 0.05
    ) {
      lines.push(
        `Policy ${rid} has lower aggressiveness (${pctStr(rm.tooAggressiveRate)}) than ${tid}, but trails on the composite score.`
      );
    }

    // Unresolved: if recommended has higher unresolved
    if (
      rm.unresolvedRate !== null &&
      tm.unresolvedRate !== null &&
      tm.unresolvedRate > rm.unresolvedRate + 0.05
    ) {
      lines.push(
        `Policy ${tid} has a higher unresolved rate (${pctStr(tm.unresolvedRate)}) compared to ${rid} (${pctStr(rm.unresolvedRate)}) — outcome verification was limited for the recommended policy.`
      );
    }

    // Conservatism: compare confidence distributions
    if (
      tm.highConfidenceRate !== null && rm.highConfidenceRate !== null &&
      tm.highConfidenceRate < rm.highConfidenceRate - 0.1
    ) {
      lines.push(
        `Policy ${tid} is more conservative in confidence behavior than ${rid}.`
      );
    }

    // Too weak: if top is weaker on weakness metric
    if (
      rm.tooWeakRate !== null &&
      tm.tooWeakRate !== null &&
      tm.tooWeakRate > rm.tooWeakRate + 0.05
    ) {
      lines.push(
        `Policy ${rid} misses fewer violations (too-weak rate: ${pctStr(rm.tooWeakRate)}) compared to ${tid} (${pctStr(tm.tooWeakRate)}).`
      );
    }
  }

  if (lines.length === 0 && runners.length > 0) {
    lines.push(
      `Policy ${shortId(runners[0]!.policyVersionId)} is the closest competitor — review the bench metrics for detailed differences.`
    );
  }

  return lines;
}

/* =========================================================
   buildPolicyRecommendation
   ========================================================= */

/**
 * Builds a single PolicyRecommendation for the given domain from a bench report.
 *
 * Steps:
 *   1. rankPoliciesFromBench — order by composite score.
 *   2. Top entry = recommended policy (null if no candidates).
 *   3. Classify confidence and recommendation strength.
 *   4. Build rationale and tradeoff lines.
 *
 * Does not mutate the benchReport.
 */
export function buildPolicyRecommendation(
  domain: PolicyRecommendation["domain"],
  benchReport: PolicyBenchReport
): PolicyRecommendation {
  const ranked = rankPoliciesFromBench(benchReport);
  const top = ranked[0] ?? null;

  const candidatePolicyVersionIds = ranked.map((r) => r.policyVersionId);

  if (!top || top.metrics.resolvedRuns === 0) {
    return {
      domain,
      recommendedPolicyVersionId: null,
      candidatePolicyVersionIds,
      basis: {
        exactMatchRate: null,
        directionMatchRate: null,
        tooAggressiveRate: null,
        tooWeakRate: null,
        unresolvedRate: null,
      },
      rationaleLines: ["No resolved runs available — no evidence-based recommendation."],
      tradeoffLines: [],
      confidence: "low",
      recommendationStrength: "weak",
    };
  }

  const confidence = classifyConfidence(top.metrics);
  const strength = classifyStrength(ranked);
  const rationaleLines = buildRationaleLines(domain, top, confidence, strength);
  const tradeoffLines = buildTradeoffLines(top, ranked);

  return {
    domain,
    recommendedPolicyVersionId: top.policyVersionId,
    candidatePolicyVersionIds,
    basis: {
      exactMatchRate: top.metrics.exactMatchRate,
      directionMatchRate: top.metrics.directionMatchRate,
      tooAggressiveRate: top.metrics.tooAggressiveRate,
      tooWeakRate: top.metrics.tooWeakRate,
      unresolvedRate: top.metrics.unresolvedRate,
    },
    rationaleLines,
    tradeoffLines,
    confidence,
    recommendationStrength: strength,
  };
}

/* =========================================================
   buildPolicyRecommendationReport
   ========================================================= */

/**
 * Builds the full PolicyRecommendationReport: one PolicyRecommendation per
 * ranked candidate (top-first) plus summary lines.
 *
 * Each candidate beyond the top gets a recommendation that explains its
 * position relative to the recommended policy, using its own metrics as
 * the basis. Rationale lines note it is a runner-up.
 *
 * Does not mutate benchReport.
 */
export function buildPolicyRecommendationReport(
  domain: PolicyRecommendationReport["domain"],
  benchReport: PolicyBenchReport
): PolicyRecommendationReport {
  const ranked = rankPoliciesFromBench(benchReport);

  if (ranked.length === 0) {
    return {
      domain,
      recommendations: [],
      summaryLines: ["No policies were evaluated in this bench run."],
    };
  }

  // Primary recommendation (top-ranked)
  const primary = buildPolicyRecommendation(domain, benchReport);

  // Runner-up entries — simplified view using their own metrics
  const runners: PolicyRecommendation[] = ranked.slice(1).map((entry) => {
    const id = shortId(entry.policyVersionId);
    const topId = primary.recommendedPolicyVersionId
      ? shortId(primary.recommendedPolicyVersionId)
      : "none";
    const rationaleLines = [
      `Policy ${id} is a runner-up candidate for ${domain}.`,
      `It scores ${entry.score.toFixed(3)} versus ${ranked[0]!.score.toFixed(3)} for the recommended policy (${topId}).`,
    ];
    if (entry.metrics.directionMatchRate !== null) {
      rationaleLines.push(
        `Direction-match rate: ${pctStr(entry.metrics.directionMatchRate)}.`
      );
    }
    return {
      domain,
      recommendedPolicyVersionId: entry.policyVersionId,
      candidatePolicyVersionIds: ranked.map((r) => r.policyVersionId),
      basis: {
        exactMatchRate: entry.metrics.exactMatchRate,
        directionMatchRate: entry.metrics.directionMatchRate,
        tooAggressiveRate: entry.metrics.tooAggressiveRate,
        tooWeakRate: entry.metrics.tooWeakRate,
        unresolvedRate: entry.metrics.unresolvedRate,
      },
      rationaleLines,
      tradeoffLines: buildTradeoffLines(entry, ranked.filter((r) => r.policyVersionId !== entry.policyVersionId).concat(entry).slice()),
      confidence: classifyConfidence(entry.metrics),
      recommendationStrength: "weak" as const,
    };
  });

  const recommendations: PolicyRecommendation[] = [primary, ...runners];

  // Summary lines
  const summaryLines: string[] = [];
  const topId = primary.recommendedPolicyVersionId
    ? shortId(primary.recommendedPolicyVersionId)
    : null;

  if (topId) {
    summaryLines.push(
      `Policy ${topId} is recommended for ${domain}. Strength: ${primary.recommendationStrength}. Confidence: ${primary.confidence}.`
    );
    summaryLines.push(
      `Final promotion remains a manual governance decision.`
    );
  } else {
    summaryLines.push(
      `No recommendation available for ${domain} — insufficient bench evidence.`
    );
  }

  if (ranked.length > 1) {
    summaryLines.push(
      `${ranked.length} policies were evaluated. Review runner-up analysis before deciding.`
    );
  }

  return { domain, recommendations, summaryLines };
}
