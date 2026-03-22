/**
 * canonical_entity_normalizer.ts
 *
 * Converts extracted MeasuredEntitySpan records into the canonical
 * CanonicalEntity schema.
 *
 * This is the single entry point for the canonical layer.
 * All downstream systems (graph builder, constraint executor, algebra)
 * must consume CanonicalEntity — never raw text.
 *
 * Pipeline:
 *   raw text
 *     → extractMeasuredEntities()   [extraction]
 *     → spanToCanonical()            [this module]
 *     → CanonicalEntity[]            [canonical substrate]
 *
 * Normalization steps applied per entity:
 *   1. Unit alias resolution        → MeasureRecord + NormalizationRecord
 *   2. Label snake_case conversion  → labelNormalized + NormalizationRecord
 *   3. Raw/normalized text diff     → NormalizationRecord (when different)
 *   4. Tag registry lookup          → TagRecord[] with provenance="registry"
 *   5. Category-inferred tag        → TagRecord with provenance="inferred"
 *   6. Unit-category fallback tag   → TagRecord with provenance="fallback"
 *   7. Category + confidence        → EntityCategory + categoryConfidence
 */

import {
  extractMeasuredEntities,
  resetEntityCounter,
} from "./measured_entity_extractor.ts";
import type { MeasuredEntitySpan, MeasuredEntityCategory } from "./measured_entity_types.ts";
import { lookupCanonicalTags } from "./tag_registry.ts";
import type {
  CanonicalEntity,
  EntityCategory,
  EntityRole,
  MeasureRecord,
  MeasureDimension,
  NormalizationRecord,
  TagRecord,
} from "./canonical_entity_types.ts";
import type { UnitCategory } from "./unit_registry.ts";

/* =========================================================
   Internal helpers
   ========================================================= */

/**
 * Convert a multi-word label to snake_case.
 * "cyclic dextrin" → "cyclic_dextrin"
 * Already-single-word labels (no spaces) are returned unchanged.
 */
function toSnakeCase(label: string): string {
  return label.trim().replace(/\s+/g, "_");
}

/**
 * Map UnitCategory to the canonical MeasureDimension.
 * "training" maps to "count" (training units are always discrete counts).
 */
function mapDimension(unitCategory: UnitCategory | null): MeasureDimension {
  if (!unitCategory) return "unknown";
  switch (unitCategory) {
    case "mass":     return "mass";
    case "volume":   return "volume";
    case "count":    return "count";
    case "time":     return "time";
    case "distance": return "distance";
    case "training": return "count";
    case "energy":   return "energy";
    case "rate":     return "rate";
  }
}

/**
 * Map MeasuredEntityCategory to the richer EntityCategory.
 *
 * Key difference: "unknown" from the extractor elevates to "substance"
 * when the measurement dimension is mass or volume (it is clearly a
 * measurable substance, just unclassified).  Truly unclassifiable
 * entities (no recognized unit, no known label) remain "unknown".
 */
function mapToEntityCategory(
  measCat: MeasuredEntityCategory,
  unitCategory: UnitCategory | null
): EntityCategory {
  switch (measCat) {
    case "food":          return "food";
    case "supplement":    return "supplement";
    case "fluid":         return "fluid";
    case "load":          return "load";
    case "duration":      return "duration";
    case "distance":      return "distance";
    case "countable_item":return "countable_item";
    case "unknown":
      if (unitCategory === "mass" || unitCategory === "volume") {
        return "substance"; // measurable but unclassified
      }
      return "unknown";
  }
}

/**
 * Compute categorical confidence from extraction confidence + registry hit.
 *
 *   registry hit + high extraction  → 0.95  (strongly grounded)
 *   no registry  + high extraction  → 0.75  (structural confidence only)
 *   moderate extraction             → 0.60
 *   low extraction                  → 0.35
 *   unknown category                → capped at 0.35
 */
function computeCategoryConfidence(
  confidence: MeasuredEntitySpan["confidence"],
  category:   MeasuredEntityCategory,
  hasRegistryEntry: boolean
): number {
  if (category === "unknown" && !hasRegistryEntry) return 0.15;
  if (confidence === "high" && hasRegistryEntry)   return 0.95;
  if (confidence === "high")                       return 0.75;
  if (confidence === "moderate")                   return 0.60;
  return 0.35;
}

/**
 * Map MeasuredEntityRole to EntityRole.
 * The string values are identical; this cast is for type safety.
 */
function mapRole(role: MeasuredEntitySpan["role"]): EntityRole {
  return role as EntityRole;
}

/* =========================================================
   Core conversion
   ========================================================= */

