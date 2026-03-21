/**
 * counterfactual_policy_bench.ts
 *
 * Deterministic counterfactual policy bench for NOMOS.
 *
 * Replays a set of saved audit runs across multiple frozen policy versions
 * and aggregates prediction accuracy and calibration metrics at dataset scale.
 *
 * Functions:
 *   runCounterfactualBench(request, auditRecords, frozenPolicies)
 *     Produces one PolicyBenchRunResult per (auditRecord × policyVersion) pair.
 *
 *   scoreBenchMetrics(runResults)
 *     Groups run results by policyVersionId and computes aggregate metrics.
 *
 *   buildPolicyBenchReport(request, runResults)
 *     Builds the full PolicyBenchReport: sorted metrics, best-in-class
 *     policy IDs, and deterministic summary lines.
 *
 * Historical context rule:
 *   For each replayed record at chronological position i, the audit context
 *   passed to replayUnderPolicy is all records at positions 0..i-1.
 *   This means every replay is informed by the same history that would have
 *   been available when that run originally occurred.
 *
 * Actual outcome derivation:
 *   "actual next" is the record immediately after position i.
 *   actualNextVariable: decisive variable of that record (null = LAWFUL).
 *   actualRiskDirection: "rising" when a violation occurred, "decreasing"
 *     when LAWFUL, null when no later record exists (unresolved).
 *
 * Calibration classes:
 *   "unresolved"      — no later record; outcome cannot be verified.
 *   "too_aggressive"  — predicted variable non-null but actual was LAWFUL.
 *   "too_weak"        — predicted null (no risk) but actual had a violation.
 *   "well_calibrated" — predicted and actual align (both null or exactMatch).
 *
 * Bench is analysis only. No policy is auto-promoted by bench results.
 * No LLM generation is used.
 */

import type { AuditRecord } from "./audit_types";
import type { FrozenPolicySnapshot } from "./policy_versioning_types";
import type {
  PolicyBenchRequest,
  PolicyBenchRunResult,
  PolicyBenchMetrics,
  PolicyBenchReport,
} from "./policy_bench_types";
import type { PolicyReplayRequest } from "./policy_replay_types";
import { replayUnderPolicy } from "./policy_replay";
import { extractDecisiveVariableOccurrences } from "./decisive_variable_trends";
import { INTENT_DOMAIN_MAP } from "./policy_routing_types";

/* =========================================================
   Internal helpers
   ========================================================= */

