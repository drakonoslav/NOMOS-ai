/**
 * policy_bench_types.ts
 *
 * Canonical types for the NOMOS counterfactual policy bench.
 *
 * The bench replays a set of saved audit runs across multiple frozen
 * policy versions and aggregates prediction metrics at dataset scale.
 *
 * Bench rules:
 *   - Each selected audit record is replayed under each selected policy.
 *   - Same canonical declaration and same historical context for every policy.
 *   - Replayed predictions are compared to the actual next outcome when available.
 *   - Aggregation is per policy version across all selected records.
 *
 * Bench is analysis only. No policy is auto-promoted by bench results.
 * No LLM generation is used.
 */

/**
 * Input specification for a bench run.
 *
 * auditRecordIds:   IDs of audit records to replay. Each is replayed under
 *   every policy in policyVersionIds.
 * policyVersionIds: frozen policy version IDs to bench against.
 * domain:           optional filter — only records whose intent maps to this
 *   domain are included. Null / undefined = no filter.
 */
export interface PolicyBenchRequest {
  auditRecordIds: string[];
  policyVersionIds: string[];
  domain?: "nutrition" | "training" | "schedule" | "generic" | null;
}

/**
 * The result of replaying one audit record under one frozen policy.
 *
 * actualNextVariable:   the decisive variable of the next chronological
 *   audit record (the ground-truth outcome). Null when no later record exists.
 * actualRiskDirection:  derived from the next record's violation status.
 *   Null when no later record exists (cannot verify).
 *
 * exactMatch:       predictedVariable === actualNextVariable (null ≡ null).
 * directionMatch:   riskDirection === actualRiskDirection when both are non-null.
 *
 * calibrationClass:
 *   "well_calibrated" — predicted and actual agree (exact or both null).
 *   "too_aggressive"  — predicted violation but actual was LAWFUL.
 *   "too_weak"        — predicted nothing but actual had a violation.
 *   "unresolved"      — no later record; outcome cannot be verified.
 */
export interface PolicyBenchRunResult {
  auditRecordId: string;
  policyVersionId: string;

  predictedVariable: string | null;
  confidence: "low" | "moderate" | "high";
  riskDirection: "decreasing" | "stable" | "rising";

  actualNextVariable: string | null;
  actualRiskDirection: "decreasing" | "stable" | "rising" | null;

  exactMatch: boolean;
  directionMatch: boolean;

  calibrationClass:
    | "well_calibrated"
    | "too_aggressive"
    | "too_weak"
    | "unresolved";
}

/**
 * Aggregated metrics for a single policy version across all bench runs.
 *
 * totalRuns:          number of audit records replayed under this policy.
 * resolvedRuns:       records with a verifiable actual outcome (not "unresolved").
 *
 * exactMatchRate:     exact matches / resolvedRuns. Null when resolvedRuns = 0.
 * directionMatchRate: direction matches / resolvedRuns. Null when resolvedRuns = 0.
 * tooAggressiveRate:  too_aggressive / resolvedRuns. Null when resolvedRuns = 0.
 * tooWeakRate:        too_weak / resolvedRuns. Null when resolvedRuns = 0.
 * unresolvedRate:     unresolved / totalRuns. Null when totalRuns = 0.
 *
 * lowConfidenceRate / moderateConfidenceRate / highConfidenceRate:
 *   fraction of totalRuns at each confidence tier. Null when totalRuns = 0.
 */
export interface PolicyBenchMetrics {
  policyVersionId: string;

  totalRuns: number;
  resolvedRuns: number;

  exactMatchRate: number | null;
  directionMatchRate: number | null;

  tooAggressiveRate: number | null;
  tooWeakRate: number | null;
  unresolvedRate: number | null;

  lowConfidenceRate: number | null;
  moderateConfidenceRate: number | null;
  highConfidenceRate: number | null;
}

/**
 * Full bench report for one PolicyBenchRequest.
 *
 * metricsByPolicy:      one PolicyBenchMetrics per policy, ordered by
 *   exactMatchRate descending (nulls last).
 *
 * bestByExactMatch:     policyVersionId with the highest exactMatchRate.
 *   Null when no resolved runs exist.
 * bestByDirectionMatch: policyVersionId with the highest directionMatchRate.
 * lowestAggressiveRate: policyVersionId with the lowest tooAggressiveRate.
 * lowestUnresolvedRate: policyVersionId with the lowest unresolvedRate.
 *
 * summaryLines:         deterministic narrative of the bench results.
 */
export interface PolicyBenchReport {
  request: PolicyBenchRequest;
  metricsByPolicy: PolicyBenchMetrics[];
  bestByExactMatch: string | null;
  bestByDirectionMatch: string | null;
  lowestAggressiveRate: string | null;
  lowestUnresolvedRate: string | null;
  summaryLines: string[];
}
