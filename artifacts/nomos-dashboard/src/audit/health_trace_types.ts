/**
 * health_trace_types.ts
 *
 * Canonical types for NOMOS health index traceability.
 *
 * Every ecosystem health component score can be traced back to:
 *   - exact raw inputs
 *   - exact formula used
 *   - weighted contribution to the overall score
 *   - contributing record IDs from the audit trail
 *
 * This layer is read-only and advisory.
 * It does not modify any score, record, or policy.
 * No LLM generation is used.
 */

/**
 * A fully auditable trace for a single health component.
 *
 * component:              which dimension this trace belongs to.
 *
 * rawInputs:              every value that feeds into the formula.
 *                         Missing inputs are represented as null, not hidden.
 *
 * formulaLines:           the exact calculation expressed step-by-step in
 *                         human-readable form, with actual values substituted
 *                         so the arithmetic can be verified by inspection.
 *
 * weightedContribution:   component score × component weight, rounded to
 *                         two decimal places.  Summing all four equals the
 *                         overall score (before final rounding).
 *
 * contributingRecordIds:  stable IDs of the audit/calibration/review records
 *                         that materially affected this component.  Empty when
 *                         no records were available (component scored at the
 *                         neutral baseline).
 *
 * explanationLines:       plain-language interpretation of this component's
 *                         current score — what drove it up or down.
 */
export interface HealthComponentTrace {
  component:
    | "stability"
    | "calibrationQuality"
    | "governanceEffectiveness"
    | "policyChurn";

  rawInputs: Record<string, number | string | boolean | null>;
  formulaLines: string[];
  weightedContribution: number;

  contributingRecordIds: string[];
  explanationLines: string[];
}

/**
 * The full traceability record for an EcosystemHealthIndex.
 *
 * overallFormulaLines:  the weighted-sum calculation with actual component
 *                       scores and weights substituted.
 *
 * overallInputs:        key → value map of all component scores plus the
 *                       final overall score, for quick programmatic access.
 *
 * componentTraces:      one HealthComponentTrace per dimension, in a
 *                       consistent order: stability, calibrationQuality,
 *                       governanceEffectiveness, policyChurn.
 */
export interface EcosystemHealthTrace {
  overallFormulaLines: string[];
  overallInputs: Record<string, number>;

  componentTraces: HealthComponentTrace[];
}
