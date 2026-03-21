/**
 * rule_adjustment_types.ts
 *
 * Canonical types for NOMOS bounded rule adjustment.
 *
 * Bounded rule adjustment lets NOMOS conservatively tune its prediction
 * confidence and escalation strength from calibration history.
 *
 * What this layer may adjust:
 *   - prediction confidence (up or down within a bounded range)
 *   - risk escalation strength (up or down within a bounded range)
 *   - uncertainty level (up within a bounded range when history is weak/noisy)
 *
 * What this layer may NEVER modify:
 *   - constraint compilation
 *   - diff engine rules
 *   - candidate verdict logic
 *   - source-truth evaluation
 *   - stored historical predictions or audit records
 *
 * All computation is deterministic. No LLM generation is used.
 */

/**
 * The current adjustment state for NOMOS prediction behavior.
 *
 * Biases are dimensionless scalars that shift prediction thresholds.
 * They are applied only to future prediction output — never to stored history.
 *
 * confidenceBias:  negative lowers confidence (more cautious output),
 *                  positive raises confidence slightly (only when strongly calibrated).
 *                  Range: [-1.0, +0.5]
 *
 * escalationBias:  negative softens risk escalation (less aggressive "rising" calls),
 *                  positive raises escalation slightly (only when calibration confirms it).
 *                  Range: [-1.0, +0.5]
 *
 * uncertaintyBias: positive increases uncertainty (adds noise / shallow-history guards).
 *                  Never negative — NOMOS only explicitly raises uncertainty, not lowers it.
 *                  Range: [0.0, +1.5]
 *
 * calibrationWindow: how many recent resolved runs are considered for signals.
 *                    Default: 5.
 */
export interface RuleAdjustmentState {
  confidenceBias: number;
  escalationBias: number;
  uncertaintyBias: number;
  calibrationWindow: number;
}

/**
 * The neutral (unadjusted) default state — all biases at zero.
 */
export const DEFAULT_ADJUSTMENT_STATE: RuleAdjustmentState = {
  confidenceBias: 0,
  escalationBias: 0,
  uncertaintyBias: 0,
  calibrationWindow: 5,
};

/**
 * Hard bounds for each bias dimension.
 */
export const ADJUSTMENT_BOUNDS = {
  confidenceBias:  { min: -1.0, max: 0.5 },
  escalationBias:  { min: -1.0, max: 0.5 },
  uncertaintyBias: { min:  0.0, max: 1.5 },
} as const;

/**
 * Input signals derived from calibration history and audit records.
 * All fields are null when insufficient data exists.
 *
 * tooAggressiveRate: fraction of resolved predictions classified "too_aggressive".
 * tooWeakRate:       fraction of resolved predictions classified "too_weak".
 * shallowHistory:    resolvedPredictions < 3 (hard guard — no confidence boost allowed).
 * noisyHistory:      recent window contains >= 3 distinct decisive variables (inconsistent).
 */
export interface RuleAdjustmentSignal {
  exactMatchRate: number | null;
  directionMatchRate: number | null;
  tooAggressiveRate: number | null;
  tooWeakRate: number | null;
  shallowHistory: boolean;
  noisyHistory: boolean;
}

/**
 * The output of one bounded adjustment pass.
 *
 * nextState:    the resulting RuleAdjustmentState after applying all changes.
 * changes:      machine-readable labels for each applied adjustment (empty if none).
 * summaryLines: human-readable sentences explaining the adjustments.
 */
export interface RuleAdjustmentDecision {
  nextState: RuleAdjustmentState;
  changes: string[];
  summaryLines: string[];
}
