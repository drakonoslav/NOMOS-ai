/**
 * policy_regime_comparison.ts
 *
 * Deterministic policy regime comparison for NOMOS.
 *
 * Functions:
 *   buildPolicyRegimeMetrics(frozenRecords)
 *     Groups frozen prediction records by policyVersionId and computes
 *     per-regime performance metrics.
 *
 *   comparePolicyRegimes(beforeMetrics, afterMetrics)
 *     Produces a pairwise comparison between two regime metric objects,
 *     computing deltas and generating summary lines.
 *
 *   buildPolicyRegimeComparisonReport(frozenRecords)
 *     Builds the complete comparison report: all regime metrics, all
 *     consecutive pairwise comparisons, and best-in-class identifiers.
 *
 * Data source: FrozenPredictionRecord[] (from policy_versioning.ts).
 * Calibration metrics are derived from the embedded frozenPolicySnapshot
 * calibrationState of the last record in each regime group.
 *
 * Comparison only — no policy is promoted or rolled back here.
 * All functions are deterministic and non-mutating.
 * No LLM generation is used.
 */

import type { FrozenPredictionRecord } from "./policy_versioning_types";
import type {
  PolicyRegimeMetrics,
  PolicyRegimeComparison,
  PolicyRegimeComparisonReport,
} from "./policy_regime_comparison_types";

/* =========================================================
   Confidence → numeric score
   ========================================================= */

function confidenceScore(c: "low" | "moderate" | "high"): number {
  if (c === "high") return 1.0;
  if (c === "moderate") return 0.5;
  return 0.0;
}

/* =========================================================
   Domain classification
   ========================================================= */

const NUTRITION_KEYWORDS = [
  "calorie", "protein", "hydration", "fat", "carb", "macro", "micro",
  "meal", "diet", "food", "vitamin", "mineral", "nutrient", "intake",
];

const TRAINING_KEYWORDS = [
  "training", "workout", "exercise", "session", "load", "recovery",
  "volume", "intensity", "sleep", "rest day", "effort",
];

const SCHEDULE_KEYWORDS = [
  "schedule", "timing", "frequency", "period", "cycle", "week", "day",
  "interval", "cadence", "routine",
];

function classifyDomain(
  variable: string | null
): { nutrition: boolean; training: boolean; schedule: boolean } {
  if (!variable) return { nutrition: false, training: false, schedule: false };
  const lower = variable.toLowerCase();
  return {
    nutrition: NUTRITION_KEYWORDS.some((k) => lower.includes(k)),
    training: TRAINING_KEYWORDS.some((k) => lower.includes(k)),
    schedule: SCHEDULE_KEYWORDS.some((k) => lower.includes(k)),
  };
}

/* =========================================================
   buildPolicyRegimeMetrics
   ========================================================= */

/**
 * Groups FrozenPredictionRecord[] by policyVersionId and computes
 * per-regime performance metrics.
 *
 * Calibration metrics (exactMatchRate, directionMatchRate, etc.) are taken
 * from the last record's embedded calibrationState — which represents the
 * most recent calibration observation under that regime.
 *
 * Bias averages are computed across all records in the regime.
 * Confidence score averages are computed across all records.
 *
 * Records are sorted by predictionTimestamp before grouping.
 * Regimes are returned in chronological order of first appearance.
 */
