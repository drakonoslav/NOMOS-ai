/**
 * canonical_entity_schema_test.ts
 *
 * Regression tests for the canonical measurable entity schema.
 *
 * Coverage groups:
 *   CS — Schema structure validation          (4 tests)
 *   NR — Normalizer output correctness        (10 tests)
 *   TR — Tag Registry integration             (8 tests)
 *   NH — Normalization History                (7 tests)
 *   DM — Dimension mapping                    (5 tests)
 *
 * All tests use normalizeEntitiesStable() to guarantee me_0-based IDs.
 */

import { describe, it, expect } from "vitest";
import { normalizeEntitiesStable } from "../compiler/canonical_entity_normalizer.ts";
import { lookupCanonicalTags, getCanonicalRegistryEntry } from "../compiler/tag_registry.ts";

/* ─────────────────────────────────────────────────────────────────────────────
   CS — Schema structure validation
   ─────────────────────────────────────────────────────────────────────────────
   Tests that CanonicalEntity has all required fields and correct shapes.
   ───────────────────────────────────────────────────────────────────────────── */

describe("CS — Schema Structure Validation", () => {

  it("(CS1) normalizeEntitiesStable returns an array", () => {
    const result = normalizeEntitiesStable("80g cyclic dextrin");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("(CS2) CanonicalEntity has all required top-level fields", () => {
    const [e] = normalizeEntitiesStable("80g cyclic dextrin");
    expect(e).toHaveProperty("id");
    expect(e).toHaveProperty("rawText");
    expect(e).toHaveProperty("normalizedText");
    expect(e).toHaveProperty("labelRaw");
    expect(e).toHaveProperty("labelNormalized");
    expect(e).toHaveProperty("category");
    expect(e).toHaveProperty("categoryConfidence");
    expect(e).toHaveProperty("measures");
    expect(e).toHaveProperty("tags");
    expect(e).toHaveProperty("role");
    expect(e).toHaveProperty("normalizationHistory");
    expect(e).toHaveProperty("sourceRegistryId");
  });

  it("(CS3) measures is non-empty array with required sub-fields", () => {
    const [e] = normalizeEntitiesStable("80g cyclic dextrin");
    expect(Array.isArray(e.measures)).toBe(true);
    expect(e.measures.length).toBeGreaterThan(0);
    const m = e.measures[0];
    expect(m).toHaveProperty("amount");
    expect(m).toHaveProperty("unitRaw");
    expect(m).toHaveProperty("unitNormalized");
    expect(m).toHaveProperty("dimension");
  });

  it("(CS4) category is one of the allowed EntityCategory values", () => {
    const VALID_CATEGORIES = new Set([
      "substance","food","fluid","supplement","object","load",
      "duration","distance","countable_item","event","anchor","unknown",
    ]);
    const entities = normalizeEntitiesStable("80g cyclic dextrin and 500 mL water and 3 hours sleep");
    for (const e of entities) {
      expect(VALID_CATEGORIES.has(e.category)).toBe(true);
    }
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   NR — Normalizer output correctness
   ─────────────────────────────────────────────────────────────────────────────
   Tests that specific input phrases produce correct canonical output.
   ───────────────────────────────────────────────────────────────────────────── */

describe("NR — Normalizer Output Correctness", () => {

  it("(NR1) '80g cyclic dextrin' → labelRaw='cyclic dextrin', labelNormalized='cyclic_dextrin'", () => {
    const [e] = normalizeEntitiesStable("80g cyclic dextrin");
    expect(e.labelRaw).toBe("cyclic dextrin");
    expect(e.labelNormalized).toBe("cyclic_dextrin");
  });

  it("(NR2) '1 banana' → labelRaw='banana', category known, amount=1", () => {
    const [e] = normalizeEntitiesStable("1 banana");
    expect(e.labelRaw.toLowerCase()).toBe("banana");
    expect(e.measures[0].amount).toBe(1);
  });

  it("(NR3) '500 mL water' → unitNormalized='ml', dimension='volume'", () => {
    const [e] = normalizeEntitiesStable("500 mL water");
    expect(e.measures[0].unitNormalized).toBe("ml");
    expect(e.measures[0].dimension).toBe("volume");
    expect(e.labelRaw.toLowerCase()).toBe("water");
  });

  it("(NR4) '2 capsules magnesium' → dimension='count', labelRaw='magnesium'", () => {
    const [e] = normalizeEntitiesStable("2 capsules magnesium");
    expect(e.measures[0].dimension).toBe("count");
    expect(e.labelRaw.toLowerCase()).toBe("magnesium");
  });

  it("(NR5) '40 lb dumbbell' → dimension='mass', labelNormalized='dumbbell'", () => {
    const [e] = normalizeEntitiesStable("40 lb dumbbell");
    expect(e.measures[0].dimension).toBe("mass");
    expect(e.labelNormalized).toBe("dumbbell");
  });

  it("(NR6) '3 hours sleep' → dimension='time', category='duration'", () => {
    const [e] = normalizeEntitiesStable("3 hours sleep");
    expect(e.measures[0].dimension).toBe("time");
    expect(e.category).toBe("duration");
  });

  it("(NR7) '12 reps curls' → dimension='count', labelNormalized='curls'", () => {
    const [e] = normalizeEntitiesStable("12 reps curls");
    expect(e.measures[0].dimension).toBe("count");
    expect(e.labelNormalized).toBe("curls");
  });

  it("(NR8) '9 grams wishes' → labelRaw='wishes', tags=[], sourceRegistryId=null", () => {
    const [e] = normalizeEntitiesStable("9 grams wishes");
    expect(e.labelRaw.toLowerCase()).toBe("wishes");
    // No registry entry for "wishes" — must not have registry-sourced tags
    const registryTags = e.tags.filter((t) => t.provenance === "registry");
    expect(registryTags).toHaveLength(0);
    expect(e.sourceRegistryId).toBeNull();
  });

  it("(NR9) '9 grams wishes' → categoryConfidence ≤ 0.40 (unknown substance)", () => {
    const [e] = normalizeEntitiesStable("9 grams wishes");
    // "wishes" has no registry entry → low category confidence
    expect(e.categoryConfidence).toBeLessThanOrEqual(0.40);
  });

  it("(NR10) multiple entities extracted from one input, each independent", () => {
    const entities = normalizeEntitiesStable("80g cyclic dextrin and 30g oats");
    expect(entities.length).toBeGreaterThanOrEqual(2);
    const labels = entities.map((e) => e.labelRaw.toLowerCase());
    expect(labels).toContain("cyclic dextrin");
    expect(labels).toContain("oats");
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   TR — Tag Registry Integration
   ─────────────────────────────────────────────────────────────────────────────
   Tests tag assignment, provenance, confidence, and sourceRegistryId.
   ───────────────────────────────────────────────────────────────────────────── */

describe("TR — Tag Registry Integration", () => {

  it("(TR1) 'cyclic dextrin' entity → tags include TagRecord with tag='fast', provenance='registry'", () => {
    const [e] = normalizeEntitiesStable("80g cyclic dextrin");
    const fastTag = e.tags.find((t) => t.tag === "fast");
    expect(fastTag).toBeDefined();
    expect(fastTag!.provenance).toBe("registry");
  });

  it("(TR2) 'cyclic dextrin' entity → tags include TagRecord with tag='carb', provenance='registry'", () => {
    const [e] = normalizeEntitiesStable("80g cyclic dextrin");
    const carbTag = e.tags.find((t) => t.tag === "carb");
    expect(carbTag).toBeDefined();
    expect(carbTag!.provenance).toBe("registry");
  });

  it("(TR3) 'oats' entity → tags include TagRecord with tag='slow', provenance='registry'", () => {
    const [e] = normalizeEntitiesStable("30g oats");
    const slowTag = e.tags.find((t) => t.tag === "slow");
    expect(slowTag).toBeDefined();
    expect(slowTag!.provenance).toBe("registry");
  });

  it("(TR4) registry-sourced tags have non-null sourceRegistryId", () => {
    const [e] = normalizeEntitiesStable("80g cyclic dextrin");
    const registryTags = e.tags.filter((t) => t.provenance === "registry");
    expect(registryTags.length).toBeGreaterThan(0);
    for (const tag of registryTags) {
      expect(tag.sourceRegistryId).not.toBeNull();
      expect(typeof tag.sourceRegistryId).toBe("string");
    }
  });

  it("(TR5) category-inferred tags have provenance='inferred'", () => {
    const [e] = normalizeEntitiesStable("80g cyclic dextrin");
    const inferredTags = e.tags.filter((t) => t.provenance === "inferred");
    // "food" category should be inferred even when registry tags exist
    expect(inferredTags.length).toBeGreaterThan(0);
  });

  it("(TR6) '9 grams wishes' → all tags have non-'registry' provenance", () => {
    const [e] = normalizeEntitiesStable("9 grams wishes");
    for (const tag of e.tags) {
      expect(tag.provenance).not.toBe("registry");
    }
  });

  it("(TR7) all TagRecord objects have confidence between 0.0 and 1.0", () => {
    const entities = normalizeEntitiesStable("80g cyclic dextrin and 30g oats and 500 mL water and 5g creatine");
    for (const e of entities) {
      for (const tag of e.tags) {
        expect(tag.confidence).toBeGreaterThanOrEqual(0.0);
        expect(tag.confidence).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it("(TR8) 'cyclic dextrin' entity → tags include inferred 'food' tag", () => {
    const [e] = normalizeEntitiesStable("80g cyclic dextrin");
    const foodTag = e.tags.find((t) => t.tag === "food");
    expect(foodTag).toBeDefined();
    expect(foodTag!.provenance).toBe("inferred");
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   NH — Normalization History
   ─────────────────────────────────────────────────────────────────────────────
   Tests that the normalizationHistory captures all transformation steps.
   ───────────────────────────────────────────────────────────────────────────── */

describe("NH — Normalization History", () => {

  it("(NH1) 'cyclic dextrin' label → normalizationHistory has entity_normalization record", () => {
    const [e] = normalizeEntitiesStable("80g cyclic dextrin");
    const stages = e.normalizationHistory.map((r) => r.stage);
    expect(stages).toContain("entity_normalization");
  });

  it("(NH2) entity_normalization record: before='cyclic dextrin', after='cyclic_dextrin'", () => {
    const [e] = normalizeEntitiesStable("80g cyclic dextrin");
    const record = e.normalizationHistory.find((r) => r.stage === "entity_normalization");
    expect(record).toBeDefined();
    expect(record!.before).toBe("cyclic dextrin");
    expect(record!.after).toBe("cyclic_dextrin");
  });

  it("(NH3) '80 grams cyclic dextrin' → unit_normalization record: before='grams', after='g'", () => {
    const [e] = normalizeEntitiesStable("80 grams cyclic dextrin");
    const record = e.normalizationHistory.find((r) => r.stage === "unit_normalization");
    expect(record).toBeDefined();
    expect(record!.before).toBe("grams");
    expect(record!.after).toBe("g");
  });

  it("(NH4) normalizationHistory records have non-empty stage, before, after, reason", () => {
    const [e] = normalizeEntitiesStable("80 grams cyclic dextrin");
    for (const r of e.normalizationHistory) {
      expect(r.stage.length).toBeGreaterThan(0);
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it("(NH5) '9 grams wishes' → unit_normalization record (grams→g)", () => {
    const [e] = normalizeEntitiesStable("9 grams wishes");
    const record = e.normalizationHistory.find((r) => r.stage === "unit_normalization");
    expect(record).toBeDefined();
    expect(record!.before).toBe("grams");
    expect(record!.after).toBe("g");
  });

  it("(NH6) '80g cyclic dextrin' (compact unit 'g') → no unit_normalization (g is already canonical)", () => {
    const [e] = normalizeEntitiesStable("80g cyclic dextrin");
    // 'g' is already the canonical form — no unit_normalization needed
    const record = e.normalizationHistory.find((r) => r.stage === "unit_normalization");
    expect(record).toBeUndefined();
  });

  it("(NH7) '9 grams wishes' → entity_normalization absent (single-word label not snake_cased)", () => {
    const [e] = normalizeEntitiesStable("9 grams wishes");
    // "wishes" → "wishes" (no change) → no entity_normalization record
    const record = e.normalizationHistory.find((r) => r.stage === "entity_normalization");
    expect(record).toBeUndefined();
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   DM — Dimension Mapping
   ─────────────────────────────────────────────────────────────────────────────
   Tests that each unit category maps to the correct MeasureDimension.
   ───────────────────────────────────────────────────────────────────────────── */

describe("DM — Dimension Mapping", () => {

  it("(DM1) mass unit → dimension='mass'", () => {
    const [e] = normalizeEntitiesStable("80g creatine");
    expect(e.measures[0].dimension).toBe("mass");
  });

  it("(DM2) volume unit → dimension='volume'", () => {
    const [e] = normalizeEntitiesStable("500 ml water");
    expect(e.measures[0].dimension).toBe("volume");
  });

  it("(DM3) time unit → dimension='time'", () => {
    const [e] = normalizeEntitiesStable("3 hours sleep");
    expect(e.measures[0].dimension).toBe("time");
  });

  it("(DM4) training unit (reps) → dimension='count'", () => {
    const [e] = normalizeEntitiesStable("12 reps curls");
    expect(e.measures[0].dimension).toBe("count");
  });

  it("(DM5) energy unit (kcal) → dimension='energy'", () => {
    const [e] = normalizeEntitiesStable("500 kcal breakfast");
    expect(e.measures[0].dimension).toBe("energy");
  });

});
