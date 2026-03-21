/**
 * health_index_traceability.ts
 *
 * Deterministic traceability functions for the NOMOS ecosystem health index.
 *
 * Functions:
 *   buildStabilityTrace              — trace for the stability component
 *   buildCalibrationQualityTrace     — trace for the calibration quality component
 *   buildGovernanceEffectivenessTrace — trace for the governance effectiveness component
 *   buildPolicyChurnTrace             — trace for the policy churn component
 *   buildEcosystemHealthTrace         — full trace covering all four components + overall
 *
 * Every trace exposes:
 *   - exact raw input values (null for missing inputs — never hidden)
 *   - exact formula with actual values substituted
 *   - weighted contribution to the overall score
 *   - contributing record IDs from the underlying audit trail
 *
 * All component weights match ecosystem_health_index.ts exactly.
 * No inputs are mutated.
 * No LLM generation is used.
 */

import type { EcosystemLoopSummary } from "./ecosystem_loop_types";
import type { GovernanceAuditRecord } from "./governance_audit_types";
import type { PredictionCalibrationReport } from "./calibration_types";
import type { GovernanceOutcomeReviewReport } from "./post_governance_review_types";
import type { EcosystemHealthIndex } from "./ecosystem_health_types";
import type {
  HealthComponentTrace,
  EcosystemHealthTrace,
} from "./health_trace_types";

/* =========================================================
   Explicit weights — must match ecosystem_health_index.ts
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

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number | null): string {
  if (n === null) return "null (unknown — default 0.5 used)";
  return n.toFixed(4);
}

function pct(n: number | null): string {
  if (n === null) return "n/a";
  return `${(n * 100).toFixed(1)}%`;
}

/* =========================================================
   buildStabilityTrace
   ========================================================= */

/**
 * Builds the full traceability record for the stability component.
 *
 * Formula traced:
 *   base = 50
 *   +25 if stabilizing
 *   -20 if drifting
 *   -15 if overcorrecting
 *   score = clamp(base + adjustments, 0, 100)
 *   weightedContribution = score × 0.35
 *
 * contributingRecordIds: the actionIds of all governance audit records
 * (these are the records whose outcomes determined the change flags).
 */
export function buildStabilityTrace(
  ecosystemLoopSummary: EcosystemLoopSummary,
  auditRecords: GovernanceAuditRecord[],
  finalScore: number
): HealthComponentTrace {
  const { stabilizing, drifting, overcorrecting } =
    ecosystemLoopSummary.ecosystemChangeSummary;

  const base = 50;
  const stabilizingAdj   = stabilizing    ? +25 : 0;
  const driftingAdj      = drifting       ? -20 : 0;
  const overcorrectingAdj = overcorrecting ? -15 : 0;
  const rawSum = base + stabilizingAdj + driftingAdj + overcorrectingAdj;

  const rawInputs: HealthComponentTrace["rawInputs"] = {
    base,
    stabilizing,
    drifting,
    overcorrecting,
    stabilizingAdjustment:   stabilizingAdj,
    driftingAdjustment:      driftingAdj,
    overcorrectingAdjustment: overcorrectingAdj,
    rawSum,
    clampedScore: finalScore,
  };

  const formulaLines: string[] = [
    "base = 50",
    `+25 if stabilizing = ${stabilizing}  → ${stabilizingAdj >= 0 ? "+" : ""}${stabilizingAdj}`,
    `-20 if drifting = ${drifting}         → ${driftingAdj >= 0 ? "+" : ""}${driftingAdj}`,
    `-15 if overcorrecting = ${overcorrecting}  → ${overcorrectingAdj >= 0 ? "+" : ""}${overcorrectingAdj}`,
    `rawSum = ${base} + ${stabilizingAdj} + ${driftingAdj} + ${overcorrectingAdj} = ${rawSum}`,
    `stability = clamp(${rawSum}, 0, 100) = ${finalScore}`,
    `weightedContribution = ${finalScore} × ${WEIGHTS.stability} = ${r2(finalScore * WEIGHTS.stability)}`,
  ];

  const contributingRecordIds = auditRecords.map((r) => r.actionId);

  const explanationLines: string[] = [];
  if (stabilizing) {
    explanationLines.push(
      `Stability boosted by +25 because the ecosystem is classified as stabilizing (met_expectations > did_not_meet among reviewed actions).`
    );
  }
  if (drifting) {
    explanationLines.push(
      `Stability reduced by -20 because the ecosystem is classified as drifting (did_not_meet ≥ met_expectations).`
    );
  }
  if (overcorrecting) {
    explanationLines.push(
      `Stability reduced by -15 because the ecosystem is classified as overcorrecting (multiple actions without improvement).`
    );
  }
  if (!stabilizing && !drifting && !overcorrecting) {
    if (auditRecords.length === 0) {
      explanationLines.push(
        "Stability is at the neutral baseline (50) — no governance actions have been recorded yet."
      );
    } else {
      explanationLines.push(
        "Stability is at the neutral baseline (50) — trajectory is not yet characterised."
      );
    }
  }
  if (contributingRecordIds.length === 0) {
    explanationLines.push(
      "No governance audit records contributed — stability reflects baseline score only."
    );
  } else {
    explanationLines.push(
      `${contributingRecordIds.length} governance action(s) in the audit trail contributed to trajectory classification.`
    );
  }

  return {
    component: "stability",
    rawInputs,
    formulaLines,
    weightedContribution: r2(finalScore * WEIGHTS.stability),
    contributingRecordIds,
    explanationLines,
  };
}