export function buildPolicyRegimeMetrics(
  frozenRecords: FrozenPredictionRecord[]
): PolicyRegimeMetrics[] {
  if (frozenRecords.length === 0) return [];

  // Sort by timestamp ascending
  const sorted = [...frozenRecords].sort((a, b) =>
    a.predictionTimestamp.localeCompare(b.predictionTimestamp)
  );

  // Group by policyVersionId, preserving insertion order (chronological)
  const groups = new Map<string, FrozenPredictionRecord[]>();
  const order: string[] = [];

  for (const record of sorted) {
    const id = record.frozenPolicyVersionId;
    if (!groups.has(id)) {
      groups.set(id, []);
      order.push(id);
    }
    groups.get(id)!.push(record);
  }

  const result: PolicyRegimeMetrics[] = [];

  for (const policyVersionId of order) {
    const records = groups.get(policyVersionId)!;
    const lastRecord = records[records.length - 1];
    const calState = lastRecord.frozenPolicySnapshot.calibrationState;

    // Confidence score average
    const confSum = records.reduce((s, r) => s + confidenceScore(r.confidence), 0);
    const averageConfidenceScore = records.length > 0 ? confSum / records.length : null;

    // Bias averages
    const escalationSum = records.reduce(
      (s, r) => s + r.frozenPolicySnapshot.boundedAdjustmentState.escalationBias,
      0
    );
    const uncertaintySum = records.reduce(
      (s, r) => s + r.frozenPolicySnapshot.boundedAdjustmentState.uncertaintyBias,
      0
    );
    const averageEscalationBias = records.length > 0 ? escalationSum / records.length : null;
    const averageUncertaintyBias = records.length > 0 ? uncertaintySum / records.length : null;

    // Domain counts
    let nutritionPredictionCount = 0;
    let trainingPredictionCount = 0;
    let schedulePredictionCount = 0;

    for (const r of records) {
      const domain = classifyDomain(r.predictedVariable);
      if (domain.nutrition) nutritionPredictionCount++;
      if (domain.training) trainingPredictionCount++;
      if (domain.schedule) schedulePredictionCount++;
    }

    result.push({
      policyVersionId,
      totalPredictions: records.length,
      resolvedPredictions: calState.resolvedPredictions,
      exactMatchRate: calState.exactMatchRate,
      directionMatchRate: calState.directionMatchRate,
      tooAggressiveRate: calState.tooAggressiveRate,
      tooWeakRate: calState.tooWeakRate,
      averageConfidenceScore,
      averageEscalationBias,
      averageUncertaintyBias,
      nutritionPredictionCount,
      trainingPredictionCount,
      schedulePredictionCount,
    });
  }

  return result;
}

/* =========================================================
   Delta helpers
   ========================================================= */

function delta(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null;
  return after - before;
}

function pct(rate: number): string {
  return `${Math.round(Math.abs(rate) * 100)}%`;
}

function shortId(id: string): string {
  // Use last 8 chars for display (e.g. "pol-a1b2c3d4" → "a1b2c3d4")
  return id.length > 4 ? id.slice(4) : id;
}

/* =========================================================
   comparePolicyRegimes
   ========================================================= */

/**
 * Produces a pairwise comparison between two regime metric objects.
 *
 * Deltas: after - before. Positive = improvement for exact/direction;
 * positive = worsening for aggressive/weak rates.
 *
 * Null delta when either rate is unavailable.
 *
 * Summary lines are deterministic and cover:
 *   - exact-match improvement or degradation
 *   - direction-match improvement or degradation
 *   - too-aggressive rate change
 *   - too-weak rate change
 *   - uncertainty and confidence bias shifts
 */
