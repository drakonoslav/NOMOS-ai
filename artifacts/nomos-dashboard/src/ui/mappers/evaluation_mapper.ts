/**
 * evaluation_mapper.ts
 *
 * Maps EvaluationResult (engine output) to EvaluationResultViewModel (UI input).
 *
 * Architecture:
 *   EvaluationResult + CompiledConstraint[]
 *     → buildOverallEvaluationReport()   [evaluation_report_builder.ts]
 *     → assertEvaluationReportInvariants()  [evaluation_report_invariants.ts]
 *     → mapReportToViewModel()            [this file]
 *     → EvaluationResultViewModel         [used by React components]
 *
 * The report schema enforces strict separation between:
 *   - classificationStatus (deterministic vs interpretation_required)
 *   - satisfactionStatus   (satisfied vs violated vs not_evaluated)
 *   - verdict              (lawful vs degraded vs invalid)
 *
 * The UI renders from typed fields on the report — never from prose inference.
 *
 * Inspection log (dev only):
 *   Each evaluation emits a collapsed console group showing the report fields
 *   so the pipeline is fully traceable.
 *
 * mapCandidateEvaluation() is retained as a standalone function for unit tests
 * that operate at the candidate level without a full report.
 */

import type {
  CandidateEvaluation,
  EvaluationResult,
} from "../evaluation/eval_types";
import type {
  CandidateEvaluationCardViewModel,
  EvaluationResultViewModel,
  UiCandidateStatus,
  UiMarginLabel,
} from "./evaluation_view_models";
import type { CompiledConstraint } from "../../compiler/constraint_compiler";
import {
  unresolvedConstraintCount,
} from "../../compiler/constraint_compiler";
import { buildOverallEvaluationReport } from "../../evaluation/evaluation_report_builder";
import type { CandidateEvaluationReport, OverallEvaluationReport } from "../../evaluation/evaluation_report_types";

/* =========================================================
   Main entry point — routes through OverallEvaluationReport
   ========================================================= */

export function mapEvaluationResultToViewModel(
  result: EvaluationResult,
  compiledConstraints?: CompiledConstraint[]
): EvaluationResultViewModel {
  // Build the formal report (invariants asserted inside)
  const report = buildOverallEvaluationReport(result, compiledConstraints ?? []);

  // Notes: API metadata first, then the three canonical summaries
  const notes: string[] = [
    ...(result.notes ?? []),
    ...report.notes,
  ];

  const candidateCards: CandidateEvaluationCardViewModel[] = report.candidates.map((c) =>
    mapReportCandidateToCard(c)
  );

  // Per-candidate diagnostic — always fires for the first candidate
  if (report.candidates.length > 0) {
    diagnoseCandidatePipeline(
      result.candidateEvaluations[0]!,
      compiledConstraints ?? [],
      report.candidates[0]!,
      candidateCards[0]!
    );
  }

  const vm: EvaluationResultViewModel = {
    overallStatus: toUiStatus(report.overallStatus),
    overallStatusLabel: toUiStatus(report.overallStatus),
    overallToneClassName: toToneClassName(toUiStatus(report.overallStatus)),
    lawfulSetLabel:
      report.lawfulCandidateIds.length > 0
        ? report.lawfulCandidateIds.join(", ")
        : "None",
    decisiveVariable: cleanPhrase(report.decisiveVariable ?? undefined),
    bestCandidateId: result.bestCandidateId ?? undefined,
    strongestMarginScore:
      report.strongestMargin !== null
        ? formatScore(report.strongestMargin)
        : undefined,
    weakestAdmissibleMarginScore:
      result.weakestAdmissibleMarginScore !== undefined
        ? formatScore(result.weakestAdmissibleMarginScore)
        : undefined,
    candidateCards,
    notes,
  };

  logEvaluationInspection(report, vm);

  return vm;
}

/* =========================================================
   Per-candidate mapping from report fields
   ========================================================= */

function mapReportCandidateToCard(
  candidate: CandidateEvaluationReport
): CandidateEvaluationCardViewModel {
  const uiStatus = toUiStatus(candidate.verdict);

  return {
    id: candidate.candidateId,
    title: candidate.candidateLabel,
    status: uiStatus,
    statusLabel: uiStatus,
    toneClassName: toToneClassName(uiStatus),
    decisiveVariable: cleanPhrase(candidate.decisiveVariable ?? undefined),
    marginScore: formatScore(candidate.margin ?? 0),
    marginLabel: marginLabelFromScore(candidate.margin ?? 0) as UiMarginLabel,
    reason: cleanPhrase(candidate.summaryReason) ?? "",
    adjustments: candidate.adjustments.map((a) => cleanPhrase(a) ?? a),
    trace: candidate.decisiveConstraintTrace ?? null,
  };
}

/* =========================================================
   mapCandidateEvaluation — standalone for unit tests
   Does NOT use the report schema. Retained for backward compatibility.
   ========================================================= */

