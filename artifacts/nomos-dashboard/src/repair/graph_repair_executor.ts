/**
 * graph_repair_executor.ts
 *
 * Applies a GraphRepairPlan to a CanonicalGraph, producing a repaired graph.
 *
 * applyGraphRepairPlan(graph, plan) is a pure function — it never mutates
 * the input graph. It returns a new CanonicalGraph with each action applied
 * in order, plus a change log and list of applied/skipped action IDs.
 *
 * Action application rules:
 *   ADD_ENTITY         — create new node with provided label/tags/measures;
 *                        if anchorLabel + relation given, also create an edge
 *   REMOVE_ENTITY      — remove node by targetNodeId + all edges incident to it
 *   UPDATE_QUANTITY    — find the measure matching the unit, set newAmount
 *   UPDATE_UNIT        — find the measure matching previousUnit, set newUnit
 *   ADD_RELATION       — create new edge from fromNodeId to toNodeId with offset
 *   REMOVE_RELATION    — remove edge by targetEdgeId
 *   UPDATE_RELATION_OFFSET — find edge by targetEdgeId, set offset.amount = newOffsetAmount
 *   MOVE_ENTITY_TO_CANDIDATE — set node.data.candidateId = toCandidateId
 *   ADD_TAG            — append tag to node.data.tags if not already present
 *   REMOVE_TAG         — remove tag from node.data.tags
 *
 * If targetNodeId or targetEdgeId is not found in the graph, the action is
 * recorded as skipped (not thrown as an error) and execution continues.
 *
 * Design invariants:
 *   - Input graph is never mutated.
 *   - Node/edge IDs in the output are stable and globally unique.
 *   - Each applied action appends one line to changeLog.
 */

import type { CanonicalGraph, CanonicalGraphNode, CanonicalGraphEdge } from "../graph/canonical_graph_types.ts";
import type { GraphRepairPlan, GraphRepairAction, GraphRepairExecutionResult } from "./graph_repair_types.ts";

/* =========================================================
   Internal counters for new node/edge IDs
   ========================================================= */

let nodeCounter = 1000;
let edgeCounter = 1000;

export function resetExecutorCounters(): void {
  nodeCounter = 1000;
  edgeCounter = 1000;
}

function nextNodeId(): string {
  return `cgn_repair_${nodeCounter++}`;
}

function nextEdgeId(): string {
  return `cge_repair_${edgeCounter++}`;
}

/* =========================================================
   Graph clone helpers
   ========================================================= */

function cloneNode(n: CanonicalGraphNode): CanonicalGraphNode {
  return {
    id:    n.id,
    kind:  n.kind,
    label: n.label,
    data:  deepClone(n.data) as Record<string, unknown>,
  };
}