export function comparePolicyRegimes(
  beforeMetrics: PolicyRegimeMetrics,
  afterMetrics: PolicyRegimeMetrics
): PolicyRegimeComparison {
  const exactMatchDelta = delta(beforeMetrics.exactMatchRate, afterMetrics.exactMatchRate);
  const directionMatchDelta = delta(
    beforeMetrics.directionMatchRate,
    afterMetrics.directionMatchRate
  );
  const tooAggressiveDelta = delta(
    beforeMetrics.tooAggressiveRate,
    afterMetrics.tooAggressiveRate
  );
  const tooWeakDelta = delta(beforeMetrics.tooWeakRate, afterMetrics.tooWeakRate);

  const lines: string[] = [];
  const beforeId = shortId(beforeMetrics.policyVersionId);
  const afterId = shortId(afterMetrics.policyVersionId);

  // Exact match
  if (exactMatchDelta !== null) {
    if (exactMatchDelta > 0.02) {
      lines.push(
        `${afterId} improved exact-match accuracy by ${pct(exactMatchDelta)} relative to ${beforeId}.`
      );
    } else if (exactMatchDelta < -0.02) {
      lines.push(
        `${afterId} reduced exact-match accuracy by ${pct(exactMatchDelta)} relative to ${beforeId}.`
      );
    } else {
      lines.push(
        `${afterId} maintained comparable exact-match accuracy to ${beforeId}.`
      );
    }
  } else {
    lines.push(
      `Exact-match comparison unavailable between ${beforeId} and ${afterId} — insufficient resolved predictions.`
    );
  }

  // Direction match
  if (directionMatchDelta !== null) {
    if (directionMatchDelta > 0.02) {
      lines.push(
        `${afterId} improved direction-match accuracy by ${pct(directionMatchDelta)}.`
      );
    } else if (directionMatchDelta < -0.02) {
      lines.push(
        `${afterId} reduced direction-match accuracy by ${pct(directionMatchDelta)}.`
      );
    }
  }

  // Too aggressive
  if (tooAggressiveDelta !== null) {
    if (tooAggressiveDelta < -0.02) {
      lines.push(
        `${afterId} reduced over-aggressive predictions by ${pct(tooAggressiveDelta)} relative to ${beforeId}.`
      );
    } else if (tooAggressiveDelta > 0.02) {
      lines.push(
        `${afterId} showed more aggressive predictions (${pct(tooAggressiveDelta)} increase) relative to ${beforeId}.`
      );
    }
  }

  // Too weak
  if (tooWeakDelta !== null) {
    if (tooWeakDelta < -0.02) {
      lines.push(
        `${afterId} reduced too-weak predictions by ${pct(tooWeakDelta)} relative to ${beforeId}.`
      );
    } else if (tooWeakDelta > 0.02) {
      lines.push(
        `${afterId} showed more under-confident predictions (${pct(tooWeakDelta)} increase) relative to ${beforeId}.`
      );
    }
  }

  // Bias shifts
  const avgEscBefore = beforeMetrics.averageEscalationBias;
  const avgEscAfter = afterMetrics.averageEscalationBias;
  if (avgEscBefore !== null && avgEscAfter !== null) {
    const escDiff = avgEscAfter - avgEscBefore;
    if (escDiff < -0.1) {
      lines.push(
        `${afterId} softened risk escalation (escalation bias shifted by ${escDiff.toFixed(2)}).`
      );
    } else if (escDiff > 0.1) {
      lines.push(
        `${afterId} strengthened risk escalation (escalation bias shifted by +${escDiff.toFixed(2)}).`
      );
    }
  }

  const avgUncBefore = beforeMetrics.averageUncertaintyBias;
  const avgUncAfter = afterMetrics.averageUncertaintyBias;
  if (avgUncBefore !== null && avgUncAfter !== null) {
    const uncDiff = avgUncAfter - avgUncBefore;
    if (uncDiff > 0.1) {
      lines.push(
        `${afterId} increased uncertainty bias (+${uncDiff.toFixed(2)}), likely due to shallow or noisy history.`
      );
    } else if (uncDiff < -0.1) {
      lines.push(
        `${afterId} reduced uncertainty bias (${uncDiff.toFixed(2)}), reflecting deeper calibration history.`
      );
    }
  }

  if (lines.length === 0) {
    lines.push(`No significant performance difference detected between ${beforeId} and ${afterId}.`);
  }

  return {
    beforePolicyVersionId: beforeMetrics.policyVersionId,
    afterPolicyVersionId: afterMetrics.policyVersionId,
    exactMatchDelta,
    directionMatchDelta,
    tooAggressiveDelta,
    tooWeakDelta,
    summaryLines: lines,
    changed: beforeMetrics.policyVersionId !== afterMetrics.policyVersionId,
  };
}

/* =========================================================
   buildPolicyRegimeComparisonReport
   ========================================================= */

