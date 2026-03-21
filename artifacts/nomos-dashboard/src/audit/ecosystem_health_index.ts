/**
 * ecosystem_health_index.ts
 *
 * Deterministic functions for the NOMOS ecosystem health index.
 *
 * Functions:
 *   scoreStability              — stability score (0–100)
 *   scoreCalibrationQuality     — calibration quality score (0–100)
 *   scoreGovernanceEffectiveness — governance effectiveness score (0–100)
 *   scorePolicyChurn             — policy churn score (0–100, higher = healthier)
 *   buildEcosystemHealthIndex    — full composite health index
 *
 * Weights (explicit — no hidden heuristics):
 *   stability:              0.35
 *   calibrationQuality:     0.25
 *   governanceEffectiveness: 0.25
 *   policyChurn:            0.15
 *
 * All component scores are clamped to [0, 100] before weighting.
 * The overall score is also clamped to [0, 100].
 *
 * No LLM generation is used.
 * No inputs are mutated.
 * This layer is advisory and read-only.
 */

import type { EcosystemLoopSummary } from "./ecosystem_loop_types";
import type { GovernanceAuditRecord } from "./governance_audit_types";
import type { PredictionCalibrationReport } from "./calibration_types";
import type { GovernanceOutcomeReviewReport } from "./post_governance_review_types";
import type {
  EcosystemHealthComponents,
  EcosystemHealthIndex,
} from "./ecosystem_health_types";

/* =========================================================
   Explicit component weights
   ========================================================= */

const WEIGHTS = {
  stability:               0.35,
  calibrationQuality:      0.25,
  governanceEffectiveness: 0.25,
  policyChurn:             0.15,
} as const;

/* =========================================================
   Utility
   ========================================================= */

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round(n: number): number {
  return Math.round(n);
}

function bandFor(overall: number): EcosystemHealthIndex["band"] {
  if (overall < 25) return "poor";
  if (overall < 50) return "fragile";
  if (overall < 75) return "stable";
  return "strong";
}

/* =========================================================
   scoreStability
   ========================================================= */

/**
 * Stability score (0–100).
 *
 * Formula:
 *   base:              50  (neutral — reflects unknown trajectory)
 *   +25 if stabilizing
 *   -20 if drifting
 *   -15 if overcorrecting
 *   (flags are not mutually exclusive; penalties are additive)
 *   Clamped to [0, 100].
 *
 * Rationale: stabilizing is the strongest positive signal. Drifting and
 * overcorrecting both reduce confidence in the system trajectory.
 */
export function scoreStability(
  ecosystemLoopSummary: EcosystemLoopSummary,
  _auditRecords: GovernanceAuditRecord[]
): number {
  const { stabilizing, drifting, overcorrecting } =
    ecosystemLoopSummary.ecosystemChangeSummary;

  let score = 50;
  if (stabilizing)    score += 25;
  if (drifting)       score -= 20;
  if (overcorrecting) score -= 15;

  return clamp(round(score), 0, 100);
}

/* =========================================================
   scoreCalibrationQuality
   ========================================================= */

/**
 * Calibration quality score (0–100).
 *
 * Formula (from PredictionCalibrationReport):
 *
 *   exactMatchContrib    = (exactMatchRate ?? 0.5) * 50
 *   directionMatchContrib = (directionMatchRate ?? 0.5) * 25
 *
 *   If resolvedPredictions > 0:
 *     unresolvedPenalty  = (unresolved / resolvedPredictions) * 20
 *     aggressivePenalty  = (too_aggressive / resolvedPredictions) * 10
 *     weakPenalty        = (too_weak / resolvedPredictions) * 5
 *   else: all penalties = 0
 *
 *   score = exactMatchContrib + directionMatchContrib
 *           - unresolvedPenalty - aggressivePenalty - weakPenalty
 *
 *   Clamped to [0, 100].
 *
 * Default of 0.5 for null rates reflects "unknown — assume mid-range".
 * Penalties are proportional to resolved predictions so they scale correctly.
 */
export function scoreCalibrationQuality(
  calibrationReport: PredictionCalibrationReport
): number {
  const {
    exactMatchRate,
    directionMatchRate,
    calibrationCounts,
    resolvedPredictions,
    totalPredictions,
  } = calibrationReport;

  // No data — return neutral baseline
  if (totalPredictions === 0 && resolvedPredictions === 0 && exactMatchRate === null) return 50;

  const exactMatchContrib     = (exactMatchRate    ?? 0.5) * 50;
  const directionMatchContrib = (directionMatchRate ?? 0.5) * 25;

  let unresolvedPenalty  = 0;
  let aggressivePenalty  = 0;
  let weakPenalty        = 0;

  if (resolvedPredictions > 0) {
    unresolvedPenalty = (calibrationCounts.unresolved   / resolvedPredictions) * 20;
    aggressivePenalty = (calibrationCounts.too_aggressive / resolvedPredictions) * 10;
    weakPenalty       = (calibrationCounts.too_weak      / resolvedPredictions) * 5;
  }

  const score =
    exactMatchContrib +
    directionMatchContrib -
    unresolvedPenalty -
    aggressivePenalty -
    weakPenalty;

  return clamp(round(score), 0, 100);
}

