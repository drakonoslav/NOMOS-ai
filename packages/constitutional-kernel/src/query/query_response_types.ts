/**
 * query_response_types.ts
 *
 * Types for NOMOS query evaluation responses.
 *
 * Constitutional role:
 * - Evaluation results from the NOMOS query evaluator.
 * - LAWFUL / DEGRADED / INVALID applies to candidate actions, not to the query itself.
 * - submissionQuality mirrors completeness from the upstream NomosQuery.
 * - violatedConstraints carries the specific constraint texts that were triggered.
 */

export type NomosActionClassification = "LAWFUL" | "DEGRADED" | "INVALID";

export interface NomosCandidateEvaluation {
  id: string;
  classification: NomosActionClassification;
  reasons: string[];
  /**
   * The raw constraint texts that produced a non-LAWFUL result for this candidate.
   * Populated by the rule-based evaluator; may be empty for LLM evaluations.
   */
  violatedConstraints?: string[];
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
  /**
   * "rule-based" when the LLM evaluator was unavailable and the semantic
   * fallback was used instead. Absent when the LLM was used.
   */
  evaluationMethod?: "llm" | "rule-based";
}