function sortChronologically(records: AuditRecord[]): AuditRecord[] {
  return [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Extracts the decisive variable from a single AuditRecord.
 * Returns null when the record has no payload or the payload is LAWFUL.
 */
function extractDecisiveVariable(record: AuditRecord): string | null {
  const occurrences = extractDecisiveVariableOccurrences([record]);
  return occurrences[0]?.decisiveVariable ?? null;
}

/**
 * Derives the actual risk direction from a next-record decisive variable.
 * Rising when a violation occurred, decreasing when LAWFUL.
 */
function deriveActualRiskDirection(
  nextVariable: string | null
): "decreasing" | "stable" | "rising" {
  return nextVariable !== null ? "rising" : "decreasing";
}

/**
 * Classifies a run result's calibration class from the prediction and outcome.
 */
function classifyCalibration(
  predictedVariable: string | null,
  actualNextVariable: string | null,
  hasNextRecord: boolean
): PolicyBenchRunResult["calibrationClass"] {
  if (!hasNextRecord) return "unresolved";
  if (predictedVariable !== null && actualNextVariable === null) return "too_aggressive";
  if (predictedVariable === null && actualNextVariable !== null) return "too_weak";
  return "well_calibrated";
}

/**
 * Returns true when the intent maps to the requested domain.
 * Always returns true when no domain filter is specified.
 */
function matchesDomain(
  intent: string,
  domain: PolicyBenchRequest["domain"]
): boolean {
  if (!domain) return true;
  const mapped = INTENT_DOMAIN_MAP[intent as keyof typeof INTENT_DOMAIN_MAP] ?? "generic";
  return mapped === domain;
}

function shortId(id: string): string {
  return id.length > 4 ? id.slice(4) : id;
}

/* =========================================================
   runCounterfactualBench
   ========================================================= */

/**
 * Core bench function: replays selected records under selected policies.
 *
 * Steps:
 *   1. Filter auditRecords to those in request.auditRecordIds (and matching
 *      request.domain if specified).
 *   2. Sort filtered records chronologically.
 *   3. For each record × policy pair:
 *      a. auditContext = all filtered records before this record (position < i).
 *      b. replayUnderPolicy with that context.
 *      c. Extract actualNextVariable from the record at position i+1.
 *      d. Compute exactMatch, directionMatch, calibrationClass.
 *   4. Return one PolicyBenchRunResult per pair.
 *
 * Does not mutate auditRecords, frozenPolicies, or any audit record.
 * Policies not found in frozenPolicies are skipped silently.
 */
export function runCounterfactualBench(
  request: PolicyBenchRequest,
  auditRecords: AuditRecord[],
  frozenPolicies: FrozenPolicySnapshot[]
): PolicyBenchRunResult[] {
  const idSet = new Set(request.auditRecordIds);

  // Filter and sort
  const filtered = sortChronologically(
    auditRecords.filter(
      (r) => idSet.has(r.id) && matchesDomain(r.intent, request.domain)
    )
  );

  // Resolve policies in request order
  const policies = request.policyVersionIds
    .map((id) => frozenPolicies.find((p) => p.policyVersionId === id))
    .filter((p): p is FrozenPolicySnapshot => p !== undefined);

  const results: PolicyBenchRunResult[] = [];

  for (let i = 0; i < filtered.length; i++) {
    const record = filtered[i]!;
    const auditContext = filtered.slice(0, i);
    const nextRecord = filtered[i + 1] ?? null;

    const actualNextVariable = nextRecord ? extractDecisiveVariable(nextRecord) : null;
    const hasNextRecord = nextRecord !== null;
    const actualRiskDirection = hasNextRecord
      ? deriveActualRiskDirection(actualNextVariable)
      : null;

    const replayRequest: PolicyReplayRequest = {
      canonicalDeclaration: record.canonicalDeclaration,
      intent: record.intent as PolicyReplayRequest["intent"],
      baselineAuditRecordId: record.id,
      replayPolicyVersionIds: policies.map((p) => p.policyVersionId),
    };

    for (const policy of policies) {
      const replayResult = replayUnderPolicy(replayRequest, policy, auditContext);

      const exactMatch = replayResult.predictedVariable === actualNextVariable;
      const directionMatch =
        actualRiskDirection !== null &&
        replayResult.riskDirection === actualRiskDirection;

      const calibrationClass = classifyCalibration(
        replayResult.predictedVariable,
        actualNextVariable,
        hasNextRecord
      );

      results.push({
        auditRecordId: record.id,
        policyVersionId: policy.policyVersionId,
        predictedVariable: replayResult.predictedVariable,
        confidence: replayResult.confidence,
        riskDirection: replayResult.riskDirection,
        actualNextVariable,
        actualRiskDirection,
        exactMatch,
        directionMatch,
        calibrationClass,
      });
    }
  }

  return results;
}

/* =========================================================
   scoreBenchMetrics
   ========================================================= */

/**
 * Groups run results by policyVersionId and computes aggregate metrics.
 *
 * Rates are computed over resolvedRuns (excluding "unresolved") except:
 *   - unresolvedRate is computed over totalRuns.
 *   - Confidence rates are computed over totalRuns.
 *
 * All rates are null when the denominator is 0.
 * Output order matches the order in which policy IDs first appear in runResults.
 */
export function scoreBenchMetrics(
  runResults: PolicyBenchRunResult[]
): PolicyBenchMetrics[] {
  // Preserve policy order of first appearance
  const policyOrder: string[] = [];
  const byPolicy = new Map<string, PolicyBenchRunResult[]>();

  for (const result of runResults) {
    if (!byPolicy.has(result.policyVersionId)) {
      policyOrder.push(result.policyVersionId);
      byPolicy.set(result.policyVersionId, []);
    }
    byPolicy.get(result.policyVersionId)!.push(result);
  }

  return policyOrder.map((policyVersionId) => {
    const runs = byPolicy.get(policyVersionId)!;
    const totalRuns = runs.length;
    const resolved = runs.filter((r) => r.calibrationClass !== "unresolved");
    const resolvedRuns = resolved.length;

    const rate = (n: number, d: number): number | null =>
      d === 0 ? null : n / d;

    const exactMatches = resolved.filter((r) => r.exactMatch).length;
    const directionMatches = resolved.filter((r) => r.directionMatch).length;
    const tooAggressive = resolved.filter((r) => r.calibrationClass === "too_aggressive").length;
    const tooWeak = resolved.filter((r) => r.calibrationClass === "too_weak").length;
    const unresolved = runs.filter((r) => r.calibrationClass === "unresolved").length;

    const lowConf = runs.filter((r) => r.confidence === "low").length;
    const modConf = runs.filter((r) => r.confidence === "moderate").length;
    const highConf = runs.filter((r) => r.confidence === "high").length;

    return {
      policyVersionId,
      totalRuns,
      resolvedRuns,
      exactMatchRate: rate(exactMatches, resolvedRuns),
      directionMatchRate: rate(directionMatches, resolvedRuns),
      tooAggressiveRate: rate(tooAggressive, resolvedRuns),
      tooWeakRate: rate(tooWeak, resolvedRuns),
      unresolvedRate: rate(unresolved, totalRuns),
      lowConfidenceRate: rate(lowConf, totalRuns),
      moderateConfidenceRate: rate(modConf, totalRuns),
      highConfidenceRate: rate(highConf, totalRuns),
    };
  });
}

/* =========================================================
   Best-in-class helpers
   ========================================================= */

function bestBy(
  metrics: PolicyBenchMetrics[],
  key: keyof PolicyBenchMetrics,
  direction: "max" | "min"
): string | null {
  const eligible = metrics.filter((m) => m[key] !== null && m[key] !== undefined);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, m) => {
    const bVal = best[key] as number;
    const mVal = m[key] as number;
    return direction === "max" ? (mVal > bVal ? m : best) : (mVal < bVal ? m : best);
  }).policyVersionId;
}

