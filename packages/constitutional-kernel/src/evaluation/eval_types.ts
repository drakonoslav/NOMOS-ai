/**
 * eval_types.ts
 *
 * Core types for the NOMOS evaluation pipeline.
 *
 * Constitutional role:
 * - Defines the typed contract between each pipeline stage.
 * - CandidateStatus is the categorical output — LAWFUL, DEGRADED, or INVALID.
 * - marginScore is a continuous [0, 1] measure of distance from constraint failure.
 * - marginLabel is a presentation-safe bucket derived from marginScore.
 * - Confidence describes matcher certainty, not constitutional authority.
 * - bestCandidateId and weakestAdmissibleMarginScore are LAWFUL-only aggregates.
 */

export type CandidateStatus = "LAWFUL" | "DEGRADED" | "INVALID";
export type MarginLabel = "HIGH" | "MODERATE" | "LOW" | "FAILED";

export interface NormalizedConstraint {
  raw: string;
  kind:
    | "NO_DROP"
    | "NO_TURNOVER"
    | "PRESERVE_STRUCTURE"
    | "NO_RELEASE"
    | "BOUNDED_TIME"
    | "BOUNDED_RESOURCE"
    | "SLEEP_MIN_DURATION_AND_CONTINUITY"
    | "NUTRITION_STRUCTURAL_LOCK"
    | "NUTRITION_ALLOWED_ACTION"
    | "NUTRITION_TARGET_TOLERANCE"
    | "NUTRITION_SOURCE_TRUTH"
    | "NUTRITION_CARB_TIMING"
    | "UNKNOWN";
  protectedObject?: string;
  threshold?: string;
  decisiveVariable?: string;
  /**
   * Sub-type key within a kind.
   * Examples:
   *   NUTRITION_STRUCTURAL_LOCK → "preserve_protein_placement" | "preserve_meal_order" | ...
   *   NUTRITION_ALLOWED_ACTION  → "adjustment_scope"
   *   NUTRITION_TARGET_TOLERANCE → "calorie_delta_minimize" | "minimize_change_magnitude"
   *   NUTRITION_SOURCE_TRUTH    → "declared_macros_override" | "estimated_defaults_allowed" | "label_priority"
   */
  key?: string;
  /** Domain-specific numeric parameters (e.g. minTotalSleepMinutes for sleep domain). */
  params?: Record<string, number>;
}

export interface NormalizedCandidate {
  id: string;
  raw: string;
  actions: string[];
  detectedVerbs: string[];
  riskFlags: string[];
}

/**
 * CandidateEvaluationDraft
 * Produced by the deterministic matcher and LLM evaluator — before margin scoring.
 * The margin scorer promotes this to CandidateEvaluation.
 */
export interface CandidateEvaluationDraft {
  id: string;
  status: CandidateStatus;
  reason: string;
  decisiveVariable: string;
  adjustments?: string[];
  confidence: "high" | "moderate" | "low";
}

export interface CandidateEvaluation extends CandidateEvaluationDraft {
  marginScore: number;
  marginLabel: MarginLabel;
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
