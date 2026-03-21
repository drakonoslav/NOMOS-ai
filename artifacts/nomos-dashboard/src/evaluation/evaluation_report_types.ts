/**
 * evaluation_report_types.ts
 *
 * Canonical evaluation report schema for NOMOS.
 *
 * Three concepts that must NEVER be conflated:
 *
 *   1. ConstraintClassificationStatus — HOW was the constraint evaluated?
 *      - "deterministic" → matched a typed rule, no LLM fallback needed
 *      - "interpretation_required" → could not be classified, sent to LLM
 *
 *   2. ConstraintSatisfactionStatus — DID the candidate satisfy the constraint?
 *      - "satisfied" → constraint evaluated and passed
 *      - "violated" → constraint evaluated and failed
 *      - "not_evaluated" → constraint was INTERPRETATION_REQUIRED with no LLM key,
 *        so satisfaction is unknown
 *
 *   3. CandidateVerdict — overall admission decision for a candidate
 *      - "lawful" → all constraints satisfied
 *      - "degraded" → at least one constraint failed at reduced confidence
 *      - "invalid" → at least one constraint definitively failed
 *
 * These are three independent axes. The UI must derive its text from
 * these fields — never infer them from prose reason strings.
 */

export type EvaluationMethod = "deterministic" | "semantic" | "hybrid";

/* =========================================================
   Constraint trace — candidate-local proof of violation
   ========================================================= */

/**
 * A self-contained proof record for one evaluated constraint.
 *
 * Holds the baseline state, candidate state, diff summary, and explicit
 * proof lines that explain exactly why the constraint passed or failed.
 *
 * Derived from ConstraintCheckResult by baseline_trace.ts.
 * Generated from variable + diff — never from violationLabel prose.
 *
 * proofLines example (violated protein placement):
 *   "Baseline meal 2 contains whey."
 *   "Candidate meal 2 does not contain whey."
 *   "Candidate meal 7 contains whey."
 *   "Therefore whey moved from meal 2 to meal 7."
 *   "Constraint MUST_EQUAL on protein placement is violated."
 */
export interface ConstraintTrace {
  constraintId: string;
  key: string;
  variableName: string;
  violationLabel: string;
  operator: string;

  /** The declared baseline state for this variable. */
  baselineState: unknown;
  /** The evaluated candidate state for this variable. */
  candidateState: unknown;
  /** Human-readable diff sentence derived from the diff engine. */
  diffSummary: string;

  /**
   * Explicit proof lines in logical order.
   * Each line is a complete, self-contained sentence.
   * Derived from variable + diff — never from violationLabel.
   */
  proofLines: string[];

  /**
   * Variable-level repair instruction. Null when satisfied.
   * Correct:   "Restore whey to meal 2."
   * Incorrect: "Restore protein placement violation to its declared state."
   */
  suggestedRepair: string | null;
}

export type ConstraintClassificationStatus =
  | "deterministic"
  | "interpretation_required";

export type ConstraintSatisfactionStatus =
  | "satisfied"
  | "violated"
  | "not_evaluated";

export type CandidateVerdict = "lawful" | "degraded" | "invalid";

export type ConstraintKindLabel =
  | "STRUCTURAL_LOCK"
  | "ALLOWED_ACTION"
  | "TARGET_TOLERANCE"
  | "SOURCE_TRUTH"
  | "INTERPRETATION_REQUIRED";

/**
 * Per-constraint evaluation record for a single candidate.
 *
 * NOTE: The NOMOS API currently returns per-candidate aggregated results,
 * not per-constraint. Satisfaction status is therefore inferred:
 *   - LAWFUL candidate → all constraints "satisfied"
 *   - DEGRADED/INVALID candidate → the decisive constraint is "violated";
 *     INTERPRETATION_REQUIRED constraints are "not_evaluated"; rest are "satisfied"
 * This is documented explicitly so callers understand the approximation.
 *
 * Variable/violation field law:
 *   - variableName   — the thing being measured (e.g. "protein placement").
 *                      INVARIANT: must NEVER contain the word "violation".
 *   - violationLabel — the event label (e.g. "protein placement violation").
 *                      Only set when satisfactionStatus === "violated".
 *                      Derived as: `${variableName} violation`.
 *                      Must NEVER be used in place of variableName for computation.
 *   - decisiveVariable — legacy field kept for backward compat; equals violationLabel
 *                        when violated, variableName when satisfied.
 */
export interface ConstraintEvaluationRecord {
  constraintId: string;
  rawText: string;

  classificationStatus: ConstraintClassificationStatus;
  satisfactionStatus: ConstraintSatisfactionStatus;

  constraintKind: ConstraintKindLabel;
  key: string | null;
  operator: string | null;

  /** The variable being compared. MUST NOT contain the word "violation". */
  variableName: string | null;
  /** The violation event label. Only set when satisfactionStatus === "violated". */
  violationLabel: string | null;
  /** Legacy field: equals violationLabel when violated, variableName when satisfied. */
  decisiveVariable: string | null;

  lhsSummary: string | null;
  rhsSummary: string | null;

  reason: string;
  adjustment: string | null;
}

/**
 * Full evaluation report for one candidate.
 *
 * verdict, satisfactionCounts, and decisiveVariable are derived from
 * ConstraintEvaluationRecord[], not from prose strings.
 */
export interface CandidateEvaluationReport {
  candidateId: string;
  candidateLabel: string;

  verdict: CandidateVerdict;
  decisiveVariable: string | null;
  margin: number | null;

  constraintsTotal: number;
  constraintsDeterministicallyClassified: number;
  constraintsInterpretationRequired: number;

  constraintsSatisfied: number;
  constraintsViolated: number;
  constraintsNotEvaluated: number;

  constraintEvaluations: ConstraintEvaluationRecord[];

  summaryReason: string;
  adjustments: string[];

  /**
   * Proof trace for the decisive violated constraint.
   * Null when the candidate is LAWFUL or no structured state is available.
   * Produced by baseline_trace.ts from the formal constraint algebra.
   */
  decisiveConstraintTrace?: ConstraintTrace | null;

  /**
   * Proof traces for all evaluated constraints, indexed by constraintId.
   * Available when the evaluation was driven by the formal algebra engine.
   */
  allConstraintTraces?: ConstraintTrace[];
}

/**
 * Top-level evaluation report for a full NomosQuery run.
 *
 * totals are aggregate sums across all candidates × all constraints.
 * notes are generated by generateClassificationSummary / generateSatisfactionSummary /
 * generateVerdictSummary — never by string inference on reason fields.
 */
export interface OverallEvaluationReport {
  evaluationMethod: EvaluationMethod;

  overallStatus: CandidateVerdict;
  lawfulCandidateIds: string[];

  strongestMargin: number | null;
  decisiveVariable: string | null;

  candidates: CandidateEvaluationReport[];

  totals: {
    candidatesEvaluated: number;
    constraintsTotal: number;
    constraintsDeterministicallyClassified: number;
    constraintsInterpretationRequired: number;
    constraintsSatisfied: number;
    constraintsViolated: number;
    constraintsNotEvaluated: number;
  };

  notes: string[];
}