/* =========================================================
   buildCalibrationQualityTrace
   ========================================================= */

/**
 * Builds the full traceability record for the calibration quality component.
 *
 * Formula traced:
 *   exactMatchContrib    = (exactMatchRate ?? 0.5) × 50
 *   directionMatchContrib = (directionMatchRate ?? 0.5) × 25
 *   If resolvedPredictions > 0:
 *     unresolvedPenalty  = (unresolved / resolvedPredictions) × 20
 *     aggressivePenalty  = (too_aggressive / resolvedPredictions) × 10
 *     weakPenalty        = (too_weak / resolvedPredictions) × 5
 *   score = clamp(exactMatchContrib + directionMatchContrib
 *                 - unresolvedPenalty - aggressivePenalty - weakPenalty, 0, 100)
 *   weightedContribution = score × 0.25
 *
 * contributingRecordIds: sourceVersionIds from outcome records.
 */
export function buildCalibrationQualityTrace(
  calibrationReport: PredictionCalibrationReport,
  finalScore: number
): HealthComponentTrace {
  const {
    exactMatchRate,
    directionMatchRate,
    calibrationCounts,
    resolvedPredictions,
    totalPredictions,
    outcomes,
  } = calibrationReport;

  const noData =
    totalPredictions === 0 && resolvedPredictions === 0 && exactMatchRate === null;

  const exactMatchEffective   = exactMatchRate    ?? 0.5;
  const directionMatchEffective = directionMatchRate ?? 0.5;

  const exactMatchContrib     = exactMatchEffective   * 50;
  const directionMatchContrib = directionMatchEffective * 25;

  const unresolvedPenalty =
    resolvedPredictions > 0
      ? (calibrationCounts.unresolved    / resolvedPredictions) * 20
      : 0;
  const aggressivePenalty =
    resolvedPredictions > 0
      ? (calibrationCounts.too_aggressive / resolvedPredictions) * 10
      : 0;
  const weakPenalty =
    resolvedPredictions > 0
      ? (calibrationCounts.too_weak       / resolvedPredictions) * 5
      : 0;

  const rawSum =
    exactMatchContrib + directionMatchContrib -
    unresolvedPenalty - aggressivePenalty - weakPenalty;

  const rawInputs: HealthComponentTrace["rawInputs"] = {
    totalPredictions,
    resolvedPredictions,
    exactMatchRate: exactMatchRate ?? null,
    directiomMatchRate: directionMatchRate ?? null,
    exactMatchRateEffective: exactMatchEffective,
    directionMatchRateEffective: directionMatchEffective,
    calibrationCounts_unresolved:    calibrationCounts.unresolved,
    calibrationCounts_too_aggressive: calibrationCounts.too_aggressive,
    calibrationCounts_too_weak:      calibrationCounts.too_weak,
    exactMatchContrib:     r2(exactMatchContrib),
    directionMatchContrib: r2(directionMatchContrib),
    unresolvedPenalty:     r2(unresolvedPenalty),
    aggressivePenalty:     r2(aggressivePenalty),
    weakPenalty:           r2(weakPenalty),
    rawSum:                r2(rawSum),
    clampedScore: finalScore,
  };

  const formulaLines: string[] = noData
    ? [
        "totalPredictions = 0 AND resolvedPredictions = 0 AND exactMatchRate = null",
        "→ neutral baseline: calibrationQuality = 50",
        `weightedContribution = 50 × ${WEIGHTS.calibrationQuality} = ${r2(50 * WEIGHTS.calibrationQuality)}`,
      ]
    : [
        `exactMatchRate = ${fmt(exactMatchRate)}  (${exactMatchRate === null ? "null → default 0.5 used" : pct(exactMatchRate)})`,
        `directionMatchRate = ${fmt(directionMatchRate)}  (${directionMatchRate === null ? "null → default 0.5 used" : pct(directionMatchRate)})`,
        `exactMatchContrib    = ${exactMatchEffective.toFixed(4)} × 50 = ${r2(exactMatchContrib)}`,
        `directionMatchContrib = ${directionMatchEffective.toFixed(4)} × 25 = ${r2(directionMatchContrib)}`,
        resolvedPredictions > 0
          ? `unresolvedPenalty  = (${calibrationCounts.unresolved} / ${resolvedPredictions}) × 20 = ${r2(unresolvedPenalty)}`
          : `unresolvedPenalty  = 0  (resolvedPredictions = 0)`,
        resolvedPredictions > 0
          ? `aggressivePenalty  = (${calibrationCounts.too_aggressive} / ${resolvedPredictions}) × 10 = ${r2(aggressivePenalty)}`
          : `aggressivePenalty  = 0  (resolvedPredictions = 0)`,
        resolvedPredictions > 0
          ? `weakPenalty        = (${calibrationCounts.too_weak} / ${resolvedPredictions}) × 5 = ${r2(weakPenalty)}`
          : `weakPenalty        = 0  (resolvedPredictions = 0)`,
        `rawSum = ${r2(exactMatchContrib)} + ${r2(directionMatchContrib)} - ${r2(unresolvedPenalty)} - ${r2(aggressivePenalty)} - ${r2(weakPenalty)} = ${r2(rawSum)}`,
        `calibrationQuality = clamp(round(${r2(rawSum)}), 0, 100) = ${finalScore}`,
        `weightedContribution = ${finalScore} × ${WEIGHTS.calibrationQuality} = ${r2(finalScore * WEIGHTS.calibrationQuality)}`,
      ];

  const contributingRecordIds = outcomes.map((o) => o.sourceVersionId);

  const explanationLines: string[] = [];
  if (noData) {
    explanationLines.push(
      "Calibration quality scored at neutral baseline (50) — no prediction data available yet."
    );
  } else {
    if (exactMatchRate !== null) {
      explanationLines.push(
        `Exact-match rate is ${pct(exactMatchRate)}, contributing ${r2(exactMatchContrib)} points.`
      );
    } else {
      explanationLines.push(
        "Exact-match rate is unknown — default 0.5 used, contributing 25 points."
      );
    }
    if (unresolvedPenalty > 0) {
      explanationLines.push(
        `Unresolved prediction burden imposed a penalty of ${r2(unresolvedPenalty)} points.`
      );
    }
    if (aggressivePenalty > 0) {
      explanationLines.push(
        `Too-aggressive predictions imposed a penalty of ${r2(aggressivePenalty)} points.`
      );
    }
    if (weakPenalty > 0) {
      explanationLines.push(
        `Too-weak predictions imposed a penalty of ${r2(weakPenalty)} points.`
      );
    }
  }

  return {
    component: "calibrationQuality",
    rawInputs,
    formulaLines,
    weightedContribution: r2(finalScore * WEIGHTS.calibrationQuality),
    contributingRecordIds,
    explanationLines,
  };
}

