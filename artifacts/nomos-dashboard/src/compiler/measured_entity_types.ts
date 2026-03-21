/**
 * measured_entity_types.ts
 *
 * Canonical types for the NOMOS measurement-and-relation grammar layer.
 *
 * This layer runs before domain-family routing.  All types are domain-agnostic.
 *
 * Design principles:
 *   - MeasuredEntity is open-vocabulary: the label field holds any noun phrase.
 *   - RelationBinding connects entities through temporal, spatial, or
 *     quantitative relation words.
 *   - AnchorReference is a named point (activity, event, state) that entities
 *     are measured relative to.  It may or may not resolve to a known anchor.
 *   - BindingResult is the top-level output of the relation_binder layer.
 */

import type { RelationType, RelationCategory } from "./relation_lexicon.ts";
import type { UnitCategory } from "./unit_registry.ts";

/* =========================================================
   MeasuredEntity
   ========================================================= */

export type MeasuredEntityCategory =
  | "food"
  | "supplement"
  | "fluid"
  | "load"
  | "duration"
  | "distance"
  | "countable_item"
  | "unknown";

export type MeasuredEntityRole =
  | "candidate_item"
  | "constraint_operand"
  | "state_fact"
  | "objective_operand"
  | "unknown";

export interface MeasuredEntity {
  /** Stable identifier within a single extraction call, e.g. "me_0". */
  id: string;

  /**
   * Original surface text covering the number, unit, and label,
   * e.g. "30 minutes", "80g cyclic dextrin".
   */
  rawText: string;

  /**
   * Normalized form: canonical unit + lowercase label,
   * e.g. "80g cyclic dextrin", "30min".
   */
  normalizedText: string;

  /** Parsed numeric value.  Null only in degenerate cases. */
  amount: number | null;

  /** Surface unit form as found in text, e.g. "minutes", "g". */
  unit: string | null;

  /** Canonical unit short form from the unit registry, e.g. "min", "g". */
  normalizedUnit: string | null;

  /** Unit's measurement category, used for downstream inference. */
  unitCategory: UnitCategory | null;

  /**
   * Open-vocabulary noun phrase following the unit.
   * NEVER required to be in a closed dictionary.
   * e.g. "cyclic dextrin", "wishes", "merger".
   */
  label: string;

  /** Lowercase, trimmed form of label. */
  normalizedLabel: string;

  /**
   * Domain category inferred from unit + label.
   * Known word sets assist inference; "unknown" is always a valid result.
   */
  category: MeasuredEntityCategory;

  /**
   * Structural role inferred from section headers (STATE / CONSTRAINTS /
   * CANDIDATES / OBJECTIVE).  "unknown" when no headers are present.
   */
  role: MeasuredEntityRole;

  /**
   * Extraction confidence.
   *
   * high     — recognized unit + non-empty label (any open-vocabulary noun)
   * moderate — recognized unit + empty label (bare quantity, e.g. "30min")
   * low      — unit not recognized
   */
  confidence: "low" | "moderate" | "high";
}

/**
 * Extends MeasuredEntity with byte offsets into the source text.
 * Used internally by the relation binder to resolve subject/offset/object
 * order by position.
 */
export interface MeasuredEntitySpan extends MeasuredEntity {
  startIndex: number;
  endIndex: number;
}

/* =========================================================
   AnchorReference
   ========================================================= */

export interface AnchorReference {
  /** Stable identifier, e.g. "anc_0". */
  id: string;

  /**
   * Normalized anchor label, e.g. "lifting", "dinner", "merger".
   * Open-vocabulary: may not resolve to a known anchor record.
   */
  label: string;

  /**
   * True if the label matches a record in the anchor registry.
   * False does not prevent binding — it is informational only.
   */
  isKnownAnchor: boolean;

  /** Surface text as it appeared in the source, e.g. "the merger". */
  rawText: string;
}

/* =========================================================
   RelationBinding
   ========================================================= */

export interface RelationBinding {
  /** Stable identifier, e.g. "rb_0". */
  id: string;

  /** ID of the primary measured entity (subject of the relation). */
  subjectId: string;

  /** Canonical relation type from the relation lexicon. */
  relation: RelationType;

  /** Semantic category of the relation (temporal/spatial/quantitative/accompaniment). */
  relationCategory: RelationCategory;

  /**
   * ID of the object entity or anchor.
   * - If the right side is a MeasuredEntity, objectId = that entity's id.
   * - If the right side is an AnchorReference, objectId = that anchor's id.
   * - Null when no right-side term could be identified.
   */
  objectId: string | null;

  /**
   * True when objectId refers to an AnchorReference; false when it refers to
   * a MeasuredEntity.  Null when objectId is null.
   */
  objectIsAnchor: boolean | null;

  /**
   * Optional offset entity that sits between the subject and the relation word.
   * e.g. in "80g dextrin 30min before lifting", the offset is {30, min}.
   */
  offsetAmount: number | null;
  offsetUnit: string | null;

  /** Slice of source text covering the full binding, for traceability. */
  rawText: string;
}

/* =========================================================
   BindingResult
   ========================================================= */

export interface BindingResult {
  /** All measured entities extracted from the input text. */
  entities: MeasuredEntitySpan[];

  /** All anchors identified (known or open-vocabulary). */
  anchors: AnchorReference[];

  /** All relation bindings resolved. */
  bindings: RelationBinding[];
}
