/**
 * policy_replay.ts
 *
 * Deterministic run replay under alternate frozen policies for NOMOS.
 *
 * Functions:
 *   replayUnderPolicy(request, frozenPolicySnapshot, auditContext)
 *     Runs the base prediction on auditContext, then applies the frozen
 *     policy snapshot's adjustment biases to produce a policy-specific
 *     PolicyReplayResult.
 *
 *   diffReplayResults(results)
 *     Identifies which fields differ across a set of PolicyReplayResult
 *     objects. Returns the field names that are not uniform.
 *
 *   buildPolicyReplayComparison(request, frozenPolicies, auditContext)
 *     Replays the request under each frozen policy, diffs the results,
 *     and produces a PolicyReplayComparison with summary lines.
 *
 * Replay invariants:
 *   - Same canonical declaration for every replay in a comparison.
 *   - Same audit context for every replay.
 *   - Only the frozen policy snapshot changes.
 *   - Historical audit records are never mutated.
 *   - Replay is experimental analysis only, not active governance.
 *
 * Confidence bias application:
 *   confidenceBias >  0.3  → upgrade one level (low→moderate, moderate→high)
 *   confidenceBias < -0.3  → downgrade one level (high→moderate, moderate→low)
 *   otherwise              → keep base confidence
 *
 * Risk direction bias application:
 *   escalationBias >  0.3  → "rising"
 *   escalationBias < -0.3  → "decreasing"
 *   otherwise              → keep base risk direction
 *
 * No LLM generation is used.
 */

import type { AuditRecord } from "./audit_types";
import type { FrozenPolicySnapshot } from "./policy_versioning_types";
import type {
  PolicyReplayRequest,
  PolicyReplayResult,
  PolicyReplayComparison,
} from "./policy_replay_types";
import {
  buildFailureSignals,
  pickPredictedVariable,
  classifyPredictionConfidence,
  classifyRiskDirection,
} from "./failure_prediction";
import {
  extractDecisiveVariableOccurrences,
  buildDecisiveVariableTrends,
  buildDriftSummary,
} from "./decisive_variable_trends";

/* =========================================================
   Deterministic hash (djb2)
   ========================================================= */

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash;
}

function canonicalHash(declaration: string): string {
  return `cdh-${djb2(declaration).toString(16).padStart(8, "0")}`;
}

/* =========================================================
   Bias application helpers
   ========================================================= */

function applyConfidenceBias(
  base: "low" | "moderate" | "high",
  bias: number
): "low" | "moderate" | "high" {
  if (bias > 0.3) {
    if (base === "low") return "moderate";
    if (base === "moderate") return "high";
    return "high";
  }
  if (bias < -0.3) {
    if (base === "high") return "moderate";
    if (base === "moderate") return "low";
    return "low";
  }
  return base;
}

function applyEscalationBias(
  base: "decreasing" | "stable" | "rising",
  bias: number
): "decreasing" | "stable" | "rising" {
  if (bias > 0.3) return "rising";
  if (bias < -0.3) return "decreasing";
  return base;
}

/* =========================================================
   replayUnderPolicy
   ========================================================= */

/**
 * Replays a canonical declaration under a single frozen policy snapshot.
 *
 * Data flow:
 *   1. Extract occurrences + trends + driftSummary from auditContext.
 *   2. Build signals → pickPredictedVariable (same for every policy).
 *   3. classifyPredictionConfidence → apply frozen policy's confidenceBias.
 *   4. classifyRiskDirection → apply frozen policy's escalationBias.
 *   5. Build explanationLines from snapshot + replay-specific context.
 *
 * The predictedVariable is always derived from audit history (signals),
 * not from the policy — only confidence and riskDirection are modulated.
 *
 * Does not mutate the frozenPolicySnapshot or any auditContext record.
 */
export function replayUnderPolicy(
  request: PolicyReplayRequest,
  frozenPolicySnapshot: FrozenPolicySnapshot,
  auditContext: AuditRecord[]
): PolicyReplayResult {
  // Base prediction signals — same regardless of policy
  const occurrences = extractDecisiveVariableOccurrences(auditContext);
  const trends = buildDecisiveVariableTrends(occurrences);
  const driftSummary = buildDriftSummary(trends, occurrences);
  const signals = buildFailureSignals(auditContext);

  const predictedVariable = pickPredictedVariable(signals);
  const baseConfidence = classifyPredictionConfidence(signals, auditContext.length);
  const baseRiskDirection = classifyRiskDirection(occurrences, driftSummary);

  // Apply frozen policy biases
  const { confidenceBias, escalationBias } = frozenPolicySnapshot.boundedAdjustmentState;
  const confidence = applyConfidenceBias(baseConfidence, confidenceBias);
  const riskDirection = applyEscalationBias(baseRiskDirection, escalationBias);

  // Explanation lines: policy explanation + replay context
  const explanationLines: string[] = [...frozenPolicySnapshot.explanationLines];

  explanationLines.push(
    `Replayed under policy ${frozenPolicySnapshot.policyVersionId} with calibration window ${frozenPolicySnapshot.calibrationWindow}.`
  );

  if (Math.abs(confidenceBias) > 0.3) {
    const direction = confidenceBias > 0 ? "upgraded" : "downgraded";
    explanationLines.push(
      `Confidence ${direction} from ${baseConfidence} to ${confidence} by policy confidence bias (${confidenceBias > 0 ? "+" : ""}${confidenceBias.toFixed(2)}).`
    );
  }

  if (Math.abs(escalationBias) > 0.3) {
    const direction = escalationBias > 0 ? "elevated to rising" : "reduced to decreasing";
    explanationLines.push(
      `Risk direction ${direction} by policy escalation bias (${escalationBias > 0 ? "+" : ""}${escalationBias.toFixed(2)}).`
    );
  }

  return {
    policyVersionId: frozenPolicySnapshot.policyVersionId,
    predictedVariable,
    confidence,
    riskDirection,
    explanationLines,
  };
}

