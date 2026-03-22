/**
 * canonical_graph_unification_test.ts
 *
 * Regression tests for entity-relation graph unification.
 *
 * The graph must be a faithful projection of canonical records.
 * No re-inference, no re-classification, no re-binding.
 *
 * Coverage groups:
 *   GT — Graph types validation                 (3 tests)
 *   EP — Entity projection                      (6 tests)
 *   RP — Relation / edge projection             (6 tests)
 *   AX — Anchor node projection                 (4 tests)
 *   IV — Invariants                             (5 tests)
 *   TR — Trace / debug output                   (5 tests)
 *   ST — Stability across runs                  (5 tests)
 *
 * All tests use buildCanonicalGraphFromText() for full-pipeline coverage.
 */

import { describe, it, expect } from "vitest";
import {
  buildCanonicalGraphFromText,
  buildCanonicalGraph,
  checkI1EntityNodeCount,
  checkI3NoTagReclassification,
  checkEdgeSourcesValid,
} from "../graph/canonical_graph_builder.ts";
import { normalizeWithAnchors } from "../compiler/canonical_relation_normalizer.ts";

const VALID_NODE_KINDS = new Set([
  "entity","quantity","anchor","candidate","objective","constraint","unit",
]);

/* ─────────────────────────────────────────────────────────────────────────────
   GT — Graph types validation
   ───────────────────────────────────────────────────────────────────────────── */