/* =========================================================
   Summary line builder
   ========================================================= */

function buildSummaryLines(
  request: PolicyBenchRequest,
  sortedMetrics: PolicyBenchMetrics[],
  bestByExactMatch: string | null,
  bestByDirectionMatch: string | null,
  lowestAggressiveRate: string | null,
  lowestUnresolvedRate: string | null
): string[] {
  const lines: string[] = [];
  const domainLabel = request.domain ?? "all domains";
  const totalRuns = request.auditRecordIds.length;
  const policyCount = request.policyVersionIds.length;

  lines.push(
    `Bench: ${totalRuns} run${totalRuns === 1 ? "" : "s"} × ${policyCount} polic${policyCount === 1 ? "y" : "ies"} across ${domainLabel}.`
  );

  if (sortedMetrics.length === 0) {
    lines.push("No results produced.");
    return lines;
  }

  if (bestByExactMatch) {
    const m = sortedMetrics.find((x) => x.policyVersionId === bestByExactMatch);
    const rate = m?.exactMatchRate != null ? ` (${(m.exactMatchRate * 100).toFixed(0)}%)` : "";
    lines.push(
      `Policy ${shortId(bestByExactMatch)} has the strongest exact-match rate across the selected ${domainLabel} runs${rate}.`
    );
  }

  if (bestByDirectionMatch && bestByDirectionMatch !== bestByExactMatch) {
    const m = sortedMetrics.find((x) => x.policyVersionId === bestByDirectionMatch);
    const rate = m?.directionMatchRate != null ? ` (${(m.directionMatchRate * 100).toFixed(0)}%)` : "";
    lines.push(
      `Policy ${shortId(bestByDirectionMatch)} leads on direction-match rate${rate}.`
    );
  }

  if (lowestAggressiveRate) {
    const m = sortedMetrics.find((x) => x.policyVersionId === lowestAggressiveRate);
    const rate = m?.tooAggressiveRate != null ? ` (${(m.tooAggressiveRate * 100).toFixed(0)}%)` : "";
    lines.push(
      `Policy ${shortId(lowestAggressiveRate)} shows the lowest over-aggressive forecast rate${rate}.`
    );
  }

  if (lowestUnresolvedRate) {
    const m = sortedMetrics.find((x) => x.policyVersionId === lowestUnresolvedRate);
    const rate = m?.unresolvedRate != null ? ` (${(m.unresolvedRate * 100).toFixed(0)}%)` : "";
    lines.push(
      `Policy ${shortId(lowestUnresolvedRate)} produces the lowest unresolved rate under shallow history${rate}.`
    );
  }

  // Confidence distribution note for each policy
  for (const m of sortedMetrics) {
    if (m.highConfidenceRate !== null && m.highConfidenceRate >= 0.5) {
      lines.push(
        `Policy ${shortId(m.policyVersionId)} is highly confident on ${(m.highConfidenceRate * 100).toFixed(0)}% of runs.`
      );
    } else if (m.lowConfidenceRate !== null && m.lowConfidenceRate >= 0.5) {
      lines.push(
        `Policy ${shortId(m.policyVersionId)} is low-confidence on ${(m.lowConfidenceRate * 100).toFixed(0)}% of runs — shallow history may be a factor.`
      );
    }
  }

  return lines;
}

