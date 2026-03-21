/**
 * graph_backprop_index_test.ts
 *
 * Tests for graph node back-propagation indexing.
 *
 * Coverage:
 *   BI — buildGraphBackpropIndex: structure and field correctness
 *   PR — Proof references: roles assigned per spec priority
 *   CR — Constraint references: derived from proof references
 *   CA — Candidate references: derived from BELONGS_TO_CANDIDATE edges
 *   SL — Summary lines: format and content
 *   GN — getNodeBackpropRecord: lookup
 *   SR — stepReferencesNode: helper
 *   DT — Determinism
 */

import { describe, it, expect } from "vitest";
import {
  buildGraphBackpropIndex,
  getNodeBackpropRecord,
  stepReferencesNode,
} from "../ui/graph/graph_backprop_index.ts";
import { buildConstraintProofTrace }     from "../graph/graph_proof_trace.ts";
import { executeGraphConstraintSet }     from "../graph/graph_constraint_executor.ts";
import type { OperandGraph }             from "../graph/operand_graph_types.ts";
import type { GraphConstraintSpec }      from "../graph/graph_constraint_types.ts";
import type { GraphConstraintProofTrace } from "../graph/graph_proof_types.ts";

/* ─────────────────────────────────────────────────────────────────────────────
   Test graph builder
   ───────────────────────────────────────────────────────────────────────────── */

interface TestEntity {
  id:            string;
  label:         string;
  amount:        number;
  unit:          string;
  tags:          string[];
  windowMinutes?: number;
  anchorLabel?:  string;
}

function makeGraph(entities: TestEntity[]): OperandGraph {
  const nodes: OperandGraph["nodes"] = [];
  const edges: OperandGraph["edges"] = [];
  const anchorIndex = new Map<string, string>();
  let edgeN = 0;
  const nextEdgeId = () => `ge_${edgeN++}`;

  for (const ent of entities) {
    const eId = `e_${ent.id}`;
    const qId = `q_${ent.id}`;
    const uId = `u_${ent.id}`;

    nodes.push({ id: eId, type: "entity",   label: ent.label,         data: { tags: ent.tags } });
    nodes.push({ id: qId, type: "quantity", label: String(ent.amount), data: { amount: ent.amount } });
    nodes.push({ id: uId, type: "unit",     label: ent.unit,           data: { normalizedUnit: ent.unit } });

    edges.push({ id: nextEdgeId(), from: eId, to: qId, type: "HAS_QUANTITY" });
    edges.push({ id: nextEdgeId(), from: eId, to: uId, type: "HAS_UNIT" });

    if (ent.anchorLabel != null && ent.windowMinutes != null) {
      let anchorId = anchorIndex.get(ent.anchorLabel);
      if (!anchorId) {
        anchorId = `a_${ent.anchorLabel}`;
        nodes.push({ id: anchorId, type: "anchor", label: ent.anchorLabel, data: { isKnownAnchor: true } });
        anchorIndex.set(ent.anchorLabel, anchorId);
      }
      const wId = `w_${ent.id}`;
      nodes.push({
        id: wId, type: "window",
        label: `${ent.windowMinutes}min before ${ent.anchorLabel}`,
        data: { offsetAmount: ent.windowMinutes, offsetUnit: "min", relation: "before", anchorLabel: ent.anchorLabel },
      });
      edges.push({ id: nextEdgeId(), from: eId, to: wId,     type: "BEFORE" });
      edges.push({ id: nextEdgeId(), from: wId, to: anchorId, type: "ANCHORS_TO" });
    }
  }
  return { nodes, edges };
}

