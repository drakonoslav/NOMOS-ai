/**
 * canonical_graph_builder.ts
 *
 * Orchestrates the canonical entity-relation graph projection.
 *
 * Input:  CanonicalEntity[], CanonicalRelation[], anchorLabels, and optional
 *         candidate / objective / constraint records.
 * Output: CanonicalGraph + CanonicalGraphTrace.
 *
 * Projection pipeline:
 *   Phase 1 — Entity nodes       (one per CanonicalEntity)
 *   Phase 2 — Anchor nodes       (one per unique anchor in relation.toEntityId)
 *   Phase 3 — Optional nodes     (candidates, objectives, constraints)
 *   Phase 4 — Relation edges     (one per CanonicalRelation)
 *   Phase 5 — Trace              (counts + warnings)
 *
 * Invariants enforced:
 *   I1 — One CanonicalEntity → exactly one graph node (entity or quantity).
 *   I2 — One CanonicalRelation → exactly one graph edge (or a logged warning).
 *   I3 — No graph node may silently reclassify entity tags or relation meaning.
 *   I4 — If graph data exists, downstream execution must prefer it over raw text.
 *
 * Entry points:
 *   buildCanonicalGraph(input)         — accepts pre-normalized canonical records
 *   buildCanonicalGraphFromText(text)  — convenience wrapper, resets all counters
 */

import {
  normalizeWithAnchors,
} from "../compiler/canonical_relation_normalizer.ts";
import type { CanonicalEntity }          from "../compiler/canonical_entity_types.ts";
import type { CanonicalRelation }        from "../compiler/canonical_relation_types.ts";
import type {
  CanonicalGraph,
  CanonicalGraphInput,
  CanonicalGraphResult,
  CanonicalGraphNode,
  CanonicalGraphEdge,
} from "./canonical_graph_types.ts";
import {
  projectEntityNode,
  projectAnchorNode,
  projectCandidateNode,
  projectObjectiveNode,
  projectConstraintNode,
  projectRelationEdge,
  buildProjectionTrace,
  entityNodeId,
  anchorNodeId,
} from "./canonical_graph_projection.ts";

/* =========================================================
   Core builder
   ========================================================= */

/**
 * Build a CanonicalGraph from pre-normalized canonical records.
 *
 * The builder is a pure projection function — it does not call any extractor,
 * parser, or LLM.  All semantic content must already be present in the input.
 *
 * Duplicate anchor nodes are deduplicated by anchorId.
 * Projection warnings are accumulated and returned in the trace.
 */
export function buildCanonicalGraph(input: CanonicalGraphInput): CanonicalGraphResult {
  const warnings: string[] = [];
  const nodes: CanonicalGraphNode[] = [];
  const edges: CanonicalGraphEdge[] = [];

  // ── Phase 1: Entity nodes ──────────────────────────────────────────────────
  // Maps canonical entity IDs (e.g. "me_0") → graph node IDs (e.g. "cgn_me_0").
  // Used by the relation projection phase to resolve edge endpoints.
  const entityNodeMap = new Map<string, string>();

  for (const entity of input.entities) {
    const node = projectEntityNode(entity);
    nodes.push(node);
    entityNodeMap.set(entity.id, node.id);
  }

  // ── Phase 2: Anchor nodes ──────────────────────────────────────────────────
  // Collect all unique anchor IDs referenced in relations, then create nodes.
  const anchorNodeMap = new Map<string, string>();
  const seenAnchors   = new Set<string>();

  for (const relation of input.relations) {
    const toId = relation.toEntityId;
    if (toId !== null && toId.startsWith("anc_") && !seenAnchors.has(toId)) {
      seenAnchors.add(toId);
      const label = input.anchorLabels?.get(toId) ?? toId;
      if (!input.anchorLabels?.has(toId)) {
        warnings.push(
          `[projection] anchor "${toId}" has no label in anchorLabels — using ID as label`,
        );
      }
      const node = projectAnchorNode(toId, label);
      nodes.push(node);
      anchorNodeMap.set(toId, anchorNodeId(toId));
    }
  }

  // ── Phase 3: Optional structural nodes ────────────────────────────────────
  for (const cand of input.candidates ?? []) {
    nodes.push(projectCandidateNode(cand));
  }
  for (const obj of input.objectives ?? []) {
    nodes.push(projectObjectiveNode(obj));
  }
  for (const con of input.constraints ?? []) {
    nodes.push(projectConstraintNode(con));
  }

  // ── Phase 4: Relation edges ────────────────────────────────────────────────
  for (const relation of input.relations) {
    const edge = projectRelationEdge(relation, entityNodeMap, anchorNodeMap, warnings);
    if (edge !== null) {
      edges.push(edge);
    }
  }

  // ── Phase 5: Trace ────────────────────────────────────────────────────────
  const graph: CanonicalGraph = { nodes, edges };
  const trace = buildProjectionTrace(
    input.entities.length,
    input.relations.length,
    nodes,
    edges,
    warnings,
  );

  return { graph, trace };
}

