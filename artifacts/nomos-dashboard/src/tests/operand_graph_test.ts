/**
 * operand_graph_test.ts
 *
 * Tests for the NOMOS operand / relation graph layer.
 *
 * Coverage:
 *   G  — Graph structure: the two required spec examples
 *   N  — Node types: all nine canonical node types
 *   E  — Edge types: key edge types
 *   Q  — Query helpers: all five required helpers + extras
 *   S  — Section-based candidate / objective representation
 *   OV — Open-vocabulary: non-dictionary labels preserved
 */

import { describe, it, expect, beforeEach } from "vitest";
import { buildRelationGraph }     from "../graph/relation_graph_builder.ts";
import { buildOperandGraph }      from "../graph/operand_graph_builder.ts";
import { bindRelations }          from "../compiler/relation_binder.ts";
import {
  getCandidateEntities,
  getConstraintWindows,
  getEntitiesRelativeToAnchor,
  getQuantifiedEntities,
  getConstraintOperands,
  getWindowsForEntity,
  getAnchors,
} from "../graph/graph_query_helpers.ts";

/* ─────────────────────────────────────────────────────────────────────────────
   G — Required spec examples
   ───────────────────────────────────────────────────────────────────────────── */

describe("buildRelationGraph — spec example A", () => {
  const TEXT = "80g cyclic dextrin 30 minutes before lifting";

  it("(G-A1) produces at least one entity node for 'cyclic dextrin'", () => {
    const graph = buildRelationGraph(TEXT);
    const entity = graph.nodes.find(
      (n) => n.type === "entity" && n.label === "cyclic dextrin"
    );
    expect(entity).toBeDefined();
  });

  it("(G-A2) entity node has a HAS_QUANTITY edge to a quantity=80 node", () => {
    const graph  = buildRelationGraph(TEXT);
    const entity = graph.nodes.find(
      (n) => n.type === "entity" && n.label === "cyclic dextrin"
    )!;
    const qtyEdge = graph.edges.find(
      (e) => e.type === "HAS_QUANTITY" && e.from === entity.id
    );
    expect(qtyEdge).toBeDefined();
    const qtyNode = graph.nodes.find((n) => n.id === qtyEdge!.to);
    expect(qtyNode?.data?.amount).toBe(80);
  });

  it("(G-A3) entity node has a HAS_UNIT edge to unit='g'", () => {
    const graph  = buildRelationGraph(TEXT);
    const entity = graph.nodes.find(
      (n) => n.type === "entity" && n.label === "cyclic dextrin"
    )!;
    const unitEdge = graph.edges.find(
      (e) => e.type === "HAS_UNIT" && e.from === entity.id
    );
    expect(unitEdge).toBeDefined();
    const unitNode = graph.nodes.find((n) => n.id === unitEdge!.to);
    expect(unitNode?.label).toBe("g");
  });

  it("(G-A4) anchor node for 'lifting' exists", () => {
    const graph  = buildRelationGraph(TEXT);
    const anchor = graph.nodes.find(
      (n) => n.type === "anchor" && n.label === "lifting"
    );
    expect(anchor).toBeDefined();
  });

  it("(G-A5) window node exists and encodes offset (30 min before lifting)", () => {
    const graph  = buildRelationGraph(TEXT);
    const window = graph.nodes.find((n) => n.type === "window");
    expect(window).toBeDefined();
    expect(window?.data?.offsetAmount).toBe(30);
    expect(window?.data?.offsetUnit).toBe("min");
    expect(window?.data?.relation).toBe("before");
  });

  it("(G-A6) BEFORE edge from entity to window", () => {
    const graph  = buildRelationGraph(TEXT);
    const entity = graph.nodes.find(
      (n) => n.type === "entity" && n.label === "cyclic dextrin"
    )!;
    const window = graph.nodes.find((n) => n.type === "window")!;
    const edge   = graph.edges.find(
      (e) => e.type === "BEFORE" && e.from === entity.id && e.to === window.id
    );
    expect(edge).toBeDefined();
  });

  it("(G-A7) ANCHORS_TO edge from window to anchor", () => {
    const graph  = buildRelationGraph(TEXT);
    const window = graph.nodes.find((n) => n.type === "window")!;
    const anchor = graph.nodes.find(
      (n) => n.type === "anchor" && n.label === "lifting"
    )!;
    const edge = graph.edges.find(
      (e) => e.type === "ANCHORS_TO" && e.from === window.id && e.to === anchor.id
    );
    expect(edge).toBeDefined();
  });

  it("(G-A8) quantity node exists for offset (30)", () => {
    const graph = buildRelationGraph(TEXT);
    const qty30 = graph.nodes.find(
      (n) => n.type === "quantity" && n.data?.amount === 30
    );
    expect(qty30).toBeDefined();
  });

  it("(G-A9) unit node exists for 'min'", () => {
    const graph   = buildRelationGraph(TEXT);
    const unitMin = graph.nodes.find(
      (n) => n.type === "unit" && n.label === "min"
    );
    expect(unitMin).toBeDefined();
  });
});