function cloneEdge(e: CanonicalGraphEdge): CanonicalGraphEdge {
  return {
    id:   e.id,
    kind: e.kind,
    from: e.from,
    to:   e.to,
    data: deepClone(e.data) as Record<string, unknown>,
  };
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function cloneGraph(g: CanonicalGraph): CanonicalGraph {
  return {
    nodes: g.nodes.map(cloneNode),
    edges: g.edges.map(cloneEdge),
  };
}

/* =========================================================
   Per-action appliers
   ========================================================= */

function applyAddEntity(
  graph: CanonicalGraph,
  action: GraphRepairAction,
  changeLog: string[]
): void {
  const p = action.payload;
  const nodeId  = nextNodeId();
  const newNode: CanonicalGraphNode = {
    id:    nodeId,
    kind:  (p.kind as "entity" | "quantity") ?? "entity",
    label: String(p.label ?? "repaired-entity"),
    data: {
      tags:              Array.isArray(p.tags) ? [...(p.tags as string[])] : [],
      measures:          Array.isArray(p.measures) ? deepClone(p.measures) : [],
      provenance:        "repair",
      canonicalEntityId: nodeId,
    },
  };
  graph.nodes.push(newNode);
  changeLog.push(`added entity node ${nodeId} (${newNode.label})`);

  // Optionally add a relation edge
  const anchorLabel  = p.anchorLabel as string | undefined;
  const relation     = p.relation    as string | undefined;
  const offsetAmount = p.offsetAmount as number | undefined;
  const offsetUnit   = p.offsetUnit  as string | undefined;

  if (anchorLabel && relation) {
    const anchorNode = graph.nodes.find(
      (n) => n.kind === "anchor" && n.label.toLowerCase() === anchorLabel.toLowerCase()
    );
    const toId = anchorNode?.id ?? `anc_unknown`;

    const edgeId = nextEdgeId();
    const newEdge: CanonicalGraphEdge = {
      id:   edgeId,
      kind: relation.toLowerCase(),
      from: nodeId,
      to:   toId,
      data: {
        relationType: relation.toUpperCase(),
        provenance:   "repair",
        confidence:   0.95,
        offset: offsetAmount != null
          ? { amount: offsetAmount, unit: offsetUnit ?? "min", unitNormalized: "min", dimension: "time" }
          : undefined,
      },
    };
    graph.edges.push(newEdge);
    changeLog.push(`added ${relation} edge ${edgeId} from ${nodeId} to ${toId} (offset: ${offsetAmount ?? "none"}${offsetUnit ?? ""})`);
  }
}

function applyRemoveEntity(
  graph: CanonicalGraph,
  action: GraphRepairAction,
  changeLog: string[],
  skipped: string[]
): void {
  const nodeId = action.targetNodeId;
  if (!nodeId) { skipped.push(action.id); return; }

  const idx = graph.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    changeLog.push(`SKIP remove entity ${nodeId}: node not found`);
    skipped.push(action.id);
    return;
  }

  const label = graph.nodes[idx].label;
  graph.nodes.splice(idx, 1);

  // Remove all edges incident to this node
  const edgesBefore = graph.edges.length;
  graph.edges = graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
  const removedEdges = edgesBefore - graph.edges.length;
  changeLog.push(`removed entity node ${nodeId} (${label}) and ${removedEdges} incident edge(s)`);
}

function applyUpdateQuantity(
  graph: CanonicalGraph,
  action: GraphRepairAction,
  changeLog: string[],
  skipped: string[]
): void {
  const nodeId = action.targetNodeId;
  if (!nodeId) { skipped.push(action.id); return; }

  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    changeLog.push(`SKIP update quantity on ${nodeId}: node not found`);
    skipped.push(action.id);
    return;
  }

  const unit       = String(action.payload.unit ?? "");
  const newAmount  = Number(action.payload.newAmount ?? 0);
  const measures   = node.data.measures as Array<{ amount: number; unit: string; unitNormalized?: string }> | undefined;

  if (!Array.isArray(measures) || measures.length === 0) {
    // Create a new measure entry
    node.data.measures = [{ amount: newAmount, unit, unitNormalized: unit }];
    changeLog.push(`created measure on ${nodeId} (${node.label}): ${newAmount}${unit}`);
    return;
  }

  const m = measures.find(
    (m) =>
      m.unit.toLowerCase() === unit.toLowerCase() ||
      (m.unitNormalized ?? "").toLowerCase() === unit.toLowerCase()
  );
  if (!m) {
    // Append new measure
    measures.push({ amount: newAmount, unit, unitNormalized: unit });
    changeLog.push(`added measure on ${nodeId} (${node.label}): ${newAmount}${unit}`);
    return;
  }

  const prev = m.amount;
  m.amount   = newAmount;
  changeLog.push(`updated ${node.label} quantity ${prev}${unit} → ${newAmount}${unit}`);
}

function applyUpdateUnit(
  graph: CanonicalGraph,
  action: GraphRepairAction,
  changeLog: string[],
  skipped: string[]
): void {
  const nodeId = action.targetNodeId;
  if (!nodeId) { skipped.push(action.id); return; }

  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    skipped.push(action.id);
    changeLog.push(`SKIP update unit on ${nodeId}: node not found`);
    return;
  }

  const prevUnit = String(action.payload.previousUnit ?? "");
  const newUnit  = String(action.payload.newUnit ?? "");
  const measures = node.data.measures as Array<{ amount: number; unit: string; unitNormalized?: string }> | undefined;

  if (!Array.isArray(measures)) {
    skipped.push(action.id);
    changeLog.push(`SKIP update unit on ${nodeId}: no measures`);
    return;
  }

  const m = measures.find((m) => m.unit.toLowerCase() === prevUnit.toLowerCase());
  if (!m) {
    skipped.push(action.id);
    changeLog.push(`SKIP update unit on ${nodeId}: unit '${prevUnit}' not found`);
    return;
  }

  m.unit           = newUnit;
  m.unitNormalized = newUnit;
  changeLog.push(`updated unit on ${nodeId} (${node.label}): ${prevUnit} → ${newUnit}`);
}

