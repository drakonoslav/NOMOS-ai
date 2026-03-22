/**
 * execution_router.ts
 *
 * Deterministic execution routing for NOMOS.
 *
 * resolveExecutionRoute() examines what data is available in the context
 * and selects exactly one execution route — never blending two.
 *
 * Priority:
 *   1. graph_first    — canonical graph present and non-empty
 *   2. event_fallback — temporal event data present (no graph)
 *   3. text_fallback  — only if fallbackAllowed is true
 *   4. Error          — no viable route and fallback not allowed
 *
 * Design invariants:
 *   - Returns exactly one decision; never returns more than one route.
 *   - If canonical graph is present and sufficient, does NOT silently
 *     select text_fallback.
 *   - text_fallback may only be returned when fallbackAllowed === true.
 */

import type {
  ExecutionRoute,
  ExecutionRoutingDecision,
  ExecutionRoutingContext,
} from "./execution_route_types.ts";
import type { CanonicalGraph } from "../graph/canonical_graph_types.ts";

/* =========================================================
   Helpers
   ========================================================= */

/**
 * Returns true if the canonical graph is non-empty (has at least one node
 * and at least one entity or quantity node).
 */
function isGraphNonEmpty(graph: CanonicalGraph): boolean {
  if (graph.nodes.length === 0) return false;
  return graph.nodes.some(
    (n) => n.kind === "entity" || n.kind === "quantity"
  );
}

/**
 * Returns true if all required entity labels are present in the graph.
 */
function graphHasRequiredLabels(
  graph: CanonicalGraph,
  labels: string[]
): boolean {
  if (labels.length === 0) return true;
  const nodeLabelSet = new Set(
    graph.nodes
      .filter((n) => n.kind === "entity" || n.kind === "quantity")
      .map((n) => n.label.toLowerCase())
  );
  return labels.every((l) => nodeLabelSet.has(l.toLowerCase()));
}

/**
 * Returns true if all required relation kinds are present in the graph.
 */
function graphHasRequiredRelations(
  graph: CanonicalGraph,
  kinds: string[]
): boolean {
  if (kinds.length === 0) return true;
  const edgeKindSet = new Set(graph.edges.map((e) => e.kind.toLowerCase()));
  return kinds.every((k) => edgeKindSet.has(k.toLowerCase()));
}

/* =========================================================
   Routing function
   ========================================================= */

/**
 * Resolves the execution route given the available context.
 *
 * This is the single authoritative entry point for all NOMOS execution
 * routing decisions.  Callers must NOT manually select a route.
 *
 * @throws Error if no viable route is found and fallbackAllowed is false.
 */
export function resolveExecutionRoute(
  context: ExecutionRoutingContext
): ExecutionRoutingDecision {
  const {
    canonicalGraph,
    canonicalEntities,
    canonicalRelations,
    eventData,
    fallbackAllowed = false,
    requiredEntityLabels = [],
    requiredRelationKinds = [],
  } = context;

  const hasCanonicalEntities =
    Array.isArray(canonicalEntities) && canonicalEntities.length > 0;
  const hasCanonicalRelations =
    Array.isArray(canonicalRelations) && canonicalRelations.length > 0;
  const hasCanonicalGraph =
    canonicalGraph != null && isGraphNonEmpty(canonicalGraph);

  /* -------------------------------------------------------
     Priority 1: graph_first
     Graph must be present and non-empty.
     If requiredEntityLabels/requiredRelationKinds are given, all must match.
     ------------------------------------------------------- */
  if (hasCanonicalGraph) {
    const graph = canonicalGraph!;
    const labelsOk = graphHasRequiredLabels(graph, requiredEntityLabels);
    const relationsOk = graphHasRequiredRelations(graph, requiredRelationKinds);
    const entityCount = graph.nodes.filter(
      (n) => n.kind === "entity" || n.kind === "quantity"
    ).length;
    const edgeCount = graph.edges.length;

    if (labelsOk && relationsOk) {
      return {
        route:                "graph_first",
        reason:               `canonical graph present with ${entityCount} entity node(s) and ${edgeCount} edge(s)`,
        hasCanonicalEntities: hasCanonicalEntities || entityCount > 0,
        hasCanonicalRelations: hasCanonicalRelations || edgeCount > 0,
        hasCanonicalGraph:    true,
        fallbackAllowed,
      };
    }

    // Graph present but missing required operands — still prefer graph_first
    // with a reason noting the gap (execution will produce warnings).
    const missing: string[] = [];
    if (!labelsOk) missing.push(`missing required entity labels [${requiredEntityLabels.join(", ")}]`);
    if (!relationsOk) missing.push(`missing required relation kinds [${requiredRelationKinds.join(", ")}]`);

    return {
      route:                "graph_first",
      reason:               `canonical graph present (${entityCount} entity node(s)); ${missing.join("; ")} — graph_first selected with potential gaps`,
      hasCanonicalEntities: hasCanonicalEntities || entityCount > 0,
      hasCanonicalRelations: hasCanonicalRelations || edgeCount > 0,
      hasCanonicalGraph:    true,
      fallbackAllowed,
    };
  }

  /* -------------------------------------------------------
     Priority 2: event_fallback
     No canonical graph, but event-array data is available.
     ------------------------------------------------------- */
  if (Array.isArray(eventData) && eventData.length > 0) {
    return {
      route:                "event_fallback",
      reason:               `no canonical graph; ${eventData.length} temporal event(s) available`,
      hasCanonicalEntities,
      hasCanonicalRelations,
      hasCanonicalGraph:    false,
      fallbackAllowed,
    };
  }

  /* -------------------------------------------------------
     Priority 3: text_fallback
     Only available when fallbackAllowed is explicitly true.
     ------------------------------------------------------- */
  if (fallbackAllowed) {
    const why = hasCanonicalEntities
      ? "canonical entities present but no graph built; text_fallback explicitly allowed"
      : "no graph, no events; text_fallback explicitly allowed";
    return {
      route:                "text_fallback",
      reason:               why,
      hasCanonicalEntities,
      hasCanonicalRelations,
      hasCanonicalGraph:    false,
      fallbackAllowed:      true,
    };
  }

  /* -------------------------------------------------------
     No viable route.
     ------------------------------------------------------- */
  throw new Error(
    "resolveExecutionRoute: no viable execution route. " +
    "Provide a canonical graph, event data, or set fallbackAllowed=true."
  );
}

/* =========================================================
   Route classification helpers (for consumers)
   ========================================================= */

export function isGraphFirstRoute(route: ExecutionRoute): boolean {
  return route === "graph_first";
}

export function isFallbackRoute(route: ExecutionRoute): boolean {
  return route === "event_fallback" || route === "text_fallback";
}

export function routeDisplayLabel(route: ExecutionRoute): string {
  switch (route) {
    case "graph_first":    return "Graph-first execution";
    case "event_fallback": return "Event fallback";
    case "text_fallback":  return "Text fallback";
  }
}
