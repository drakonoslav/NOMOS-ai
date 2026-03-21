/**
 * constraint_algebra.ts — research / test-only algebra
 *
 * STATUS: NOT in the production UI call path. Imported only by test files
 * (constraint_algebra_test.ts, baseline_trace_test.ts). The production
 * evaluation pipeline runs in packages/constitutional-kernel via the API.
 *
 * This module contains a formal constraint expression model developed
 * in parallel with the kernel's deterministic_matcher.ts. It is kept
 * here for test coverage and research purposes. It is not a replacement
 * for kernel evaluation and must not be presented as such.
 *
 * Formal constraint expression model for NOMOS.
 *
 * Architecture law:
 *   Every constraint evaluation is computed as:
 *     baseline state + candidate state + operator → diff → satisfaction result
 *
 *   Violation labels are REPORTING OUTPUTS only — never computation inputs.
 *   The engine starts with state, operator, and difference — not with labels.
 *
 * Three invariants enforced throughout:
 *   A1. variableName must NEVER contain the word "violation".
 *   A2. violationLabel must equal variableName + " violation" (exact derivation).
 *   A3. If satisfactionStatus === "satisfied", decisiveVariable must be null
 *       or must NOT contain the word "violation".
 *   A4. explanation must be generated from variable + diff — never from violationLabel.
 */

/* =========================================================
   Operator type
   ========================================================= */

export type AlgebraOperator =
  | "MUST_EQUAL"          // protein placement, meal order, meal count, meal dispersal
  | "SUBSET_OF"           // adjustment scope (only already-present foods)
  | "MINIMIZE_ABS_DELTA"  // calorie lockdown, change magnitude
  | "SOURCE_PRIORITY";    // label truth, declared macro truth

/* =========================================================
   Core interfaces
   ========================================================= */

/**
 * A formal constraint expression binding a variable, operator, and both values.
 *
 * INVARIANT A1: variableName must NEVER contain "violation".
 * INVARIANT A2: violationLabel must equal `${variableName} violation`.
 */
export interface ConstraintExpression<T = unknown> {
  constraintId: string;
  key: string;

  /** The variable being measured. Must NOT contain "violation". */
  variableName: string;
  /** The violation event label. Derived as: `${variableName} violation`. For reporting only. */
  violationLabel: string;

  operator: AlgebraOperator;
  baselineValue: T;
  candidateValue: T;
}

/**
 * The result of comparing baseline state to candidate state for one variable.
 * Produced by the diff engine — never inferred from prose or labels.
 */
export interface DiffResult<T = unknown> {
  /** True if baseline === candidate under the applicable equality definition. */
  equal: boolean;
  /** Items/fields present in candidate but absent from baseline. */
  added?: unknown;
  /** Items/fields present in baseline but absent from candidate. */
  removed?: unknown;
  /** Items/fields present in both but with differing values. */
  changed?: unknown;
  /** Numeric difference (candidate − baseline). Used by MINIMIZE_ABS_DELTA. */
  delta?: number | null;
  /** Human-readable diff description. Derived from diff data — not from labels. */
  summary: string;
}

/**
 * The complete evaluation result for one constraint.
 *
 * INVARIANT A1: variableName must NOT contain "violation".
 * INVARIANT A3: if satisfactionStatus === "satisfied", decisiveVariable must be null
 *   or must not contain "violation".
 * INVARIANT A4: explanation must be derived from variableName + diff, not from violationLabel.
 */
export interface ConstraintCheckResult<T = unknown> {
  constraintId: string;
  key: string;

  /** The variable being measured. Never contains "violation". */
  variableName: string;
  /** The violation event label. Only used in decisiveVariable when violated. */
  violationLabel: string;

  operator: string;
  baselineValue: T;
  candidateValue: T;
  diff: DiffResult<T>;

  satisfactionStatus: "satisfied" | "violated";
  /**
   * UI label for the decisive factor.
   * - When violated: violationLabel (e.g. "protein placement violation").
   * - When satisfied: null.
   */
  decisiveVariable: string | null;

  /**
   * Human-readable explanation.
   * Derived from variableName + diff — never from violationLabel.
   * Correct:   "Protein placement differs from baseline. Whey moved from meal 2 to meal 7."
   * Incorrect: "protein placement violation was altered"
   */
  explanation: string;

  /**
   * Variable-level repair instruction. Null when satisfied.
   * Correct:   "Restore whey to meal 2."
   * Incorrect: "Restore protein placement violation to its declared state."
   */
  suggestedRepair: string | null;
}

/* =========================================================
   Invariant checker
   ========================================================= */

export interface AlgebraInvariantViolation {
  invariant: string;
  detail: string;
}

export function assertConstraintExpressionInvariants<T>(
  expr: ConstraintExpression<T>
): AlgebraInvariantViolation[] {
  const violations: AlgebraInvariantViolation[] = [];

  if (expr.variableName.toLowerCase().includes("violation")) {
    violations.push({
      invariant: "A1",
      detail: `ConstraintExpression.variableName="${expr.variableName}" contains "violation". variableName is the measured variable, not the violation label.`,
    });
  }

  const expectedLabel = `${expr.variableName} violation`;
  if (expr.violationLabel !== expectedLabel) {
    violations.push({
      invariant: "A2",
      detail: `ConstraintExpression.violationLabel="${expr.violationLabel}" must equal "${expectedLabel}" (variableName + " violation").`,
    });
  }

  return violations;
}

export function assertConstraintCheckResultInvariants<T>(
  result: ConstraintCheckResult<T>
): AlgebraInvariantViolation[] {
  const violations: AlgebraInvariantViolation[] = [];

  if (result.variableName.toLowerCase().includes("violation")) {
    violations.push({
      invariant: "A1",
      detail: `ConstraintCheckResult.variableName="${result.variableName}" contains "violation".`,
    });
  }

  if (
    result.satisfactionStatus === "satisfied" &&
    result.decisiveVariable?.toLowerCase().includes("violation")
  ) {
    violations.push({
      invariant: "A3",
      detail: `satisfactionStatus="satisfied" but decisiveVariable="${result.decisiveVariable}" contains "violation". decisiveVariable may only use violationLabel when violated.`,
    });
  }

  if (result.explanation.toLowerCase().includes("was altered")) {
    violations.push({
      invariant: "A4",
      detail: `explanation="${result.explanation.slice(0, 80)}" contains "was altered". Explanations must be derived from variable + diff, not from violationLabel.`,
    });
  }

  return violations;
}

/* =========================================================
   Algebra: satisfaction from operator + diff
   ========================================================= */

/**
 * Determines satisfaction status from the operator and diff result.
 * This is the single place that maps operator semantics to pass/fail.
 */
export function evaluateSatisfaction(
  operator: AlgebraOperator,
  diff: DiffResult
): "satisfied" | "violated" {
  switch (operator) {
    case "MUST_EQUAL":
      return diff.equal ? "satisfied" : "violated";

    case "SUBSET_OF": {
      if (!diff.added) return "satisfied";
      const added = diff.added;
      if (Array.isArray(added)) return added.length === 0 ? "satisfied" : "violated";
      if (typeof added === "object" && added !== null) {
        return Object.keys(added as object).length === 0 ? "satisfied" : "violated";
      }
      return diff.equal ? "satisfied" : "violated";
    }

    case "MINIMIZE_ABS_DELTA":
      return diff.equal ? "satisfied" : "violated";

    case "SOURCE_PRIORITY":
      return diff.equal ? "satisfied" : "violated";
  }
}