/* =========================================================
   buildPolicyBenchReport
   ========================================================= */

/**
 * Builds the full PolicyBenchReport from run results.
 *
 * Steps:
 *   1. scoreBenchMetrics(runResults) → metrics per policy.
 *   2. Sort metricsByPolicy by exactMatchRate descending (nulls last).
 *   3. Compute best-in-class policy IDs.
 *   4. Build summary lines.
 *
 * Does not run any new replay — operates purely on runResults.
 * Does not mutate runResults or request.
 */
export function buildPolicyBenchReport(
  request: PolicyBenchRequest,
  runResults: PolicyBenchRunResult[]
): PolicyBenchReport {
  const rawMetrics = scoreBenchMetrics(runResults);

  // Sort by exactMatchRate descending, nulls last
  const metricsByPolicy = [...rawMetrics].sort((a, b) => {
    if (a.exactMatchRate === null && b.exactMatchRate === null) return 0;
    if (a.exactMatchRate === null) return 1;
    if (b.exactMatchRate === null) return -1;
    return b.exactMatchRate - a.exactMatchRate;
  });

  const bestByExactMatch = bestBy(metricsByPolicy, "exactMatchRate", "max");
  const bestByDirectionMatch = bestBy(metricsByPolicy, "directionMatchRate", "max");
  const lowestAggressiveRate = bestBy(metricsByPolicy, "tooAggressiveRate", "min");
  const lowestUnresolvedRate = bestBy(metricsByPolicy, "unresolvedRate", "min");

  const summaryLines = buildSummaryLines(
    request,
    metricsByPolicy,
    bestByExactMatch,
    bestByDirectionMatch,
    lowestAggressiveRate,
    lowestUnresolvedRate
  );

  return {
    request,
    metricsByPolicy,
    bestByExactMatch,
    bestByDirectionMatch,
    lowestAggressiveRate,
    lowestUnresolvedRate,
    summaryLines,
  };
}
