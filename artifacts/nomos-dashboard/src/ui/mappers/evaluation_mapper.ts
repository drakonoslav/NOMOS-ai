/**
 * evaluation_mapper.ts
 *
 * Maps EvaluationResult (engine output) to EvaluationResultViewModel (UI input).
 *
 * Design:
 * - Pure functions — no side effects outside of dev-mode inspection logs.
 * - cleanPhrase normalizes trailing punctuation for consistent display.
 * - toToneClassName maps CandidateStatus to a CSS class modifier.
 * - formatScore formats a margin score to a fixed-decimal string ("0.85").
 * - Optional summary fields are passed through as undefined when absent.
 * - No React or component logic lives here.
 *
 * Sanitization contract:
 * - When compiled constraints are all deterministic (unresolvedCount === 0),
 *   any stale fallback text in candidate.reason or candidate.adjustments is
 *   stripped before rendering. This prevents the API's LLM-fallback residue
 *   from appearing when the dashboard compiler has already confirmed all
 *   constraints are typed.
 *
 * Pipeline consistency invariant:
 * - If the footer note says "No interpretation fallback used" but any candidate
 *   still contains fallback text after sanitization, a console.error is emitted.
 *   This surfaces internal inconsistencies without crashing the UI.
 *
 * Inspection log (dev only):
 * - logEvaluationInspection() emits a structured console.group with:
 *     1. raw evaluation result from nomos-core
 *     2. compiled constraints (dashboard-side)
 *     3. final mapped view model
 *   Set NOMOS_INSPECTION=0 or run in production to suppress.
 */

import {
  CandidateEvaluation,
  EvaluationResult,
} from "../evaluation/eval_types";
import {
  CandidateEvaluationCardViewModel,
  EvaluationResultViewModel,
  UiCandidateStatus,
  UiMarginLabel,
} from "./evaluation_view_models";
import {
  CompiledConstraint,
  resolveDisplayDecisiveVariable,
  unresolvedConstraintCount,
} from "../../compiler/constraint_compiler";

/* =========================================================
   Fallback text signals
   Must mirror candidate_scoring.ts FALLBACK_SIGNAL and
   llm_semantic_evaluator.ts fallback reason text exactly.
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

/* =========================================================
   Main entry point
   ========================================================= */

export function mapEvaluationResultToViewModel(
  result: EvaluationResult,
  compiledConstraints?: CompiledConstraint[]
): EvaluationResultViewModel {
  const unresolved = compiledConstraints
    ? unresolvedConstraintCount(compiledConstraints)
    : null;

  const allDeterministic =
    unresolved !== null &&
    unresolved === 0 &&
    (compiledConstraints?.length ?? 0) > 0;

  const globalDecisive =
    compiledConstraints && result.decisiveVariable === "constraint interpretation"
      ? resolveDisplayDecisiveVariable(compiledConstraints, result.decisiveVariable)
      : result.decisiveVariable;

  const notes = [...(result.notes ?? [])];
  if (allDeterministic) {
    notes.push("All constraints evaluated deterministically. No interpretation fallback used.");
  } else if (unresolved !== null && unresolved > 0) {
    notes.push(
      `${unresolved} constraint${unresolved > 1 ? "s" : ""} could not be classified deterministically and require manual review.`
    );
  }

  const candidateCards = result.candidateEvaluations.map((e) =>
    mapCandidateEvaluation(e, compiledConstraints, allDeterministic)
  );

  // Pipeline consistency invariant check
  if (allDeterministic) {
    for (const card of candidateCards) {
      const reasonHasFallback = containsFallbackReasonSignal(card.reason);
      const adjustmentHasFallback = card.adjustments.some(containsFallbackAdjustmentSignal);
      if (reasonHasFallback || adjustmentHasFallback) {
        console.error(
          "[NOMOS] Pipeline consistency error: candidate",
          card.id,
          "still contains fallback text after sanitization.",
          "\n  reason:", card.reason,
          "\n  adjustments:", card.adjustments,
          "\n  This means the sanitization step missed a fallback signal pattern.",
          "\n  Add the pattern to FALLBACK_REASON_SIGNALS or FALLBACK_ADJUSTMENT_SIGNALS."
        );
      }
    }
  }

  const vm: EvaluationResultViewModel = {
    overallStatus: result.overallStatus,
    overallStatusLabel: result.overallStatus,
    overallToneClassName: toToneClassName(result.overallStatus),
    lawfulSetLabel:
      result.lawfulSet.length > 0 ? result.lawfulSet.join(", ") : "None",
    decisiveVariable: cleanPhrase(globalDecisive),
    bestCandidateId: result.bestCandidateId ?? undefined,
    strongestMarginScore:
      result.strongestMarginScore !== undefined
        ? formatScore(result.strongestMarginScore)
        : undefined,
    weakestAdmissibleMarginScore:
      result.weakestAdmissibleMarginScore !== undefined
        ? formatScore(result.weakestAdmissibleMarginScore)
        : undefined,
    candidateCards,
    notes,
  };

  logEvaluationInspection(result, compiledConstraints, vm);

  return vm;
}