/* =========================================================
   diffReplayResults
   ========================================================= */

/**
 * Identifies which fields differ across a set of replay results.
 *
 * Returns a sorted array of field names from:
 *   ["predictedVariable", "confidence", "riskDirection", "explanationLines"]
 *
 * A field is "differing" when its value is not identical across all results.
 * For explanationLines, differing means line counts differ.
 *
 * Empty when results has 0 or 1 entry, or when all values are uniform.
 */
export function diffReplayResults(results: PolicyReplayResult[]): string[] {
  if (results.length < 2) return [];

  const differing: string[] = [];

  // predictedVariable
  const firstVar = results[0]!.predictedVariable;
  if (!results.every((r) => r.predictedVariable === firstVar)) {
    differing.push("predictedVariable");
  }

  // confidence
  const firstConf = results[0]!.confidence;
  if (!results.every((r) => r.confidence === firstConf)) {
    differing.push("confidence");
  }

  // riskDirection
  const firstDir = results[0]!.riskDirection;
  if (!results.every((r) => r.riskDirection === firstDir)) {
    differing.push("riskDirection");
  }

  // explanationLines (compare by line count — proxy for content change)
  const firstLineCount = results[0]!.explanationLines.length;
  if (!results.every((r) => r.explanationLines.length === firstLineCount)) {
    differing.push("explanationLines");
  }

  return differing;
}

/* =========================================================
   Summary line builders
   ========================================================= */

function shortId(id: string): string {
  return id.length > 4 ? id.slice(4) : id;
}

function buildSummaryLines(
  results: PolicyReplayResult[],
  differingFields: string[]
): string[] {
  const lines: string[] = [];

  if (results.length === 0) {
    lines.push("No policies replayed.");
    return lines;
  }

  if (results.length === 1) {
    const r = results[0]!;
    lines.push(
      `Single-policy replay under ${shortId(r.policyVersionId)}: ` +
      `${r.predictedVariable ?? "no prediction"}, confidence ${r.confidence}, direction ${r.riskDirection}.`
    );
    return lines;
  }

  lines.push(
    `${results.length} policies replayed on the same canonical declaration and audit context.`
  );

  if (differingFields.length === 0) {
    lines.push("All policies produced identical outputs — no divergence detected.");
  } else {
    lines.push(`Diverging fields: ${differingFields.join(", ")}.`);
  }

  // predictedVariable — note if it changed
  if (differingFields.includes("predictedVariable")) {
    const vars = results.map((r) => `${shortId(r.policyVersionId)}: ${r.predictedVariable ?? "null"}`);
    lines.push(`Predicted variable: ${vars.join(" | ")}.`);
  } else if (results[0]!.predictedVariable) {
    lines.push(`Predicted variable unchanged across all policies: ${results[0]!.predictedVariable}.`);
  }

  // confidence
  if (differingFields.includes("confidence")) {
    const confs = results.map((r) => `${shortId(r.policyVersionId)}: ${r.confidence}`);
    lines.push(`Confidence: ${confs.join(" | ")}.`);
  }

  // riskDirection
  if (differingFields.includes("riskDirection")) {
    const dirs = results.map((r) => `${shortId(r.policyVersionId)}: ${r.riskDirection}`);
    lines.push(`Risk direction: ${dirs.join(" | ")}.`);
  }

  return lines;
}

/* =========================================================
   buildPolicyReplayComparison
   ========================================================= */

/**
 * Builds a complete cross-policy comparison for a single canonical declaration.
 *
 * Steps:
 *   1. Replay under each frozen policy in frozenPolicies (order preserved).
 *   2. Diff the results.
 *   3. Build summary lines.
 *   4. Compute canonicalDeclarationHash.
 *
 * Does not mutate the request, frozenPolicies, or auditContext.
 * Frozen policies not in request.replayPolicyVersionIds are skipped.
 */
export function buildPolicyReplayComparison(
  request: PolicyReplayRequest,
  frozenPolicies: FrozenPolicySnapshot[],
  auditContext: AuditRecord[]
): PolicyReplayComparison {
  const hash = canonicalHash(request.canonicalDeclaration);

  // Only replay policies in the request's version ID list, in order
  const orderedPolicies = request.replayPolicyVersionIds
    .map((id) => frozenPolicies.find((p) => p.policyVersionId === id))
    .filter((p): p is FrozenPolicySnapshot => p !== undefined);

  const results: PolicyReplayResult[] = orderedPolicies.map((snapshot) =>
    replayUnderPolicy(request, snapshot, auditContext)
  );

  const differingFields = diffReplayResults(results);
  const summaryLines = buildSummaryLines(results, differingFields);

  return {
    canonicalDeclarationHash: hash,
    results,
    differingFields,
    summaryLines,
  };
}
