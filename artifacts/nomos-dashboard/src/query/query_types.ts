/**
 * query_types.ts (frontend)
 *
 * Canonical NomosQuery and response types for the dashboard.
 * Mirror of the backend query_types / query_response_types.
 */

export type SubmissionCompleteness = "COMPLETE" | "PARTIAL" | "INSUFFICIENT";
export type ParserConfidence = "HIGH" | "MEDIUM" | "LOW";
export type NomosActionClassification = "LAWFUL" | "DEGRADED" | "INVALID";

export interface NomosStateBlock {
  description: string;
  facts: string[];
  constraints: string[];
  uncertainties: string[];
}

export interface NomosCandidateBlock {
  id: string;
  description: string;
}

export interface NomosObjectiveBlock {
  description: string;
}

export interface NomosQuery {
  rawInput: string;
  state: NomosStateBlock;
  candidates: NomosCandidateBlock[];
  objective?: NomosObjectiveBlock;
  parserConfidence: ParserConfidence;
  completeness: SubmissionCompleteness;
  notes: string[];
}

export interface GuidedCandidateDraft {
  id: string;
  description: string;
  notes?: string;
}

export interface GuidedQueryDraft {
  situation: string;
  facts: string[];
  constraints: string[];
  uncertainties: string[];
  candidates: GuidedCandidateDraft[];
  objective: string;
}

export interface NomosCandidateEvaluation {
  id: string;
  classification: NomosActionClassification;
  reasons: string[];
  /**
   * The specific constraint texts that produced a non-LAWFUL verdict.
   * Populated by the rule-based evaluator; may be absent for LLM evaluations.
   */
  violatedConstraints?: string[];
}

export interface NomosAdjustment {
  candidateId: string;
  actions: string[];
}

export interface NomosQueryResponse {
  submissionQuality: SubmissionCompleteness;
  overallStatus: NomosActionClassification;
  candidateEvaluations: NomosCandidateEvaluation[];
  lawfulSet: string[];
  adjustments?: NomosAdjustment[];
  notes: string[];
  /**
   * "rule-based" when the LLM was unavailable and the semantic fallback ran.
   * Absent when the LLM produced the result.
   */
  evaluationMethod?: "llm" | "rule-based";
}

export function draftToQuery(draft: GuidedQueryDraft): NomosQuery {
  const facts = draft.facts.map((f) => f.trim()).filter(Boolean);
  const constraints = draft.constraints.map((c) => c.trim()).filter(Boolean);
  const uncertainties = draft.uncertainties.map((u) => u.trim()).filter(Boolean);
  const candidates = draft.candidates
    .filter((c) => c.description.trim())
    .map((c) => ({ id: c.id, description: c.description.trim() }));

  const hasConstraints = constraints.length > 0;
  const hasCandidates = candidates.length > 0;
  const hasObjective = draft.objective.trim().length > 0;
  const hasFacts = facts.length > 0 || draft.situation.trim().length > 0;

  let completeness: SubmissionCompleteness = "INSUFFICIENT";
  if (hasFacts && hasConstraints && hasCandidates && hasObjective) {
    completeness = "COMPLETE";
  } else if (hasFacts && hasCandidates) {
    completeness = "PARTIAL";
  }

  let parserConfidence: ParserConfidence = "LOW";
  if (completeness === "COMPLETE" && constraints.length >= 1 && candidates.length >= 2) {
    parserConfidence = "HIGH";
  } else if (completeness === "PARTIAL") {
    parserConfidence = "MEDIUM";
  }

  const notes: string[] = [];
  if (candidates.length === 0) notes.push("No candidates provided.");
  if (constraints.length === 0) notes.push("No constraints provided.");
  if (!hasObjective) notes.push("No objective provided.");
  notes.push("Structured via guided form. Fields taken at face value.");

  return {
    rawInput: [
      draft.situation,
      ...facts,
      ...constraints.map((c) => `[constraint] ${c}`),
      ...uncertainties.map((u) => `[uncertainty] ${u}`),
      ...candidates.map((c) => `${c.id}: ${c.description}`),
      draft.objective ? `Objective: ${draft.objective}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    state: {
      description: draft.situation.trim(),
      facts,
      constraints,
      uncertainties,
    },
    candidates,
    objective: hasObjective ? { description: draft.objective.trim() } : undefined,
    parserConfidence,
    completeness,
    notes,
  };
}