/* =========================================================
   Text convenience entry point
   ========================================================= */

/**
 * Build a CanonicalGraph directly from raw text.
 *
 * Calls normalizeWithAnchors() which resets all counters (entity counter via
 * bindRelations, relation counter explicitly) so IDs are always stable.
 *
 * Optional structural annotations (candidates, objectives, constraints) can
 * be provided in the options parameter.
 */
export function buildCanonicalGraphFromText(
  rawText: string,
  options?: {
    candidates?: CanonicalGraphInput["candidates"];
    objectives?: CanonicalGraphInput["objectives"];
    constraints?: CanonicalGraphInput["constraints"];
  },
): CanonicalGraphResult {
  const { entities, relations, anchorLabels } = normalizeWithAnchors(rawText);

  return buildCanonicalGraph({
    entities,
    relations,
    anchorLabels,
    candidates:  options?.candidates,
    objectives:  options?.objectives,
    constraints: options?.constraints,
  });
}

/* =========================================================
   Invariant helpers (exported for test access)
   ========================================================= */

/**
 * Assert that graph entity node count equals canonical entity count.
 * Returns a list of violation strings (empty = invariant holds).
 *
 * Invariant I1: one CanonicalEntity → one graph node.
 */
export function checkI1EntityNodeCount(
  entities: CanonicalEntity[],
  nodes: CanonicalGraphNode[],
): string[] {
  const entityAndQuantityNodes = nodes.filter(
    (n) => n.kind === "entity" || n.kind === "quantity",
  );
  if (entityAndQuantityNodes.length !== entities.length) {
    return [
      `I1 VIOLATION: ${entities.length} canonical entities but ` +
      `${entityAndQuantityNodes.length} entity/quantity nodes`,
    ];
  }
  return [];
}

/**
 * Assert that no entity node has a different tag set than its source entity.
 * Returns a list of violation strings (empty = invariant holds).
 *
 * Invariant I3: no silent tag reclassification.
 */
export function checkI3NoTagReclassification(
  entities: CanonicalEntity[],
  nodes: CanonicalGraphNode[],
): string[] {
  const violations: string[] = [];
  const entityMap = new Map(entities.map((e) => [e.id, e]));

  for (const node of nodes) {
    if (node.kind !== "entity" && node.kind !== "quantity") continue;
    const entityId = node.data["canonicalEntityId"] as string | undefined;
    if (!entityId) continue;
    const entity = entityMap.get(entityId);
    if (!entity) continue;

    const nodeTags   = (node.data["tags"] as unknown[] | undefined)?.length ?? 0;
    const entityTags = entity.tags.length;
    if (nodeTags !== entityTags) {
      violations.push(
        `I3 VIOLATION on node ${node.id}: ` +
        `entity has ${entityTags} tags but node.data.tags has ${nodeTags}`,
      );
    }
  }
  return violations;
}

/**
 * Assert that every edge.from references a valid node in the graph.
 * Returns a list of violation strings (empty = invariant holds).
 */
export function checkEdgeSourcesValid(
  nodes: CanonicalGraphNode[],
  edges: CanonicalGraphEdge[],
): string[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const violations: string[] = [];
  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) {
      violations.push(`Edge ${edge.id} (${edge.kind}) has unknown from="${edge.from}"`);
    }
  }
  return violations;
}
