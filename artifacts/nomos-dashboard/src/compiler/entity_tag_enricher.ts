/**
 * entity_tag_enricher.ts
 *
 * Assigns canonical tags + provenance records to extracted entity spans.
 *
 * Enrichment runs once per entity, immediately after extraction.
 * Downstream layers (graph builder, constraint executor) reuse the result
 * without re-inferring tags from labels.
 *
 * Pipeline:
 *   1. Registry lookup by normalized label   → provenance "registry"
 *   2. Category-based tag (food, supplement, fluid, …) → provenance "inferred"
 *      Only added when the category tag is not already present from the registry.
 *   3. Unit-category fallback tag            → provenance "fallback"
 *      Added only when steps 1 and 2 produce nothing.
 *
 * This guarantees:
 *   - Every entity has at least an empty tags array and provenance map.
 *   - Classification happens once and is not recreated elsewhere.
 *   - Provenance is traceable at every downstream query.
 */

import { lookupEntityTags } from "./entity_tag_registry.ts";
import type { TagProvenanceSource }      from "./entity_tag_registry.ts";
import type { MeasuredEntityCategory }   from "./measured_entity_types.ts";
import type { UnitCategory }             from "./unit_registry.ts";

/* =========================================================
   Public API
   ========================================================= */

export interface EntityTagResult {
  tags:         string[];
  tagProvenance: Record<string, TagProvenanceSource>;
}

/**
 * Enrich an extracted entity with canonical tags and their provenance.
 *
 * @param normalizedLabel  Lowercase, trimmed noun phrase (e.g. "cyclic dextrin")
 * @param category         Coarse domain category inferred from unit + word sets
 * @param unitCategory     Physical unit dimension (mass, volume, time, …)
 */
export function enrichEntityTags(
  normalizedLabel: string,
  category:        MeasuredEntityCategory,
  unitCategory:    UnitCategory | null
): EntityTagResult {
  const tags: string[]                               = [];
  const tagProvenance: Record<string, TagProvenanceSource> = {};

  // ── Step 1: registry lookup ──────────────────────────────────────────────
  const record = lookupEntityTags(normalizedLabel);
  if (record) {
    for (const tag of record.tags) {
      if (!tags.includes(tag)) {
        tags.push(tag);
        tagProvenance[tag] = record.provenance[tag] ?? "registry";
      }
    }
  }

  // ── Step 2: category-derived tag ─────────────────────────────────────────
  // The coarse category (food, supplement, fluid, …) is added as an inferred
  // tag only when it is not already present from registry output.  This ensures
  // a "cyclic dextrin" entity tagged ["fast","carb"] also carries "food" as an
  // additional searchable dimension without overriding the registry result.
  if (category !== "unknown") {
    if (!tags.includes(category)) {
      tags.push(category);
      tagProvenance[category] = "inferred";
    }
  }

  // ── Step 3: unit-category fallback ───────────────────────────────────────
  // Used for bare-measurement entities or unusual labels that have no registry
  // entry and no meaningful category.  Provides at least one tag.
  if (tags.length === 0 && unitCategory && unitCategory !== "unknown") {
    const fallbackTag = unitCategory as string;
    tags.push(fallbackTag);
    tagProvenance[fallbackTag] = "fallback";
  }

  return { tags, tagProvenance };
}
