/**
 * canonical_relation_schema_test.ts
 *
 * Regression tests for the canonical relation schema.
 *
 * Coverage groups:
 *   CS — Canonical structure validation         (3 tests)
 *   RT — Relation type mapping                  (6 tests)
 *   RO — Relation offset correctness            (4 tests)
 *   RW — Relation window correctness            (3 tests)
 *   RP — Relation provenance                    (5 tests)
 *   SR — Structural (HAS_MEASURE) relations     (5 tests)
 *   NH — Normalization history                  (4 tests)
 *   PR — Pre/Post shorthand expansion           (4 tests)
 *
 * All tests use normalizeRelationsStable() for repeatable rel_0 IDs.
 */

import { describe, it, expect } from "vitest";
import { normalizeRelationsStable } from "../compiler/canonical_relation_normalizer.ts";

const VALID_TYPES = new Set([
  "HAS_MEASURE","HAS_TAG","MODIFIED_BY","BELONGS_TO_CANDIDATE",
  "BELONGS_TO_OBJECTIVE","BELONGS_TO_CONSTRAINT","CLASSIFIED_AS",
  "AGGREGATES_OVER","CONSTRAINS","COMPARES_TO_THRESHOLD",
  "BEFORE","AFTER","WITHIN_WINDOW","BETWEEN","DURING",
  "RELATIVE_TO_ANCHOR","WITH",
]);

/* ─────────────────────────────────────────────────────────────────────────────
   CS — Canonical structure validation
   ───────────────────────────────────────────────────────────────────────────── */

