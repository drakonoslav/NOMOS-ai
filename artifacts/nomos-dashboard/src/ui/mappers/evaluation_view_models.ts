/**
 * evaluation_view_models.ts
 *
 * UI view-model types for evaluation results.
 *
 * Design:
 * - All strings are already label-safe and presentation-ready.
 * - toneClassName is the CSS modifier class for the card's status tone.
 * - statusLabel is the exact displayed string.
 * - marginScoreDisplay is pre-formatted (e.g. "0.85").
 * - marginLabelDisplay is uppercase (e.g. "HIGH").
 * - No backend field names leak into components.
 */

export type UiCandidateStatus = "LAWFUL" | "DEGRADED" | "INVALID";

export interface CandidateEvaluationCardViewModel {
  id: string;
  title: string;
  status: UiCandidateStatus;
  statusLabel: string;
  toneClassName: string;
  reason: string;
  decisiveVariable?: string;
  adjustments: string[];
  marginScoreDisplay: string;
  marginLabelDisplay: string;
}

export interface EvaluationResultViewModel {
  overallStatus: UiCandidateStatus;
  overallStatusLabel: string;
  overallToneClassName: string;
  lawfulSetLabel: string;
  decisiveVariable?: string;
  candidateCards: CandidateEvaluationCardViewModel[];
  notes: string[];
  bestCandidateId: string | null;
  strongestMarginDisplay: string;
  weakestAdmissibleMarginDisplay: string | null;
}
