/**
 * tag_provenance_test.ts
 *
 * Regression tests for tag/class provenance tracking.
 *
 * Coverage groups:
 *   RL — Registry Lookup          (9 tests)
 *   EN — Tag Enricher             (7 tests)
 *   GP — Graph Node Propagation   (6 tests)
 *   FP — filterEntitiesByTags on real pipeline data (6 tests)
 */

import { describe, it, expect } from "vitest";
import { lookupEntityTags, getRegistryEntry }  from "../compiler/entity_tag_registry.ts";
import { enrichEntityTags }                    from "../compiler/entity_tag_enricher.ts";
import { buildOperandGraph }                   from "../graph/operand_graph_builder.ts";
import { buildRelationGraph }                  from "../graph/relation_graph_builder.ts";
import { filterEntitiesByTags, selectCandidateEntities } from "../graph/graph_query_engine.ts";
import { executeGraphConstraint }              from "../graph/graph_constraint_executor.ts";
import type { BindingResult, MeasuredEntitySpan } from "../compiler/measured_entity_types.ts";
import type { GraphConstraintSpec }            from "../graph/graph_constraint_types.ts";

/* ─────────────────────────────────────────────────────────────────────────────
   RL — Registry Lookup
   ─────────────────────────────────────────────────────────────────────────────
   Tests the entity_tag_registry lookupEntityTags function.
   ───────────────────────────────────────────────────────────────────────────── */

