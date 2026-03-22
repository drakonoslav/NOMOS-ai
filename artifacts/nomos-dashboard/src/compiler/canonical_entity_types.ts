/**
 * canonical_entity_types.ts
 *
 * Domain-agnostic canonical measurable entity schema for NOMOS.
 *
 * Design contract:
 *   - Any measurable noun phrase becomes a CanonicalEntity.
 *   - No closed vocabulary.  Unknown labels are preserved structurally.
 *   - Every field is typed, traceable, and auditable.
 *   - Classification, tags, confidence, and normalization are separated.
 *
 * Layer position:
 *   extraction → normalization (this schema) → relation binding → graph build → algebra
 */

/* =========================================================
   Entity category
   =========================================================
   Broad "what kind of thing is it" classification.
   category ≠ tags.  category is structural; tags are semantic.
   ========================================================= */

export type EntityCategory =
  | "substance"     // measurable matter with no more specific category
  | "food"          // edible substance
  | "fluid"         // drinkable / injectable liquid
  | "supplement"    // nutritional or pharmaceutical supplement
  | "object"        // physical tool, equipment, implement
  | "load"          // weighted resistance load (barbell, dumbbell, …)
  | "duration"      // time-valued entity (sleep, rest, workout length)
  | "distance"      // spatial extent
  | "countable_item"// discrete countable unit (rep, set, capsule, step)
  | "event"         // named occurrence with implied duration/timing
  | "anchor"        // temporal reference point ("lifting", "dinner")
  | "unknown";      // unclassifiable with current evidence

/* =========================================================
   Tag provenance
   =========================================================
   Describes HOW a tag was assigned.  Every tag carries a provenance.
   ========================================================= */

export type TagProvenance =
  | "explicit"   // user declared this tag in source text
  | "registry"   // looked up in the canonical tag registry
  | "normalized" // assigned during the normalization pipeline step
  | "inferred"   // derived from unit category or entity category
  | "fallback";  // last-resort heuristic when nothing else matched

/* =========================================================
   TagRecord
   =========================================================
   One semantic tag with full traceability.
   ========================================================= */

export interface TagRecord {
  /** The tag string, always lowercase. */
  tag: string;

  /** How this tag was determined. */
  provenance: TagProvenance;

  /**
   * Confidence in this tag assignment.
   * 1.0 = certain (explicit declaration)
   * 0.0 = no confidence (should rarely happen)
   */
  confidence: number;

  /**
   * Registry entry ID that anchored this tag, if applicable.
   * e.g. "food.cyclic_dextrin", "supplement.magnesium"
   * Null for inferred or fallback tags.
   */
  sourceRegistryId?: string | null;
}

/* =========================================================
   NormalizationRecord
   =========================================================
   One step in the normalization pipeline, for full auditability.
   ========================================================= */

export interface NormalizationRecord {
  /** Pipeline stage name. */
  stage:  string;

  /** Value before transformation. */
  before: string;

  /** Value after transformation. */
  after:  string;

  /** Human-readable reason for the transformation. */
  reason: string;
}

/* =========================================================
   MeasureRecord
   =========================================================
   One measurement attached to an entity.
   Supports multi-measure entities (e.g., "2 scoops / 60g protein").
   ========================================================= */

export type MeasureDimension =
  | "mass"
  | "volume"
  | "count"
  | "time"
  | "distance"
  | "energy"
  | "rate"
  | "unknown";

export interface MeasureRecord {
  /** Parsed numeric amount. */
  amount: number;

  /** Unit surface form as found in text, e.g. "grams", "mL", "reps". */
  unitRaw: string;

  /** Canonical short form from the unit registry, e.g. "g", "ml", "rep". */
  unitNormalized: string;

  /** Physical dimension of the measurement. */
  dimension: MeasureDimension;
}

/* =========================================================
   EntityRole
   =========================================================
   Structural role within the protocol / query.
   ========================================================= */

export type EntityRole =
  | "candidate_item"    // an option being evaluated
  | "constraint_operand"// operand in a threshold constraint
  | "state_fact"        // factual observation about current state
  | "objective_operand" // operand in an optimization objective
  | "anchor"            // temporal or spatial reference point
  | "unknown";

/* =========================================================
   CanonicalEntity
   =========================================================
   The complete, domain-agnostic representation of one measured noun phrase.
   All downstream systems must consume CanonicalEntity, not raw text.
   ========================================================= */

export interface CanonicalEntity {
  /** Stable identifier within one normalization call, e.g. "me_0". */
  id: string;

  /** Surface text as found in the source, e.g. "80g cyclic dextrin". */
  rawText: string;

  /** Canonical spacing + unit form, e.g. "80g cyclic_dextrin". */
  normalizedText: string;

  /** Noun phrase as it appeared in source text, e.g. "cyclic dextrin". */
  labelRaw: string;

  /** Snake_case canonical label, e.g. "cyclic_dextrin". */
  labelNormalized: string;

  /** Broad structural category. */
  category: EntityCategory;

  /**
   * Confidence in the category assignment.
   * High (0.90+) = known registry entry + recognized unit.
   * Low (< 0.40) = unknown label, no unit, or fallback inference.
   */
  categoryConfidence: number;

  /**
   * Measurements attached to this entity.
   * Typically one element; multi-measure support reserved.
   */
  measures: MeasureRecord[];

  /**
   * Semantic tags with full provenance.
   * Examples: [{tag:"fast",provenance:"registry",confidence:0.97}]
   */
  tags: TagRecord[];

  /** Structural role within the query / protocol. */
  role: EntityRole;

  /**
   * Registry entry that anchored normalization, if found.
   * e.g. "food.cyclic_dextrin"
   */
  sourceRegistryId?: string | null;

  /**
   * Ordered log of each normalization step applied.
   * Records unit alias resolution, label formatting, etc.
   */
  normalizationHistory: NormalizationRecord[];

  /** Modifier words, e.g. ["fast-digesting", "pre-lift"]. */
  modifiers?: string[];

  /** Free-form notes for diagnostics. */
  notes?: string[];
}
