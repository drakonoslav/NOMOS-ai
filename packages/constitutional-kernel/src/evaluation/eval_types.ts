/**
 * eval_types.ts
 *
 * Core types for the NOMOS evaluation pipeline.
 *
 * Constitutional role:
 * - Defines the typed contract between each pipeline stage.
 * - CandidateStatus is the only output the kernel produces — LAWFUL, DEGRADED, or INVALID.
 * - Confidence describes matcher certainty, not constitutional authority.
 * - decisiveVariable is the named factor that determined the result.
 */

export type CandidateStatus = "LAWFUL" | "DEGRADED" | "INVALID";

export interface NormalizedConstraint {
  raw: string;
  kind:
    | "NO_DROP"
    | "NO_TURNOVER"
    | "PRESERVE_STRUCTURE"
    | "NO_RELEASE"
    | "BOUNDED_TIME"
    | "BOUNDED_RESOURCE"
    | "UNKNOWN";
  protectedObject?: string;
  threshold?: string;
  decisiveVariable?: string;
}

export interface NormalizedCandidate {
  id: string;
  raw: string;
  actions: string[];
  detectedVerbs: string[];
  riskFlags: string[];
}

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
