/**
 * execution_route_types.ts
 *
 * Canonical types for execution routing in NOMOS.
 *
 * The execution layer selects exactly one route per evaluation run and records
 * it explicitly so proof, diff, and repair are always mode-coherent.
 *
 * Route priority:
 *   graph_first    — canonical graph is available and sufficient
 *   event_fallback — temporal event-array data available, no canonical graph
 *   text_fallback  — raw text only; must be explicitly allowed by caller
 *
 * Design invariants:
 *   I1: If graph_first is selected, proof/diff/repair are all graph-native.
 *   I2: If canonical graph is available and sufficient, text_fallback must not
 *       silently run instead.
 *   I3: Exactly one route is chosen; routes are never blended in a single run.
 *   I4: All executions produce an ExecutionTrace that records which route ran.
 */

/* =========================================================
   Route enum
   ========================================================= */

/**
 * The three mutually exclusive execution routes.
 *
 * - "graph_first"    Use canonical graph as the primary query substrate.
 * - "event_fallback" Fall back to temporal event-array evaluation.
 * - "text_fallback"  Last resort: raw text evaluation (must be explicitly allowed).
 */
export type ExecutionRoute =
  | "graph_first"
  | "event_fallback"
  | "text_fallback";

/* =========================================================
   Routing decision
   ========================================================= */

/**
 * The result of resolveExecutionRoute().
 *
 * Records why a specific route was chosen and what data was present
 * at decision time.  Always attached to ExecutionTrace.
 */
export interface ExecutionRoutingDecision {
  /** The chosen route. */
  route: ExecutionRoute;

  /**
   * Human-readable description of why this route was selected.
   * Examples:
   *   "canonical graph present with 3 entity nodes and 2 relation edges"
   *   "no canonical graph; 4 temporal events available"
   *   "no graph or events; text_fallback explicitly allowed"
   */
  reason: string;

  /** Whether CanonicalEntity records were present in the context. */
  hasCanonicalEntities: boolean;

  /** Whether CanonicalRelation records were present in the context. */
  hasCanonicalRelations: boolean;

  /** Whether a CanonicalGraph was present and non-empty in the context. */
  hasCanonicalGraph: boolean;

  /**
   * Whether the caller explicitly allowed fallback evaluation.
   * If false, text_fallback is never selected.
   */
  fallbackAllowed: boolean;
}

/* =========================================================
   Routing context
   ========================================================= */

/**
 * Everything resolveExecutionRoute() needs to make a deterministic decision.
 */
export interface ExecutionRoutingContext {
  /** A pre-built canonical graph, if available. */
  canonicalGraph?: import("../graph/canonical_graph_types.ts").CanonicalGraph | null;

  /** Canonical entity records, if available without a pre-built graph. */
  canonicalEntities?: import("../compiler/canonical_entity_types.ts").CanonicalEntity[] | null;

  /** Canonical relation records, if available without a pre-built graph. */
  canonicalRelations?: import("../compiler/canonical_relation_types.ts").CanonicalRelation[] | null;

  /**
   * Temporal event-array data (legacy).
   * If present and non-empty, event_fallback is available.
   */
  eventData?: unknown[] | null;

  /**
   * Whether text_fallback is allowed.
   * Defaults to false — text_fallback must be explicitly permitted.
   */
  fallbackAllowed?: boolean;

  /**
   * Optional: entity labels that must be present in the graph for graph_first
   * to be considered sufficient.
   */
  requiredEntityLabels?: string[];

  /**
   * Optional: relation kinds (lowercase) that must be present in the graph
   * for graph_first to be considered sufficient.
   */
  requiredRelationKinds?: string[];
}

/* =========================================================
   Graph-native diff
   ========================================================= */

/**
 * Describes the gap between observed value and required threshold,
 * expressed in graph terms (which nodes would need to change).
 */
export interface GraphNativeDiff {
  constraintId: string;

  /** The amount by which the observed value fell short (or exceeded) the threshold. */
  deltaRequired: number;

  /** Whether the constraint was already passing (diff is informational). */
  alreadyPassing: boolean;

  /** The unit for the delta (matches the aggregation quantityUnit). */
  unit: string;

  /** Node IDs in the graph that are candidates for modification. */
  targetNodeIds: string[];

  /** Human-readable diff summary. */
  summary: string;
}

/* =========================================================
   Graph-native repair
   ========================================================= */

/**
 * A single graph transformation that, if applied, would make a failing
 * constraint pass.
 */
export interface GraphRepairSuggestion {
  /**
   * The kind of graph transformation:
   *   "add_entity_node"    — add a new entity node to supply missing quantity
   *   "adjust_quantity_edge" — change an existing entity's measure/quantity
   *   "adjust_window_edge" — widen a temporal window edge to include more entities
   *   "add_relation"       — add a new relation edge
   */
  kind:
    | "add_entity_node"
    | "adjust_quantity_edge"
    | "adjust_window_edge"
    | "add_relation";

  /** Human-readable description of the proposed change. */
  description: string;

  /** Node ID to modify (for adjust* kinds). */
  targetNodeId?: string;

  /** Edge ID to modify (for adjust_window_edge, adjust_quantity_edge). */
  targetEdgeId?: string;

  /** Proposed new numeric value (amount or window bound). */
  proposedValue?: number;

  /** Proposed unit string. */
  proposedUnit?: string;

  /** Proposed label for a new node. */
  proposedLabel?: string;

  /** Arbitrary extra data for the transformation. */
  data?: Record<string, unknown>;
}

/**
 * All repair suggestions for one failing constraint.
 */
export interface GraphNativeRepair {
  constraintId: string;

  /** Whether the constraint was already passing (no repairs needed). */
  alreadyPassing: boolean;

  suggestions: GraphRepairSuggestion[];
}

/* =========================================================
   Graph-first per-constraint result
   ========================================================= */

/**
 * Complete graph-native result for a single constraint evaluation.
 */
export interface GraphFirstConstraintResult {
  constraintId: string;
  label: string;
  passed: boolean;
  observedValue: number;
  operator: string;
  threshold: number;
  selectedNodeIds: string[];
  explanationLines: string[];
  proof: import("../graph/graph_proof_types.ts").GraphConstraintProofTrace;
  diff: GraphNativeDiff;
  repair: GraphNativeRepair;
}

/* =========================================================
   Graph-first evaluation result
   ========================================================= */

/**
 * Top-level result returned by the graph-first evaluator.
 */
export interface GraphFirstEvaluationResult {
  route: "graph_first";
  trace: import("./execution_trace.ts").ExecutionTrace;
  routingDecision: ExecutionRoutingDecision;
  constraintResults: GraphFirstConstraintResult[];
  allPassed: boolean;
  passCount: number;
  failCount: number;
}

/* =========================================================
   Fallback evaluation result
   ========================================================= */

/**
 * Top-level result returned by fallback evaluators (event or text).
 */
export interface FallbackEvaluationResult {
  route: "event_fallback" | "text_fallback";
  trace: import("./execution_trace.ts").ExecutionTrace;
  routingDecision: ExecutionRoutingDecision;

  /**
   * Simple pass/fail per constraint ID.
   * Fallback evaluation does not produce graph-native proof/diff/repair.
   */
  constraintResults: Array<{
    constraintId: string;
    label: string;
    passed: boolean;
    observedValue: number;
    operator: string;
    threshold: number;
    explanationLines: string[];
  }>;

  allPassed: boolean;
  passCount: number;
  failCount: number;
}
