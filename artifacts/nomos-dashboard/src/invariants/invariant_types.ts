/**
 * invariant_types.ts
 *
 * Canonical types for NOMOS system-level invariant checking.
 *
 * Four invariants are enforced across the full execution stack:
 *
 *   GraphFidelity      — every measured entity maps to exactly one graph node;
 *                        no duplication across parsing and graph layers
 *
 *   ExecutionDeterminism — identical inputs (graph + constraints) always produce
 *                          identical execution results and proof traces
 *
 *   ProofIntegrity     — every node ID in every proof step must exist in the
 *                        graph; no ghost or inferred node references
 *
 *   ModeInvariance     — NL / Guided / Auto modes all converge to the same
 *                        BindingResult, graph, and evaluation result
 */

/* =========================================================
   Invariant identity
   ========================================================= */

export type InvariantName =
  | "GraphFidelity"
  | "ExecutionDeterminism"
  | "ProofIntegrity"
  | "ModeInvariance";

/* =========================================================
   Violation
   ========================================================= */

export interface InvariantViolation {
  /** Which invariant was violated. */
  invariant: InvariantName;

  /**
   * Short machine-readable rule label, e.g.
   *   "ENTITY_NOT_IN_GRAPH", "GHOST_NODE_ID", "RESULT_UNSTABLE"
   */
  rule: string;

  /** Human-readable explanation. */
  message: string;

  /** Structured diagnostic payload for debugging. */
  detail?: Record<string, unknown>;
}

/* =========================================================
   Per-invariant result
   ========================================================= */

export interface InvariantResult {
  invariant: InvariantName;

  /** One-line description of what this invariant enforces. */
  description: string;

  passed: boolean;

  violations: InvariantViolation[];
}

/* =========================================================
   Aggregate report
   ========================================================= */

export interface InvariantReport {
  /** True only when ALL invariants pass with zero violations. */
  allPassed: boolean;

  results: InvariantResult[];

  /** Sum of violations.length across all results. */
  totalViolations: number;
}
