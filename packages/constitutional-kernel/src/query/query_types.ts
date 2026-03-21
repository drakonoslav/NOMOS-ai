/**
 * query_types.ts
 *
 * Canonical NomosQuery shape.
 *
 * Constitutional role:
 * - Defines the structured representation of a human submission.
 * - parserConfidence describes extraction quality, NOT lawfulness.
 * - completeness describes submission usability, NOT verification.
 * - Lawful / Degraded / Invalid classification belongs to the kernel, not the parser.
 */

export type SubmissionCompleteness = "COMPLETE" | "PARTIAL" | "INSUFFICIENT";
export type ParserConfidence = "HIGH" | "MEDIUM" | "LOW";

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
  /**
   * Parser confidence is about extraction quality, not lawfulness.
   */
  parserConfidence: ParserConfidence;
  /**
   * Whether the parser thinks the submission is usable by NOMOS
   * without further clarification.
   */
  completeness: SubmissionCompleteness;
  notes: string[];
}
