/**
 * evaluation_mapper.ts
 *
 * Maps EvaluationResult (engine output) to EvaluationResultViewModel (UI input).
 *
 * Design:
 * - Pure functions — no side effects.
 * - cleanPhrase normalizes trailing punctuation for consistent display.
 * - toToneClassName maps CandidateStatus to a CSS class modifier.
 * - formatScore formats a margin score to a fixed-decimal string ("0.85").
 * - Optional summary fields are passed through as undefined when absent.
 * - No component logic lives here.
 */

import {
  CandidateEvaluation,
  EvaluationResult,
  MarginLabel,
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

export function mapEvaluationResultToViewModel(
  result: EvaluationResult,
  compiledConstraints?: CompiledConstraint[]
): EvaluationResultViewModel {
  const unresolved = compiledConstraints
    ? unresolvedConstraintCount(compiledConstraints)
    : null;

  const globalDecisive =
    compiledConstraints && result.decisiveVariable === "constraint interpretation"
      ? resolveDisplayDecisiveVariable(compiledConstraints, result.decisiveVariable)
      : result.decisiveVariable;

  const notes = [...(result.notes ?? [])];
  if (unresolved !== null && unresolved === 0 && compiledConstraints!.length > 0) {
    notes.push("All constraints evaluated deterministically. No interpretation fallback used.");
  } else if (unresolved !== null && unresolved > 0) {
    notes.push(
      `${unresolved} constraint${unresolved > 1 ? "s" : ""} could not be classified deterministically and require manual review.`
    );
  }

  return {
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
    candidateCards: result.candidateEvaluations.map((e) =>
      mapCandidateEvaluation(e, compiledConstraints)
    ),
    notes,
  };
}

export function mapCandidateEvaluation(
  evaluation: CandidateEvaluation,
  compiledConstraints?: CompiledConstraint[]
): CandidateEvaluationCardViewModel {
  const decisiveVariable =
    compiledConstraints && evaluation.decisiveVariable === "constraint interpretation"
      ? resolveDisplayDecisiveVariable(compiledConstraints, evaluation.decisiveVariable)
      : evaluation.decisiveVariable;

  return {
    id: evaluation.id,
    title: `Candidate ${evaluation.id}`,
    status: evaluation.status,
    statusLabel: evaluation.status,
    toneClassName: toToneClassName(evaluation.status),
    decisiveVariable: cleanPhrase(decisiveVariable),
    marginScore: formatScore(evaluation.marginScore),
    marginLabel: evaluation.marginLabel as UiMarginLabel,
    reason: cleanPhrase(deduplicateReasonString(evaluation.reason)) ?? "",
    adjustments: deduplicateAdjustments(evaluation.adjustments ?? []).map(
      (a) => cleanPhrase(a) ?? a
    ),
  };
}

/* =========================================================
   Reason-text deduplication
   Applied at map time so the card is always a clean display value.
   ========================================================= */

const REASON_SEPARATOR = " Additionally: ";

/**
 * Signals that a reason clause originated from the LLM semantic fallback
 * (no deterministic classification was possible for that constraint).
 * Mirrors the FALLBACK_SIGNAL constant in candidate_scoring.ts.
 */
const FALLBACK_CLAUSE_SIGNALS = [
  "could not be deterministically classified",
  "unresolved constraint interpretation",
  "require manual review (not deterministically classifiable)",
  "constraint interpretation required",
];

function isUnresolvedClause(clause: string): boolean {
  const lower = clause.toLowerCase();
  return FALLBACK_CLAUSE_SIGNALS.some((sig) => lower.includes(sig));
}

/**
 * Deduplicates a merged reason string.
 *
 * Steps:
 * 1. Split on the clause separator " Additionally: ".
 * 2. Separate typed clauses from fallback clauses.
 * 3. Deduplicate typed clauses by case-insensitive exact match — keep first occurrence.
 * 4. Deduplicate fallback clauses by case-insensitive exact match.
 *    - If exactly 1 unique fallback clause → keep it as-is.
 *    - If 2+ unique fallback clauses → replace with:
 *      "N unresolved constraint interpretations remain."
 * 5. Rejoin with the same separator.
 */
function deduplicateReasonString(reason: string): string {
  if (!reason) return reason;

  const clauses = reason
    .split(REASON_SEPARATOR)
    .map((c) => c.trim())
    .filter(Boolean);

  if (clauses.length <= 1) return reason;

  const typedClauses: string[] = [];
  const fallbackClauses: string[] = [];

  for (const clause of clauses) {
    if (isUnresolvedClause(clause)) {
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

  // Deduplicate fallback clauses, then summarize if multiple unique ones remain
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
 * Deduplicates adjustment strings by case-insensitive exact match.
 * Preserves order; keeps first occurrence.
 */
function deduplicateAdjustments(adjustments: string[]): string[] {
  const seen = new Set<string>();
  return adjustments.filter((a) => {
    const key = a.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
