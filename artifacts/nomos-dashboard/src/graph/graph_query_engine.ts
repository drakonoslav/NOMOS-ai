/**
 * graph_query_engine.ts
 *
 * Deterministic graph query functions used by the constraint executor.
 *
 * All functions are pure (no side effects, same input → same output).
 * No LLM generation.
 *
 * Functions:
 *   selectCandidateEntities     — select entities by candidate membership
 *   filterEntitiesByTags        — filter by required data.tags
 *   filterEntitiesByLabels      — filter by entity label (case-insensitive)
 *   restrictEntitiesByAnchorWindow — restrict to temporal/spatial window
 *   aggregateSelectedQuantity   — sum/count/max/min over selected entities
 */

import type { OperandGraph, GraphNode } from "./operand_graph_types.ts";
import { resolveUnit } from "../compiler/unit_registry.ts";

/* =========================================================
   Internal helpers
   ========================================================= */

function nodeById(graph: OperandGraph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

/**
 * Convert an offset amount to minutes.
 * Handles the canonical unit strings used by the unit registry.
 */
export function offsetToMinutes(amount: number, unit: string): number {
  const u = unit.toLowerCase();
  switch (u) {
    case "s":   case "second":  case "seconds":  return amount / 60;
    case "min": case "minute":  case "minutes":  return amount;
    case "hr":  case "hour":    case "hours":    return amount * 60;
    case "d":   case "day":     case "days":     return amount * 1440;
    case "wk":  case "week":    case "weeks":    return amount * 10_080;
    case "mo":  case "month":   case "months":   return amount * 43_200;
    case "yr":  case "year":    case "years":    return amount * 525_600;
    default: return amount; // treat as minutes
  }
}

/* =========================================================
   selectCandidateEntities
   ========================================================= */

/**
 * Select entity nodes from the graph.
 *
 * If `candidateId` is provided (non-null, non-empty):
 *   - Find the candidate node whose label matches candidateId (case-insensitive).
 *   - Return entity nodes connected to it via BELONGS_TO_CANDIDATE edges.
 *
 * If `candidateId` is null / undefined / "":
 *   - Return all entity nodes that have at least one HAS_QUANTITY edge
 *     (i.e., all named, quantified entities in the graph).
 */
export function selectCandidateEntities(
  graph:       OperandGraph,
  candidateId: string | null | undefined
): GraphNode[] {
  if (candidateId != null && candidateId !== "") {
    // Find candidate node by label
    const candidateNode = graph.nodes.find(
      (n) =>
        n.type === "candidate" &&
        n.label.toLowerCase() === candidateId.toLowerCase()
    );
    if (!candidateNode) return [];

    // Return entities pointed to by BELONGS_TO_CANDIDATE
    return graph.edges
      .filter((e) => e.type === "BELONGS_TO_CANDIDATE" && e.to === candidateNode.id)
      .map((e) => nodeById(graph, e.from))
      .filter((n): n is GraphNode => n !== undefined && n.type === "entity");
  }

  // No candidate filter — return all quantified entities
  const withQty = new Set(
    graph.edges
      .filter((e) => e.type === "HAS_QUANTITY")
      .map((e) => e.from)
  );
  return graph.nodes.filter((n) => n.type === "entity" && withQty.has(n.id));
}

/* =========================================================
   filterEntitiesByTags
   ========================================================= */

/**
 * Keep only entities whose `data.tags` contains ALL of the specified tags.
 *
 * Tags comparison is case-insensitive.
 * Entities with no `data.tags` array are excluded when tags is non-empty.
 */
export function filterEntitiesByTags(
  graph:     OperandGraph,
  entityIds: string[],
  tags:      string[]
): string[] {
  if (tags.length === 0) return entityIds;

  const required = tags.map((t) => t.toLowerCase());

  return entityIds.filter((id) => {
    const node = nodeById(graph, id);
    if (!node) return false;
    const nodeTags = (node.data?.tags as string[] | undefined) ?? [];
    const lowerTags = nodeTags.map((t) => t.toLowerCase());
    return required.every((t) => lowerTags.includes(t));
  });
}

/* =========================================================
   filterEntitiesByLabels
   ========================================================= */

/**
 * Keep only entities whose label matches one of the specified strings
 * (case-insensitive substring or exact match).
 *
 * If `labels` is empty, all entity ids are returned unchanged.
 */
export function filterEntitiesByLabels(
  graph:     OperandGraph,
  entityIds: string[],
  labels:    string[]
): string[] {
  if (labels.length === 0) return entityIds;

  const lowerLabels = labels.map((l) => l.toLowerCase());

  return entityIds.filter((id) => {
    const node = nodeById(graph, id);
    if (!node) return false;
    const nl = (node.label ?? "").toLowerCase();
    return lowerLabels.some((l) => nl === l || nl.includes(l));
  });
}

/* =========================================================
   restrictEntitiesByAnchorWindow
   ========================================================= */

/**
 * Keep only entities that are temporally / spatially connected to the named
 * anchor within the specified window.
 *
 * An entity qualifies if:
 *   1. It has a BEFORE / AFTER / WITHIN / BETWEEN edge to a window node.
 *   2. That window node has an ANCHORS_TO edge to an anchor whose label
 *      matches anchorLabel (case-insensitive).
 *   3. The window's offsetAmount (converted to minutes) is ≤ windowMinutes.
 *      (windowMinutes = null means any offset qualifies.)
 *
 * If anchorLabel is null / undefined, the anchor check is skipped
 * (all entities with any temporal window survive).
 *
 * If relation is provided, only edges of the matching type are considered.
 *
 * Edge-type mapping: "before" → BEFORE, "after" → AFTER,
 *                    "within" → WITHIN, "between" → BETWEEN.
 */
export function restrictEntitiesByAnchorWindow(
  graph:        OperandGraph,
  entityIds:    string[],
  anchorLabel:  string | null | undefined,
  relation:     "before" | "after" | "within" | "between" | null | undefined,
  windowMinutes: number | null | undefined
): string[] {
  // When no restriction is requested, pass everything through
  if (!anchorLabel && !relation && windowMinutes == null) return entityIds;

  const RELATION_TO_EDGE: Record<string, string> = {
    before:  "BEFORE",
    after:   "AFTER",
    within:  "WITHIN",
    between: "BETWEEN",
  };
  const allowedEdgeTypes = relation
    ? new Set([RELATION_TO_EDGE[relation]].filter(Boolean))
    : new Set(["BEFORE", "AFTER", "WITHIN", "BETWEEN", "RELATIVE_TO"]);

  const lowerAnchor = anchorLabel?.toLowerCase() ?? null;

  return entityIds.filter((entityId) => {
    // Find all temporal/spatial edges from this entity
    const temporalEdges = graph.edges.filter(
      (e) => e.from === entityId && allowedEdgeTypes.has(e.type)
    );
    if (temporalEdges.length === 0) return false;

    for (const edge of temporalEdges) {
      const targetNode = nodeById(graph, edge.to);
      if (!targetNode) continue;

      if (targetNode.type === "window") {
        // Validate anchor
        if (lowerAnchor) {
          const anchorsTo = graph.edges.find(
            (e) => e.type === "ANCHORS_TO" && e.from === targetNode.id
          );
          if (!anchorsTo) continue;
          const anchorNode = nodeById(graph, anchorsTo.to);
          if (!anchorNode) continue;
          if (anchorNode.label.toLowerCase() !== lowerAnchor) continue;
        }

        // Validate window size
        if (windowMinutes != null) {
          const offsetAmt  = targetNode.data?.offsetAmount as number | undefined;
          const offsetUnit = targetNode.data?.offsetUnit  as string | undefined;
          if (offsetAmt == null || !offsetUnit) continue;
          const offsetMin = offsetToMinutes(offsetAmt, offsetUnit);
          if (offsetMin > windowMinutes) continue;
        }

        return true; // qualifies via this window
      }

      if (targetNode.type === "anchor") {
        // Direct entity → anchor edge (no offset info)
        if (lowerAnchor && targetNode.label.toLowerCase() !== lowerAnchor) continue;
        // If windowMinutes is specified but there's no offset, exclude
        if (windowMinutes != null) continue;
        return true;
      }
    }

    return false;
  });
}

/* =========================================================
   aggregateSelectedQuantity
   ========================================================= */

/**
 * Compute an aggregate over the selected entity nodes.
 *
 * For each entity:
 *   - Follow HAS_QUANTITY edge → get amount
 *   - Follow HAS_UNIT edge → get normalizedUnit
 *   - Include the entity only if its normalizedUnit matches `quantityUnit`
 *     (both resolved to canonical form via unit registry, or exact match)
 *
 * Returns 0 when no matching entities are found.
 */
export function aggregateSelectedQuantity(
  graph:        OperandGraph,
  entityIds:    string[],
  quantityUnit: string,
  aggregation:  "sum" | "count" | "max" | "min"
): number {
  if (entityIds.length === 0) return 0;

  // Normalize the target unit to canonical form
  const targetCanonical =
    resolveUnit(quantityUnit)?.canonical ?? quantityUnit.toLowerCase();

  const amounts: number[] = [];

  for (const entityId of entityIds) {
    // HAS_QUANTITY edge → quantity node
    const qtyEdge = graph.edges.find(
      (e) => e.type === "HAS_QUANTITY" && e.from === entityId
    );
    if (!qtyEdge) continue;
    const qtyNode = nodeById(graph, qtyEdge.to);
    if (!qtyNode) continue;
    const amount = qtyNode.data?.amount as number | undefined;
    if (amount == null) continue;

    // HAS_UNIT edge → unit node
    const unitEdge = graph.edges.find(
      (e) => e.type === "HAS_UNIT" && e.from === entityId
    );
    if (!unitEdge) continue;
    const unitNode = nodeById(graph, unitEdge.to);
    if (!unitNode) continue;

    const unitCanonical =
      (unitNode.data?.normalizedUnit as string | undefined) ??
      resolveUnit(unitNode.label)?.canonical ??
      unitNode.label.toLowerCase();

    if (unitCanonical !== targetCanonical) continue;

    amounts.push(amount);
  }

  if (amounts.length === 0) return 0;
  if (aggregation === "count") return amounts.length;
  if (aggregation === "sum")   return amounts.reduce((a, b) => a + b, 0);
  if (aggregation === "max")   return Math.max(...amounts);
  if (aggregation === "min")   return Math.min(...amounts);
  return 0;
}
