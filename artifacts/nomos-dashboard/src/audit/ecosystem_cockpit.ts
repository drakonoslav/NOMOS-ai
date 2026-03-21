/**
 * ecosystem_cockpit.ts
 *
 * Deterministic composition function for the NOMOS ecosystem cockpit.
 *
 * buildEcosystemCockpitSnapshot composes a single EcosystemCockpitSnapshot
 * from all NOMOS subsystems.
 *
 * Inputs:
 *   healthIndex       — EcosystemHealthIndex (health components)
 *   trendReport       — DecisiveVariableTrendReport (decisive-variable trends)
 *   failurePrediction — FailurePrediction (predicted failure mode)
 *   policySnapshot    — PredictionPolicySnapshot (active policy + biases)
 *   auditTrail        — GovernanceAuditRecord[] (governance history)
 *   crosswalk         — PlaybookDecisionCrosswalk | null (doctrine alignment)
 *   reviewReport      — GovernanceOutcomeReviewReport (governance outcomes)
 *   loopSummary       — EcosystemLoopSummary (ecosystem trajectory)
 *
 * No inputs are mutated.
 * No LLM generation is used.
 * The cockpit does not execute any governance action.
 */

import type { EcosystemHealthIndex } from "./ecosystem_health_types";
import type { DecisiveVariableTrendReport } from "./trend_types";
import type { FailurePrediction } from "./prediction_types";
import type { PredictionPolicySnapshot } from "./policy_visibility_types";
import type { GovernanceAuditRecord } from "./governance_audit_types";
import type { PlaybookDecisionCrosswalk } from "./playbook_crosswalk_types";
import type { GovernanceOutcomeReviewReport } from "./post_governance_review_types";
import type { EcosystemLoopSummary } from "./ecosystem_loop_types";
import type { EcosystemCockpitSnapshot } from "./cockpit_types";

/* =========================================================
   Drift state derivation
   ========================================================= */

function deriveDriftState(
  loopSummary: EcosystemLoopSummary
): EcosystemCockpitSnapshot["trends"]["driftState"] {
  const { stabilizing, drifting, overcorrecting } =
    loopSummary.ecosystemChangeSummary;

  if (stabilizing)    return "stabilizing";
  if (overcorrecting) return "overcorrecting";
  if (drifting)       return "drifting";
  return "stable";
}

/* =========================================================
   Dominant streak derivation
   ========================================================= */

function deriveDominantStreak(
  trendReport: DecisiveVariableTrendReport
): string | null {
  if (trendReport.variables.length === 0) return null;

  const top = [...trendReport.variables].sort(
    (a, b) => b.currentStreak - a.currentStreak
  )[0];

  return top.currentStreak >= 3 ? top.variable : null;
}

/* =========================================================
   Attention alert generation
   ========================================================= */

function buildAlerts(
  healthIndex: EcosystemHealthIndex,
  trendReport: DecisiveVariableTrendReport,
  failurePrediction: FailurePrediction,
  policySnapshot: PredictionPolicySnapshot,
  crosswalk: PlaybookDecisionCrosswalk | null,
  loopSummary: EcosystemLoopSummary
): string[] {
  const alerts: string[] = [];
  const { components } = healthIndex;

  // ── Health component cautions ─────────────────────────────────────────────

  if (components.stability < 25) {
    alerts.push("Stability is poor — ecosystem trajectory is deteriorating.");
  } else if (components.stability < 50) {
    alerts.push("Stability is fragile — governance outcomes are not yet improving.");
  }

  if (components.calibrationQuality < 25) {
    alerts.push("Calibration quality is poor — predictions are significantly off-target.");
  } else if (components.calibrationQuality < 50) {
    alerts.push("Calibration quality is fragile.");
  }

  if (components.governanceEffectiveness < 25) {
    alerts.push("Governance effectiveness is poor — most actions are not meeting expectations.");
  } else if (components.governanceEffectiveness < 50) {
    alerts.push("Governance effectiveness is fragile — outcome data is thin or underperforming.");
  }

  if (components.policyChurn < 25) {
    alerts.push("Policy churn is excessive — frequent changes are not associated with improvement.");
  }

  // ── Prediction alerts ─────────────────────────────────────────────────────

  if (failurePrediction.confidence === "low") {
    alerts.push("Prediction confidence is low due to shallow history.");
  }

  if (failurePrediction.riskDirection === "rising") {
    alerts.push("Prediction risk direction is rising — degradation mode may be intensifying.");
  }

  // ── Recurring violation streak ────────────────────────────────────────────

  const dominantStreak = deriveDominantStreak(trendReport);
  if (dominantStreak !== null) {
    const top = trendReport.variables.find((v) => v.variable === dominantStreak);
    if (top && top.currentStreak >= 3) {
      alerts.push(
        `"${top.variable}" has recurred in ${top.currentStreak} consecutive runs.`
      );
    }
  }

  // ── Governance churn ──────────────────────────────────────────────────────

  if (loopSummary.ecosystemChangeSummary.overcorrecting) {
    alerts.push("Recent governance churn may indicate overcorrection.");
  }

  // ── Doctrine pressure vs recommendation ──────────────────────────────────

  if (crosswalk !== null) {
    const supporting  = crosswalk.supportingHeuristics.length;
    const cautioning  = crosswalk.cautioningHeuristics.length;
    if (cautioning > supporting && (supporting + cautioning) > 0) {
      alerts.push(
        "Doctrine cautions outweigh supporting heuristics for the current recommendation."
      );
    }
  }

  // ── Unresolved prediction rate ────────────────────────────────────────────

  const { totalPredictions, resolvedPredictions } = policySnapshot.calibrationState;
  if (totalPredictions > 0) {
    const unresolved = totalPredictions - resolvedPredictions;
    const unresolvedRate = unresolved / totalPredictions;
    if (unresolvedRate > 0.3) {
      alerts.push(
        `High unresolved prediction rate — ${Math.round(unresolvedRate * 100)}% of predictions lack outcomes.`
      );
    }
  }

  return alerts;
}

