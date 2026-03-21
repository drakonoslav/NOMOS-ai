/**
 * eval_types.ts — API response contract types
 *
 * Defines the shape of the EvaluationResult returned by POST /api/nomos/query/evaluate.
 * These are the API boundary types seen by the dashboard, NOT the kernel's internal
 * pipeline types (NormalizedConstraint, CandidateEvaluationDraft, etc.).
 *
 * Source of truth: the kernel's API response shape (packages/constitutional-kernel
 * query/query_response_types.ts). If the API response shape changes, update this file.
 *
 * Preferred future: generate these from lib/api-spec/openapi.yaml via Orval.
 */

import type { ConstraintTrace } from "../../evaluation/evaluation_report_types";

export type { ConstraintTrace };

export type CandidateStatus = "LAWFUL" | "DEGRADED" | "INVALID";
export type MarginLabel = "HIGH" | "MODERATE" | "LOW" | "FAILED";

export interface CandidateEvaluation {
  id: string;
  status: CandidateStatus;
  reason: string;
  decisiveVariable: string;
  adjustments?: string[];
  confidence: "high" | "moderate" | "low";
  marginScore: number;
  marginLabel: MarginLabel;

  /**
   * Optional proof trace for the decisive violated constraint.
   * Provided when the evaluation was driven by the formal constraint algebra.
   * Carries baseline state, candidate state, diff, and proof lines.
   */
  decisiveConstraintTrace?: ConstraintTrace | null;
}

export interface EvaluationResult {
  overallStatus: CandidateStatus;
  lawfulSet: string[];
  candidateEvaluations: CandidateEvaluation[];
  decisiveVariable: string;
  notes: string[];
  bestCandidateId?: string;
  strongestMarginScore?: number;
  weakestAdmissibleMarginScore?: number;
}