export function mapCandidateEvaluation(
  evaluation: CandidateEvaluation,
  compiledConstraints?: CompiledConstraint[],
  allDeterministic?: boolean
): CandidateEvaluationCardViewModel {
  const deterministic = allDeterministic ??
    (compiledConstraints ? unresolvedConstraintCount(compiledConstraints) === 0 : false);

  const decisiveVariable =
    compiledConstraints && evaluation.decisiveVariable === "constraint interpretation"
      ? fallbackResolveDecisiveVariable(compiledConstraints)
      : evaluation.decisiveVariable;

  const rawReason = deduplicateReasonString(evaluation.reason, deterministic);
  const sanitizedAdjustments = sanitizeAdjustments(
    evaluation.adjustments ?? [],
    deterministic
  );

  return {
    id: evaluation.id,
    title: `Candidate ${evaluation.id}`,
    status: evaluation.status as UiCandidateStatus,
    statusLabel: evaluation.status as UiCandidateStatus,
    toneClassName: toToneClassName(evaluation.status as UiCandidateStatus),
    decisiveVariable: cleanPhrase(decisiveVariable),
    marginScore: formatScore(evaluation.marginScore),
    marginLabel: evaluation.marginLabel as UiMarginLabel,
    reason: cleanPhrase(rawReason) ?? "",
    adjustments: sanitizedAdjustments.map((a) => cleanPhrase(a) ?? a),
  };
}

/* =========================================================
   Fallback signals (used in standalone mapCandidateEvaluation)
   ========================================================= */

const FALLBACK_REASON_SIGNALS = [
  "could not be deterministically classified",
  "unresolved constraint interpretation",
  "require manual review (not deterministically classifiable)",
  "constraint interpretation required",
  "evaluation requires manual review",
];

const FALLBACK_ADJUSTMENT_SIGNALS = [
  "clarify constraint semantics",
  "manual review required",
  "constraint interpretation",
];

function containsFallbackReasonSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return FALLBACK_REASON_SIGNALS.some((sig) => lower.includes(sig));
}

function containsFallbackAdjustmentSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return FALLBACK_ADJUSTMENT_SIGNALS.some((sig) => lower.includes(sig));
}

const REASON_SEPARATOR = " Additionally: ";

function deduplicateReasonString(reason: string, allDeterministic: boolean): string {
  if (!reason) return reason;

  const clauses = reason.split(REASON_SEPARATOR).map((c) => c.trim()).filter(Boolean);
  if (clauses.length === 0) return reason;

  const typedClauses: string[] = [];
  const fallbackClauses: string[] = [];

  for (const clause of clauses) {
    if (containsFallbackReasonSignal(clause)) fallbackClauses.push(clause);
    else typedClauses.push(clause);
  }

  const seenTyped = new Set<string>();
  const uniqueTyped: string[] = [];
  for (const clause of typedClauses) {
    const key = clause.toLowerCase();
    if (!seenTyped.has(key)) { seenTyped.add(key); uniqueTyped.push(clause); }
  }

  if (allDeterministic) {
    if (uniqueTyped.length === 0) return "Evaluated deterministically. No typed reason produced.";
    return uniqueTyped.join(REASON_SEPARATOR);
  }

  const seenFallback = new Set<string>();
  const uniqueFallbacks: string[] = [];
  for (const clause of fallbackClauses) {
    const key = clause.toLowerCase();
    if (!seenFallback.has(key)) { seenFallback.add(key); uniqueFallbacks.push(clause); }
  }

  const result = [...uniqueTyped];
  if (uniqueFallbacks.length > 1) {
    result.push(`${uniqueFallbacks.length} unresolved constraint interpretations remain.`);
  } else if (uniqueFallbacks.length === 1) {
    result.push(uniqueFallbacks[0]!);
  }
  return result.join(REASON_SEPARATOR);
}

