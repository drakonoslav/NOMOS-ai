/**
 * canonical_graph_projection.ts
 *
 * Individual projection functions for the canonical entity-relation graph.
 *
 * Each function converts one canonical record into one graph representation
 * (node or edge), preserving all semantic metadata verbatim.
 *
 * The core invariant enforced here:
 *   "The graph projects canonical semantics. It never invents them."
 *
 * No tag re-derivation, no re-classification, no re-inference.
 * All data fields are copied from the canonical source, not recomputed.
 */

import type { CanonicalEntity }   from "../compiler/canonical_entity_types.ts";
import type { CanonicalRelation, CanonicalRelationType }
                                  from "../compiler/canonical_relation_types.ts";
import type {
  CanonicalGraphNode,
  CanonicalGraphEdge,
  CanonicalGraphTrace,
  CanonicalNodeKind,
  CanonicalCandidateRecord,
  CanonicalObjectiveRecord,
  CanonicalConstraintRecord,
} from "./canonical_graph_types.ts";

/* =========================================================
   Node ID helpers
   ========================================================= */

/** Stable graph node ID for a canonical entity. */
export function entityNodeId(entityId: string): string {
  return `cgn_${entityId}`;
}

/** Stable graph node ID for an anchor. */
export function anchorNodeId(anchorId: string): string {
  return `cgn_${anchorId}`;
}

/** Edge ID derived from the canonical relation ID. */
export function relationEdgeId(relationId: string): string {
  return `cge_${relationId}`;
}

/* =========================================================
   Relation type → edge kind
   ========================================================= */

/**
 * Convert a CanonicalRelationType to a graph edge kind string.
 * The kind is the relation type lowercased.
 *
 * Examples:
 *   "BEFORE"           → "before"
 *   "WITHIN_WINDOW"    → "within_window"
 *   "HAS_MEASURE"      → "has_measure"
 *   "COMPARES_TO_THRESHOLD" → "compares_to_threshold"
 */
export function relTypeToEdgeKind(type: CanonicalRelationType): string {
  return type.toLowerCase();
}

/* =========================================================
   Entity projection
   ========================================================= */

/**
 * Project a CanonicalEntity into a CanonicalGraphNode.
 *
 * Projection rules:
 *   - kind = "entity" when labelRaw is non-empty (named entity)
 *   - kind = "quantity" when labelRaw is empty (bare measurement, e.g. "30 minutes")
 *   - All canonical metadata is copied verbatim into data.
 *   - Tags, category, provenance, measures, history: never re-derived.
 */
export function projectEntityNode(entity: CanonicalEntity): CanonicalGraphNode {
  const hasLabel = entity.labelRaw.trim() !== "";
  const kind: CanonicalNodeKind = hasLabel ? "entity" : "quantity";

  const label = hasLabel
    ? entity.labelRaw
    : `${entity.measures[0]?.amount ?? "?"} ${entity.measures[0]?.unitNormalized ?? ""}`.trim();

  return {
    id:   entityNodeId(entity.id),
    kind,
    label,
    data: {
      canonicalEntityId:    entity.id,
      rawText:              entity.rawText,
      normalizedText:       entity.normalizedText,
      labelRaw:             entity.labelRaw,
      labelNormalized:      entity.labelNormalized,
      category:             entity.category,
      categoryConfidence:   entity.categoryConfidence,
      role:                 entity.role,
      tags:                 entity.tags,
      measures:             entity.measures,
      normalizationHistory: entity.normalizationHistory,
      sourceRegistryId:     entity.sourceRegistryId,
    },
  };
}

/* =========================================================
   Anchor projection
   ========================================================= */

/**
 * Project an anchor reference into a CanonicalGraphNode.
 *
 * Anchor nodes are created for each unique toEntityId in relations that
 * targets an AnchorReference (id starts with "anc_").
 *
 * The label comes from the anchorLabels Map produced by normalizeWithAnchors().
 * When the label is not available, a warning is issued and a fallback is used.
 */
export function projectAnchorNode(
  anchorId: string,
  label: string,
): CanonicalGraphNode {
  return {
    id:   anchorNodeId(anchorId),
    kind: "anchor",
    label,
    data: {
      anchorId,
      isKnownAnchor: true,
    },
  };
}

/* =========================================================
   Candidate / Objective / Constraint projection
   ========================================================= */

export function projectCandidateNode(rec: CanonicalCandidateRecord): CanonicalGraphNode {
  return {
    id:   `cgn_cand_${rec.id}`,
    kind: "candidate",
    label: rec.label,
    data: { candidateId: rec.id, ...(rec.data ?? {}) },
  };
}