function addCandidateNode(graph: OperandGraph, candidateLabel: string, entityIds: string[]): void {
  const cId = `c_${candidateLabel}`;
  graph.nodes.push({ id: cId, type: "candidate", label: candidateLabel });
  let n = graph.edges.length;
  for (const eid of entityIds) {
    graph.edges.push({ id: `ge_cand_${n++}`, from: eid, to: cId, type: "BELONGS_TO_CANDIDATE" });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Shared fixtures
   ───────────────────────────────────────────────────────────────────────────── */

const FAST_CARB: GraphConstraintSpec = {
  constraintId: "C1", label: "fast carb ≥ 60g within 90min before lifting",
  selection: { entityTags: ["fast","carb"], anchorLabel: "lifting", relation: "before", windowMinutes: 90 },
  aggregation: { quantityUnit: "g", aggregation: "sum" },
  operator: ">=", threshold: 60,
};
const SLOW_CARB: GraphConstraintSpec = {
  constraintId: "C2", label: "slow carb ≤ 20g within 60min before lifting",
  selection: { entityTags: ["slow","carb"], anchorLabel: "lifting", relation: "before", windowMinutes: 60 },
  aggregation: { quantityUnit: "g", aggregation: "sum" },
  operator: "<=", threshold: 20,
};

function makeMixedGraph() {
  const g = makeGraph([
    { id: "fast1", label: "cyclic dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting" },
    { id: "slow1", label: "oats",           amount: 30, unit: "g",
      tags: ["slow","carb"], windowMinutes: 30, anchorLabel: "lifting" },
  ]);
  addCandidateNode(g, "A", ["e_fast1", "e_slow1"]);
  return g;
}

function buildTraces(g: OperandGraph): GraphConstraintProofTrace[] {
  return [
    buildConstraintProofTrace(g, FAST_CARB),
    buildConstraintProofTrace(g, SLOW_CARB),
  ];
}

/* ─────────────────────────────────────────────────────────────────────────────
   BI — buildGraphBackpropIndex structure
   ───────────────────────────────────────────────────────────────────────────── */

describe("buildGraphBackpropIndex — structure", () => {

  it("(BI1) returns a Map with one entry per graph node", () => {
    const g       = makeMixedGraph();
    const traces  = buildTraces(g);
    const results = executeGraphConstraintSet(g, [FAST_CARB, SLOW_CARB]);
    const index   = buildGraphBackpropIndex(g, traces, results);
    expect(index.size).toBe(g.nodes.length);
  });

  it("(BI2) every graph node has a record", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, buildTraces(g), []);
    for (const node of g.nodes) {
      expect(index.has(node.id)).toBe(true);
    }
  });

  it("(BI3) records have required fields", () => {
    const g      = makeMixedGraph();
    const index  = buildGraphBackpropIndex(g, buildTraces(g), []);
    const record = index.get("e_fast1")!;
    expect(record.nodeId).toBe("e_fast1");
    expect(Array.isArray(record.proofReferences)).toBe(true);
    expect(Array.isArray(record.constraintReferences)).toBe(true);
    expect(Array.isArray(record.candidateReferences)).toBe(true);
    expect(Array.isArray(record.summaryLines)).toBe(true);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   PR — Proof references
   ───────────────────────────────────────────────────────────────────────────── */

describe("Proof references", () => {

  it("(PR1) surviving fast entity has 'selected' role in at least one step", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, buildTraces(g), []);
    const rec   = index.get("e_fast1")!;
    expect(rec.proofReferences.some((r) => r.roleInStep === "selected")).toBe(true);
  });

  it("(PR2) fast entity excluded from C2 (slow-carb constraint)", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, buildTraces(g), []);
    const rec   = index.get("e_fast1")!;
    const c2Refs = rec.proofReferences.filter((r) => r.constraintId === "C2");
    expect(c2Refs.some((r) => r.roleInStep === "excluded")).toBe(true);
  });

  it("(PR3) oats excluded from C1 (fast-carb constraint)", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, buildTraces(g), []);
    const rec   = index.get("e_slow1")!;
    const c1Refs = rec.proofReferences.filter((r) => r.constraintId === "C1");
    expect(c1Refs.some((r) => r.roleInStep === "excluded")).toBe(true);
  });

  it("(PR4) anchor node is referenced as 'anchor' role", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, buildTraces(g), []);
    const rec   = index.get("a_lifting")!;
    expect(rec.proofReferences.some((r) => r.roleInStep === "anchor")).toBe(true);
  });

  it("(PR5) window node is referenced as 'window' role", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, buildTraces(g), []);
    const rec   = index.get("w_fast1")!;
    expect(rec.proofReferences.some((r) => r.roleInStep === "window")).toBe(true);
  });

  it("(PR6) aggregate source entity has 'aggregate_source' role", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, buildTraces(g), []);
    const rec   = index.get("e_fast1")!;
    expect(rec.proofReferences.some((r) => r.roleInStep === "aggregate_source")).toBe(true);
  });

  it("(PR7) proofStepId follows format constraintId-step-N", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, buildTraces(g), []);
    const rec   = index.get("e_fast1")!;
    expect(rec.proofReferences.every((r) => /^C\d+-step-\d+$/.test(r.proofStepId))).toBe(true);
  });

  it("(PR8) excluded beats selected for same step (priority)", () => {
    // Construct a step where a node appears in both selected and excluded
    // (pathological — shouldn't happen in real traces — just testing priority)
    const g = makeMixedGraph();
    const customTrace: GraphConstraintProofTrace = {
      constraintId: "CX", label: "test", candidateId: null,
      steps: [{
        stepNumber: 1, label: "Test Step",
        description: "test",
        selectedNodeIds: ["e_fast1"],
        excludedNodeIds: ["e_fast1"], // same node in both
      }],
      finalObservedValue: 0, operator: ">=", threshold: 0, passed: true,
    };
    const index = buildGraphBackpropIndex(g, [customTrace], []);
    const rec   = index.get("e_fast1")!;
    const ref   = rec.proofReferences.find((r) => r.constraintId === "CX");
    expect(ref).toBeDefined();
    expect(ref!.roleInStep).toBe("excluded"); // excluded > selected
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   CR — Constraint references
   ───────────────────────────────────────────────────────────────────────────── */

describe("Constraint references", () => {

  it("(CR1) fast entity touched by C1", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, buildTraces(g), []);
    const rec   = index.get("e_fast1")!;
    expect(rec.constraintReferences.some((c) => c.constraintId === "C1")).toBe(true);
  });

  it("(CR2) anchor node touched by both constraints", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, buildTraces(g), []);
    const rec   = index.get("a_lifting")!;
    const ids   = rec.constraintReferences.map((c) => c.constraintId);
    expect(ids).toContain("C1");
    expect(ids).toContain("C2");
  });

  it("(CR3) constraint label is populated from proof trace", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, buildTraces(g), []);
    const rec   = index.get("e_fast1")!;
    const c1ref = rec.constraintReferences.find((c) => c.constraintId === "C1");
    expect(c1ref?.constraintLabel).toBeTruthy();
  });

  it("(CR4) node not in any step has no constraint references", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, [], []);
    const rec   = index.get("e_fast1")!;
    expect(rec.constraintReferences).toHaveLength(0);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   CA — Candidate references
   ───────────────────────────────────────────────────────────────────────────── */

