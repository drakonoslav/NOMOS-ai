/**
 * evaluation_view_models.ts
 *
 * UI view-model types for evaluation results.
 *
 * Design:
 * - All strings are already label-safe and presentation-ready.
 * - toneClassName is the CSS modifier class for the card's status tone.
 * - statusLabel is the exact displayed string.
 * - marginScore is pre-formatted to two decimal places, e.g. "0.85".
 * - marginLabel is the exact bucket string: HIGH | MODERATE | LOW | FAILED.
 * - Optional summary fields are omitted from the panel when absent.
 * - No backend field names leak into components.
 */

import type { ConstraintTrace } from "../../evaluation/evaluation_report_types";

export type { ConstraintTrace };

export type UiCandidateStatus = "LAWFUL" | "DEGRADED" | "INVALID";
export type UiMarginLabel = "HIGH" | "MODERATE" | "LOW" | "FAILED";

export interface CandidateEvaluationCardViewModel {
  id: string;
  title: string;
  status: UiCandidateStatus;
  statusLabel: string;
  toneClassName: string;

  decisiveVariable?: string;

  marginScore: string;
  marginLabel: UiMarginLabel;

  reason: string;
  adjustments: string[];

  /**
   * Proof trace for the decisive violated constraint.
   * Present when the evaluation was driven by the formal constraint algebra.
   * Displayed in the expandable "View proof trace" section of the card.
   */
  trace?: ConstraintTrace | null;
}

export interface EvaluationResultViewModel {
  overallStatus: UiCandidateStatus;
  overallStatusLabel: string;
  overallToneClassName: string;

  lawfulSetLabel: string;
  decisiveVariable?: string;

  bestCandidateId?: string;
  strongestMarginScore?: string;
  weakestAdmissibleMarginScore?: string;

  candidateCards: CandidateEvaluationCardViewModel[];
  notes: string[];
}
