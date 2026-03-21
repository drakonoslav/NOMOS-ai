/**
 * constraint_types.ts
 *
 * General NOMOS constraint reasoning framework.
 *
 * Constitutional role:
 * - Defines the abstract grammar of constraint classes, evaluation operators,
 *   derived variable representation, atomic constraint decomposition, and
 *   margin results.
 * - Domain modules (sleep, transport, agriculture, nutrition, …) become thin
 *   adapters that map their raw constraints and candidate descriptions into
 *   these interfaces; the core evaluation and margin pipeline then operates
 *   generically over them.
 *
 * Pipeline intent:
 *   raw constraint
 *     → AtomicConstraint[]            (constraint decomposition)
 *     → DerivedVariable[]             (candidate state derivation)
 *     → AtomicConstraintEvaluation[]  (operator evaluation)
 *     → CandidateConstraintProfile    (margin + status synthesis)
 */

/* =========================================================
   ConstraintClass
   ========================================================= */

/**
 * Defines the kind of admissibility boundary being enforced.
 *
 * - PROHIBITION            forbidden event or state must not occur
 * - MIN_THRESHOLD          value must be >= threshold
 * - MAX_THRESHOLD          value must be <= threshold
 * - RANGE                  value must stay within [min, max]
 * - CONTINUITY             max interruption/gap must stay below bound
 * - DEADLINE               event must occur before/after a time boundary
 * - SEQUENCING             event ordering must hold
 * - RESOURCE_PRESERVATION  stock or integrity must remain preserved / non-negative
 * - COMPATIBILITY          coupled constraints must jointly hold
 * - UNCERTAINTY_SENSITIVE  admissibility depends on epistemic quality
 */
export type ConstraintClass =
  | "PROHIBITION"
  | "MIN_THRESHOLD"
  | "MAX_THRESHOLD"
  | "RANGE"
  | "CONTINUITY"
  | "DEADLINE"
  | "SEQUENCING"
  | "RESOURCE_PRESERVATION"
  | "COMPATIBILITY"
  | "UNCERTAINTY_SENSITIVE";

/* =========================================================
   EvaluationOperator
   ========================================================= */

/**
 * Defines the formal comparison or logical test applied to a derived variable.
 *
 * - FORBIDS           forbidden event present?
 * - GTE               >=
 * - LTE               <=
 * - BETWEEN           lower <= x <= upper
 * - MAX_GAP_LTE       largest gap <= threshold
 * - MIN_GAP_GTE       smallest gap >= threshold
 * - BEFORE            event A before boundary or event B
 * - AFTER             event A after boundary or event B
 * - WITHIN_WINDOW     event occurs inside time window
 * - ORDERED_BEFORE    event A must precede event B
 * - NON_NEGATIVE      resource or state >= 0
 * - PRESERVED         integrity or structure remains intact
 * - JOINTLY_SATISFIED multiple coupled predicates satisfied simultaneously
 * - CONFIDENCE_GTE    model or epistemic confidence >= threshold
 */
export type EvaluationOperator =
  | "FORBIDS"
  | "GTE"
  | "LTE"
  | "BETWEEN"
  | "MAX_GAP_LTE"
  | "MIN_GAP_GTE"
  | "BEFORE"
  | "AFTER"
  | "WITHIN_WINDOW"
  | "ORDERED_BEFORE"
  | "NON_NEGATIVE"
  | "PRESERVED"
  | "JOINTLY_SATISFIED"
  | "CONFIDENCE_GTE";

/* =========================================================
   DerivedVariable
   ========================================================= */

/**
 * A value NOMOS must compute from a candidate description before evaluation.
 *
 * Examples of derived variables:
 *   total_sleep_minutes      — summed from sleep interval descriptions
 *   longest_wake_gap         — maximum inter-sleep gap parsed from text
 *   drop_risk                — boolean inferred from action verb
 *   soil_disturbance_score   — estimated from tillage description
 *   cumulative_protein_g     — totalled across meals
 *   remaining_budget_usd     — resource balance after expenditures
 */