/* =========================================================
   buildGovernanceEffectivenessTrace
   ========================================================= */

/**
 * Builds the full traceability record for the governance effectiveness component.
 *
 * Formula traced:
 *   If reviewableActions = 0 AND totalGovernanceActions = 0 → 50
 *   If reviewableActions = 0 AND totalGovernanceActions > 0  → 40
 *   Otherwise:
 *     metRate     = met_expectations / reviewableActions
 *     partialRate = partially_met    / reviewableActions
 *     score = clamp(100 × metRate + 50 × partialRate, 0, 100)
 *   weightedContribution = score × 0.25
 *
 * contributingRecordIds: actionIds from governance outcome reviews.
 */
export function buildGovernanceEffectivenessTrace(
  governanceOutcomeReviewReport: GovernanceOutcomeReviewReport,
  finalScore: number
): HealthComponentTrace {
  const {
    totalGovernanceActions,
    reviewableActions,
    outcomeCounts,
    reviews,
  } = governanceOutcomeReviewReport;

  const metRate     = reviewableActions > 0 ? outcomeCounts.met_expectations / reviewableActions : null;
  const partialRate = reviewableActions > 0 ? outcomeCounts.partially_met    / reviewableActions : null;
  const rawSum      = metRate !== null && partialRate !== null
    ? 100 * metRate + 50 * partialRate
    : null;

  const rawInputs: HealthComponentTrace["rawInputs"] = {
    totalGovernanceActions,
    reviewableActions,
    met_expectations:    outcomeCounts.met_expectations,
    partially_met:       outcomeCounts.partially_met,
    did_not_meet:        outcomeCounts.did_not_meet,
    insufficient_followup: outcomeCounts.insufficient_followup,
    metRate:    metRate    !== null ? r2(metRate)    : null,
    partialRate: partialRate !== null ? r2(partialRate) : null,
    rawSum: rawSum !== null ? r2(rawSum) : null,
    clampedScore: finalScore,
  };

  const formulaLines: string[] = [];

  if (reviewableActions === 0 && totalGovernanceActions === 0) {
    formulaLines.push(
      "reviewableActions = 0 AND totalGovernanceActions = 0",
      "→ neutral baseline: governanceEffectiveness = 50",
      `weightedContribution = 50 × ${WEIGHTS.governanceEffectiveness} = ${r2(50 * WEIGHTS.governanceEffectiveness)}`
    );
  } else if (reviewableActions === 0) {
    formulaLines.push(
      `reviewableActions = 0, totalGovernanceActions = ${totalGovernanceActions}`,
      "→ shallow evidence baseline: governanceEffectiveness = 40",
      `weightedContribution = 40 × ${WEIGHTS.governanceEffectiveness} = ${r2(40 * WEIGHTS.governanceEffectiveness)}`
    );
  } else {
    formulaLines.push(
      `reviewableActions = ${reviewableActions}`,
      `metRate     = ${outcomeCounts.met_expectations} / ${reviewableActions} = ${fmt(metRate)}`,
      `partialRate = ${outcomeCounts.partially_met}    / ${reviewableActions} = ${fmt(partialRate)}`,
      `did_not_meet = ${outcomeCounts.did_not_meet}  (no credit)`,
      `rawSum = 100 × ${fmt(metRate)} + 50 × ${fmt(partialRate)} = ${r2(rawSum!)}`,
      `governanceEffectiveness = clamp(round(${r2(rawSum!)}), 0, 100) = ${finalScore}`,
      `weightedContribution = ${finalScore} × ${WEIGHTS.governanceEffectiveness} = ${r2(finalScore * WEIGHTS.governanceEffectiveness)}`
    );
  }

  const contributingRecordIds = reviews.map((rv) => rv.actionId);

  const explanationLines: string[] = [];
  if (reviewableActions === 0 && totalGovernanceActions === 0) {
    explanationLines.push(
      "Governance effectiveness scored at neutral baseline — no governance actions have been recorded."
    );
  } else if (reviewableActions === 0) {
    explanationLines.push(
      `Governance effectiveness scored at shallow-evidence baseline (40) — ${totalGovernanceActions} action(s) exist but none have completed outcome reviews yet.`
    );
  } else {
    const metPct = Math.round((outcomeCounts.met_expectations / reviewableActions) * 100);
    explanationLines.push(
      `${metPct}% of reviewable governance actions met expectations (${outcomeCounts.met_expectations} of ${reviewableActions}).`
    );
    if (outcomeCounts.partially_met > 0) {
      explanationLines.push(
        `${outcomeCounts.partially_met} action(s) partially met expectations — each contributes 50 credit points.`
      );
    }
    if (outcomeCounts.did_not_meet > 0) {
      explanationLines.push(
        `${outcomeCounts.did_not_meet} action(s) did not meet expectations — these contributed 0 credit points.`
      );
    }
  }

  return {
    component: "governanceEffectiveness",
    rawInputs,
    formulaLines,
    weightedContribution: r2(finalScore * WEIGHTS.governanceEffectiveness),
    contributingRecordIds,
    explanationLines,
  };
}

