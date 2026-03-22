/**
 * execution_trace.ts
 *
 * Canonical execution trace for NOMOS evaluation runs.
 *
 * Every evaluation — regardless of route — produces exactly one ExecutionTrace.
 * The trace is the authoritative record of:
 *   - which route was chosen
 *   - why it was chosen
 *   - which proof/diff/repair modes were used
 *   - any notes or warnings generated during execution
 *
 * Design invariants:
 *   - route === "graph_first" → proofMode/diffMode/repairMode === "graph"
 *   - route === "event_fallback" → proofMode/diffMode/repairMode === "event"
 *   - route === "text_fallback" → proofMode/diffMode/repairMode === "text"
 *   - fallbackUsed === true whenever route !== "graph_first"
 *   - graphUsed === true only when route === "graph_first"
 */

import type { ExecutionRoute } from "./execution_route_types.ts";

/* =========================================================
   ExecutionTrace
   ========================================================= */

/**
 * Canonical execution trace — attached to every evaluation result.
 *
 * Downstream UI must display `route` to allow operators to audit
 * which semantic substrate was used for a given result.
 */
export interface ExecutionTrace {
  /** The route that was ultimately selected and used. */
  route: ExecutionRoute;

  /**
   * Why this route was selected.
   * Mirrors ExecutionRoutingDecision.reason for convenience.
   */
  routingReason: string;

  /** IDs of all constraints that were evaluated. */
  constraintIds: string[];

  /** True when the canonical graph was the execution substrate. */
  graphUsed: boolean;

  /**
   * True when any fallback path (event or text) was used.
   * Mutually exclusive with graphUsed.
   */
  fallbackUsed: boolean;

  /** Which substrate produced the proof trace. */
  proofMode: "graph" | "event" | "text";

  /** Which substrate produced the diff. */
  diffMode: "graph" | "event" | "text";

  /** Which substrate produced the repair suggestions. */
  repairMode: "graph" | "event" | "text";

  /**
   * Optional notes and warnings generated during execution.
   * Examples:
   *   "candidateId 'A' not found in graph; all entity nodes used"
   *   "anchor 'lifting' matched 1 node"
   *   "text_fallback used because no canonical graph was available"
   */
  notes: string[];
}

/* =========================================================
   Builder
   ========================================================= */

/**
 * Build a graph-first execution trace.
 */
export function buildGraphFirstTrace(opts: {
  routingReason: string;
  constraintIds: string[];
  notes?: string[];
}): ExecutionTrace {
  return {
    route:         "graph_first",
    routingReason: opts.routingReason,
    constraintIds: opts.constraintIds,
    graphUsed:     true,
    fallbackUsed:  false,
    proofMode:     "graph",
    diffMode:      "graph",
    repairMode:    "graph",
    notes:         opts.notes ?? [],
  };
}

/**
 * Build an event-fallback execution trace.
 */
export function buildEventFallbackTrace(opts: {
  routingReason: string;
  constraintIds: string[];
  notes?: string[];
}): ExecutionTrace {
  return {
    route:         "event_fallback",
    routingReason: opts.routingReason,
    constraintIds: opts.constraintIds,
    graphUsed:     false,
    fallbackUsed:  true,
    proofMode:     "event",
    diffMode:      "event",
    repairMode:    "event",
    notes:         opts.notes ?? [],
  };
}

/**
 * Build a text-fallback execution trace.
 */
export function buildTextFallbackTrace(opts: {
  routingReason: string;
  constraintIds: string[];
  notes?: string[];
}): ExecutionTrace {
  return {
    route:         "text_fallback",
    routingReason: opts.routingReason,
    constraintIds: opts.constraintIds,
    graphUsed:     false,
    fallbackUsed:  true,
    proofMode:     "text",
    diffMode:      "text",
    repairMode:    "text",
    notes:         opts.notes ?? [],
  };
}

/**
 * Generic builder — selects the correct factory based on route.
 */
export function buildExecutionTrace(opts: {
  route: ExecutionRoute;
  routingReason: string;
  constraintIds: string[];
  notes?: string[];
}): ExecutionTrace {
  switch (opts.route) {
    case "graph_first":
      return buildGraphFirstTrace(opts);
    case "event_fallback":
      return buildEventFallbackTrace(opts);
    case "text_fallback":
      return buildTextFallbackTrace(opts);
  }
}
