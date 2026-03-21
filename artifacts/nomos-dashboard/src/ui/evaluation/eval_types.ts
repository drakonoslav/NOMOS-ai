/**
 * eval_types.ts (dashboard mirror)
 *
 * Local type mirror of packages/constitutional-kernel/src/evaluation/eval_types.ts.
 * Kept in sync manually. The dashboard does not import from nomos-core directly
 * for these types — it uses this local file.
 */

export type CandidateStatus = "LAWFUL" | "DEGRADED" | "INVALID";

export interface CandidateEvaluation {
  id: string;
  status: CandidateStatus;
  reason: string;
  decisiveVariable: string;
  adjustments?: string[];
  confidence: "high" | "moderate" | "low";
}

export interface EvaluationResult {
  overallStatus: CandidateStatus;
  lawfulSet: string[];
  candidateEvaluations: CandidateEvaluation[];
  decisiveVariable: string;
  notes: string[];
}