/* =========================================================
   Per-candidate mapping
   ========================================================= */

export function mapCandidateEvaluation(
  evaluation: CandidateEvaluation,
  compiledConstraints?: CompiledConstraint[],
  allDeterministic?: boolean
): CandidateEvaluationCardViewModel {
  const decisiveVariable =
    compiledConstraints && evaluation.decisiveVariable === "constraint interpretation"
      ? resolveDisplayDecisiveVariable(compiledConstraints, evaluation.decisiveVariable)
      : evaluation.decisiveVariable;

  // Deduplicate and optionally strip fallback clauses from reason
  const rawReason = deduplicateReasonString(evaluation.reason, allDeterministic ?? false);
  const sanitizedAdjustments = sanitizeAdjustments(
    evaluation.adjustments ?? [],
    allDeterministic ?? false
  );

  return {
    id: evaluation.id,
    title: `Candidate ${evaluation.id}`,
    status: evaluation.status,
    statusLabel: evaluation.status,
    toneClassName: toToneClassName(evaluation.status),
    decisiveVariable: cleanPhrase(decisiveVariable),
    marginScore: formatScore(evaluation.marginScore),
    marginLabel: evaluation.marginLabel as UiMarginLabel,
    reason: cleanPhrase(rawReason) ?? "",
    adjustments: sanitizedAdjustments.map((a) => cleanPhrase(a) ?? a),
  };
}

/* =========================================================
   Reason deduplication + sanitization
   ========================================================= */

/**
 * Splits a merged reason string on " Additionally: ", deduplicates typed clauses,
 * handles fallback clauses.
 *
 * When allDeterministic is true: any clause that matches a fallback signal is
 * stripped entirely (stale API residue). If this empties the reason, falls back
 * to "All constraints passed deterministic evaluation."
 *
 * When allDeterministic is false: fallback clauses are deduplicated and
 * summarized as "N unresolved constraint interpretations remain."
 */
function deduplicateReasonString(reason: string, allDeterministic: boolean): string {
  if (!reason) return reason;

  const clauses = reason
    .split(REASON_SEPARATOR)
    .map((c) => c.trim())
    .filter(Boolean);

  if (clauses.length === 0) return reason;

  const typedClauses: string[] = [];
  const fallbackClauses: string[] = [];

  for (const clause of clauses) {
    if (containsFallbackReasonSignal(clause)) {
      fallbackClauses.push(clause);
    } else {
      typedClauses.push(clause);
    }
  }

  // Deduplicate typed clauses — preserve order, keep first occurrence
  const seenTyped = new Set<string>();
  const uniqueTyped: string[] = [];
  for (const clause of typedClauses) {
    const key = clause.toLowerCase();
    if (!seenTyped.has(key)) {
      seenTyped.add(key);
      uniqueTyped.push(clause);
    }
  }

  if (allDeterministic) {
    // Strip all fallback clauses — they are stale API residue
    if (uniqueTyped.length === 0) {
      return "All constraints passed deterministic evaluation.";
    }
    return uniqueTyped.join(REASON_SEPARATOR);
  }

  // Non-deterministic path: deduplicate fallbacks then summarize
  const seenFallback = new Set<string>();
  const uniqueFallbacks: string[] = [];
  for (const clause of fallbackClauses) {
    const key = clause.toLowerCase();
    if (!seenFallback.has(key)) {
      seenFallback.add(key);
      uniqueFallbacks.push(clause);
    }
  }

  const result = [...uniqueTyped];
  if (uniqueFallbacks.length > 1) {
    result.push(`${uniqueFallbacks.length} unresolved constraint interpretations remain.`);
  } else if (uniqueFallbacks.length === 1) {
    result.push(uniqueFallbacks[0]!);
  }

  return result.join(REASON_SEPARATOR);
}

