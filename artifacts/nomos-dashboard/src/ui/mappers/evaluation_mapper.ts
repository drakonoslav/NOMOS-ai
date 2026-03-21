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

export function mapEvaluationResultToViewModel(
  result: EvaluationResult
): EvaluationResultViewModel {
  return {
    overallStatus: result.overallStatus,
    overallStatusLabel: result.overallStatus,
    overallToneClassName: toToneClassName(result.overallStatus),
    lawfulSetLabel:
      result.lawfulSet.length > 0 ? result.lawfulSet.join(", ") : "None",
    decisiveVariable: cleanPhrase(result.decisiveVariable),
    bestCandidateId: result.bestCandidateId ?? undefined,
    strongestMarginScore:
      result.strongestMarginScore !== undefined
        ? formatScore(result.strongestMarginScore)
        : undefined,
    weakestAdmissibleMarginScore:
      result.weakestAdmissibleMarginScore !== undefined
        ? formatScore(result.weakestAdmissibleMarginScore)
        : undefined,
    candidateCards: result.candidateEvaluations.map(mapCandidateEvaluation),
    notes: result.notes ?? [],
  };
}

export function mapCandidateEvaluation(
  evaluation: CandidateEvaluation
): CandidateEvaluationCardViewModel {
  return {
    id: evaluation.id,
    title: `Candidate ${evaluation.id}`,
    status: evaluation.status,
    statusLabel: evaluation.status,
    toneClassName: toToneClassName(evaluation.status),
    decisiveVariable: cleanPhrase(evaluation.decisiveVariable),
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
