/**
 * graph_constraint_types.ts
 *
 * Canonical types for graph-native constraint specification and execution.
 *
 * Constraints execute by:
 *   1. Selecting entities from the graph (by candidate, label, or all)
 *   2. Filtering by entity tags (fast / carb / slow / etc.)
 *   3. Restricting to entities within a temporal or spatial window
 *   4. Aggregating a measured quantity (sum / count / max / min)
 *   5. Comparing the aggregate to a threshold
 *
 * This is the preferred evaluation path whenever an OperandGraph is available.
 * It replaces ad hoc string scanning and hand-built event arrays.
 */

/* =========================================================
   Selection spec
   ========================================================= */

/**
 * Describes which graph entities to select for evaluation.
 *
 * All fields are optional — omitted fields mean "no restriction on that axis."
 */
export interface GraphSelectionSpec {
  /**
   * If set, only entities belonging to this candidate node are selected.
   * Match is by candidate node label (e.g. "A", "candidate-1").
   */
  candidateId?: string | null;

  /**
   * If set, only entities whose data.tags includes ALL of these tags are kept.
   * Tags are lowercase strings (e.g. ["fast", "carb"]).
   */
  entityTags?: string[];

  /**
   * If set, only entities whose label matches one of these strings (case-
   * insensitive) are kept.  Allows pinpoint label-based selection.
   */
  entityLabels?: string[];

  /**
   * If set together with relation, only entities that are connected via a
   * BEFORE / AFTER / WITHIN / BETWEEN edge to a window node that ANCHORS_TO
   * the named anchor are kept.
   */
  anchorLabel?: string | null;

  /**
   * Temporal or spatial relation used for anchor-window restriction.
   * Must be accompanied by anchorLabel to take effect.
   */
  relation?: "before" | "after" | "within" | "between" | null;

  /**
   * Maximum window size in minutes.  Entities whose offset (converted to
   * minutes) exceeds this value are excluded.
   * Null = no window-size restriction (any window to the anchor qualifies).
   */
  windowMinutes?: number | null;
}

/* =========================================================
   Aggregation spec
   ========================================================= */

/**
 * Describes how to aggregate the selected entities' quantities.
 */
export interface GraphAggregationSpec {
  /**
   * The canonical unit to match (e.g. "g", "ml", "rep").
   * Only entities whose unit resolves to this canonical form are included
   * in the aggregate.
   */
  quantityUnit: string;

  aggregation: "sum" | "count" | "max" | "min";
}

/* =========================================================
   Constraint spec
   ========================================================= */

/**
 * A fully specified graph constraint, ready for deterministic evaluation.
 */
export interface GraphConstraintSpec {
  /** Stable identifier for this constraint. */
  constraintId: string;

  /** Human-readable description, used in explanation lines. */
  label: string;

  selection:   GraphSelectionSpec;
  aggregation: GraphAggregationSpec;

  /** Comparison operator applied between observedValue and threshold. */
  operator: ">=" | "<=" | ">" | "<" | "==";

  /** The threshold value to compare the aggregate against. */
  threshold: number;
}

/* =========================================================
   Execution result
   ========================================================= */

/**
 * Auditable, step-by-step result of executing one constraint over a graph.
 */
export interface GraphConstraintExecutionResult {
  constraintId: string;
  passed:       boolean;

  /** Graph node IDs of all entities that survived all selection/filter steps. */
  selectedNodeIds: string[];

  /** The aggregated numeric value computed from the selected entities. */
  observedValue: number;

  operator:  string;
  threshold: number;

  /**
   * Ordered, human-readable description of each evaluation step.
   * Example:
   *   "selected 3 candidate-A entities"
   *   "filtered by tags [fast, carb]: 2 entities"
   *   "restricted to within 90min before lifting: 2 entities"
   *   "aggregated sum(g) = 80"
   *   "compared 80 >= 60 → pass"
   */
  explanationLines: string[];

  /**
   * Node-aware proof trace.
   * Records which node IDs were selected, excluded, and what windows were
   * applied at each step.  Always present — every execution produces a trace.
   */
  proof: import("./graph_proof_types.ts").GraphConstraintProofTrace;
}
