/**
 * eval_types.ts (dashboard mirror)
 *
 * Local type mirror of packages/constitutional-kernel/src/evaluation/eval_types.ts.
 * Kept in sync manually. The dashboard does not import from nomos-core directly
 * for these types — it uses this local file.
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
