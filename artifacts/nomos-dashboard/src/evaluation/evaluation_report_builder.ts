/**
 * evaluation_report_builder.ts
 *
 * Builds an OverallEvaluationReport from the nomos-core API response and
 * dashboard compiled constraints.
 *
 * The builder is the single source of truth for all evaluation state.
 * The UI must read from the report fields — not from reason strings.
 *
 * Satisfaction inference (documented limitation):
 *   The NOMOS API returns per-candidate aggregated results, not per-constraint.
 *   Satisfaction status is inferred as follows:
 *     - LAWFUL candidate      → all constraints "satisfied"
 *     - DEGRADED/INVALID candidate:
 *       - The constraint whose compiled decisiveVariable best matches the
 *         candidate's API decisiveVariable → "violated"
 *       - INTERPRETATION_REQUIRED constraints → "not_evaluated"
 *       - All others → "satisfied"
 *   This is an approximation. Multiple violated constraints are possible but
 *   only one can be identified with certainty from the aggregate result.
 */

import type { EvaluationResult, CandidateEvaluation } from "../ui/evaluation/eval_types";
import type { CompiledConstraint } from "../compiler/constraint_compiler";
import type {
  CandidateEvaluationReport,
  CandidateVerdict,
  ConstraintEvaluationRecord,
  ConstraintKindLabel,
  EvaluationMethod,
  OverallEvaluationReport,
} from "./evaluation_report_types";
import {
  generateClassificationSummary,
  generateSatisfactionSummary,
  generateVerdictSummary,
  resolveReportDecisiveVariable,
} from "./evaluation_report_summaries";
import { assertEvaluationReportInvariants } from "./evaluation_report_invariants";

/* =========================================================
   Entry point
   ========================================================= */

export function buildOverallEvaluationReport(
  result: EvaluationResult,
  compiledConstraints: CompiledConstraint[]
): OverallEvaluationReport {
  const candidates: CandidateEvaluationReport[] = result.candidateEvaluations.map((e) =>
    buildCandidateReport(e, compiledConstraints)
  );

  const overallStatus = verdictFromStatus(result.overallStatus);

  const lawfulCandidateIds = candidates
    .filter((c) => c.verdict === "lawful")
    .map((c) => c.candidateId);

  const evaluationMethod = resolveEvaluationMethod(compiledConstraints);

  const totals = computeTotals(candidates, compiledConstraints);

  // Use the global decisive variable from the worst candidate
  const globalDecisive = resolveGlobalDecisiveVariable(result, candidates);

  const report: OverallEvaluationReport = {
    evaluationMethod,
    overallStatus,
    lawfulCandidateIds,
    strongestMargin: result.strongestMarginScore ?? null,
    decisiveVariable: globalDecisive,
    candidates,
    totals,
    notes: [],
  };

  // Notes generated from fields — never from prose
  report.notes = buildNotes(report);

  // Invariant check — logs but does not throw in production
  assertEvaluationReportInvariants(report);

  return report;
}

/* =========================================================
   Per-candidate report
   ========================================================= */