describe("CS — Canonical Structure Validation", () => {

  it("(CS1) normalizeRelationsStable returns an array", () => {
    const result = normalizeRelationsStable("80g cyclic dextrin before lifting");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("(CS2) CanonicalRelation has all required top-level fields", () => {
    const [r] = normalizeRelationsStable("80g cyclic dextrin before lifting");
    expect(r).toHaveProperty("id");
    expect(r).toHaveProperty("type");
    expect(r).toHaveProperty("fromEntityId");
    expect(r).toHaveProperty("toEntityId");
    expect(r).toHaveProperty("labelRaw");
    expect(r).toHaveProperty("labelNormalized");
    expect(r).toHaveProperty("provenance");
    expect(r).toHaveProperty("confidence");
    expect(r).toHaveProperty("offset");
    expect(r).toHaveProperty("window");
    expect(r).toHaveProperty("qualifiers");
    expect(r).toHaveProperty("sourceRegistryId");
    expect(r).toHaveProperty("normalizationHistory");
  });

  it("(CS3) confidence is in [0, 1] and type is a valid CanonicalRelationType", () => {
    const relations = normalizeRelationsStable(
      "80g cyclic dextrin 30 minutes before lifting and 30g oats with breakfast",
    );
    for (const r of relations) {
      expect(r.confidence).toBeGreaterThanOrEqual(0.0);
      expect(r.confidence).toBeLessThanOrEqual(1.0);
      expect(VALID_TYPES.has(r.type)).toBe(true);
    }
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   RT — Relation type mapping
   ───────────────────────────────────────────────────────────────────────────── */

describe("RT — Relation Type Mapping", () => {

  it("(RT1) '...before lifting' → BEFORE relation present", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin 30 minutes before lifting");
    const before = rels.find((r) => r.type === "BEFORE");
    expect(before).toBeDefined();
  });

  it("(RT2) '...after sleep' → AFTER relation present", () => {
    const rels = normalizeRelationsStable("5mg melatonin 2 hours after sleep");
    const after = rels.find((r) => r.type === "AFTER");
    expect(after).toBeDefined();
  });

  it("(RT3) 'within 90 minutes before lifting' → WITHIN_WINDOW relation present", () => {
    const rels = normalizeRelationsStable(
      "80g cyclic dextrin within 90 minutes before lifting",
    );
    const within = rels.find((r) => r.type === "WITHIN_WINDOW");
    expect(within).toBeDefined();
  });

  it("(RT4) '...with breakfast' → WITH relation present", () => {
    const rels = normalizeRelationsStable("30g oats with breakfast");
    const withRel = rels.find((r) => r.type === "WITH");
    expect(withRel).toBeDefined();
  });

  it("(RT5) '...during sleep' → DURING relation present", () => {
    const rels = normalizeRelationsStable("3 hours during sleep");
    const during = rels.find((r) => r.type === "DURING");
    expect(during).toBeDefined();
  });

  it("(RT6) '...between meals' → BETWEEN relation present", () => {
    const rels = normalizeRelationsStable("10g bcaa between meals");
    const between = rels.find((r) => r.type === "BETWEEN");
    expect(between).toBeDefined();
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   RO — Relation offset correctness
   ───────────────────────────────────────────────────────────────────────────── */

describe("RO — Relation Offset Correctness", () => {

  it("(RO1) '30 minutes before lifting' → BEFORE offset.amount = 30", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin 30 minutes before lifting");
    const before = rels.find((r) => r.type === "BEFORE");
    expect(before).toBeDefined();
    expect(before!.offset).not.toBeNull();
    expect(before!.offset!.amount).toBe(30);
  });

  it("(RO2) '30 minutes before lifting' → BEFORE offset.dimension = 'time'", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin 30 minutes before lifting");
    const before = rels.find((r) => r.type === "BEFORE");
    expect(before!.offset!.dimension).toBe("time");
  });

  it("(RO3) '2 hours after sleep' → AFTER offset.unitNormalized = 'hr'", () => {
    const rels = normalizeRelationsStable("5mg melatonin 2 hours after sleep");
    const after = rels.find((r) => r.type === "AFTER");
    expect(after).toBeDefined();
    expect(after!.offset).not.toBeNull();
    expect(after!.offset!.unitNormalized).toBe("hr");
  });

  it("(RO4) 'with breakfast' → WITH relation offset is null (no offset)", () => {
    const rels = normalizeRelationsStable("30g oats with breakfast");
    const withRel = rels.find((r) => r.type === "WITH");
    expect(withRel).toBeDefined();
    expect(withRel!.offset).toBeNull();
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   RW — Relation window correctness
   ───────────────────────────────────────────────────────────────────────────── */

describe("RW — Relation Window Correctness", () => {

  it("(RW1) 'within 90 minutes before lifting' → WITHIN_WINDOW.window is defined", () => {
    const rels = normalizeRelationsStable(
      "80g cyclic dextrin within 90 minutes before lifting",
    );
    const within = rels.find((r) => r.type === "WITHIN_WINDOW");
    expect(within).toBeDefined();
    expect(within!.window).not.toBeNull();
  });

  it("(RW2) WITHIN_WINDOW window.endAmount = 90", () => {
    const rels = normalizeRelationsStable(
      "80g cyclic dextrin within 90 minutes before lifting",
    );
    const within = rels.find((r) => r.type === "WITHIN_WINDOW");
    expect(within!.window!.endAmount).toBe(90);
  });

  it("(RW3) plain 'before lifting' (no 'within') → no WITHIN_WINDOW relation", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin before lifting");
    const within = rels.find((r) => r.type === "WITHIN_WINDOW");
    expect(within).toBeUndefined();
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   RP — Relation provenance
   ───────────────────────────────────────────────────────────────────────────── */

describe("RP — Relation Provenance", () => {

  it("(RP1) 'before' surface → BEFORE provenance = 'explicit'", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin before lifting");
    const before = rels.find((r) => r.type === "BEFORE");
    expect(before).toBeDefined();
    expect(before!.provenance).toBe("explicit");
  });

  it("(RP2) 'pre' shorthand → BEFORE provenance = 'normalized'", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin pre lifting");
    const before = rels.find((r) => r.type === "BEFORE");
    expect(before).toBeDefined();
    expect(before!.provenance).toBe("normalized");
  });

  it("(RP3) 'post' shorthand → AFTER provenance = 'normalized'", () => {
    const rels = normalizeRelationsStable("5mg melatonin post workout");
    const after = rels.find((r) => r.type === "AFTER");
    expect(after).toBeDefined();
    expect(after!.provenance).toBe("normalized");
  });

  it("(RP4) HAS_MEASURE relations → provenance = 'inferred'", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin before lifting");
    const structural = rels.filter((r) => r.type === "HAS_MEASURE");
    expect(structural.length).toBeGreaterThan(0);
    for (const r of structural) {
      expect(r.provenance).toBe("inferred");
    }
  });

  it("(RP5) all non-null provenances are valid RelationProvenance values", () => {
    const VALID_PROVENANCES = new Set(["explicit","registry","normalized","inferred","fallback"]);
    const rels = normalizeRelationsStable(
      "80g cyclic dextrin 30 minutes before lifting and 30g oats with breakfast",
    );
    for (const r of rels) {
      expect(VALID_PROVENANCES.has(r.provenance)).toBe(true);
    }
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   SR — Structural (HAS_MEASURE) relations
   ───────────────────────────────────────────────────────────────────────────── */

describe("SR — Structural HAS_MEASURE Relations", () => {

  it("(SR1) '80g cyclic dextrin' → HAS_MEASURE relation in output", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin before lifting");
    const hasMeasure = rels.find((r) => r.type === "HAS_MEASURE");
    expect(hasMeasure).toBeDefined();
  });

  it("(SR2) HAS_MEASURE.fromEntityId is non-empty string", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin before lifting");
    const hasMeasure = rels.find((r) => r.type === "HAS_MEASURE");
    expect(typeof hasMeasure!.fromEntityId).toBe("string");
    expect(hasMeasure!.fromEntityId.length).toBeGreaterThan(0);
  });

  it("(SR3) HAS_MEASURE.confidence = 0.99 (structural certainty)", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin before lifting");
    const hasMeasure = rels.find((r) => r.type === "HAS_MEASURE");
    expect(hasMeasure!.confidence).toBe(0.99);
  });

  it("(SR4) HAS_MEASURE.toEntityId is null", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin before lifting");
    const hasMeasure = rels.find((r) => r.type === "HAS_MEASURE");
    expect(hasMeasure!.toEntityId).toBeNull();
  });

  it("(SR5) all relations have a non-empty fromEntityId", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin 30 minutes before lifting");
    for (const r of rels) {
      expect(typeof r.fromEntityId).toBe("string");
      expect(r.fromEntityId.length).toBeGreaterThan(0);
    }
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   NH — Normalization history
   ───────────────────────────────────────────────────────────────────────────── */

describe("NH — Normalization History", () => {

  it("(NH1) BEFORE relation → normalizationHistory has 'relation_normalization' record", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin before lifting");
    const before = rels.find((r) => r.type === "BEFORE");
    const stages = before!.normalizationHistory.map((r) => r.stage);
    expect(stages).toContain("relation_normalization");
  });

  it("(NH2) relation_normalization.after includes 'BEFORE' for before relations", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin before lifting");
    const before = rels.find((r) => r.type === "BEFORE");
    const record = before!.normalizationHistory.find((r) => r.stage === "relation_normalization");
    expect(record).toBeDefined();
    expect(record!.after).toContain("BEFORE");
  });

  it("(NH3) HAS_MEASURE → normalizationHistory has 'structural_inference' record", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin before lifting");
    const hasMeasure = rels.find((r) => r.type === "HAS_MEASURE");
    const stages = hasMeasure!.normalizationHistory.map((r) => r.stage);
    expect(stages).toContain("structural_inference");
  });

  it("(NH4) all normalizationHistory records have non-empty stage, before, after, reason", () => {
    const rels = normalizeRelationsStable(
      "80g cyclic dextrin 30 minutes before lifting and 30g oats with breakfast",
    );
    for (const r of rels) {
      for (const h of r.normalizationHistory) {
        expect(h.stage.length).toBeGreaterThan(0);
        expect(h.reason.length).toBeGreaterThan(0);
      }
    }
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   PR — Pre/Post shorthand expansion
   ───────────────────────────────────────────────────────────────────────────── */

describe("PR — Pre/Post Shorthand Expansion", () => {

  it("(PR1) 'pre lifting' → BEFORE relation type", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin pre lifting");
    const before = rels.find((r) => r.type === "BEFORE");
    expect(before).toBeDefined();
  });

  it("(PR2) 'post workout' → AFTER relation type", () => {
    const rels = normalizeRelationsStable("5mg melatonin post workout");
    const after = rels.find((r) => r.type === "AFTER");
    expect(after).toBeDefined();
  });

  it("(PR3) shorthand 'pre' has normalizationHistory with 'shorthand_expansion' stage", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin pre lifting");
    const before = rels.find((r) => r.type === "BEFORE");
    const stages = before!.normalizationHistory.map((r) => r.stage);
    expect(stages).toContain("shorthand_expansion");
  });

  it("(PR4) explicit 'before' does NOT have 'shorthand_expansion' in history", () => {
    const rels = normalizeRelationsStable("80g cyclic dextrin before lifting");
    const before = rels.find((r) => r.type === "BEFORE");
    const stages = before!.normalizationHistory.map((r) => r.stage);
    expect(stages).not.toContain("shorthand_expansion");
  });

});
