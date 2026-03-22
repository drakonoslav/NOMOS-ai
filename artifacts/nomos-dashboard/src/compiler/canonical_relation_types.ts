/**
 * canonical_relation_types.ts
 *
 * Typed schema for canonical relations in the NOMOS entity-relation graph.
 *
 * Design principles:
 *   - Every relation has an explicit type (not a free-form string).
 *   - Offsets and windows are first-class measurable attributes, never buried prose.
 *   - Provenance tracks where the relation came from (explicit text vs inferred).
 *   - Normalization history makes every transformation auditable.
 *   - Schema is domain-agnostic: same types support nutrition, training,
 *     scheduling, logistics, and any measurable-entity domain.
 */

/* =========================================================
   Canonical relation types
   ========================================================= */

/**
 * CanonicalRelationType — the closed set of typed relation slots.
 *
 * Structural:
 *   HAS_MEASURE          entity → measure (amount + unit)
 *   HAS_TAG              entity → semantic tag
 *   MODIFIED_BY          entity → modifier qualifier
 *   BELONGS_TO_CANDIDATE entity → candidate block
 *   BELONGS_TO_OBJECTIVE entity → objective block
 *   BELONGS_TO_CONSTRAINT entity → constraint block
 *   CLASSIFIED_AS        entity → category label
 *   AGGREGATES_OVER      constraint → entity set (aggregation span)
 *   CONSTRAINS           constraint → entity (applies a constraint)
 *   COMPARES_TO_THRESHOLD entity → threshold value (at least, no more than, etc.)
 *
 * Temporal:
 *   BEFORE               entity precedes anchor by optional offset
 *   AFTER                entity follows anchor by optional offset
 *   WITHIN_WINDOW        entity occurs within a bounded time/distance window
 *   BETWEEN              entity falls between two anchors
 *   DURING               entity is concurrent with anchor
 *
 * Spatial/generic:
 *   RELATIVE_TO_ANCHOR   entity is positionally related to anchor (above/below/near/etc.)
 *
 * Accompaniment:
 *   WITH                 entity accompanies anchor (with dinner, with training, etc.)
 */
export type CanonicalRelationType =
  | "HAS_MEASURE"
  | "HAS_TAG"
  | "MODIFIED_BY"
  | "BELONGS_TO_CANDIDATE"
  | "BELONGS_TO_OBJECTIVE"
  | "BELONGS_TO_CONSTRAINT"
  | "CLASSIFIED_AS"
  | "AGGREGATES_OVER"
  | "CONSTRAINS"
  | "COMPARES_TO_THRESHOLD"
  | "BEFORE"
  | "AFTER"
  | "WITHIN_WINDOW"
  | "BETWEEN"
  | "DURING"
  | "RELATIVE_TO_ANCHOR"
  | "WITH";

/* =========================================================
   Provenance
   ========================================================= */

/**
 * RelationProvenance — how the relation was established.
 *
 *   explicit   — stated directly in source text ("30 minutes before lifting")
 *   registry   — matched via canonical relation registry lookup
 *   normalized — shorthand expanded to canonical form ("pre" → BEFORE)
 *   inferred   — derived from structural context (e.g. every entity HAS_MEASURE)
 *   fallback   — assigned when no better mechanism applies
 */
export type RelationProvenance =
  | "explicit"
  | "registry"
  | "normalized"
  | "inferred"
  | "fallback";

/* =========================================================
   Offset — first-class measurable displacement
   ========================================================= */

/**
 * Dimension of the relation offset.
 * Always "time" or "distance" for temporal/spatial relations.
 * "count" for counted offsets (e.g. "3 steps before").
 * "unknown" when the unit cannot be classified.
 */
export type RelationOffsetDimension = "time" | "distance" | "count" | "unknown";

/**
 * RelationOffset — a measurable scalar displacement between entity and anchor.
 *
 * Example: in "80g cyclic dextrin 30 minutes before lifting":
 *   amount: 30, unitRaw: "minutes", unitNormalized: "min", dimension: "time"
 */
export interface RelationOffset {
  amount: number;
  unitRaw: string;
  unitNormalized: string;
  dimension: RelationOffsetDimension;
}

/* =========================================================
   Window — bounded temporal or spatial context
   ========================================================= */

/**
 * RelationWindow — a bounded interval in which a relation holds.
 *
 * Example: "within 90 minutes before lifting":
 *   endAmount: 90, endUnit: "min", anchorLabel: "lifting", relationDirection: "before"
 *
 * Example: "between 2pm and 4pm":
 *   startAmount: 14, startUnit: "hr", endAmount: 16, endUnit: "hr"
 */
export interface RelationWindow {
  startAmount: number | null;
  startUnit: string | null;
  endAmount: number | null;
  endUnit: string | null;
  anchorLabel: string | null;
  relationDirection: "before" | "after" | "around" | "between" | null;
}

/* =========================================================
   Normalization record
   ========================================================= */

export interface RelationNormalizationRecord {
  stage: string;
  before: string;
  after: string;
  reason: string;
}

/* =========================================================
   CanonicalRelation — the core contract
   ========================================================= */

/**
 * CanonicalRelation — a fully typed, provenanced, auditable edge in the
 * NOMOS entity-relation graph.
 *
 * Every relation connects a fromEntityId (subject) to a toEntityId (object or
 * anchor). The type determines the semantic category of the link. Structural
 * relations (HAS_MEASURE, BELONGS_TO_*) have provenance="inferred". Temporal
 * and accompaniment relations derived from text have provenance="explicit" or
 * provenance="normalized" for shorthand expansions.
 */
export interface CanonicalRelation {
  /** Stable identifier e.g. "rel_0", "rel_1". */
  id: string;

  /** Typed relation slot — never a free-form string. */
  type: CanonicalRelationType;

  /** ID of the subject entity (fromEntityId). Always present. */
  fromEntityId: string;

  /**
   * ID of the object entity, anchor, or aggregate target.
   * Null when the relation has no explicit target (e.g. HAS_MEASURE stores
   * its payload in the measure record on the entity itself).
   */
  toEntityId: string | null;

  /** Raw phrase from source text that triggered this relation. */
  labelRaw: string;

  /** Normalized canonical label for the relation type. */
  labelNormalized: string;

  /** Where the relation came from. */
  provenance: RelationProvenance;

  /** Confidence score [0.0, 1.0]. */
  confidence: number;

  /**
   * Scalar displacement between subject and anchor.
   * Populated for BEFORE, AFTER, and WITHIN_WINDOW when an explicit offset
   * (e.g. "30 minutes") is present in text.
   */
  offset: RelationOffset | null;

  /**
   * Bounded interval context.
   * Populated for WITHIN_WINDOW and BETWEEN.
   */
  window: RelationWindow | null;

  /** Optional qualifier strings (e.g. "at least", "approximately"). */
  qualifiers: string[];

  /**
   * Namespaced source registry ID for well-known relation types.
   * Format: "{category}.{relation_name}" e.g. "temporal.before".
   * Null for structural/inferred relations.
   */
  sourceRegistryId: string | null;

  /** Ordered log of every normalization transformation applied. */
  normalizationHistory: RelationNormalizationRecord[];
}