describe("Candidate references", () => {

  it("(CA1) entity connected via BELONGS_TO_CANDIDATE has candidate reference", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, [], []);
    const rec   = index.get("e_fast1")!;
    expect(rec.candidateReferences.length).toBeGreaterThanOrEqual(1);
    expect(rec.candidateReferences[0].candidateLabel).toBe("A");
  });

  it("(CA2) entity without BELONGS_TO_CANDIDATE edge has empty candidate references", () => {
    const g = makeGraph([
      { id: "x", label: "protein", amount: 30, unit: "g", tags: ["protein"] },
    ]);
    const index = buildGraphBackpropIndex(g, [], []);
    const rec   = index.get("e_x")!;
    expect(rec.candidateReferences).toHaveLength(0);
  });

  it("(CA3) multiple candidates per entity are captured", () => {
    const g = makeGraph([
      { id: "x", label: "oats", amount: 30, unit: "g", tags: [] },
    ]);
    // Add two candidate nodes both pointing to e_x
    const cA: OperandGraph["nodes"][0] = { id: "c_A", type: "candidate", label: "A" };
    const cB: OperandGraph["nodes"][0] = { id: "c_B", type: "candidate", label: "B" };
    g.nodes.push(cA, cB);
    g.edges.push(
      { id: "ge_ca", from: "e_x", to: "c_A", type: "BELONGS_TO_CANDIDATE" },
      { id: "ge_cb", from: "e_x", to: "c_B", type: "BELONGS_TO_CANDIDATE" },
    );
    const index = buildGraphBackpropIndex(g, [], []);
    const rec   = index.get("e_x")!;
    const labels = rec.candidateReferences.map((c) => c.candidateLabel);
    expect(labels).toContain("A");
    expect(labels).toContain("B");
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   SL — Summary lines
   ───────────────────────────────────────────────────────────────────────────── */

describe("Summary lines", () => {

  it("(SL1) unreferenced node gets 'not referenced' summary", () => {
    const g     = makeGraph([{ id: "x", label: "oats", amount: 30, unit: "g", tags: [] }]);
    const index = buildGraphBackpropIndex(g, [], []);
    const rec   = index.get("e_x")!;
    expect(rec.summaryLines.some((l) => /not referenced/i.test(l))).toBe(true);
  });

  it("(SL2) selected entity has 'selected in N steps' in summary", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, buildTraces(g), []);
    const rec   = index.get("e_fast1")!;
    expect(rec.summaryLines.some((l) => /selected/i.test(l))).toBe(true);
  });

  it("(SL3) excluded entity has 'excluded' in summary", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, buildTraces(g), []);
    const rec   = index.get("e_slow1")!; // slow1 excluded from C1
    expect(rec.summaryLines.some((l) => /excluded/i.test(l))).toBe(true);
  });

  it("(SL4) entity with candidate reference has 'belongs to candidate' summary", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, [], []);
    const rec   = index.get("e_fast1")!;
    expect(rec.summaryLines.some((l) => /belongs to candidate/i.test(l))).toBe(true);
  });

  it("(SL5) entity with constraint reference has 'participated in constraint' summary", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, buildTraces(g), []);
    const rec   = index.get("e_fast1")!;
    expect(rec.summaryLines.some((l) => /participated in constraint/i.test(l))).toBe(true);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   GN — getNodeBackpropRecord
   ───────────────────────────────────────────────────────────────────────────── */