describe("GT — Graph Types Validation", () => {

  it("(GT1) buildCanonicalGraphFromText returns { graph, trace }", () => {
    const { graph, trace } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    expect(graph).toBeDefined();
    expect(trace).toBeDefined();
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
  });

  it("(GT2) all node kinds are valid CanonicalNodeKind values", () => {
    const { graph } = buildCanonicalGraphFromText(
      "80g cyclic dextrin 30 minutes before lifting and 30g oats with breakfast",
    );
    for (const node of graph.nodes) {
      expect(VALID_NODE_KINDS.has(node.kind)).toBe(true);
    }
  });

  it("(GT3) all edge kinds are non-empty lowercase strings", () => {
    const { graph } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    expect(graph.edges.length).toBeGreaterThan(0);
    for (const edge of graph.edges) {
      expect(typeof edge.kind).toBe("string");
      expect(edge.kind.length).toBeGreaterThan(0);
      expect(edge.kind).toBe(edge.kind.toLowerCase());
    }
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   EP — Entity projection
   (nutrition carb timing example)
   ───────────────────────────────────────────────────────────────────────────── */

describe("EP — Entity Projection", () => {

  it("(EP1) 'cyclic dextrin' → at least one entity node in graph", () => {
    const { graph } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    const entityNodes = graph.nodes.filter((n) => n.kind === "entity");
    expect(entityNodes.length).toBeGreaterThan(0);
  });

  it("(EP2) entity node label matches canonical entity labelRaw", () => {
    const { graph } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    const entity = graph.nodes.find((n) => n.kind === "entity");
    expect(entity).toBeDefined();
    expect(entity!.label.toLowerCase()).toContain("cyclic dextrin");
  });

  it("(EP3) entity node data has canonicalEntityId field", () => {
    const { graph } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    const entity = graph.nodes.find((n) => n.kind === "entity");
    expect(entity!.data).toHaveProperty("canonicalEntityId");
    expect(typeof entity!.data["canonicalEntityId"]).toBe("string");
  });

  it("(EP4) entity node data.category is non-null", () => {
    const { graph } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    const entity = graph.nodes.find((n) => n.kind === "entity");
    expect(entity!.data["category"]).toBeDefined();
    expect(typeof entity!.data["category"]).toBe("string");
  });

  it("(EP5) entity node data.tags is an array (tags survive projection verbatim)", () => {
    const { graph } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    const entity = graph.nodes.find((n) => n.kind === "entity");
    expect(Array.isArray(entity!.data["tags"])).toBe(true);
  });

  it("(EP6) entity node data.measures is an array with at least one entry", () => {
    const { graph } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    const entity = graph.nodes.find((n) => n.kind === "entity");
    const measures = entity!.data["measures"] as unknown[];
    expect(Array.isArray(measures)).toBe(true);
    expect(measures.length).toBeGreaterThan(0);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   RP — Relation / edge projection
   (training load example, mixed measurable-entity example)
   ───────────────────────────────────────────────────────────────────────────── */

describe("RP — Relation / Edge Projection", () => {

  it("(RP1) '30 minutes before lifting' → edge with kind='before'", () => {
    const { graph } = buildCanonicalGraphFromText(
      "80g cyclic dextrin 30 minutes before lifting",
    );
    const before = graph.edges.find((e) => e.kind === "before");
    expect(before).toBeDefined();
  });

  it("(RP2) BEFORE edge data.offset.amount = 30", () => {
    const { graph } = buildCanonicalGraphFromText(
      "80g cyclic dextrin 30 minutes before lifting",
    );
    const before = graph.edges.find((e) => e.kind === "before");
    const offset = before!.data["offset"] as { amount: number } | null;
    expect(offset).not.toBeNull();
    expect(offset!.amount).toBe(30);
  });

  it("(RP3) 'with breakfast' → edge with kind='with'", () => {
    const { graph } = buildCanonicalGraphFromText("30g oats with breakfast");
    const withEdge = graph.edges.find((e) => e.kind === "with");
    expect(withEdge).toBeDefined();
  });

  it("(RP4) 'during sleep' → edge with kind='during'", () => {
    const { graph } = buildCanonicalGraphFromText("3 hours during sleep");
    const during = graph.edges.find((e) => e.kind === "during");
    expect(during).toBeDefined();
  });

  it("(RP5) all edge.data has provenance field (provenance survives projection)", () => {
    const VALID_PROVENANCES = new Set(["explicit","registry","normalized","inferred","fallback"]);
    const { graph } = buildCanonicalGraphFromText(
      "80g cyclic dextrin 30 minutes before lifting",
    );
    for (const edge of graph.edges) {
      expect(VALID_PROVENANCES.has(edge.data["provenance"] as string)).toBe(true);
    }
  });

  it("(RP6) BEFORE edge data.relationType = 'BEFORE' (type not reclassified)", () => {
    const { graph } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    const before = graph.edges.find((e) => e.kind === "before");
    expect(before!.data["relationType"]).toBe("BEFORE");
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   AX — Anchor node projection
   (nutrition carb timing example)
   ───────────────────────────────────────────────────────────────────────────── */

describe("AX — Anchor Node Projection", () => {

  it("(AX1) 'before lifting' → anchor node present with label containing 'lifting'", () => {
    const { graph } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    const anchor = graph.nodes.find((n) => n.kind === "anchor");
    expect(anchor).toBeDefined();
    expect(anchor!.label.toLowerCase()).toContain("lifting");
  });

  it("(AX2) anchor node kind = 'anchor'", () => {
    const { graph } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    const anchor = graph.nodes.find((n) => n.kind === "anchor");
    expect(anchor!.kind).toBe("anchor");
  });

  it("(AX3) BEFORE edge.to = anchor node id", () => {
    const { graph } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    const anchor    = graph.nodes.find((n) => n.kind === "anchor")!;
    const beforeEdge = graph.edges.find((e) => e.kind === "before");
    expect(beforeEdge!.to).toBe(anchor.id);
  });

  it("(AX4) 'after sleep' → anchor node with label containing 'sleep'", () => {
    const { graph } = buildCanonicalGraphFromText("5mg melatonin 2 hours after sleep");
    const anchor = graph.nodes.find((n) => n.kind === "anchor");
    expect(anchor).toBeDefined();
    expect(anchor!.label.toLowerCase()).toContain("sleep");
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   IV — Invariants
   (multi-candidate + mixed measurable-entity examples)
   ───────────────────────────────────────────────────────────────────────────── */

describe("IV — Invariants", () => {

  it("(IV1) I1: one canonical entity → one graph entity/quantity node", () => {
    const { entities, relations, anchorLabels } =
      normalizeWithAnchors("80g cyclic dextrin 30 minutes before lifting");
    const { graph } = buildCanonicalGraph({ entities, relations, anchorLabels });
    const violations = checkI1EntityNodeCount(entities, graph.nodes);
    expect(violations).toHaveLength(0);
  });

  it("(IV2) I3: no silent tag reclassification (node.data.tags count = entity.tags count)", () => {
    const { entities, relations, anchorLabels } =
      normalizeWithAnchors("80g cyclic dextrin and 5g creatine and 500 mL water");
    const { graph } = buildCanonicalGraph({ entities, relations, anchorLabels });
    const violations = checkI3NoTagReclassification(entities, graph.nodes);
    expect(violations).toHaveLength(0);
  });

  it("(IV3) all edge.from values reference valid node IDs", () => {
    const { graph } = buildCanonicalGraphFromText(
      "80g cyclic dextrin 30 minutes before lifting and 30g oats with breakfast",
    );
    const violations = checkEdgeSourcesValid(graph.nodes, graph.edges);
    expect(violations).toHaveLength(0);
  });

  it("(IV4) no edge.data.relationType is changed from canonical source (mixed example)", () => {
    const { graph } = buildCanonicalGraphFromText(
      "80g cyclic dextrin before lifting and 5g creatine with training and 3 hours during sleep",
    );
    const expectedKinds = new Set(["before","with","during","has_measure"]);
    for (const edge of graph.edges) {
      expect(expectedKinds.has(edge.kind)).toBe(true);
      const canonical = (edge.data["relationType"] as string).toLowerCase().replace(/_/g,"_");
      expect(edge.kind).toBe(canonical.toLowerCase());
    }
  });

  it("(IV5) candidate/objective nodes appear when provided (multi-candidate example)", () => {
    const { graph } = buildCanonicalGraphFromText(
      "80g cyclic dextrin before lifting",
      {
        candidates: [{ id: "a", label: "Option A" }, { id: "b", label: "Option B" }],
        objectives: [{ id: "perf", label: "Maximize performance" }],
      },
    );
    const candidates = graph.nodes.filter((n) => n.kind === "candidate");
    const objectives = graph.nodes.filter((n) => n.kind === "objective");
    expect(candidates.length).toBe(2);
    expect(objectives.length).toBe(1);
    expect(objectives[0].label).toBe("Maximize performance");
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   TR — Trace / debug output
   ───────────────────────────────────────────────────────────────────────────── */

describe("TR — Trace / Debug Output", () => {

  it("(TR1) trace.canonicalEntityCount > 0", () => {
    const { trace } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    expect(trace.canonicalEntityCount).toBeGreaterThan(0);
  });

  it("(TR2) trace.graphNodeCount >= trace.canonicalEntityCount", () => {
    const { trace } = buildCanonicalGraphFromText(
      "80g cyclic dextrin 30 minutes before lifting",
    );
    expect(trace.graphNodeCount).toBeGreaterThanOrEqual(trace.canonicalEntityCount);
  });

  it("(TR3) trace.projectionWarnings is an array", () => {
    const { trace } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    expect(Array.isArray(trace.projectionWarnings)).toBe(true);
  });

  it("(TR4) trace.nodeKindCounts.entity >= 1 for named entity input", () => {
    const { trace } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    expect(trace.nodeKindCounts["entity"]).toBeGreaterThanOrEqual(1);
  });

  it("(TR5) trace.edgeKindCounts has key 'has_measure' with count >= 1", () => {
    const { trace } = buildCanonicalGraphFromText("80g cyclic dextrin before lifting");
    expect(trace.edgeKindCounts["has_measure"]).toBeGreaterThanOrEqual(1);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   ST — Stability across runs
   (same input → identical graph structure every call)
   ───────────────────────────────────────────────────────────────────────────── */

describe("ST — Stability Across Runs", () => {

  it("(ST1) same input → same entity node count both runs", () => {
    const INPUT = "80g cyclic dextrin 30 minutes before lifting";
    const { graph: g1 } = buildCanonicalGraphFromText(INPUT);
    const { graph: g2 } = buildCanonicalGraphFromText(INPUT);
    const count = (g: typeof g1) => g.nodes.filter((n) => n.kind === "entity" || n.kind === "quantity").length;
    expect(count(g1)).toBe(count(g2));
  });

  it("(ST2) same input → same total edge count both runs", () => {
    const INPUT = "80g cyclic dextrin 30 minutes before lifting";
    const { graph: g1 } = buildCanonicalGraphFromText(INPUT);
    const { graph: g2 } = buildCanonicalGraphFromText(INPUT);
    expect(g1.edges.length).toBe(g2.edges.length);
  });

  it("(ST3) same input → same sorted entity node labels both runs", () => {
    const INPUT = "80g cyclic dextrin and 30g oats and 5g creatine";
    const labels = (g: ReturnType<typeof buildCanonicalGraphFromText>["graph"]) =>
      g.nodes
        .filter((n) => n.kind === "entity")
        .map((n) => n.label)
        .sort();
    const { graph: g1 } = buildCanonicalGraphFromText(INPUT);
    const { graph: g2 } = buildCanonicalGraphFromText(INPUT);
    expect(labels(g1)).toEqual(labels(g2));
  });

  it("(ST4) same input → same sorted edge kinds both runs", () => {
    const INPUT = "80g cyclic dextrin 30 minutes before lifting and 30g oats with breakfast";
    const kinds = (g: ReturnType<typeof buildCanonicalGraphFromText>["graph"]) =>
      g.edges.map((e) => e.kind).sort();
    const { graph: g1 } = buildCanonicalGraphFromText(INPUT);
    const { graph: g2 } = buildCanonicalGraphFromText(INPUT);
    expect(kinds(g1)).toEqual(kinds(g2));
  });

  it("(ST5) training load example → entity node for 'dumbbell' present and stable", () => {
    const INPUT = "40 lb dumbbell 12 reps bench press";
    const { graph: g1 } = buildCanonicalGraphFromText(INPUT);
    const { graph: g2 } = buildCanonicalGraphFromText(INPUT);
    const hasDumbbell = (g: typeof g1) =>
      g.nodes.some((n) => n.kind === "entity" && n.label.toLowerCase() === "dumbbell");
    expect(hasDumbbell(g1)).toBe(true);
    expect(hasDumbbell(g2)).toBe(true);
  });

});