function buildCandidateReport(
  candidate: CandidateEvaluation,
  compiledConstraints: CompiledConstraint[]
): CandidateEvaluationReport {
  const verdict = verdictFromStatus(candidate.status);
  const constraintEvaluations = buildConstraintRecords(candidate, compiledConstraints);

  const constraintsTotal                      = constraintEvaluations.length;
  const constraintsDeterministicallyClassified = constraintEvaluations.filter(
    (r) => r.classificationStatus === "deterministic"
  ).length;
  const constraintsInterpretationRequired      = constraintEvaluations.filter(
    (r) => r.classificationStatus === "interpretation_required"
  ).length;
  const constraintsSatisfied                   = constraintEvaluations.filter(
    (r) => r.satisfactionStatus === "satisfied"
  ).length;
  const constraintsViolated                    = constraintEvaluations.filter(
    (r) => r.satisfactionStatus === "violated"
  ).length;
  const constraintsNotEvaluated                = constraintEvaluations.filter(
    (r) => r.satisfactionStatus === "not_evaluated"
  ).length;

  const report: CandidateEvaluationReport = {
    candidateId: candidate.id,
    candidateLabel: `Candidate ${candidate.id}`,
    verdict,
    decisiveVariable: candidate.decisiveVariable,
    margin: candidate.marginScore,
    marginLabel: candidate.marginLabel ?? null,
    constraintsTotal,
    constraintsDeterministicallyClassified,
    constraintsInterpretationRequired,
    constraintsSatisfied,
    constraintsViolated,
    constraintsNotEvaluated,
    constraintEvaluations,
    summaryReason: "",
    adjustments: [],
    // Pass through algebra-level trace if provided by the evaluation source
    decisiveConstraintTrace: candidate.decisiveConstraintTrace ?? null,
  };

  // Decisive variable — from highest-priority violated constraint, or the first
  // compiled constraint when the API returns the "constraint interpretation" sentinel.
  const rawApiDecisive = candidate.decisiveVariable;
  const resolvedFromRecords = resolveReportDecisiveVariable(report);
  if (resolvedFromRecords && resolvedFromRecords !== rawApiDecisive) {
    report.decisiveVariable = resolvedFromRecords;
  } else if (
    rawApiDecisive.toLowerCase() === "constraint interpretation" &&
    compiledConstraints.length > 0
  ) {
    const first = compiledConstraints.find((c) => c.kind !== "INTERPRETATION_REQUIRED");
    report.decisiveVariable = first?.decisiveVariable ?? rawApiDecisive;
  } else {
    report.decisiveVariable = resolvedFromRecords ?? rawApiDecisive;
  }

  // summaryReason — from typed records, not from raw merged reason string
  report.summaryReason = buildCandidateSummaryReason(report, candidate.reason);

  // Adjustments — from violated constraints only
  report.adjustments = buildCandidateAdjustments(constraintEvaluations);

  return report;
}

/* =========================================================
   Per-constraint records
   ========================================================= */

function buildConstraintRecords(
  candidate: CandidateEvaluation,
  compiledConstraints: CompiledConstraint[]
): ConstraintEvaluationRecord[] {
  const apiDecisive = candidate.decisiveVariable.toLowerCase();
  const candidateIsViolated = candidate.status !== "LAWFUL";

  // Find which compiled constraint is the "decisive" one for a violated candidate
  const decisiveIndex = candidateIsViolated
    ? findDecisiveConstraintIndex(apiDecisive, compiledConstraints)
    : -1;

  return compiledConstraints.map((c, idx) => {
    const isInterpretation = c.kind === "INTERPRETATION_REQUIRED";
    const classificationStatus = isInterpretation ? "interpretation_required" : "deterministic";

    let satisfactionStatus: "satisfied" | "violated" | "not_evaluated";
    if (!candidateIsViolated) {
      satisfactionStatus = "satisfied";
    } else if (isInterpretation) {
      satisfactionStatus = "not_evaluated";
    } else if (idx === decisiveIndex) {
      satisfactionStatus = "violated";
    } else {
      satisfactionStatus = "satisfied";
    }

    const variableName = resolveVariableName(c.decisiveVariable ?? null);
    const violationLabel = satisfactionStatus === "violated" && variableName
      ? `${variableName} violation`
      : null;

    const record: ConstraintEvaluationRecord = {
      constraintId: `${c.kind}:${c.key ?? idx}`,
      rawText: c.raw,
      classificationStatus,
      satisfactionStatus,
      constraintKind: kindLabel(c.kind),
      key: c.key ?? null,
      operator: c.operator ?? null,
      variableName,
      violationLabel,
      decisiveVariable: satisfactionStatus === "violated" ? violationLabel : variableName,
      lhsSummary: c.lhs ?? null,
      rhsSummary: c.rhs ?? null,
      reason: satisfactionStatus === "violated"
        ? buildViolationReason(c)
        : satisfactionStatus === "not_evaluated"
          ? "Could not be evaluated — constraint requires manual review."
          : buildSatisfactionReason(c),
      adjustment: satisfactionStatus === "violated" ? buildViolationAdjustment(c) : null,
    };

    return record;
  });
}

/* =========================================================
   Decisive constraint matching
   ========================================================= */

/**
 * Finds the index of the compiled constraint whose decisiveVariable best
 * matches the API candidate's decisiveVariable.
 *
 * The API returns e.g. "protein placement" while the compiler has
 * "protein placement violation". We match using a bidirectional startsWith
 * after lowercasing both.
 */