export function projectObjectiveNode(rec: CanonicalObjectiveRecord): CanonicalGraphNode {
  return {
    id:   `cgn_obj_${rec.id}`,
    kind: "objective",
    label: rec.label,
    data: { objectiveId: rec.id, ...(rec.data ?? {}) },
  };
}

export function projectConstraintNode(rec: CanonicalConstraintRecord): CanonicalGraphNode {
  return {
    id:   `cgn_con_${rec.id}`,
    kind: "constraint",
    label: rec.label,
    data: { constraintId: rec.id, ...(rec.data ?? {}) },
  };
}

/* =========================================================
   Relation projection
   ========================================================= */

/**
 * Project a CanonicalRelation into a CanonicalGraphEdge.
 *
 * Projection rules:
 *   - Every CanonicalRelation produces exactly one graph edge.
 *   - HAS_MEASURE produces a self-edge (from === to = entity node).
 *   - Relations targeting anchors (toEntityId starts with "anc_") use the
 *     anchor node as the target.
 *   - Relations with null toEntityId use the fromEntityId as the target
 *     (self-edge fallback, same as HAS_MEASURE).
 *   - All canonical metadata survives verbatim into edge.data.
 *   - kind is the lowercased CanonicalRelationType — never re-classified.
 *
 * Returns null and adds a warning when the fromEntityId cannot be resolved
 * to a graph node (projection guard: the graph cannot invent entities).
 */
export function projectRelationEdge(
  relation: CanonicalRelation,
  entityNodeIds: Map<string, string>,
  anchorNodeIds: Map<string, string>,
  warnings: string[],
): CanonicalGraphEdge | null {
  const fromNodeId = entityNodeIds.get(relation.fromEntityId);
  if (!fromNodeId) {
    warnings.push(
      `[projection] relation ${relation.id} (${relation.type}) references unknown ` +
      `fromEntityId="${relation.fromEntityId}" — edge skipped`,
    );
    return null;
  }

  let toNodeId: string;

  if (relation.toEntityId === null) {
    toNodeId = fromNodeId;
  } else if (relation.toEntityId.startsWith("anc_")) {
    const ancNode = anchorNodeIds.get(relation.toEntityId);
    if (!ancNode) {
      warnings.push(
        `[projection] relation ${relation.id} references unknown ` +
        `anchor toEntityId="${relation.toEntityId}" — self-edge used as fallback`,
      );
      toNodeId = fromNodeId;
    } else {
      toNodeId = ancNode;
    }
  } else {
    const toNode = entityNodeIds.get(relation.toEntityId);
    if (!toNode) {
      warnings.push(
        `[projection] relation ${relation.id} references unknown ` +
        `toEntityId="${relation.toEntityId}" — self-edge used as fallback`,
      );
      toNodeId = fromNodeId;
    } else {
      toNodeId = toNode;
    }
  }

  return {
    id:   relationEdgeId(relation.id),
    kind: relTypeToEdgeKind(relation.type),
    from: fromNodeId,
    to:   toNodeId,
    data: {
      canonicalRelationId:  relation.id,
      relationType:         relation.type,
      labelRaw:             relation.labelRaw,
      labelNormalized:      relation.labelNormalized,
      provenance:           relation.provenance,
      confidence:           relation.confidence,
      offset:               relation.offset ?? null,
      window:               relation.window ?? null,
      qualifiers:           relation.qualifiers,
      sourceRegistryId:     relation.sourceRegistryId,
      normalizationHistory: relation.normalizationHistory,
    },
  };
}

/* =========================================================
   Trace builder
   ========================================================= */

/**
 * Build a CanonicalGraphTrace summarizing the projection.
 */
export function buildProjectionTrace(
  entityCount: number,
  relationCount: number,
  nodes: CanonicalGraphNode[],
  edges: CanonicalGraphEdge[],
  warnings: string[],
): CanonicalGraphTrace {
  const nodeKindCounts: Record<CanonicalNodeKind, number> = {
    entity: 0, quantity: 0, anchor: 0, candidate: 0, objective: 0, constraint: 0, unit: 0,
  };
  for (const n of nodes) {
    nodeKindCounts[n.kind] = (nodeKindCounts[n.kind] ?? 0) + 1;
  }

  const edgeKindCounts: Record<string, number> = {};
  for (const e of edges) {
    edgeKindCounts[e.kind] = (edgeKindCounts[e.kind] ?? 0) + 1;
  }

  return {
    canonicalEntityCount:   entityCount,
    canonicalRelationCount: relationCount,
    graphNodeCount:         nodes.length,
    graphEdgeCount:         edges.length,
    nodeKindCounts,
    edgeKindCounts,
    projectionWarnings:     [...warnings],
  };
}