/**
 * Strips stale fallback adjustment strings when allDeterministic is true.
 * Always deduplicates by case-insensitive exact match.
 */
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

/* =========================================================
   Runtime inspection log (dev only)
   ========================================================= */

/**
 * Logs the full evaluation pipeline state in a collapsed console group.
 * Only emits in development builds or when NOMOS_INSPECTION is set.
 * Suppressed in production automatically via import.meta.env.PROD.
 */
function logEvaluationInspection(
  rawResult: EvaluationResult,
  compiledConstraints: CompiledConstraint[] | undefined,
  mappedViewModel: EvaluationResultViewModel
): void {
  if (typeof import.meta !== "undefined" && (import.meta as { env?: { PROD?: boolean } }).env?.PROD) {
    return;
  }

  console.groupCollapsed(
    `[NOMOS] Evaluation inspection — overall: ${rawResult.overallStatus}, ` +
    `${rawResult.candidateEvaluations.length} candidate(s), ` +
    `${rawResult.candidateEvaluations[0]?.reason?.slice(0, 60) ?? ""}…`
  );

  console.group("1. Raw evaluation result (from nomos-core API)");
  console.log("overallStatus:", rawResult.overallStatus);
  console.log("decisiveVariable:", rawResult.decisiveVariable);
  console.log("notes:", rawResult.notes);
  console.log("candidates:");
  for (const c of rawResult.candidateEvaluations) {
    console.log(`  [${c.id}] status=${c.status} decisive=${c.decisiveVariable}`);
    console.log(`       reason=${c.reason}`);
    console.log(`       adjustments=${JSON.stringify(c.adjustments ?? [])}`);
  }
  console.groupEnd();

  console.group("2. Compiled constraints (dashboard-side)");
  if (!compiledConstraints || compiledConstraints.length === 0) {
    console.log("(none — no compiled constraints passed)");
  } else {
    for (const cc of compiledConstraints) {
      const status = cc.kind === "INTERPRETATION_REQUIRED" ? "⚠ UNRESOLVED" : "✓";
      console.log(`  ${status} [${cc.kind}:${cc.key}] "${cc.raw.slice(0, 60)}…"`);
      console.log(`       decisiveVariable: ${cc.decisiveVariable}, operator: ${cc.operator}`);
    }
    console.log(`unresolvedCount: ${unresolvedConstraintCount(compiledConstraints)}`);
  }
  console.groupEnd();

  console.group("3. Mapped view model (final card props)");
  console.log("overallStatus:", mappedViewModel.overallStatus);
  console.log("decisiveVariable:", mappedViewModel.decisiveVariable);
  console.log("notes:", mappedViewModel.notes);
  console.log("candidates:");
  for (const card of mappedViewModel.candidateCards) {
    console.log(`  [${card.id}] status=${card.status} decisive=${card.decisiveVariable}`);
    console.log(`       reason=${card.reason}`);
    console.log(`       adjustments=${JSON.stringify(card.adjustments)}`);
  }
  console.groupEnd();

  console.groupEnd();
}

/* =========================================================
   Helpers
   ========================================================= */

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