function findDecisiveConstraintIndex(
  apiDecisive: string,
  compiledConstraints: CompiledConstraint[]
): number {
  const normalizedApi = apiDecisive.replace(/ violation$/i, "").trim();

  let bestIdx = -1;
  let bestScore = -1;

  compiledConstraints.forEach((c, idx) => {
    if (c.kind === "INTERPRETATION_REQUIRED") return;
    const dv = (c.decisiveVariable ?? "").toLowerCase().replace(/ violation$/i, "").trim();
    if (!dv) return;

    let score = 0;
    if (dv === normalizedApi) score = 3;
    else if (dv.startsWith(normalizedApi) || normalizedApi.startsWith(dv)) score = 2;
    else if (dv.includes(normalizedApi) || normalizedApi.includes(dv)) score = 1;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });

  return bestIdx;
}

/* =========================================================
   Reason and adjustment builders
   ========================================================= */

function buildCandidateSummaryReason(
  report: CandidateEvaluationReport,
  rawApiReason: string
): string {
  // Strip any stale fallback residue from the API reason
  const FALLBACK_SIGNALS = [
    "could not be deterministically classified",
    "evaluation requires manual review",
    "manual review (not deterministically classifiable)",
  ];

  const typed = rawApiReason
    .split(" Additionally: ")
    .map((c) => c.trim())
    .filter((c) => {
      const lower = c.toLowerCase();
      return !FALLBACK_SIGNALS.some((sig) => lower.includes(sig));
    })
    .filter(Boolean);

  if (report.constraintsViolated > 0) {
    // Lead with the violated constraint reason
    const violatedReasons = report.constraintEvaluations
      .filter((r) => r.satisfactionStatus === "violated")
      .map((r) => r.reason)
      .filter(Boolean);

    const combined = [...new Set([...violatedReasons, ...typed])];
    return combined.join(" ") || "Constraint violation detected.";
  }

  if (typed.length > 0) return typed.join(" ");

  if (report.constraintsSatisfied === report.constraintsTotal && report.constraintsTotal > 0) {
    return "All declared constraints satisfied.";
  }

  return "Evaluated deterministically.";
}