/* =========================================================
   scoreGovernanceEffectiveness
   ========================================================= */

/**
 * Governance effectiveness score (0–100).
 *
 * Formula (from GovernanceOutcomeReviewReport):
 *
 *   If reviewableActions = 0 AND totalGovernanceActions = 0:
 *     → 50 (neutral — no governance history)
 *   If reviewableActions = 0 AND totalGovernanceActions > 0:
 *     → 40 (governance has occurred but no outcome data yet)
 *
 *   Otherwise:
 *     metRate     = met_expectations / reviewableActions
 *     partialRate = partially_met    / reviewableActions
 *
 *     score = 100 * metRate + 50 * partialRate
 *
 *   Clamped to [0, 100].
 *
 * Rationale:
 *   met_expectations = full credit (100).
 *   partially_met    = half credit (50).
 *   did_not_meet     = no credit (0).
 *   insufficient_followup = not included in reviewableActions.
 */
export function scoreGovernanceEffectiveness(
  governanceOutcomeReviewReport: GovernanceOutcomeReviewReport
): number {
  const {
    totalGovernanceActions,
    reviewableActions,
    outcomeCounts,
  } = governanceOutcomeReviewReport;

  if (reviewableActions === 0) {
    return totalGovernanceActions === 0 ? 50 : 40;
  }

  const metRate     = outcomeCounts.met_expectations / reviewableActions;
  const partialRate = outcomeCounts.partially_met    / reviewableActions;

  const score = 100 * metRate + 50 * partialRate;
  return clamp(round(score), 0, 100);
}

/* =========================================================
   scorePolicyChurn
   ========================================================= */

/**
 * Policy churn score (0–100), where HIGHER = HEALTHIER (less harmful churn).
 *
 * Formula:
 *   n = governanceAuditTrail.length
 *
 *   churnBase = clamp(100 - n * 8, 0, 100)
 *     n=0  → 100  (no churn at all)
 *     n=5  → 60
 *     n=10 → 20
 *     n=12+→ 0 (fully penalised)
 *
 *   Trajectory adjustments (additive):
 *     +15 if stabilizing  (churn is associated with improvement)
 *     -25 if overcorrecting (churn is not helping)
 *     -15 if drifting      (churn is not helping)
 *
 *   Clamped to [0, 100].
 */
export function scorePolicyChurn(
  governanceAuditTrail: GovernanceAuditRecord[],
  ecosystemLoopSummary: EcosystemLoopSummary
): number {
  const n = governanceAuditTrail.length;
  const { stabilizing, drifting, overcorrecting } =
    ecosystemLoopSummary.ecosystemChangeSummary;

  let score = clamp(100 - n * 8, 0, 100);
  if (stabilizing)    score += 15;
  if (overcorrecting) score -= 25;
  if (drifting)       score -= 15;

  return clamp(round(score), 0, 100);
}

/* =========================================================
   Explanation and caution line builders
   ========================================================= */