function applyAddRelation(
  graph: CanonicalGraph,
  action: GraphRepairAction,
  changeLog: string[],
  skipped: string[]
): void {
  const fromId = String(action.payload.fromNodeId ?? action.targetNodeId ?? "");
  const toId   = String(action.payload.toNodeId ?? "");
  const kind   = String(action.payload.kind ?? "before").toLowerCase();

  if (!fromId || !toId) {
    skipped.push(action.id);
    changeLog.push(`SKIP add relation: missing fromNodeId or toNodeId`);
    return;
  }

  const fromExists = graph.nodes.some((n) => n.id === fromId);
  const toExists   = graph.nodes.some((n) => n.id === toId) || toId.startsWith("anc_");
  if (!fromExists) {
    skipped.push(action.id);
    changeLog.push(`SKIP add relation: from node ${fromId} not found`);
    return;
  }

  const edgeId  = nextEdgeId();
  const offset  = action.payload.offset as { amount?: number; unit?: string } | undefined;
  const newEdge: CanonicalGraphEdge = {
    id:   edgeId,
    kind,
    from: fromId,
    to:   toId,
    data: {
      relationType: kind.toUpperCase(),
      provenance:   "repair",
      confidence:   Number(action.payload.confidence ?? 0.95),
      offset: offset
        ? { amount: offset.amount ?? 0, unit: offset.unit ?? "min", unitNormalized: "min", dimension: "time" }
        : undefined,
    },
  };

  graph.edges.push(newEdge);
  changeLog.push(`added ${kind} edge ${edgeId} from ${fromId} to ${toId}${offset ? ` (offset: ${offset.amount}${offset.unit ?? "min"})` : ""}`);
}

function applyRemoveRelation(
  graph: CanonicalGraph,
  action: GraphRepairAction,
  changeLog: string[],
  skipped: string[]
): void {
  const edgeId = action.targetEdgeId;
  if (!edgeId) { skipped.push(action.id); return; }

  const idx = graph.edges.findIndex((e) => e.id === edgeId);
  if (idx === -1) {
    skipped.push(action.id);
    changeLog.push(`SKIP remove relation ${edgeId}: edge not found`);
    return;
  }

  const edge = graph.edges[idx];
  graph.edges.splice(idx, 1);
  changeLog.push(`removed ${edge.kind} edge ${edgeId} from ${edge.from} to ${edge.to}`);
}

function applyUpdateRelationOffset(
  graph: CanonicalGraph,
  action: GraphRepairAction,
  changeLog: string[],
  skipped: string[]
): void {
  const edgeId = action.targetEdgeId;
  if (!edgeId) { skipped.push(action.id); return; }

  const edge = graph.edges.find((e) => e.id === edgeId);
  if (!edge) {
    skipped.push(action.id);
    changeLog.push(`SKIP update offset on edge ${edgeId}: edge not found`);
    return;
  }

  const newOffset = Number(action.payload.newOffsetAmount ?? 0);
  const unit      = String(action.payload.unit ?? "min");
  const prev      = Number(action.payload.previousOffsetAmount ?? 0);

  const offsetObj = edge.data.offset as Record<string, unknown> | undefined;
  if (offsetObj) {
    offsetObj.amount = newOffset;
    offsetObj.unit   = unit;
  } else {
    edge.data.offset = { amount: newOffset, unit, unitNormalized: "min", dimension: "time" };
  }

  const nodeLabel = action.targetNodeId
    ? (graph.nodes.find((n) => n.id === action.targetNodeId)?.label ?? action.targetNodeId)
    : edge.from;
  changeLog.push(`updated ${edge.kind} offset on ${nodeLabel}: ${prev}min → ${newOffset}min`);
}

function applyMoveEntityToCandidate(
  graph: CanonicalGraph,
  action: GraphRepairAction,
  changeLog: string[],
  skipped: string[]
): void {
  const nodeId = action.targetNodeId;
  if (!nodeId) { skipped.push(action.id); return; }

  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    skipped.push(action.id);
    changeLog.push(`SKIP move entity ${nodeId}: node not found`);
    return;
  }

  const from = node.data.candidateId ?? "(none)";
  const to   = String(action.payload.toCandidateId ?? "");
  node.data.candidateId = to;
  changeLog.push(`moved ${node.label} from candidate '${from}' to '${to}'`);
}