function buildCandidateAdjustments(records: ConstraintEvaluationRecord[]): string[] {
  const violated = records.filter((r) => r.satisfactionStatus === "violated" && r.adjustment);
  const seen = new Set<string>();
  return violated
    .map((r) => r.adjustment!)
    .filter((a) => {
      const key = a.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Strips the " violation" suffix from a raw decisiveVariable string.
 *
 * decisiveVariable values from the engine must be variable names, not violation
 * labels. This helper is a safety net for any legacy data that accidentally
 * includes the suffix, ensuring reason text always reads "protein placement"
 * rather than "protein placement violation".
 *
 * INVARIANT: The returned string must never contain the word "violation".
 */
function resolveVariableName(raw: string | null): string | null {
  if (!raw) return null;
  return raw.replace(/ violation$/i, "").trim() || null;
}

function buildViolationReason(c: CompiledConstraint): string {
  const variableName = resolveVariableName(c.decisiveVariable ?? null) ?? "constraint";
  switch (c.kind) {
    case "STRUCTURAL_LOCK":
      return `Structural lock violated: ${variableName} differs from declared baseline.`;
    case "ALLOWED_ACTION":
      return `Allowed-action boundary violated: ${variableName} exceeded declared scope.`;
    case "TARGET_TOLERANCE":
      return `Target tolerance exceeded: ${variableName} diverged beyond declared limit.`;
    case "SOURCE_TRUTH":
      return `Source-truth constraint violated: ${variableName} references undeclared data.`;
    default:
      return `Constraint violated: ${variableName}.`;
  }
}

function buildSatisfactionReason(c: CompiledConstraint): string {
  const variableName = resolveVariableName(c.decisiveVariable ?? null) ?? "constraint";
  switch (c.kind) {
    case "STRUCTURAL_LOCK":
      return `Structural lock satisfied: ${variableName} preserved.`;
    case "ALLOWED_ACTION":
      return `Allowed-action scope satisfied: ${variableName} within declared boundary.`;
    case "TARGET_TOLERANCE":
      return `Target tolerance satisfied: ${variableName} within declared limit.`;
    case "SOURCE_TRUTH":
      return `Source-truth constraint satisfied: ${variableName} uses declared data.`;
    default:
      return `Constraint satisfied.`;
  }
}

function buildViolationAdjustment(c: CompiledConstraint): string {
  const variableName = resolveVariableName(c.decisiveVariable ?? null) ?? "the constrained structure";
  switch (c.kind) {
    case "STRUCTURAL_LOCK":
      return `Restore ${variableName} to its declared state.`;
    case "ALLOWED_ACTION":
      return `Restrict action to the declared scope for ${variableName}.`;
    case "TARGET_TOLERANCE":
      return `Reduce ${variableName} to within the declared tolerance.`;
    case "SOURCE_TRUTH":
      return `Use only declared source data for ${variableName}.`;
    default:
      return `Review constraint: ${c.raw.slice(0, 80)}.`;
  }
}

/* =========================================================
   Helpers
   ========================================================= */

function verdictFromStatus(
  status: "LAWFUL" | "DEGRADED" | "INVALID"
): CandidateVerdict {
  switch (status) {
    case "LAWFUL":   return "lawful";
    case "DEGRADED": return "degraded";
    case "INVALID":  return "invalid";
  }
}

function kindLabel(kind: string): ConstraintKindLabel {
  switch (kind) {
    case "STRUCTURAL_LOCK":       return "STRUCTURAL_LOCK";
    case "ALLOWED_ACTION":        return "ALLOWED_ACTION";
    case "TARGET_TOLERANCE":      return "TARGET_TOLERANCE";
    case "SOURCE_TRUTH":          return "SOURCE_TRUTH";
    default:                      return "INTERPRETATION_REQUIRED";
  }
}

function resolveEvaluationMethod(compiledConstraints: CompiledConstraint[]): EvaluationMethod {
  const hasInterpretation = compiledConstraints.some((c) => c.kind === "INTERPRETATION_REQUIRED");
  const hasDeterministic  = compiledConstraints.some((c) => c.kind !== "INTERPRETATION_REQUIRED");

  if (hasInterpretation && hasDeterministic) return "hybrid";
  if (hasInterpretation)                      return "semantic";
  return "deterministic";
}

function resolveGlobalDecisiveVariable(
  result: EvaluationResult,
  candidates: CandidateEvaluationReport[]
): string | null {
  // Prefer from the worst-status candidate
  const worst =
    candidates.find((c) => c.verdict === "invalid") ??
    candidates.find((c) => c.verdict === "degraded") ??
    candidates.find((c) => c.verdict === "lawful");

  return worst?.decisiveVariable ?? result.decisiveVariable ?? null;
}

function computeTotals(
  candidates: CandidateEvaluationReport[],
  compiledConstraints: CompiledConstraint[]
): OverallEvaluationReport["totals"] {
  // Classification totals are per unique constraint (not per candidate)
  const constraintsTotal =
    compiledConstraints.length;
  const constraintsDeterministicallyClassified =
    compiledConstraints.filter((c) => c.kind !== "INTERPRETATION_REQUIRED").length;
  const constraintsInterpretationRequired =
    compiledConstraints.filter((c) => c.kind === "INTERPRETATION_REQUIRED").length;

  // Satisfaction totals are summed across all candidates × constraints
  let constraintsSatisfied   = 0;
  let constraintsViolated    = 0;
  let constraintsNotEvaluated = 0;

  for (const candidate of candidates) {
    constraintsSatisfied    += candidate.constraintsSatisfied;
    constraintsViolated     += candidate.constraintsViolated;
    constraintsNotEvaluated += candidate.constraintsNotEvaluated;
  }

  return {
    candidatesEvaluated: candidates.length,
    constraintsTotal,
    constraintsDeterministicallyClassified,
    constraintsInterpretationRequired,
    constraintsSatisfied,
    constraintsViolated,
    constraintsNotEvaluated,
  };
}

function buildNotes(report: OverallEvaluationReport): string[] {
  return [
    generateClassificationSummary(report),
    generateSatisfactionSummary(report),
    generateVerdictSummary(report),
  ].filter(Boolean);
}