/* =========================================================
   buildPolicyChurnTrace
   ========================================================= */

/**
 * Builds the full traceability record for the policy churn component.
 *
 * Formula traced:
 *   n = governanceAuditTrail.length
 *   churnBase = clamp(100 - n × 8, 0, 100)
 *   +15 if stabilizing
 *   -25 if overcorrecting
 *   -15 if drifting
 *   score = clamp(churnBase + adjustments, 0, 100)
 *   weightedContribution = score × 0.15
 *
 * contributingRecordIds: actionIds from governance audit records.
 */
export function buildPolicyChurnTrace(
  governanceAuditTrail: GovernanceAuditRecord[],
  ecosystemLoopSummary: EcosystemLoopSummary,
  finalScore: number
): HealthComponentTrace {
  const n = governanceAuditTrail.length;
  const { stabilizing, drifting, overcorrecting } =
    ecosystemLoopSummary.ecosystemChangeSummary;

  const churnBase         = Math.max(0, Math.min(100, 100 - n * 8));
  const stabilizingAdj    = stabilizing    ? +15 : 0;
  const overcorrectingAdj = overcorrecting ? -25 : 0;
  const driftingAdj       = drifting       ? -15 : 0;
  const rawSum = churnBase + stabilizingAdj + overcorrectingAdj + driftingAdj;

  const rawInputs: HealthComponentTrace["rawInputs"] = {
    n,
    churnBase,
    stabilizing,
    drifting,
    overcorrecting,
    stabilizingAdjustment:    stabilizingAdj,
    overcorrectingAdjustment: overcorrectingAdj,
    driftingAdjustment:       driftingAdj,
    rawSum,
    clampedScore: finalScore,
  };

  const formulaLines: string[] = [
    `n = ${n}  (total governance actions in audit trail)`,
    `churnBase = clamp(100 - ${n} × 8, 0, 100) = clamp(${100 - n * 8}, 0, 100) = ${churnBase}`,
    `+15 if stabilizing = ${stabilizing}    → ${stabilizingAdj >= 0 ? "+" : ""}${stabilizingAdj}`,
    `-25 if overcorrecting = ${overcorrecting}  → ${overcorrectingAdj >= 0 ? "+" : ""}${overcorrectingAdj}`,
    `-15 if drifting = ${drifting}           → ${driftingAdj >= 0 ? "+" : ""}${driftingAdj}`,
    `rawSum = ${churnBase} + ${stabilizingAdj} + ${overcorrectingAdj} + ${driftingAdj} = ${rawSum}`,
    `policyChurn = clamp(${rawSum}, 0, 100) = ${finalScore}`,
    `weightedContribution = ${finalScore} × ${WEIGHTS.policyChurn} = ${r2(finalScore * WEIGHTS.policyChurn)}`,
  ];

  const contributingRecordIds = governanceAuditTrail.map((r) => r.actionId);

  const explanationLines: string[] = [];
  if (n === 0) {
    explanationLines.push(
      "Policy churn scored near baseline (100 before trajectory adjustments) — no governance actions have been recorded."
    );
  } else {
    explanationLines.push(
      `${n} governance action(s) in the audit trail reduced the churn base by ${n * 8} points (n × 8 per action).`
    );
  }
  if (stabilizing) {
    explanationLines.push(
      "+15 bonus applied because the ecosystem is stabilizing — policy churn appears constructive."
    );
  }
  if (overcorrecting) {
    explanationLines.push(
      "-25 penalty applied because the ecosystem is overcorrecting — churn is not associated with improvement."
    );
  }
  if (drifting) {
    explanationLines.push(
      "-15 penalty applied because the ecosystem is drifting — policy churn has not arrested the decline."
    );
  }

  return {
    component: "policyChurn",
    rawInputs,
    formulaLines,
    weightedContribution: r2(finalScore * WEIGHTS.policyChurn),
    contributingRecordIds,
    explanationLines,
  };
}