function applyAddTag(
  graph: CanonicalGraph,
  action: GraphRepairAction,
  changeLog: string[],
  skipped: string[]
): void {
  const nodeId = action.targetNodeId;
  if (!nodeId) { skipped.push(action.id); return; }

  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    skipped.push(action.id);
    changeLog.push(`SKIP add tag on ${nodeId}: node not found`);
    return;
  }

  const tag  = String(action.payload.tag ?? "").toLowerCase();
  const tags = node.data.tags as string[] | undefined ?? [];
  if (!tags.includes(tag)) {
    tags.push(tag);
    node.data.tags = tags;
    changeLog.push(`added tag '${tag}' to ${node.label}`);
  } else {
    changeLog.push(`tag '${tag}' already present on ${node.label} (no-op)`);
  }
}

function applyRemoveTag(
  graph: CanonicalGraph,
  action: GraphRepairAction,
  changeLog: string[],
  skipped: string[]
): void {
  const nodeId = action.targetNodeId;
  if (!nodeId) { skipped.push(action.id); return; }

  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    skipped.push(action.id);
    changeLog.push(`SKIP remove tag on ${nodeId}: node not found`);
    return;
  }

  const tag  = String(action.payload.tag ?? "").toLowerCase();
  const tags = (node.data.tags as string[] | undefined ?? []).filter((t) => t !== tag);
  node.data.tags = tags;
  changeLog.push(`removed tag '${tag}' from ${node.label}`);
}

/* =========================================================
   Public entry point
   ========================================================= */

/**
 * Apply a repair plan to a graph, returning the repaired graph.
 *
 * The input graph is never mutated.
 * Actions are applied in index order.
 * Skipped actions are recorded but do not halt execution.
 */
export function applyGraphRepairPlan(
  graph: CanonicalGraph,
  plan: GraphRepairPlan
): GraphRepairExecutionResult {
  const working     = cloneGraph(graph);
  const changeLog:  string[] = [];
  const applied:    string[] = [];
  const skipped:    string[] = [];

  for (const action of plan.actions) {
    switch (action.type) {
      case "ADD_ENTITY":
        applyAddEntity(working, action, changeLog);
        applied.push(action.id);
        break;
      case "REMOVE_ENTITY":
        applyRemoveEntity(working, action, changeLog, skipped);
        if (!skipped.includes(action.id)) applied.push(action.id);
        break;
      case "UPDATE_QUANTITY":
        applyUpdateQuantity(working, action, changeLog, skipped);
        if (!skipped.includes(action.id)) applied.push(action.id);
        break;
      case "UPDATE_UNIT":
        applyUpdateUnit(working, action, changeLog, skipped);
        if (!skipped.includes(action.id)) applied.push(action.id);
        break;
      case "ADD_RELATION":
        applyAddRelation(working, action, changeLog, skipped);
        if (!skipped.includes(action.id)) applied.push(action.id);
        break;
      case "REMOVE_RELATION":
        applyRemoveRelation(working, action, changeLog, skipped);
        if (!skipped.includes(action.id)) applied.push(action.id);
        break;
      case "UPDATE_RELATION_OFFSET":
        applyUpdateRelationOffset(working, action, changeLog, skipped);
        if (!skipped.includes(action.id)) applied.push(action.id);
        break;
      case "MOVE_ENTITY_TO_CANDIDATE":
        applyMoveEntityToCandidate(working, action, changeLog, skipped);
        if (!skipped.includes(action.id)) applied.push(action.id);
        break;
      case "ADD_TAG":
        applyAddTag(working, action, changeLog, skipped);
        if (!skipped.includes(action.id)) applied.push(action.id);
        break;
      case "REMOVE_TAG":
        applyRemoveTag(working, action, changeLog, skipped);
        if (!skipped.includes(action.id)) applied.push(action.id);
        break;
    }
  }

  return {
    repairedGraph:    working,
    appliedActionIds: applied,
    skippedActionIds: skipped,
    changeLog,
  };
}