function buildExplanationLines(
  components: EcosystemHealthComponents,
  ecosystemLoopSummary: EcosystemLoopSummary,
  calibrationReport: PredictionCalibrationReport,
  reviewReport: GovernanceOutcomeReviewReport
): string[] {
  const lines: string[] = [];
  const { stabilizing, drifting, overcorrecting } =
    ecosystemLoopSummary.ecosystemChangeSummary;

  // Stability
  const sBand = bandFor(components.stability * 1);
  if (stabilizing) {
    lines.push(
      `Stability is ${sBand} — governance outcomes are improving and the system appears to be stabilizing.`
    );
  } else if (overcorrecting) {
    lines.push(
      `Stability is ${sBand} — repeated policy changes without improvement suggest overcorrection.`
    );
  } else if (drifting) {
    lines.push(
      `Stability is ${sBand} — recurring failures suggest the system is drifting away from lawful outcomes.`
    );
  } else {
    lines.push(
      `Stability is ${sBand} — insufficient outcome data to characterise the trajectory with confidence.`
    );
  }

  // Calibration quality
  const cBand = bandFor(components.calibrationQuality * 1);
  const exactMatch = calibrationReport.exactMatchRate;
  if (exactMatch !== null) {
    const pct = Math.round(exactMatch * 100);
    lines.push(
      `Calibration quality is ${cBand} — exact-match rate is ${pct}%` +
        (calibrationReport.calibrationCounts.unresolved > 0
          ? ` with unresolved prediction burden.`
          : `.`)
    );
  } else {
    lines.push(
      `Calibration quality is ${cBand} — no resolved prediction data is available yet.`
    );
  }

  // Governance effectiveness
  const gBand = bandFor(components.governanceEffectiveness * 1);
  if (reviewReport.reviewableActions === 0) {
    lines.push(
      `Governance effectiveness is ${gBand} — no reviewable governance actions yet.`
    );
  } else {
    const metPct = Math.round(
      (reviewReport.outcomeCounts.met_expectations / reviewReport.reviewableActions) * 100
    );
    lines.push(
      `Governance effectiveness is ${gBand} — ${metPct}% of reviewable actions met expectations.`
    );
  }

  // Policy churn
  const pBand = bandFor(components.policyChurn * 1);
  const actionCount = ecosystemLoopSummary.totalGovernanceActions;
  if (actionCount === 0) {
    lines.push(
      `Policy churn is ${pBand} — no governance actions have been recorded (no harmful churn).`
    );
  } else if (overcorrecting) {
    lines.push(
      `Policy churn is ${pBand} — ${actionCount} governance action(s) without a met-expectations outcome suggests churn without gain.`
    );
  } else if (stabilizing) {
    lines.push(
      `Policy churn is ${pBand} — policy changes appear to be contributing to stabilization.`
    );
  } else {
    lines.push(
      `Policy churn is ${pBand} — ${actionCount} governance action(s) recorded; trajectory is not yet clear.`
    );
  }

  return lines;
}

function buildCautionLines(
  components: EcosystemHealthComponents,
  overall: number
): string[] {
  const lines: string[] = [];

  if (overall < 25) {
    lines.push(
      "Overall ecosystem health is in the poor range — all components should be reviewed urgently."
    );
  } else if (overall < 50) {
    lines.push(
      "Overall ecosystem health is fragile — multiple components need attention."
    );
  }

  if (components.stability < 40) {
    lines.push(
      "Stability is low — the system trajectory is unclear or worsening. Review governance outcomes."
    );
  }

  if (components.calibrationQuality < 40) {
    lines.push(
      "Calibration quality is low — prediction accuracy may be insufficient to support reliable governance recommendations."
    );
  }

  if (components.governanceEffectiveness < 40) {
    lines.push(
      "Governance effectiveness is low — recent policy actions are not delivering expected outcomes."
    );
  }

  if (components.policyChurn < 40) {
    lines.push(
      "Policy churn is high — frequent governance actions without clear gains may indicate overcorrection."
    );
  }

  return lines;
}

/* =========================================================
   buildEcosystemHealthIndex
   ========================================================= */

/**
 * Builds the full EcosystemHealthIndex.
 *
 * Parameters:
 *   ecosystemLoopSummary         — top-level ecosystem loop summary.
 *   calibrationReport            — prediction calibration report.
 *   governanceOutcomeReviewReport — governance outcome review report.
 *   governanceAuditTrail         — raw governance audit records.
 *
 * Weights (explicit):
 *   stability:               0.35
 *   calibrationQuality:      0.25
 *   governanceEffectiveness: 0.25
 *   policyChurn:             0.15
 *
 * No inputs are mutated.
 */
export function buildEcosystemHealthIndex(
  ecosystemLoopSummary: EcosystemLoopSummary,
  calibrationReport: PredictionCalibrationReport,
  governanceOutcomeReviewReport: GovernanceOutcomeReviewReport,
  governanceAuditTrail: GovernanceAuditRecord[]
): EcosystemHealthIndex {
  const stability = scoreStability(ecosystemLoopSummary, governanceAuditTrail);
  const calibrationQuality = scoreCalibrationQuality(calibrationReport);
  const governanceEffectiveness = scoreGovernanceEffectiveness(
    governanceOutcomeReviewReport
  );
  const policyChurn = scorePolicyChurn(governanceAuditTrail, ecosystemLoopSummary);

  const components: EcosystemHealthComponents = {
    stability,
    calibrationQuality,
    governanceEffectiveness,
    policyChurn,
  };

  const rawOverall =
    stability               * WEIGHTS.stability +
    calibrationQuality      * WEIGHTS.calibrationQuality +
    governanceEffectiveness * WEIGHTS.governanceEffectiveness +
    policyChurn             * WEIGHTS.policyChurn;

  const overall = clamp(round(rawOverall), 0, 100);
  const band    = bandFor(overall);

  const explanationLines = buildExplanationLines(
    components,
    ecosystemLoopSummary,
    calibrationReport,
    governanceOutcomeReviewReport
  );

  const cautionLines = buildCautionLines(components, overall);

  return {
    overall,
    band,
    components,
    explanationLines,
    cautionLines,
  };
}