/* =========================================================
   buildEcosystemHealthTrace
   ========================================================= */

/**
 * Builds the full EcosystemHealthTrace for a given EcosystemHealthIndex.
 *
 * Each component trace is built from the same inputs that produced the
 * healthIndex, using the finalScore values from the index itself to
 * guarantee the trace is perfectly consistent with the displayed score.
 *
 * No inputs are mutated.
 */
export function buildEcosystemHealthTrace(
  healthIndex: EcosystemHealthIndex,
  ecosystemLoopSummary: EcosystemLoopSummary,
  calibrationReport: PredictionCalibrationReport,
  governanceOutcomeReviewReport: GovernanceOutcomeReviewReport,
  governanceAuditTrail: GovernanceAuditRecord[]
): EcosystemHealthTrace {
  const { stability, calibrationQuality, governanceEffectiveness, policyChurn } =
    healthIndex.components;

  const stabilityTrace = buildStabilityTrace(
    ecosystemLoopSummary,
    governanceAuditTrail,
    stability
  );
  const calibrationTrace = buildCalibrationQualityTrace(
    calibrationReport,
    calibrationQuality
  );
  const governanceTrace = buildGovernanceEffectivenessTrace(
    governanceOutcomeReviewReport,
    governanceEffectiveness
  );
  const churnTrace = buildPolicyChurnTrace(
    governanceAuditTrail,
    ecosystemLoopSummary,
    policyChurn
  );

  const overallInputs: Record<string, number> = {
    stability,
    calibrationQuality,
    governanceEffectiveness,
    policyChurn,
    overall: healthIndex.overall,
  };

  const sc  = r2(stability               * WEIGHTS.stability);
  const cc  = r2(calibrationQuality      * WEIGHTS.calibrationQuality);
  const gc  = r2(governanceEffectiveness * WEIGHTS.governanceEffectiveness);
  const pc  = r2(policyChurn             * WEIGHTS.policyChurn);
  const sum = r2(sc + cc + gc + pc);

  const overallFormulaLines: string[] = [
    `overall = stability × ${WEIGHTS.stability}`,
    `        + calibrationQuality × ${WEIGHTS.calibrationQuality}`,
    `        + governanceEffectiveness × ${WEIGHTS.governanceEffectiveness}`,
    `        + policyChurn × ${WEIGHTS.policyChurn}`,
    `       = ${stability} × ${WEIGHTS.stability}  +  ${calibrationQuality} × ${WEIGHTS.calibrationQuality}  +  ${governanceEffectiveness} × ${WEIGHTS.governanceEffectiveness}  +  ${policyChurn} × ${WEIGHTS.policyChurn}`,
    `       = ${sc}  +  ${cc}  +  ${gc}  +  ${pc}`,
    `       = ${sum}`,
    `overall = clamp(round(${sum}), 0, 100) = ${healthIndex.overall}`,
  ];

  return {
    overallFormulaLines,
    overallInputs,
    componentTraces: [stabilityTrace, calibrationTrace, governanceTrace, churnTrace],
  };
}
