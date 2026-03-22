/**
 * canonical_graph_types.ts
 *
 * Schema for the NOMOS canonical entity-relation graph.
 *
 * The canonical graph is a pure projection of canonical semantic objects:
 *   CanonicalEntity[]  →  entity/quantity nodes
 *   CanonicalRelation[] →  typed edges (or self-edges for HAS_MEASURE)
 *
 * Design law:
 *   "The graph may project canonical semantics. It may not invent them."
 *
 * This means:
 *   - No tag re-inference  (tags come verbatim from CanonicalEntity.tags)
 *   - No relation re-classification  (kind comes directly from CanonicalRelationType)
 *   - All provenance and confidence values from canonical records survive into
 *     node/edge data unchanged.
 *
 * Node kinds:
 *   "entity"      — a named measurable noun (cyclic dextrin, magnesium, …)
 *   "quantity"    — a bare numeric measurement with no entity label (30min offset)
 *   "anchor"      — a named reference point (lifting, dinner, sleep, …)
 *   "candidate"   — a candidate option in a multi-candidate query
 *   "objective"   — the optimization target
 *   "constraint"  — a quantitative rule (at least 60g, no more than 3mg, …)
 *   "unit"        — a measurement unit node (shared, deduplicated)
 *
 * Edge kinds are the lowercased canonical relation types, e.g.:
 *   "before", "after", "within_window", "has_measure", "with", "during", …
 */

/* =========================================================
   Node
   ========================================================= */

export type CanonicalNodeKind =
  | "entity"
  | "quantity"
  | "anchor"
  | "candidate"
  | "objective"
  | "constraint"
  | "unit";

export interface CanonicalGraphNode {
  /** Stable graph node ID, e.g. "cgn_me_0", "cgn_anc_0". */
  id: string;

  /**
   * Node kind — determines the semantic role of this node in the graph.
   * Never re-derived; always projected from the canonical source record.
   */
  kind: CanonicalNodeKind;

  /**
   * Human-readable label.
   *   entity   → canonical entity labelRaw
   *   quantity → stringified amount + unit
   *   anchor   → anchor surface label
   *   candidate/objective/constraint → supplied label text
   */
  label: string;

  /**
   * Structured semantic payload — all canonical metadata projected verbatim.
   * Downstream execution must prefer data from this field over raw text.
   *
   * For entity nodes includes at minimum:
   *   canonicalEntityId, category, categoryConfidence, tags, role, provenance,
   *   measures, normalizationHistory, sourceRegistryId
   */
  data: Record<string, unknown>;
}

/* =========================================================
   Edge
   ========================================================= */

export interface CanonicalGraphEdge {
  /** Stable graph edge ID, e.g. "cge_rel_0". */
  id: string;

  /**
   * Edge kind — the canonical relation type in lowercase.
   * e.g. "before", "after", "within_window", "has_measure", "with"
   * Never re-classified from source text; always derived from CanonicalRelation.type.
   */
  kind: string;

  /** Source graph node ID. */
  from: string;

  /**
   * Target graph node ID.
   * For HAS_MEASURE self-edges: to === from (entity node points to itself).
   * For anchor-targeting relations: to is an anchor node ID.
   */
  to: string;

  /**
   * Semantic payload projected verbatim from the CanonicalRelation.
   * Includes at minimum: relationType, provenance, confidence,
   * offset (if present), window (if present), sourceRegistryId,
   * normalizationHistory.
   */
  data: Record<string, unknown>;
}

/* =========================================================
   Graph
   ========================================================= */

export interface CanonicalGraph {
  nodes: CanonicalGraphNode[];
  edges: CanonicalGraphEdge[];
}

/* =========================================================
   Trace / debug output
   ========================================================= */

/**
 * CanonicalGraphTrace — projection summary for debugging and validation.
 *
 * Exposes counts at each layer and any warnings produced during projection.
 */
export interface CanonicalGraphTrace {
  /** Number of CanonicalEntity records provided as input. */
  canonicalEntityCount: number;

  /** Number of CanonicalRelation records provided as input. */
  canonicalRelationCount: number;

  /** Total node count in the resulting graph. */
  graphNodeCount: number;

  /** Total edge count in the resulting graph. */
  graphEdgeCount: number;

  /** Breakdown of node counts by kind. */
  nodeKindCounts: Record<CanonicalNodeKind, number>;

  /** Breakdown of edge counts by kind. */
  edgeKindCounts: Record<string, number>;

  /** Warnings generated during projection (e.g. missing anchor labels). */
  projectionWarnings: string[];
}

/* =========================================================
   Builder result
   ========================================================= */

export interface CanonicalGraphResult {
  graph: CanonicalGraph;
  trace: CanonicalGraphTrace;
}

/* =========================================================
   Builder input
   ========================================================= */

/** Optional records for candidate, objective, and constraint nodes. */
export interface CanonicalCandidateRecord {
  id: string;
  label: string;
  data?: Record<string, unknown>;
}

export interface CanonicalObjectiveRecord {
  id: string;
  label: string;
  data?: Record<string, unknown>;
}

export interface CanonicalConstraintRecord {
  id: string;
  label: string;
  data?: Record<string, unknown>;
}

/**
 * Input to the canonical graph builder.
 *
 * entities and relations are required (the two canonical substrates).
 * candidates, objectives, constraints are optional structural annotations.
 * anchorLabels maps anchorId → surface label (produced by normalizeWithAnchors).
 */
export interface CanonicalGraphInput {
  entities: import("../compiler/canonical_entity_types.ts").CanonicalEntity[];
  relations: import("../compiler/canonical_relation_types.ts").CanonicalRelation[];
  anchorLabels?: Map<string, string>;
  candidates?: CanonicalCandidateRecord[];
  objectives?: CanonicalObjectiveRecord[];
  constraints?: CanonicalConstraintRecord[];
}