function sanitizeAdjustments(adjustments: string[], allDeterministic: boolean): string[] {
  const seen = new Set<string>();
  return adjustments.filter((a) => {
    if (allDeterministic && containsFallbackAdjustmentSignal(a)) return false;
    const key = a.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackResolveDecisiveVariable(compiledConstraints: CompiledConstraint[]): string {
  // Pick the first non-interpretation-required constraint's decisiveVariable
  const first = compiledConstraints.find((c) => c.kind !== "INTERPRETATION_REQUIRED");
  return first?.decisiveVariable ?? "constraint boundary";
}

/* =========================================================
   Per-candidate diagnostic print
   Always fires for the first candidate of each evaluation.
   ========================================================= */

function diagnoseCandidatePipeline(
  raw: CandidateEvaluation,
  compiledConstraints: CompiledConstraint[],
  report: CandidateEvaluationReport,
  card: CandidateEvaluationCardViewModel
): void {
  const rawClauses = raw.reason
    .split(" Additionally: ")
    .map((c, i) => `  [${i}] ${c.trim()}`);

  console.group(
    `[NOMOS:DIAG] Candidate ${raw.id} — status=${raw.status} | decisive="${raw.decisiveVariable}" → "${card.decisiveVariable}"`
  );

  console.group("1. Raw reason clauses (pre-sanitization, split on ' Additionally: ')");
  rawClauses.forEach((line) => console.log(line));
  console.groupEnd();

  console.group("2. Compiled constraint kinds & classification");
  if (compiledConstraints.length === 0) {
    console.log("  (none)");
  } else {
    compiledConstraints.forEach((c) => {
      const cls = c.kind === "INTERPRETATION_REQUIRED" ? "⚠ INTERPRETATION_REQUIRED" : "✓ deterministic";
      console.log(`  ${cls}  [${c.kind}:${c.key}]  "${c.raw.slice(0, 55)}…"`);
    });
    console.log(`  unresolvedCount: ${unresolvedConstraintCount(compiledConstraints)} / ${compiledConstraints.length}`);
  }
  console.groupEnd();

  console.group("3. Report constraint records (satisfaction)");
  report.constraintEvaluations.forEach((r) => {
    const sat = r.satisfactionStatus === "violated" ? "✗ VIOLATED" :
                r.satisfactionStatus === "not_evaluated" ? "? NOT_EVALUATED" : "✓ satisfied";
    console.log(`  ${sat}  [${r.constraintKind}:${r.key}]  decisive="${r.decisiveVariable ?? "—"}"`);
  });
  console.log(`  Violated: ${report.constraintsViolated}  Satisfied: ${report.constraintsSatisfied}  Not-evaluated: ${report.constraintsNotEvaluated}`);
  console.groupEnd();

  console.group("4. Mapped decisive variable");
  console.log(`  raw API:  "${raw.decisiveVariable}"`);
  console.log(`  report:   "${report.decisiveVariable}"`);
  console.log(`  rendered: "${card.decisiveVariable}"`);
  console.groupEnd();

  console.group("5. Rendered reason string");
  console.log(`  "${card.reason}"`);
  const hasFallback = containsFallbackReasonSignal(card.reason);
  console.log(hasFallback ? "  ⚠ STALE FALLBACK SURVIVED" : "  ✓ no fallback residue");
  console.groupEnd();

  console.group("6. Rendered adjustments");
  if (card.adjustments.length === 0) {
    console.log("  (none)");
  } else {
    card.adjustments.forEach((a, i) => {
      const hasFallback = containsFallbackAdjustmentSignal(a);
      console.log(`  [${i}] ${hasFallback ? "⚠ STALE: " : "✓ "}"${a}"`);
    });
  }
  console.groupEnd();

  console.groupEnd();
}

/* =========================================================
   Runtime inspection log (dev only)
   ========================================================= */

function logEvaluationInspection(
  report: OverallEvaluationReport,
  vm: EvaluationResultViewModel
): void {
  if (typeof import.meta !== "undefined" && (import.meta as { env?: { PROD?: boolean } }).env?.PROD) {
    return;
  }

  console.groupCollapsed(
    `[NOMOS] Evaluation — method=${report.evaluationMethod} | status=${report.overallStatus} | ` +
    `${report.totals.constraintsViolated} violated / ${report.totals.constraintsTotal} total`
  );

  console.group("Classification");
  console.log("  method:", report.evaluationMethod);
  console.log(`  deterministic: ${report.totals.constraintsDeterministicallyClassified} / ${report.totals.constraintsTotal}`);
  console.log(`  interpretation_required: ${report.totals.constraintsInterpretationRequired}`);
  console.groupEnd();

  console.group("Satisfaction");
  console.log(`  satisfied: ${report.totals.constraintsSatisfied}`);
  console.log(`  violated:  ${report.totals.constraintsViolated}`);
  console.log(`  not_evaluated: ${report.totals.constraintsNotEvaluated}`);
  console.groupEnd();

  console.group("Verdict");
  console.log("  overallStatus:", report.overallStatus);
  console.log("  decisiveVariable:", report.decisiveVariable);
  console.log("  lawfulCandidates:", report.lawfulCandidateIds);
  console.groupEnd();

  console.group("Notes (final)");
  vm.notes.forEach((n, i) => console.log(`  [${i}] ${n}`));
  console.groupEnd();

  console.groupEnd();
}

/* =========================================================
   Helpers
   ========================================================= */

function toUiStatus(verdict: string): UiCandidateStatus {
  switch (verdict) {
    case "lawful":   return "LAWFUL";
    case "degraded": return "DEGRADED";
    case "invalid":  return "INVALID";
    // pass-through for already-uppercase values
    case "LAWFUL":   return "LAWFUL";
    case "DEGRADED": return "DEGRADED";
    case "INVALID":  return "INVALID";
    default:         return "DEGRADED";
  }
}

function toToneClassName(status: UiCandidateStatus): string {
  switch (status) {
    case "LAWFUL":   return "is-lawful";
    case "DEGRADED": return "is-degraded";
    case "INVALID":  return "is-invalid";
  }
}

function cleanPhrase(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

function formatScore(score: number): string {
  return score.toFixed(2);
}

function marginLabelFromScore(score: number): string {
  if (score >= 0.75) return "HIGH";
  if (score >= 0.5)  return "MODERATE";
  if (score > 0)     return "LOW";
  return "FAILED";
}