/* =========================================================
   buildEcosystemCockpitSnapshot
   ========================================================= */

/**
 * Composes a read-first operational snapshot of the full NOMOS ecosystem.
 *
 * All fields are derived deterministically from the provided subsystem
 * reports.  Nothing is generated, inferred, or mutated.
 */
export function buildEcosystemCockpitSnapshot(
  healthIndex: EcosystemHealthIndex,
  trendReport: DecisiveVariableTrendReport,
  failurePrediction: FailurePrediction,
  policySnapshot: PredictionPolicySnapshot,
  auditTrail: GovernanceAuditRecord[],
  crosswalk: PlaybookDecisionCrosswalk | null,
  reviewReport: GovernanceOutcomeReviewReport,
  loopSummary: EcosystemLoopSummary
): EcosystemCockpitSnapshot {
  // ── Health ────────────────────────────────────────────────────────────────

  const health: EcosystemCockpitSnapshot["health"] = {
    overall:               healthIndex.overall,
    band:                  healthIndex.band,
    stability:             healthIndex.components.stability,
    calibrationQuality:    healthIndex.components.calibrationQuality,
    governanceEffectiveness: healthIndex.components.governanceEffectiveness,
    policyChurn:           healthIndex.components.policyChurn,
  };

  // ── Trends ────────────────────────────────────────────────────────────────

  const trends: EcosystemCockpitSnapshot["trends"] = {
    mostFrequentVariable: trendReport.driftSummary.mostFrequentVariable,
    mostRecentVariable:   trendReport.driftSummary.mostRecentVariable,
    currentDominantStreak: deriveDominantStreak(trendReport),
    driftState:           deriveDriftState(loopSummary),
  };

  // ── Prediction ────────────────────────────────────────────────────────────

  const topSignalVariable = failurePrediction.signals[0]?.variable ?? null;
  const topSignal =
    topSignalVariable ??
    (failurePrediction.explanationLines.length > 0
      ? failurePrediction.explanationLines[0]
      : null);

  const prediction: EcosystemCockpitSnapshot["prediction"] = {
    predictedVariable: failurePrediction.predictedVariable,
    confidence:        failurePrediction.confidence,
    riskDirection:     failurePrediction.riskDirection,
    topSignal,
  };

  // ── Governance ────────────────────────────────────────────────────────────

  const latestAudit = auditTrail.length > 0 ? auditTrail[auditTrail.length - 1] : null;
  const latestReview =
    reviewReport.reviews.length > 0
      ? reviewReport.reviews[reviewReport.reviews.length - 1]
      : null;

  const governance: EcosystemCockpitSnapshot["governance"] = {
    activeDomainPolicy:     latestAudit?.chosenPolicyVersionId ?? null,
    latestRecommendation:   latestAudit?.recommendedPolicyVersionId ?? null,
    latestOutcomeClass:     latestReview?.outcomeClass ?? null,
    recentGovernanceAction: latestAudit?.action ?? null,
  };

  // ── Policy ────────────────────────────────────────────────────────────────

  const { boundedAdjustmentState } = policySnapshot;
  const policy: EcosystemCockpitSnapshot["policy"] = {
    policyVersionId:   policySnapshot.policyVersion,
    confidenceBias:    boundedAdjustmentState.confidenceBias,
    escalationBias:    boundedAdjustmentState.escalationBias,
    uncertaintyBias:   boundedAdjustmentState.uncertaintyBias,
    calibrationWindow: boundedAdjustmentState.calibrationWindow,
  };

  // ── Doctrine ──────────────────────────────────────────────────────────────

  const supportingCount = crosswalk?.supportingHeuristics.length ?? 0;
  const cautioningCount = crosswalk?.cautioningHeuristics.length ?? 0;

  const mostRelevantHeuristic =
    crosswalk !== null
      ? (crosswalk.supportingHeuristics[0]?.title ??
         crosswalk.cautioningHeuristics[0]?.title ??
         null)
      : null;

  const doctrine: EcosystemCockpitSnapshot["doctrine"] = {
    supportingCount,
    cautioningCount,
    mostRelevantHeuristic,
  };

  // ── Attention ─────────────────────────────────────────────────────────────

  const alerts = buildAlerts(
    healthIndex,
    trendReport,
    failurePrediction,
    policySnapshot,
    crosswalk,
    loopSummary
  );

  const attention: EcosystemCockpitSnapshot["attention"] = { alerts };

  return {
    health,
    trends,
    prediction,
    governance,
    policy,
    doctrine,
    attention,
  };
}
