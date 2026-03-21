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
    reason: cleanPhrase(evaluation.reason) ?? "",
    adjustments: (evaluation.adjustments ?? []).map((a) => cleanPhrase(a) ?? a),
  };
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