/**
 * Builds the complete cross-regime comparison report.
 *
 * Steps:
 *   1. Build per-regime metrics (chronological order).
 *   2. Compute consecutive pairwise comparisons.
 *   3. Find best-in-class by exactMatchRate, directionMatchRate, tooAggressiveRate.
 *   4. Generate overall summary lines.
 *
 * Does not mutate the input array.
 */
export function buildPolicyRegimeComparisonReport(
  frozenRecords: FrozenPredictionRecord[]
): PolicyRegimeComparisonReport {
  const regimes = buildPolicyRegimeMetrics(frozenRecords);

  // Pairwise comparisons: regimes[i] → regimes[i+1]
  const pairwiseComparisons: PolicyRegimeComparison[] = [];
  for (let i = 0; i < regimes.length - 1; i++) {
    pairwiseComparisons.push(comparePolicyRegimes(regimes[i], regimes[i + 1]));
  }

  // Best-in-class
  let bestByExactMatch: string | null = null;
  let bestByDirectionMatch: string | null = null;
  let lowestAggressiveRate: string | null = null;

  let maxExact = -Infinity;
  let maxDirection = -Infinity;
  let minAggressive = Infinity;

  for (const r of regimes) {
    if (r.exactMatchRate !== null && r.exactMatchRate > maxExact) {
      maxExact = r.exactMatchRate;
      bestByExactMatch = r.policyVersionId;
    }
    if (r.directionMatchRate !== null && r.directionMatchRate > maxDirection) {
      maxDirection = r.directionMatchRate;
      bestByDirectionMatch = r.policyVersionId;
    }
    if (r.tooAggressiveRate !== null && r.tooAggressiveRate < minAggressive) {
      minAggressive = r.tooAggressiveRate;
      lowestAggressiveRate = r.policyVersionId;
    }
  }

  // Overall summary lines
  const summaryLines: string[] = [];

  if (regimes.length === 0) {
    summaryLines.push("No frozen predictions available for regime comparison.");
  } else if (regimes.length === 1) {
    const r = regimes[0];
    summaryLines.push(
      `Single policy regime observed: ${shortId(r.policyVersionId)} with ${r.totalPredictions} prediction${r.totalPredictions !== 1 ? "s" : ""}.`
    );
  } else {
    summaryLines.push(
      `${regimes.length} policy regimes observed across ${frozenRecords.length} frozen prediction${frozenRecords.length !== 1 ? "s" : ""}.`
    );

    if (bestByExactMatch) {
      const r = regimes.find((x) => x.policyVersionId === bestByExactMatch)!;
      summaryLines.push(
        `${shortId(bestByExactMatch)} retained the strongest exact-match rate (${r.exactMatchRate !== null ? `${Math.round(r.exactMatchRate * 100)}%` : "—"}).`
      );
    }

    if (bestByDirectionMatch && bestByDirectionMatch !== bestByExactMatch) {
      const r = regimes.find((x) => x.policyVersionId === bestByDirectionMatch)!;
      summaryLines.push(
        `${shortId(bestByDirectionMatch)} achieved the best direction-match rate (${r.directionMatchRate !== null ? `${Math.round(r.directionMatchRate * 100)}%` : "—"}).`
      );
    }

    if (lowestAggressiveRate) {
      const r = regimes.find((x) => x.policyVersionId === lowestAggressiveRate)!;
      summaryLines.push(
        `${shortId(lowestAggressiveRate)} produced the lowest over-aggressive rate (${r.tooAggressiveRate !== null ? `${Math.round(r.tooAggressiveRate * 100)}%` : "—"}).`
      );
    }

    // Append pairwise lines that describe significant changes
    for (const comp of pairwiseComparisons) {
      const significant = comp.summaryLines.filter(
        (l) => !l.includes("comparable") && !l.includes("unavailable") && !l.includes("No significant")
      );
      for (const line of significant.slice(0, 1)) {
        summaryLines.push(line);
      }
    }
  }

  return {
    regimes,
    pairwiseComparisons,
    bestByExactMatch,
    bestByDirectionMatch,
    lowestAggressiveRate,
    summaryLines,
  };
}