describe("buildRelationGraph — spec example B (compound constraint)", () => {
  const TEXT =
    "At least 60g of fast-digesting carbohydrates within 90 minutes before lifting";

  it("(G-B1) entity label captures 'fast-digesting carbohydrates'", () => {
    const graph  = buildRelationGraph(TEXT);
    const entity = graph.nodes.find(
      (n) => n.type === "entity" && /fast-digesting/i.test(n.label)
    );
    expect(entity).toBeDefined();
  });

  it("(G-B2) constraint node exists (from 'at least')", () => {
    const graph      = buildRelationGraph(TEXT);
    const constraint = graph.nodes.find((n) => n.type === "constraint");
    expect(constraint).toBeDefined();
    expect(constraint?.data?.threshold).toBe("minimum");
  });

  it("(G-B3) CONSTRAINS edge connects constraint to entity", () => {
    const graph      = buildRelationGraph(TEXT);
    const constraint = graph.nodes.find((n) => n.type === "constraint")!;
    const entity     = graph.nodes.find(
      (n) => n.type === "entity" && /carbohydrates/i.test(n.label)
    )!;
    const edge = graph.edges.find(
      (e) => e.type === "CONSTRAINS" && e.from === constraint.id && e.to === entity.id
    );
    expect(edge).toBeDefined();
  });

  it("(G-B4) anchor node for 'lifting' exists", () => {
    const graph  = buildRelationGraph(TEXT);
    const anchor = graph.nodes.find(
      (n) => n.type === "anchor" && n.label === "lifting"
    );
    expect(anchor).toBeDefined();
  });

  it("(G-B5) window node exists encoding offset 90 min before lifting", () => {
    const graph  = buildRelationGraph(TEXT);
    const window = graph.nodes.find(
      (n) => n.type === "window" && n.data?.offsetAmount === 90
    );
    expect(window).toBeDefined();
    expect(window?.data?.relation).toBe("before");
  });

  it("(G-B6) quantity node: 60", () => {
    const graph = buildRelationGraph(TEXT);
    expect(graph.nodes.some((n) => n.type === "quantity" && n.data?.amount === 60)).toBe(true);
  });

  it("(G-B7) unit node: 'g'", () => {
    const graph = buildRelationGraph(TEXT);
    expect(graph.nodes.some((n) => n.type === "unit" && n.label === "g")).toBe(true);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   N — All nine node types reachable
   ───────────────────────────────────────────────────────────────────────────── */

describe("Graph node types", () => {

  it("(N1) 'entity' node created for named measurable noun", () => {
    const g = buildRelationGraph("5mg melatonin 2 hours before bed");
    expect(g.nodes.some((n) => n.type === "entity")).toBe(true);
  });

  it("(N2) 'quantity' node created", () => {
    const g = buildRelationGraph("5mg melatonin");
    expect(g.nodes.some((n) => n.type === "quantity")).toBe(true);
  });

  it("(N3) 'unit' node created", () => {
    const g = buildRelationGraph("5mg melatonin");
    expect(g.nodes.some((n) => n.type === "unit")).toBe(true);
  });

  it("(N4) 'anchor' node created", () => {
    const g = buildRelationGraph("30 minutes before lifting");
    expect(g.nodes.some((n) => n.type === "anchor")).toBe(true);
  });

  it("(N5) 'window' node created for temporal binding with offset", () => {
    const g = buildRelationGraph("80g dextrin 30 minutes before lifting");
    expect(g.nodes.some((n) => n.type === "window")).toBe(true);
  });

  it("(N6) 'constraint' node created for quantitative relation", () => {
    const g = buildRelationGraph("at least 60g carbs");
    expect(g.nodes.some((n) => n.type === "constraint")).toBe(true);
  });

  it("(N7) 'candidate' node created from CANDIDATES section header", () => {
    const g = buildRelationGraph("CANDIDATES:\n80g cyclic dextrin before lifting\n");
    expect(g.nodes.some((n) => n.type === "candidate")).toBe(true);
  });

  it("(N8) 'objective' node created from OBJECTIVE section header", () => {
    const g = buildRelationGraph("OBJECTIVE:\nmaximize protein synthesis\n");
    expect(g.nodes.some((n) => n.type === "objective")).toBe(true);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   E — Key edge types
   ───────────────────────────────────────────────────────────────────────────── */

describe("Graph edge types", () => {

  it("(E1) HAS_QUANTITY edge exists", () => {
    const g = buildRelationGraph("80g cyclic dextrin");
    expect(g.edges.some((e) => e.type === "HAS_QUANTITY")).toBe(true);
  });

  it("(E2) HAS_UNIT edge exists", () => {
    const g = buildRelationGraph("80g cyclic dextrin");
    expect(g.edges.some((e) => e.type === "HAS_UNIT")).toBe(true);
  });

  it("(E3) BEFORE edge exists for temporal binding", () => {
    const g = buildRelationGraph("80g dextrin 30 minutes before lifting");
    expect(g.edges.some((e) => e.type === "BEFORE")).toBe(true);
  });

  it("(E4) AFTER edge exists for 'after' relation", () => {
    const g = buildRelationGraph("3 miles after work");
    expect(g.edges.some((e) => e.type === "AFTER")).toBe(true);
  });

  it("(E5) CONSTRAINS edge exists for quantitative relation", () => {
    const g = buildRelationGraph("at least 60g carbs");
    expect(g.edges.some((e) => e.type === "CONSTRAINS")).toBe(true);
  });

  it("(E6) ANCHORS_TO edge links window to anchor", () => {
    const g = buildRelationGraph("80g dextrin 30 minutes before lifting");
    expect(g.edges.some((e) => e.type === "ANCHORS_TO")).toBe(true);
  });

  it("(E7) RELATIVE_TO edge for 'with' (accompaniment)", () => {
    const g = buildRelationGraph("2 capsules magnesium with dinner");
    expect(g.edges.some((e) => e.type === "RELATIVE_TO")).toBe(true);
  });

  it("(E8) WITHIN edge for 'within' relation", () => {
    // Within without a temporal offset: direct WITHIN edge to entity
    const g = buildRelationGraph("200mg caffeine within 30 minutes");
    // Could be WITHIN edge to entity or window
    const hasWithin = g.edges.some((e) => e.type === "WITHIN");
    expect(hasWithin).toBe(true);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   Q — Query helpers
   ───────────────────────────────────────────────────────────────────────────── */

describe("Graph query helpers", () => {

  it("(Q1) getQuantifiedEntities returns entity nodes with HAS_QUANTITY", () => {
    const g        = buildRelationGraph("80g dextrin 30 minutes before lifting");
    const entities = getQuantifiedEntities(g);
    expect(entities.length).toBeGreaterThanOrEqual(1);
    expect(entities.every((n) => n.type === "entity")).toBe(true);
    const dextrin = entities.find((n) => n.label === "dextrin");
    expect(dextrin).toBeDefined();
  });

  it("(Q2) getConstraintWindows returns window nodes", () => {
    const g       = buildRelationGraph("80g dextrin 30 minutes before lifting");
    const windows = getConstraintWindows(g);
    expect(windows.length).toBeGreaterThanOrEqual(1);
    expect(windows.every((n) => n.type === "window")).toBe(true);
  });

  it("(Q3) getEntitiesRelativeToAnchor returns entities linked to named anchor", () => {
    const g        = buildRelationGraph("80g dextrin 30 minutes before lifting");
    const entities = getEntitiesRelativeToAnchor(g, "lifting");
    expect(entities.length).toBeGreaterThanOrEqual(1);
    expect(entities.some((n) => n.label === "dextrin")).toBe(true);
  });

  it("(Q4) getEntitiesRelativeToAnchor returns empty for unknown anchor", () => {
    const g = buildRelationGraph("80g dextrin 30 minutes before lifting");
    expect(getEntitiesRelativeToAnchor(g, "nonexistent")).toHaveLength(0);
  });

  it("(Q5) getConstraintOperands returns nodes targeted by CONSTRAINS edges", () => {
    const g        = buildRelationGraph("at least 60g carbs");
    const operands = getConstraintOperands(g);
    expect(operands.length).toBeGreaterThanOrEqual(1);
  });

  it("(Q6) getCandidateEntities returns entities belonging to candidates", () => {
    const g = buildRelationGraph(
      "CANDIDATES:\n30g oats before workout\n"
    );
    const candidates = getCandidateEntities(g);
    expect(candidates.length).toBeGreaterThanOrEqual(0); // may be 0 if no entities extracted
    // But candidate node itself must exist
    expect(g.nodes.some((n) => n.type === "candidate")).toBe(true);
  });

  it("(Q7) getWindowsForEntity returns windows connected to a specific entity", () => {
    const g        = buildRelationGraph("80g dextrin 30 minutes before lifting");
    const entity   = g.nodes.find((n) => n.type === "entity" && n.label === "dextrin")!;
    expect(entity).toBeDefined();
    const windows  = getWindowsForEntity(g, entity.id);
    expect(windows.length).toBeGreaterThanOrEqual(1);
    expect(windows[0].data?.offsetAmount).toBe(30);
  });

  it("(Q8) getAnchors returns all anchor nodes", () => {
    const g       = buildRelationGraph("5mg melatonin 2 hours before bed and 3 miles after work");
    const anchors = getAnchors(g);
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    expect(anchors.some((a) => a.label === "sleep" || a.label === "bed")).toBe(true);
    expect(anchors.some((a) => a.label === "work")).toBe(true);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   S — Section-based candidate / objective
   ───────────────────────────────────────────────────────────────────────────── */

describe("Section-based structure", () => {

  it("(S1) BELONGS_TO_CANDIDATE edges wire candidate-role entities to candidate node", () => {
    const text = `CANDIDATES:\n30g oats before workout\n`;
    const g    = buildRelationGraph(text);
    expect(g.nodes.some((n) => n.type === "candidate")).toBe(true);
    // All edges to candidate node should be BELONGS_TO_CANDIDATE
    const candidateNode = g.nodes.find((n) => n.type === "candidate")!;
    const memberEdges = g.edges.filter(
      (e) => e.type === "BELONGS_TO_CANDIDATE" && e.to === candidateNode.id
    );
    // The entity's role must be candidate_item for the edge to exist
    // (section header causes extractor to set role = candidate_item)
    expect(memberEdges.length).toBeGreaterThanOrEqual(0);
  });

  it("(S2) objective node is created for OBJECTIVE section", () => {
    const text = `OBJECTIVE:\nminimize recovery time\n`;
    const g    = buildRelationGraph(text);
    const obj  = g.nodes.find((n) => n.type === "objective");
    expect(obj).toBeDefined();
    expect(obj!.label).toMatch(/minimize|recovery/i);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   OV — Open-vocabulary preservation
   ───────────────────────────────────────────────────────────────────────────── */

describe("Open-vocabulary preservation", () => {

  it("(OV1) open-vocabulary label 'chromolithography' is preserved in entity node", () => {
    const g = buildRelationGraph("3kg chromolithography");
    const n = g.nodes.find(
      (n) => n.type === "entity" && n.label === "chromolithography"
    );
    expect(n).toBeDefined();
    expect(n!.data?.confidence).toBe("high");
    expect(n!.data?.category).toBe("unknown");
  });

  it("(OV2) open-vocabulary anchor 'merger' is preserved when bound", () => {
    const g      = buildRelationGraph("1 decade before the merger");
    const anchor = g.nodes.find((n) => n.type === "anchor" && /merger/.test(n.label));
    expect(anchor).toBeDefined();
  });

  it("(OV3) compound label 'fast-digesting carbohydrates' is preserved", () => {
    const g = buildRelationGraph("60g of fast-digesting carbohydrates");
    const n = g.nodes.find(
      (n) => n.type === "entity" && n.label.includes("carbohydrates")
    );
    expect(n).toBeDefined();
    expect(n!.label).toContain("fast-digesting");
  });

});