describe("RL — Registry Lookup", () => {

  it("(RL1) exact match 'cyclic dextrin' → tags include fast and carb", () => {
    const r = lookupEntityTags("cyclic dextrin");
    expect(r).not.toBeNull();
    expect(r!.tags).toContain("fast");
    expect(r!.tags).toContain("carb");
  });

  it("(RL2) exact match 'oats' → tags include slow and carb", () => {
    const r = lookupEntityTags("oats");
    expect(r).not.toBeNull();
    expect(r!.tags).toContain("slow");
    expect(r!.tags).toContain("carb");
  });

  it("(RL3) containment match 'pure cyclic dextrin concentrate' → matches 'cyclic dextrin'", () => {
    const r = lookupEntityTags("pure cyclic dextrin concentrate");
    expect(r).not.toBeNull();
    expect(r!.tags).toContain("fast");
    expect(r!.tags).toContain("carb");
  });

  it("(RL4) token match 'raw dextrin powder' → matches single-word key 'dextrin'", () => {
    const r = lookupEntityTags("raw dextrin powder");
    expect(r).not.toBeNull();
    expect(r!.tags).toContain("fast");
    expect(r!.tags).toContain("carb");
  });

  it("(RL5) miss — 'unobtainium extract' → null", () => {
    const r = lookupEntityTags("unobtainium extract");
    expect(r).toBeNull();
  });

  it("(RL6) exact match 'magnesium' → tags include supplement and mineral", () => {
    const r = lookupEntityTags("magnesium");
    expect(r).not.toBeNull();
    expect(r!.tags).toContain("supplement");
    expect(r!.tags).toContain("mineral");
  });

  it("(RL7) exact match 'water' → tags include fluid", () => {
    const r = lookupEntityTags("water");
    expect(r).not.toBeNull();
    expect(r!.tags).toContain("fluid");
  });

  it("(RL8) exact match 'whey protein' → tags include protein and fast", () => {
    const r = lookupEntityTags("whey protein");
    expect(r).not.toBeNull();
    expect(r!.tags).toContain("protein");
    expect(r!.tags).toContain("fast");
  });

  it("(RL9) 'brown rice' prefers longer key over 'rice' — tags include slow", () => {
    const r = lookupEntityTags("brown rice");
    expect(r).not.toBeNull();
    expect(r!.tags).toContain("slow");
    expect(r!.tags).toContain("carb");
    // Must NOT be the short-key "rice" entry (which only has "carb")
    expect(r!.tags).toContain("slow");
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   EN — Tag Enricher
   ─────────────────────────────────────────────────────────────────────────────
   Tests enrichEntityTags(normalizedLabel, category, unitCategory).
   ───────────────────────────────────────────────────────────────────────────── */

describe("EN — Tag Enricher", () => {

  it("(EN1) 'cyclic dextrin' / food / mass → registry tags fast+carb + inferred food", () => {
    const r = enrichEntityTags("cyclic dextrin", "food", "mass");
    expect(r.tags).toContain("fast");
    expect(r.tags).toContain("carb");
    expect(r.tags).toContain("food");
    expect(r.tagProvenance["fast"]).toBe("registry");
    expect(r.tagProvenance["carb"]).toBe("registry");
    expect(r.tagProvenance["food"]).toBe("inferred");
  });

  it("(EN2) 'oats' / food / mass → registry tags slow+carb + inferred food", () => {
    const r = enrichEntityTags("oats", "food", "mass");
    expect(r.tags).toContain("slow");
    expect(r.tags).toContain("carb");
    expect(r.tags).toContain("food");
    expect(r.tagProvenance["slow"]).toBe("registry");
    expect(r.tagProvenance["carb"]).toBe("registry");
    expect(r.tagProvenance["food"]).toBe("inferred");
  });

  it("(EN3) 'creatine' / supplement / mass → registry supplement; no duplication", () => {
    const r = enrichEntityTags("creatine", "supplement", "mass");
    expect(r.tags).toContain("supplement");
    expect(r.tagProvenance["supplement"]).toBe("registry");
    // Category "supplement" also matches but must NOT appear twice in tags
    expect(r.tags.filter((t) => t === "supplement")).toHaveLength(1);
  });

  it("(EN4) unknown label / food category → only inferred category tag", () => {
    const r = enrichEntityTags("zylokrypto extract", "food", "mass");
    expect(r.tags).toContain("food");
    expect(r.tagProvenance["food"]).toBe("inferred");
    // No registry tags — unknown label
    expect(r.tags.every((t) => r.tagProvenance[t] !== "registry")).toBe(true);
  });

  it("(EN5) unknown label / unknown category / known unitCategory → fallback tag", () => {
    const r = enrichEntityTags("xyz", "unknown", "mass");
    expect(r.tags).toContain("mass");
    expect(r.tagProvenance["mass"]).toBe("fallback");
  });

  it("(EN6) empty label + unknown category + null unitCategory → empty tags", () => {
    const r = enrichEntityTags("", "unknown", null);
    expect(r.tags).toHaveLength(0);
    expect(Object.keys(r.tagProvenance)).toHaveLength(0);
  });

  it("(EN7) tagProvenance keys exactly match tags array", () => {
    const r = enrichEntityTags("cyclic dextrin", "food", "mass");
    const tagSet = new Set(r.tags);
    const provSet = new Set(Object.keys(r.tagProvenance));
    for (const tag of tagSet) expect(provSet.has(tag)).toBe(true);
    for (const key of provSet) expect(tagSet.has(key)).toBe(true);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   GP — Graph Node Propagation
   ─────────────────────────────────────────────────────────────────────────────
   Tests that buildOperandGraph copies tags + tagProvenance verbatim from spans.
   ───────────────────────────────────────────────────────────────────────────── */

function makeMinimalSpan(
  overrides: Partial<MeasuredEntitySpan> & Pick<MeasuredEntitySpan, "id" | "label" | "tags" | "tagProvenance">
): MeasuredEntitySpan {
  return {
    rawText:        overrides.label,
    normalizedText: overrides.label,
    amount:         100,
    unit:           "g",
    normalizedUnit: "g",
    unitCategory:   "mass",
    normalizedLabel: overrides.label.toLowerCase(),
    category:       "food",
    role:           "unknown",
    confidence:     "high",
    startIndex:     0,
    endIndex:       overrides.label.length,
    ...overrides,
  };
}

function makeResult(spans: MeasuredEntitySpan[]): BindingResult {
  return { entities: spans, anchors: [], bindings: [] };
}

describe("GP — Graph Node Propagation", () => {

  it("(GP1) entity span tags==['fast','carb'] → entity node data.tags contains 'fast'", () => {
    const span = makeMinimalSpan({ id: "me_0", label: "cyclic dextrin", tags: ["fast","carb"], tagProvenance: { fast:"registry", carb:"registry" } });
    const graph = buildOperandGraph(makeResult([span]));
    const entityNode = graph.nodes.find((n) => n.type === "entity");
    expect(entityNode).toBeDefined();
    expect((entityNode!.data?.tags as string[])).toContain("fast");
    expect((entityNode!.data?.tags as string[])).toContain("carb");
  });

  it("(GP2) entity span tags==['slow','carb'] → entity node data.tags contains 'slow'", () => {
    const span = makeMinimalSpan({ id: "me_0", label: "oats", tags: ["slow","carb"], tagProvenance: { slow:"registry", carb:"registry" } });
    const graph = buildOperandGraph(makeResult([span]));
    const entityNode = graph.nodes.find((n) => n.type === "entity");
    expect((entityNode!.data?.tags as string[])).toContain("slow");
    expect((entityNode!.data?.tags as string[])).not.toContain("fast");
  });

  it("(GP3) tagProvenance is propagated verbatim to entity node data", () => {
    const span = makeMinimalSpan({ id: "me_0", label: "cyclic dextrin", tags: ["fast","carb"], tagProvenance: { fast:"registry", carb:"registry" } });
    const graph = buildOperandGraph(makeResult([span]));
    const entityNode = graph.nodes.find((n) => n.type === "entity");
    const prov = entityNode!.data?.tagProvenance as Record<string, string>;
    expect(prov["fast"]).toBe("registry");
    expect(prov["carb"]).toBe("registry");
  });

  it("(GP4) empty tags → entity node data.tags is empty array", () => {
    const span = makeMinimalSpan({ id: "me_0", label: "mystery substance", tags: [], tagProvenance: {} });
    const graph = buildOperandGraph(makeResult([span]));
    const entityNode = graph.nodes.find((n) => n.type === "entity");
    expect((entityNode!.data?.tags as string[])).toHaveLength(0);
  });

  it("(GP5) entity node data.tagProvenance is present as a key", () => {
    const span = makeMinimalSpan({ id: "me_0", label: "magnesium", tags: ["supplement","mineral"], tagProvenance: { supplement:"registry", mineral:"registry" } });
    const graph = buildOperandGraph(makeResult([span]));
    const entityNode = graph.nodes.find((n) => n.type === "entity");
    expect(entityNode!.data).toHaveProperty("tagProvenance");
  });

  it("(GP6) two spans produce two entity nodes, each with their own tags", () => {
    const s1 = makeMinimalSpan({ id: "me_0", label: "cyclic dextrin", tags: ["fast","carb"], tagProvenance: { fast:"registry", carb:"registry" } });
    const s2 = makeMinimalSpan({ id: "me_1", label: "oats", tags: ["slow","carb"], tagProvenance: { slow:"registry", carb:"registry" }, startIndex: 10, endIndex: 20 });
    const graph = buildOperandGraph(makeResult([s1, s2]));
    const entityNodes = graph.nodes.filter((n) => n.type === "entity");
    expect(entityNodes).toHaveLength(2);
    const dextrinNode = entityNodes.find((n) => n.label === "cyclic dextrin");
    const oatsNode    = entityNodes.find((n) => n.label === "oats");
    expect((dextrinNode!.data?.tags as string[])).toContain("fast");
    expect((oatsNode!.data?.tags   as string[])).toContain("slow");
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   FP — filterEntitiesByTags on real pipeline data
   ─────────────────────────────────────────────────────────────────────────────
   Tests that semantic tag filtering works end-to-end from raw text input.
   ───────────────────────────────────────────────────────────────────────────── */

describe("FP — filterEntitiesByTags on real pipeline data", () => {

  it("(FP1) 'cyclic dextrin' entity → filter by [fast,carb] → entity survives", () => {
    const graph = buildRelationGraph("80g cyclic dextrin before lifting");
    const allIds = selectCandidateEntities(graph, null).map((n) => n.id);
    const filtered = filterEntitiesByTags(graph, allIds, ["fast","carb"]);
    expect(filtered.length).toBeGreaterThan(0);
  });

  it("(FP2) 'oats' entity → filter by [fast,carb] → entity is excluded (missing fast)", () => {
    const graph   = buildRelationGraph("30g oats before lifting");
    const allIds  = selectCandidateEntities(graph, null).map((n) => n.id);
    const filtered = filterEntitiesByTags(graph, allIds, ["fast","carb"]);
    // Oats are slow-carb; they must not pass a fast+carb filter
    expect(filtered).toHaveLength(0);
  });

  it("(FP3) empty tag filter → all entities survive", () => {
    const graph   = buildRelationGraph("80g cyclic dextrin before lifting");
    const allIds  = selectCandidateEntities(graph, null).map((n) => n.id);
    const filtered = filterEntitiesByTags(graph, allIds, []);
    expect(filtered).toEqual(allIds);
  });

  it("(FP4) mixed graph → filter by [fast,carb] → only cyclic dextrin entity survives", () => {
    const graph   = buildRelationGraph("80g cyclic dextrin and 30g oats before lifting");
    const allIds  = selectCandidateEntities(graph, null).map((n) => n.id);
    const filtered = filterEntitiesByTags(graph, allIds, ["fast","carb"]);
    // At least one entity (cyclic dextrin) must pass
    expect(filtered.length).toBeGreaterThan(0);
    // All surviving nodes must have both fast and carb tags
    for (const id of filtered) {
      const node = graph.nodes.find((n) => n.id === id);
      const tags = (node?.data?.tags as string[] | undefined) ?? [];
      expect(tags).toContain("fast");
      expect(tags).toContain("carb");
    }
  });

  it("(FP5) 'oats' entity → filter by [slow,carb] → entity survives", () => {
    const graph   = buildRelationGraph("30g oats before lifting");
    const allIds  = selectCandidateEntities(graph, null).map((n) => n.id);
    const filtered = filterEntitiesByTags(graph, allIds, ["slow","carb"]);
    expect(filtered.length).toBeGreaterThan(0);
  });

  it("(FP6) full constraint: fast+carb, sum(g) >= 60 passes for 80g cyclic dextrin", () => {
    const graph = buildRelationGraph("80g cyclic dextrin before lifting");
    const spec: GraphConstraintSpec = {
      constraintId: "C-FP6",
      label:        "fast carb >= 60g",
      selection:    { entityTags: ["fast","carb"] },
      aggregation:  { quantityUnit: "g", aggregation: "sum" },
      operator:     ">=",
      threshold:    60,
    };
    const result = executeGraphConstraint(graph, spec);
    expect(result.passed).toBe(true);
    expect(result.observedValue).toBeGreaterThanOrEqual(60);
  });

});