/**
 * Convert one MeasuredEntitySpan to a CanonicalEntity.
 *
 * This is the canonical normalization step.  All structural decisions
 * (category, tags, confidence, history) are made here and nowhere else.
 */
function spanToCanonical(span: MeasuredEntitySpan): CanonicalEntity {
  const normHistory: NormalizationRecord[] = [];

  // ── Step 1: unit normalization history ──────────────────────────────────
  const unitRaw        = span.unit ?? "";
  const unitNormalized = span.normalizedUnit ?? unitRaw;
  if (unitRaw && unitNormalized && unitRaw !== unitNormalized) {
    normHistory.push({
      stage:  "unit_normalization",
      before: unitRaw,
      after:  unitNormalized,
      reason: "canonical unit alias resolution",
    });
  }

  // ── Step 2: label normalization history ──────────────────────────────────
  const labelRaw        = span.label;
  const labelNormalized = toSnakeCase(span.normalizedLabel);
  if (labelRaw !== "" && labelRaw !== labelNormalized) {
    normHistory.push({
      stage:  "entity_normalization",
      before: labelRaw,
      after:  labelNormalized,
      reason: "canonical label formatting (snake_case)",
    });
  }

  // ── Step 3: text normalization history ───────────────────────────────────
  if (span.rawText !== span.normalizedText && span.rawText !== "") {
    normHistory.push({
      stage:  "text_normalization",
      before: span.rawText,
      after:  span.normalizedText,
      reason: "quantity-unit separation and spacing",
    });
  }

  // ── Step 4: tag registry lookup ──────────────────────────────────────────
  const registryEntry  = lookupCanonicalTags(span.normalizedLabel);
  const tags: TagRecord[] = [];
  const sourceRegistryId = registryEntry?.sourceRegistryId ?? null;

  if (registryEntry) {
    tags.push(...registryEntry.tags);
  }

  // ── Step 5: category-inferred tag ────────────────────────────────────────
  // The coarse category adds an inferred tag only if not already present.
  // This lets "cyclic dextrin" (tagged ["carb","fast"]) also carry "food"
  // as a searchable inferred dimension without losing the registry result.
  const categoryTag = span.category !== "unknown" ? span.category : null;
  if (categoryTag && !tags.some((t) => t.tag === categoryTag)) {
    tags.push({
      tag:            categoryTag,
      provenance:     "inferred",
      confidence:     0.80,
      sourceRegistryId: null,
    });
  }

  // ── Step 6: unit-category fallback tag ───────────────────────────────────
  if (tags.length === 0 && span.unitCategory) {
    tags.push({
      tag:            span.unitCategory,
      provenance:     "fallback",
      confidence:     0.50,
      sourceRegistryId: null,
    });
  }

  // ── Step 7: category + confidence ────────────────────────────────────────
  const category           = mapToEntityCategory(span.category, span.unitCategory);
  const categoryConfidence = computeCategoryConfidence(
    span.confidence, span.category, registryEntry !== null
  );

  // ── Step 8: measure record ────────────────────────────────────────────────
  const dimension = mapDimension(span.unitCategory);
  const measure: MeasureRecord = {
    amount:         span.amount ?? 0,
    unitRaw,
    unitNormalized,
    dimension,
  };

  return {
    id:                  span.id,
    rawText:             span.rawText,
    normalizedText:      span.normalizedText,
    labelRaw,
    labelNormalized,
    category,
    categoryConfidence,
    measures:            [measure],
    tags,
    role:                mapRole(span.role),
    sourceRegistryId,
    normalizationHistory: normHistory,
    modifiers:           [],
    notes:               [],
  };
}

/* =========================================================
   Public API
   ========================================================= */

/**
 * Normalize all measurable entities in `rawText`.
 *
 * Calls the extractor internally and converts every span to a
 * CanonicalEntity.  The entity counter is NOT reset automatically —
 * call resetEntityCounter() before this function if stable me_0-based
 * IDs are required (e.g., in tests).
 *
 * @returns  Ordered array of CanonicalEntity, sorted by source position.
 */
export function normalizeEntities(rawText: string): CanonicalEntity[] {
  const spans = extractMeasuredEntities(rawText);
  return spans.map(spanToCanonical);
}

/**
 * Same as normalizeEntities() but resets the entity counter first,
 * guaranteeing IDs start at "me_0".  Safe for independent calls in tests
 * but NOT safe for concurrent calls.
 */
export function normalizeEntitiesStable(rawText: string): CanonicalEntity[] {
  resetEntityCounter();
  return normalizeEntities(rawText);
}

/**
 * Normalize a single pre-extracted span.
 * Used when the caller already has MeasuredEntitySpan records.
 */
export function normalizeSpan(span: MeasuredEntitySpan): CanonicalEntity {
  return spanToCanonical(span);
}
