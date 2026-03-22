/**
 * canonical_relation_normalizer.ts
 *
 * Converts raw text (or a pre-computed BindingResult) into canonical
 * CanonicalRelation records suitable for graph construction and algebraic
 * reasoning.
 *
 * Pipeline:
 *   raw text
 *     → bindRelations()              [relation_binder — extracts entity spans +
 *                                     relation bindings in one pass]
 *     → buildHasMeasureRelations()   [structural inferred relations per entity]
 *     → buildCanonicalRelation()     [explicit/normalized text relations]
 *     → CanonicalRelation[]          [canonical relation substrate]
 *
 * Two entry points:
 *   normalizeRelations(rawText)        — stable (bindRelations resets entity counter)
 *   normalizeRelationsStable(rawText)  — also resets relation counter to rel_0
 *
 * Entity IDs are compatible with normalizeEntitiesStable() because both
 * call resetEntityCounter() before extraction.
 */

import { bindRelations }          from "./relation_binder.ts";
import { resolveUnit }            from "./unit_registry.ts";
import type { MeasuredEntitySpan }from "./measured_entity_types.ts";
import type { RelationBinding, BindingResult } from "./measured_entity_types.ts";
import type {
  CanonicalRelation,
  CanonicalRelationType,
  RelationOffset,
  RelationOffsetDimension,
  RelationWindow,
  RelationProvenance,
  RelationNormalizationRecord,
} from "./canonical_relation_types.ts";
import {
  resolveCanonicalRelationType,
  isShorthandRelation,
  computeRelationConfidence,
  getRelationSourceRegistryId,
} from "./relation_registry.ts";

/* =========================================================
   Module-level relation counter
   ========================================================= */

let _relCounter = 0;

/**
 * Reset the relation ID counter to 0.
 * Call before `normalizeRelations()` in tests to get stable rel_0, rel_1, … IDs.
 */
export function resetRelationCounter(): void {
  _relCounter = 0;
}

/* =========================================================
   Internal helpers
   ========================================================= */

/**
 * Map a UnitCategory (or null) to a RelationOffsetDimension.
 */
function mapOffsetDimension(
  category: "mass" | "volume" | "count" | "time" | "distance" | "training" | "energy" | "rate" | null | undefined,
): RelationOffsetDimension {
  switch (category) {
    case "time":     return "time";
    case "distance": return "distance";
    case "count":
    case "training": return "count";
    default:         return "unknown";
  }
}

/**
 * Build a RelationOffset from a binding's offsetAmount/offsetUnit fields.
 * Returns null when no offset is present.
 */
function buildOffset(
  offsetAmount: number | null,
  offsetUnit: string | null,
): RelationOffset | null {
  if (offsetAmount === null || offsetUnit === null) return null;
  const unitRecord = resolveUnit(offsetUnit);
  return {
    amount: offsetAmount,
    unitRaw: offsetUnit,
    unitNormalized: unitRecord?.canonical ?? offsetUnit,
    dimension: mapOffsetDimension(unitRecord?.category),
  };
}

/**
 * Build a RelationWindow when the canonical type is WITHIN_WINDOW.
 *
 * Strategy A — object entity is a time/distance span (e.g. "within 90min"):
 *   Use the object entity's amount/unit as the window endAmount/endUnit.
 *
 * Strategy B — an explicit offset on the binding (less common for "within"):
 *   Use the offset as the window bound.
 *
 * Returns null when neither strategy yields data.
 */
function buildWindow(
  canonType: CanonicalRelationType,
  binding: RelationBinding,
  entityMap: Map<string, MeasuredEntitySpan>,
): RelationWindow | null {
  if (canonType !== "WITHIN_WINDOW") return null;

  // Strategy A: object entity is a measured time/distance span
  if (binding.objectId !== null && binding.objectIsAnchor === false) {
    const obj = entityMap.get(binding.objectId);
    if (obj && (obj.unitCategory === "time" || obj.unitCategory === "distance")) {
      return {
        startAmount: null,
        startUnit:   null,
        endAmount:   obj.amount,
        endUnit:     obj.normalizedUnit,
        anchorLabel: null,
        relationDirection: null,
      };
    }
  }

  // Strategy B: binding has an explicit offset
  if (binding.offsetAmount !== null && binding.offsetUnit !== null) {
    const unitRecord = resolveUnit(binding.offsetUnit);
    return {
      startAmount: null,
      startUnit:   null,
      endAmount:   binding.offsetAmount,
      endUnit:     unitRecord?.canonical ?? binding.offsetUnit,
      anchorLabel: null,
      relationDirection: null,
    };
  }

  return null;
}

