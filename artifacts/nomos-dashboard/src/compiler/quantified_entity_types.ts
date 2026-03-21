/**
 * quantified_entity_types.ts
 *
 * Canonical types for the quantified entity extraction layer.
 *
 * A QuantifiedEntity is any measurable noun phrase where a numeric amount
 * and a recognized unit are both present.  This is a domain-agnostic type —
 * food, supplement, training, duration, and equipment entities all share the
 * same structure.
 *
 * These types are consumed by:
 *   - quantified_entity_extractor.ts  (producer)
 *   - query_family_classifier.ts      (consumer — uses entities as evidence)
 *   - auto_compiler.ts                (consumer — uses entities in draft building)
 *   - field_extractor.ts              (consumer — may extend its ExtractedFields)
 */

/* =========================================================
   Primitive sub-types
   ========================================================= */

/**
 * Category — the domain classification of the measured entity.
 *
 * "food"            — nutritional food item (oats, dextrin, chicken, etc.)
 * "supplement"      — non-food supplement (creatine, magnesium, vitamin D, etc.)
 * "fluid"           — liquid item (water, milk, juice, shake, etc.)
 * "load"            — physical training load (lb/kg attached to equipment)
 * "duration"        — time-based activity or rest (hours sleep, minutes recovery)
 * "countable_item"  — discrete units: eggs, bananas, capsules, reps, sets
 * "unknown"         — could not be classified
 */
export type QuantifiedEntityCategory =
  | "food"
  | "supplement"
  | "fluid"
  | "load"
  | "duration"
  | "countable_item"
  | "unknown";

/**
 * Role — where the entity appears in the canonical query structure.
 *
 * "candidate_item"      — an action option under evaluation
 * "constraint_operand"  — a bound in a threshold constraint
 * "state_fact"          — a declared fact in the STATE section
 * "objective_operand"   — a target or metric in the OBJECTIVE section
 * "unknown"             — no structural context detected
 */
export type QuantifiedEntityRole =
  | "candidate_item"
  | "constraint_operand"
  | "state_fact"
  | "objective_operand"
  | "unknown";

/**
 * Confidence — how certain the extractor is about this entity.
 *
 * "high"     — recognized unit + entity label is in a known domain word set
 * "moderate" — recognized unit + entity label is non-empty but not in domain set
 * "low"      — recognized unit + entity label is empty (robustness fallback)
 */
export type QuantifiedEntityConfidence = "low" | "moderate" | "high";

/* =========================================================
   QuantifiedEntity
   ========================================================= */

/**
 * QuantifiedEntity — a measurable noun phrase with an amount and unit.
 *
 * Example: "80g cyclic dextrin"
 *   id:                    "qe_0"
 *   rawText:               "80g cyclic dextrin"
 *   normalizedText:        "80g cyclic dextrin"
 *   amount:                80
 *   unit:                  "g"            (surface form as written)
 *   normalizedUnit:        "g"            (canonical short form)
 *   entityLabel:           "cyclic dextrin"
 *   normalizedEntityLabel: "cyclic dextrin"
 *   category:              "food"
 *   role:                  "candidate_item"
 *   confidence:            "high"
 */
export interface QuantifiedEntity {
  id: string;

  rawText: string;
  normalizedText: string;

  amount: number;
  unit: string;
  normalizedUnit: string;

  entityLabel: string;
  normalizedEntityLabel: string;

  category: QuantifiedEntityCategory;
  role: QuantifiedEntityRole;

  modifiers?: string[];
  tags?: string[];

  confidence: QuantifiedEntityConfidence;
}
