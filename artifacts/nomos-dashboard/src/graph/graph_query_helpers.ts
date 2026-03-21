/**
 * graph_query_helpers.ts
 *
 * Structural query helpers for OperandGraph.
 *
 * These helpers allow later evaluators to query the graph structurally
 * instead of parsing raw strings.  All queries are deterministic.
 *
 * Available helpers:
 *   getCandidateEntities(graph, candidateId)
 *   getConstraintWindows(graph)
 *   getEntitiesRelativeToAnchor(graph, anchorLabel)
 *   getQuantifiedEntities(graph)
 *   getConstraintOperands(graph)
 *   getWindowsForEntity(graph, entityNodeId)
 *   getAnchors(graph)
 */

import type { OperandGraph, GraphNode, GraphEdge } from "./operand_graph_types.ts";

/* =========================================================
   Internal helpers
   ========================================================= */

function nodeById(graph: OperandGraph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

function edgesFrom(graph: OperandGraph, fromId: string): GraphEdge[] {
  return graph.edges.filter((e) => e.from === fromId);
}

function edgesTo(graph: OperandGraph, toId: string): GraphEdge[] {
  return graph.edges.filter((e) => e.to === toId);
}

/* =========================================================
   Public query helpers
   ========================================================= */

/**
 * Return all entity nodes that belong to a given candidate node.
 *
 * Traverses BELONGS_TO_CANDIDATE edges pointing to the candidate.
 * If candidateId is omitted, returns entities for ALL candidates.
 */
export function getCandidateEntities(
  graph: OperandGraph,
  candidateId?: string
): GraphNode[] {
  const candidateIds: Set<string> = candidateId
    ? new Set([candidateId])
    : new Set(
        graph.nodes
          .filter((n) => n.type === "candidate")
          .map((n) => n.id)
      );

  return graph.edges
    .filter((e) => e.type === "BELONGS_TO_CANDIDATE" && candidateIds.has(e.to))
    .map((e) => nodeById(graph, e.from))
    .filter((n): n is GraphNode => n !== undefined && n.type === "entity");
}

/**
 * Return all window nodes in the graph.
 *
 * Window nodes capture temporal / spatial windows
 * (e.g. "30min before lifting", "within 90 minutes before lifting").
 */
export function getConstraintWindows(graph: OperandGraph): GraphNode[] {
  return graph.nodes.filter((n) => n.type === "window");
}

/**
 * Return all entity nodes that are connected (via any directional edge) to an
 * anchor with the given label (case-insensitive).
 *
 * Traverses:
 *   entity → BEFORE | AFTER | WITHIN | RELATIVE_TO → window → ANCHORS_TO → anchor
 *   entity → BEFORE | AFTER | RELATIVE_TO → anchor  (direct)
 */
export function getEntitiesRelativeToAnchor(
  graph:       OperandGraph,
  anchorLabel: string
): GraphNode[] {
  const lower = anchorLabel.toLowerCase();

  // Find matching anchor nodes
  const anchorNodeIds = new Set(
    graph.nodes
      .filter((n) => n.type === "anchor" && n.label.toLowerCase() === lower)
      .map((n) => n.id)
  );
  if (anchorNodeIds.size === 0) return [];

  // Find window nodes that ANCHORS_TO any of those anchors
  const windowNodeIds = new Set(
    graph.edges
      .filter((e) => e.type === "ANCHORS_TO" && anchorNodeIds.has(e.to))
      .map((e) => e.from)
  );

  const relationalEdgeTypes = new Set([
    "BEFORE", "AFTER", "WITHIN", "BETWEEN", "RELATIVE_TO",
  ]);

  const result: GraphNode[] = [];
  const seen   = new Set<string>();

  for (const edge of graph.edges) {
    if (!relationalEdgeTypes.has(edge.type)) continue;

    // Direct: entity → anchor
    if (anchorNodeIds.has(edge.to)) {
      const n = nodeById(graph, edge.from);
      if (n && n.type === "entity" && !seen.has(n.id)) {
        seen.add(n.id);
        result.push(n);
      }
    }

    // Via window: entity → window
    if (windowNodeIds.has(edge.to)) {
      const n = nodeById(graph, edge.from);
      if (n && n.type === "entity" && !seen.has(n.id)) {
        seen.add(n.id);
        result.push(n);
      }
    }
  }

  return result;
}

/**
 * Return all entity nodes that have at least one HAS_QUANTITY edge.
 *
 * These are the named, measurable entities extracted from text.
 * Bare quantities (bare time offsets like "30 minutes") are excluded
 * because they do not have entity nodes.
 */
export function getQuantifiedEntities(graph: OperandGraph): GraphNode[] {
  const entityIdsWithQty = new Set(
    graph.edges
      .filter((e) => e.type === "HAS_QUANTITY")
      .map((e) => e.from)
  );
  return graph.nodes.filter(
    (n) => n.type === "entity" && entityIdsWithQty.has(n.id)
  );
}

/**
 * Return all entity (or quantity) nodes targeted by a CONSTRAINS edge.
 *
 * These are the operands to which a quantitative constraint applies.
 */
export function getConstraintOperands(graph: OperandGraph): GraphNode[] {
  const operandIds = new Set(
    graph.edges
      .filter((e) => e.type === "CONSTRAINS")
      .map((e) => e.to)
  );
  return graph.nodes.filter((n) => operandIds.has(n.id));
}

/**
 * Return all window nodes associated with a specific entity node.
 *
 * Traverses BEFORE | AFTER | WITHIN edges from the entity.
 */
export function getWindowsForEntity(
  graph:        OperandGraph,
  entityNodeId: string
): GraphNode[] {
  const windowEdgeTypes = new Set(["BEFORE", "AFTER", "WITHIN"]);
  return edgesFrom(graph, entityNodeId)
    .filter((e) => windowEdgeTypes.has(e.type))
    .map((e) => nodeById(graph, e.to))
    .filter((n): n is GraphNode => n !== undefined && n.type === "window");
}

/**
 * Return all anchor nodes in the graph.
 */
export function getAnchors(graph: OperandGraph): GraphNode[] {
  return graph.nodes.filter((n) => n.type === "anchor");
}