/* =========================================================
   Structural relation builders
   ========================================================= */

/**
 * Build a HAS_MEASURE relation for every extracted entity.
 *
 * These relations are inferred — they are always present by construction
 * since every measured entity structurally has a measure attribute.
 */
function buildHasMeasureRelation(entity: MeasuredEntitySpan): CanonicalRelation {
  const unitRecord = resolveUnit(entity.normalizedUnit ?? "");
  const unitNorm = unitRecord?.canonical ?? entity.normalizedUnit ?? "";
  return {
    id:              `rel_${_relCounter++}`,
    type:            "HAS_MEASURE",
    fromEntityId:    entity.id,
    toEntityId:      null,
    labelRaw:        entity.rawText,
    labelNormalized: "has_measure",
    provenance:      "inferred",
    confidence:      computeRelationConfidence("HAS_MEASURE", false, "inferred"),
    offset:          null,
    window:          null,
    qualifiers:      [],
    sourceRegistryId: null,
    normalizationHistory: [
      {
        stage:  "structural_inference",
        before: entity.rawText,
        after:  `HAS_MEASURE(${entity.id}, amount=${entity.amount}, unit=${unitNorm})`,
        reason: "every extracted entity structurally has a measure",
      },
    ],
  };
}

/* =========================================================
   Explicit relation builder
   ========================================================= */

/**
 * Convert a single RelationBinding into a CanonicalRelation.
 */
function buildCanonicalRelation(
  binding: RelationBinding,
  entityMap: Map<string, MeasuredEntitySpan>,
): CanonicalRelation {
  const canonType   = resolveCanonicalRelationType(binding.relation);
  const isShorthand = isShorthandRelation(binding.rawText, binding.relation);
  const offset      = buildOffset(binding.offsetAmount, binding.offsetUnit);
  const window      = buildWindow(canonType, binding, entityMap);
  const provenance: RelationProvenance = isShorthand ? "normalized" : "explicit";
  const confidence  = computeRelationConfidence(canonType, offset !== null, provenance);

  const history: RelationNormalizationRecord[] = [
    {
      stage:  "relation_normalization",
      before: binding.relation,
      after:  offset
        ? `${canonType} + offset(${offset.amount} ${offset.unitNormalized})`
        : canonType,
      reason: "canonical relation type binding from lexicon surface",
    },
  ];

  if (isShorthand) {
    history.push({
      stage:  "shorthand_expansion",
      before: binding.rawText,
      after:  `${canonType} (expanded from shorthand surface)`,
      reason: "pre/post shorthand expanded to canonical temporal type",
    });
  }

  return {
    id:              `rel_${_relCounter++}`,
    type:            canonType,
    fromEntityId:    binding.subjectId,
    toEntityId:      binding.objectId,
    labelRaw:        binding.rawText,
    labelNormalized: canonType.toLowerCase(),
    provenance,
    confidence,
    offset,
    window,
    qualifiers:      [],
    sourceRegistryId: getRelationSourceRegistryId(canonType),
    normalizationHistory: history,
  };
}

/* =========================================================
   Public API
   ========================================================= */

/**
 * Normalize raw text into a CanonicalRelation array.
 *
 * Produces:
 *   1. One HAS_MEASURE relation per extracted entity (structural/inferred).
 *   2. One CanonicalRelation per explicit RelationBinding from the binder.
 *
 * Entity IDs (me_0, me_1, …) match those produced by normalizeEntitiesStable()
 * because bindRelations() calls resetEntityCounter() internally.
 *
 * Relation IDs (rel_0, rel_1, …) are assigned from the module-level counter.
 * Call normalizeRelationsStable() in tests for repeatable rel IDs.
 */
export function normalizeRelations(rawText: string): CanonicalRelation[] {
  const result: BindingResult = bindRelations(rawText);

  const entityMap = new Map<string, MeasuredEntitySpan>(
    result.entities.map((e) => [e.id, e]),
  );

  const relations: CanonicalRelation[] = [];

  for (const entity of result.entities) {
    relations.push(buildHasMeasureRelation(entity));
  }

  for (const binding of result.bindings) {
    relations.push(buildCanonicalRelation(binding, entityMap));
  }

  return relations;
}

/**
 * Stable version of normalizeRelations().
 *
 * Resets the relation counter to 0 before running so that rel IDs always
 * start at rel_0.  Use this in tests.
 */
export function normalizeRelationsStable(rawText: string): CanonicalRelation[] {
  _relCounter = 0;
  return normalizeRelations(rawText);
}