export interface DerivedVariable<TValue = number | boolean | string> {
  /**
   * Stable identifier used in evaluation and UI.
   * Examples: total_sleep_minutes, longest_wake_gap, drop_risk
   */
  key: string;

  /**
   * Human-readable label.
   */
  label: string;

  /**
   * Value derived from candidate state or action description.
   */
  value: TValue;

  /**
   * Units if numeric or temporal.
   * Examples: "minutes", "hours", "kg", "%", "score"
   */
  units?: string;

  /**
   * Trace of which candidate fragments contributed to this value.
   * Example: ["sleep_23_30_06_30", "wake_02_00_03_00"]
   */
  provenance?: string[];

  /**
   * Whether this variable was computed deterministically, estimated via LLM,
   * or derived through a combination of both.
   */
  derivationMode: "DETERMINISTIC" | "ESTIMATED" | "HYBRID";

  /**
   * Optional confidence in [0, 1] when not purely deterministic.
   */
  confidence?: number;

  /**
   * Optional human-readable explanation of how this value was derived.
   */
  notes?: string[];
}

/* =========================================================
   AtomicConstraint
   ========================================================= */

/**
 * One fully decomposed, evaluable rule derived from a raw constraint string.
 *
 * A single natural-language constraint may yield multiple AtomicConstraints.
 *
 * Example — "Total sleep must be at least 7 hours, and no wake period longer than 20 minutes."
 * decomposes into:
 *
 *   { id: "sleep_total_min",     operator: "GTE",         variableKey: "total_sleep_minutes",  threshold: 420 }
 *   { id: "sleep_continuity_gap", operator: "MAX_GAP_LTE", variableKey: "longest_wake_gap_minutes", threshold: 20 }
 */
export interface AtomicConstraint {
  /**
   * Stable unique identifier within its constraint set.
   * Examples: sleep_total_min, sleep_continuity_gap, drop_prohibition
   */
  id: string;

  /**
   * Original parent raw constraint text.
   */
  raw: string;

  /**
   * Optional normalized short-form expression.
   * Example: "total_sleep_minutes >= 420"
   */
  normalized?: string;

  /**
   * Constraint family.
   */
  constraintClass: ConstraintClass;

  /**
   * Operator used to test the constraint.
   */
  operator: EvaluationOperator;

  /**
   * Key of the derived variable this constraint evaluates.
   */
  variableKey: string;

  /**
   * Human-readable variable label.
   */
  variableLabel: string;

  /**
   * Primary threshold value if applicable.
   * Examples: 420 (minutes), 20 (minutes), true (boolean prohibition)
   */
  threshold?: number | string | boolean;

  /**
   * Secondary threshold for range or window comparisons.
   * Example: upper bound of a BETWEEN or WITHIN_WINDOW constraint.
   */
  thresholdUpper?: number | string;

  /**
   * Units for threshold values.
   * Examples: "minutes", "kg", "USD"
   */
  units?: string;

  /**
   * Whether a violation immediately disqualifies the candidate (INVALID),
   * as opposed to producing a DEGRADED result.
   */
  hard: boolean;

  /**
   * Whether this constraint is required for admissibility or advisory
   * for margin shaping only.
   */
  priority: "REQUIRED" | "PREFERRED";

  /**
   * Variable most likely to govern the decisive outcome or margin.
   */
  decisiveVariableHint?: string;

  /**
   * Optional temporal structure for deadline, window, or sequencing constraints.
   */
  temporalContext?: {
    type: "INTERVAL" | "WINDOW" | "DEADLINE" | "SEQUENCE";
    reference?: string;
    start?: string | number;
    end?: string | number;
  };

  /**
   * Optional coupling to other constraints that must hold jointly.
   */
  coupledConstraintIds?: string[];

  /**
   * Optional notes from decomposition.
   */
  notes?: string[];
}

/* =========================================================
   MarginResult
   ========================================================= */