describe("getNodeBackpropRecord", () => {

  it("(GN1) returns record for known node", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, [], []);
    expect(getNodeBackpropRecord("e_fast1", index)).not.toBeNull();
  });

  it("(GN2) returns null for unknown node", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, [], []);
    expect(getNodeBackpropRecord("not_a_real_id", index)).toBeNull();
  });

  it("(GN3) returned record has correct nodeId", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, [], []);
    expect(getNodeBackpropRecord("e_slow1", index)!.nodeId).toBe("e_slow1");
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   SR — stepReferencesNode
   ───────────────────────────────────────────────────────────────────────────── */

describe("stepReferencesNode", () => {

  it("(SR1) true when nodeId is in selectedNodeIds", () => {
    expect(stepReferencesNode({ selectedNodeIds: ["e_a"] }, "e_a")).toBe(true);
  });

  it("(SR2) true when nodeId is in excludedNodeIds", () => {
    expect(stepReferencesNode({ excludedNodeIds: ["e_b"] }, "e_b")).toBe(true);
  });

  it("(SR3) true when nodeId is in anchorNodeIds", () => {
    expect(stepReferencesNode({ anchorNodeIds: ["a_lift"] }, "a_lift")).toBe(true);
  });

  it("(SR4) true when nodeId is in windowNodeIds", () => {
    expect(stepReferencesNode({ windowNodeIds: ["w_0"] }, "w_0")).toBe(true);
  });

  it("(SR5) true when nodeId is in aggregateSourceNodeIds", () => {
    expect(stepReferencesNode({ aggregateSourceNodeIds: ["e_c"] }, "e_c")).toBe(true);
  });

  it("(SR6) false when nodeId is absent from all arrays", () => {
    expect(stepReferencesNode({ selectedNodeIds: ["e_a"] }, "e_z")).toBe(false);
  });

  it("(SR7) false when all arrays are empty/undefined", () => {
    expect(stepReferencesNode({}, "e_a")).toBe(false);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   DT — Determinism
   ───────────────────────────────────────────────────────────────────────────── */

describe("Determinism", () => {

  it("(DT1) same inputs produce identical index (deep equal)", () => {
    const g      = makeMixedGraph();
    const traces = buildTraces(g);
    const idx1   = buildGraphBackpropIndex(g, traces, []);
    const idx2   = buildGraphBackpropIndex(g, traces, []);
    // Compare records for a key node
    const r1 = idx1.get("e_fast1")!;
    const r2 = idx2.get("e_fast1")!;
    expect(r1.proofReferences.length).toBe(r2.proofReferences.length);
    expect(r1.constraintReferences.length).toBe(r2.constraintReferences.length);
    expect(r1.summaryLines).toEqual(r2.summaryLines);
  });

  it("(DT2) no proof references added when traces array is empty", () => {
    const g     = makeMixedGraph();
    const index = buildGraphBackpropIndex(g, [], []);
    const rec   = index.get("e_fast1")!;
    expect(rec.proofReferences).toHaveLength(0);
    expect(rec.constraintReferences).toHaveLength(0);
  });

});
