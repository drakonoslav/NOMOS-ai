/**
 * graph_proof_types.ts
 *
 * Canonical types for graph-native proof traces.
 *
 * A proof trace is a deterministic, node-aware record of every step the
 * graph constraint executor took to reach a pass/fail decision.
 *
 * Design principles:
 *   - Every step records which node IDs survived and which were excluded.
 *   - The trace reflects actual graph execution, not post hoc narrative.
 *   - Excluded nodes are identified by their graph node IDs so the UI can
 *     highlight them directly in the graph view.
 *   - The trace is self-contained: it carries enough information to
 *     reconstruct the full reasoning without re-running the executor.
 */

/* =========================================================
   Step types
   ========================================================= */

export type GraphProofStepLabel =
  | "Candidate Selection"
  | "Tag Filter"
  | "Label Filter"
  | "Window Restriction"
  | "Aggregation"
  | "Threshold Comparison";

export interface GraphProofStep {
  /** 1-indexed step number in the trace. */
  stepNumber: number;

  /** Short label for the step type — used as a heading in the UI. */
  label: GraphProofStepLabel | string;

  /**
   * Human-readable description of what this step did.
   *
   * Examples:
   *   "Selected 3 entities belonging to candidate A."
   *   "Filtered entities tagged fast + carb. 2 qualified, 1 excluded."
   *   "Restricted entities to 90min before lifting. 1 excluded."
   *   "Aggregated qualifying grams = 80."
   *   "Compared 80 >= 60 → pass."
   */
  description: string;

  /**
   * Node IDs that survived after this step.
   * Empty on the comparison step (no entity-level operation).
   */
  selectedNodeIds?: string[];

  /**
   * Node IDs that were present before this step but removed by it.
   * Enables the UI to highlight "filtered out" nodes.
   */
  excludedNodeIds?: string[];

  /**
   * Arbitrary step-specific data for detailed inspection.
   *
   * Examples:
   *   Tag filter:      { tags: ["fast","carb"] }
   *   Window step:     { windowNodeIds: ["w_0"], anchorLabel: "lifting", offsetMinutes: 90 }
   *   Aggregation:     { aggregate: 80, unit: "g", method: "sum" }
   *   Comparison:      { observed: 80, operator: ">=", threshold: 60, passed: true }
   */
  data?: Record<string, unknown>;
}

/* =========================================================
   Full proof trace
   ========================================================= */

export interface GraphConstraintProofTrace {
  /** Matches the constraintId in the corresponding GraphConstraintSpec. */
  constraintId: string;

  /** Human-readable constraint label. */
  label: string;

  /** The candidate this trace applies to (null = all candidates). */
  candidateId?: string | null;

  /** Ordered list of execution steps. */
  steps: GraphProofStep[];

  /** The aggregate value produced by the Aggregation step. */
  finalObservedValue: number;

  /** The comparison operator used. */
  operator: string;

  /** The threshold value that observed was compared against. */
  threshold: number;

  /** Final pass/fail decision. */
  passed: boolean;
}