/**
 * Distance from failure or constraint boundary for a single atomic constraint.
 *
 * Turns categorical pass/fail evaluation into a continuous margin signal.
 *
 * Example — Candidate A (420 min sleep):
 *   variableKey:     "total_sleep_minutes"
 *   actualValue:     420
 *   threshold:       420
 *   slack:           0          (exactly at boundary)
 *   normalizedScore: 0.50       (on edge — MODERATE)
 *   band:            "MODERATE"
 *   violated:        false
 *   limiting:        true       (duration is the tighter of two constraints)
 */
export interface MarginResult {
  /**
   * Key of the variable whose boundary is being measured.
   */
  variableKey: string;

  /**
   * Human-readable label.
   */
  variableLabel: string;

  /**
   * Operator being evaluated.
   */
  operator: EvaluationOperator;

  /**
   * Actual derived value from the candidate.
   */
  actualValue: number | string | boolean;

  /**
   * Primary threshold value.
   */
  threshold?: number | string | boolean;

  /**
   * Secondary threshold for range-like comparisons.
   */
  thresholdUpper?: number | string;

  /**
   * Signed slack where computable.
   *   Positive — admissible side (safe margin)
   *   Zero     — exactly at boundary
   *   Negative — violated side
   *
   * Examples:
   *   actual 450 min, threshold 420 min => slack +30
   *   actual 390 min, threshold 420 min => slack -30
   */
  slack?: number;

  /**
   * Normalized margin score in [0.00, 1.00].
   *   1.00 = maximum available margin
   *   0.00 = direct failure or hard violation
   */
  normalizedScore: number;

  /**
   * Interpretable margin band.
   */
  band: "HIGH" | "MODERATE" | "LOW" | "FAILED";

  /**
   * Whether this is the limiting (tightest) margin among all constraints
   * for this candidate.
   */
  limiting: boolean;

  /**
   * Whether a violation occurred (normalizedScore === 0 and constraint hard).
   */
  violated: boolean;

  /**
   * Short formal explanation following the two-clause reason pattern.
   * Example: "Sleep duration at threshold. Constraint satisfied."
   */
  reason: string;

  /**
   * Optional suggested repair if violated or margin is low.
   */
  adjustments?: string[];
}

/* =========================================================
   AtomicConstraintEvaluation
   ========================================================= */

/**
 * Result of evaluating one AtomicConstraint against one candidate's
 * DerivedVariable.
 */
export interface AtomicConstraintEvaluation {
  /**
   * ID of the AtomicConstraint that was evaluated.
   */
  constraintId: string;

  /**
   * The derived variable value that was tested.
   */
  variable: DerivedVariable;

  /**
   * Whether the constraint was satisfied for this candidate.
   */
  satisfied: boolean;

  /**
   * Full margin detail for this constraint.
   */
  margin: MarginResult;
}

/* =========================================================
   CandidateConstraintProfile
   ========================================================= */

/**
 * Complete constraint evaluation profile for a single candidate.
 *
 * Synthesizes all AtomicConstraintEvaluations into a single categorical
 * status, decisive variable, reason, and limiting margin.
 */
export interface CandidateConstraintProfile {
  /**
   * ID of the candidate being profiled.
   */
  candidateId: string;

  /**
   * Full results for every atomic constraint evaluated against this candidate.
   */
  atomicEvaluations: AtomicConstraintEvaluation[];

  /**
   * The tightest (most constraining) margin result across all atomic evaluations.
   * Governs the overall margin score and band for this candidate.
   */
  limitingMargin: MarginResult;

  /**
   * Overall categorical interpretation.
   */
  status: "LAWFUL" | "DEGRADED" | "INVALID";

  /**
   * Variable that most strongly governs the outcome or margin.
   */
  decisiveVariable: string;

  /**
   * Compressed explanation following the two-clause reason pattern.
   */
  reason: string;

  /**
   * Optional candidate-level repair suggestions.
   */
  adjustments?: string[];
}
