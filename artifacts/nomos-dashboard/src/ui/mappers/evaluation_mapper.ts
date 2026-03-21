/**
 * evaluation_mapper.ts
 *
 * Maps EvaluationResult (engine output) to EvaluationResultViewModel (UI input).
 *
 * Design:
 * - Pure functions — no side effects.
 * - cleanPhrase normalizes trailing punctuation for consistent display.
 * - toToneClassName maps CandidateStatus to a CSS class modifier.
 * - No component logic lives here.
 */

import {
  CandidateEvaluation,
  EvaluationResult,
} from "../evaluation/eval_types";
import {
  CandidateEvaluationCardViewModel,
  EvaluationResultViewModel,
  UiCandidateStatus,
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
    reason: cleanPhrase(evaluation.reason) ?? "",
    decisiveVariable: cleanPhrase(evaluation.decisiveVariable),
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
