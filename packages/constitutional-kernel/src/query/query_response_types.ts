/**
 * query_response_types.ts
 *
 * Types for NOMOS query evaluation responses.
 *
 * Constitutional role:
 * - Evaluation results from the NOMOS query evaluator.
 * - LAWFUL / DEGRADED / INVALID applies to candidate actions, not to the query itself.
 * - submissionQuality mirrors completeness from the upstream NomosQuery.
 */

export type NomosActionClassification = "LAWFUL" | "DEGRADED" | "INVALID";

export interface NomosCandidateEvaluation {
  id: string;
  classification: NomosActionClassification;
  reasons: string[];
}

export interface NomosAdjustment {
  candidateId: string;
  actions: string[];
}

export interface NomosQueryResponse {
  submissionQuality: "COMPLETE" | "PARTIAL" | "INSUFFICIENT";
  overallStatus: NomosActionClassification;
  candidateEvaluations: NomosCandidateEvaluation[];
  lawfulSet: string[];
  adjustments?: NomosAdjustment[];
  notes: string[];
}
