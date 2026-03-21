/**
 * invariants_test.ts
 *
 * Comprehensive tests for all four NOMOS system invariants.
 *
 * Coverage groups:
 *   GF  — GraphFidelity invariant        (15 tests)
 *   ED  — ExecutionDeterminism invariant  (10 tests)
 *   PI  — ProofIntegrity invariant        (12 tests)
 *   MI  — ModeInvariance invariant         (9 tests)
 *   RN  — InvariantRunner + assertInvariants (6 tests)
 */

import { describe, it, expect } from "vitest";
import { checkGraphFidelity }          from "../invariants/graph_fidelity_invariant.ts";
import { checkExecutionDeterminism }   from "../invariants/execution_determinism_invariant.ts";
import { checkProofIntegrity }         from "../invariants/proof_integrity_invariant.ts";
import { checkModeInvariance }         from "../invariants/mode_invariance_invariant.ts";
import { runAllInvariants, assertInvariants } from "../invariants/invariant_runner.ts";
import { buildConstraintProofTrace }   from "../graph/graph_proof_trace.ts";
import { buildOperandGraph }           from "../graph/operand_graph_builder.ts";
import { bindRelations }               from "../compiler/relation_binder.ts";
import type { BindingResult }          from "../compiler/measured_entity_types.ts";
import type { OperandGraph, GraphNode } from "../graph/operand_graph_types.ts";
import type { GraphConstraintSpec }    from "../graph/graph_constraint_types.ts";
import type { GraphConstraintProofTrace } from "../graph/graph_proof_types.ts";

/* ─────────────────────────────────────────────────────────────────────────────
   Test helpers
   ───────────────────────────────────────────────────────────────────────────── */

interface TestEntity {
  id: string; label: string; amount: number; unit: string; tags: string[];
  windowMinutes?: number; anchorLabel?: string;
}

function makeGraph(entities: TestEntity[]): OperandGraph {
  const nodes: OperandGraph["nodes"] = [];
  const edges: OperandGraph["edges"] = [];
  const anchorIndex = new Map<string, string>();
  let edgeN = 0;
  const nextEdgeId = () => `ge_${edgeN++}`;

  for (const ent of entities) {
    const eId = `e_${ent.id}`, qId = `q_${ent.id}`, uId = `u_${ent.id}`;
    nodes.push({ id: eId, type: "entity",   label: ent.label, data: { entityId: ent.id, tags: ent.tags } });
    nodes.push({ id: qId, type: "quantity", label: String(ent.amount), data: { amount: ent.amount } });
    nodes.push({ id: uId, type: "unit",     label: ent.unit,  data: { normalizedUnit: ent.unit } });
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
      nodes.push({ id: wId, type: "window", label: `${ent.windowMinutes}min before ${ent.anchorLabel}`,
        data: { offsetAmount: ent.windowMinutes, offsetUnit: "min", relation: "before", anchorLabel: ent.anchorLabel } });
      edges.push({ id: nextEdgeId(), from: eId, to: wId,     type: "BEFORE" });
      edges.push({ id: nextEdgeId(), from: wId, to: anchorId, type: "ANCHORS_TO" });
    }
  }
  return { nodes, edges };
}

function makeFakeBinding(entities: TestEntity[]): BindingResult {
  return {
    entities: entities.map((ent) => ({
      id: ent.id, rawText: "", normalizedText: "", amount: ent.amount, unit: ent.unit,
      normalizedUnit: ent.unit, unitCategory: null, label: ent.label,
      normalizedLabel: ent.label.toLowerCase(), category: "unknown", role: "unknown",
      confidence: 1.0, tags: ent.tags, tagProvenance: {},
    })),
    anchors:  [],
    bindings: [],
    warnings: [],
  };
}

const SPEC: GraphConstraintSpec = {
  constraintId: "C1", label: "fast carb ≥ 60g",
  selection:    { entityTags: ["fast","carb"] },
  aggregation:  { quantityUnit: "g", aggregation: "sum" },
  operator:     ">=", threshold: 60,
};

const ENTITIES_PASS: TestEntity[] = [
  { id: "f1", label: "cyclic dextrin", amount: 80, unit: "g", tags: ["fast","carb"] },
  { id: "s1", label: "oats",           amount: 30, unit: "g", tags: ["slow","carb"] },
];

/* ─────────────────────────────────────────────────────────────────────────────
   GF — GraphFidelity
   ───────────────────────────────────────────────────────────────────────────── */

describe("GraphFidelity invariant", () => {

  it("(GF1) passes for a well-formed binding + graph pair", () => {
    const g  = makeGraph(ENTITIES_PASS);
    const b  = makeFakeBinding(ENTITIES_PASS);
    const r  = checkGraphFidelity(b, g);
    expect(r.passed).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it("(GF2) fails when entity span is missing from graph", () => {
    const g  = makeGraph([]); // empty graph
    const b  = makeFakeBinding(ENTITIES_PASS);
    const r  = checkGraphFidelity(b, g);
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.rule === "ENTITY_NOT_IN_GRAPH")).toBe(true);
  });

  it("(GF3) fails when entity is duplicated in graph", () => {
    const g   = makeGraph(ENTITIES_PASS);
    const b   = makeFakeBinding(ENTITIES_PASS);
    // Manually add a duplicate entity node with the same entityId
    const dup: GraphNode = { id: "e_f1_dup", type: "entity", label: "cyclic dextrin", data: { entityId: "f1" } };
    g.nodes.push(dup);
    const r   = checkGraphFidelity(b, g);
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.rule === "ENTITY_DUPLICATED_IN_GRAPH" || v.rule === "ENTITY_COUNT_MISMATCH" || v.rule === "DUPLICATE_ENTITY_ID")).toBe(true);
  });

  it("(GF4) fails when graph has orphan entity node not in binding", () => {
    const g   = makeGraph(ENTITIES_PASS);
    const b   = makeFakeBinding([]); // binding has no entities
    const r   = checkGraphFidelity(b, g);
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.rule === "ORPHAN_ENTITY_NODE" || v.rule === "ENTITY_COUNT_MISMATCH")).toBe(true);
  });

  it("(GF5) fails when entity count in graph != span count", () => {
    const g = makeGraph([ENTITIES_PASS[0]]); // one entity in graph
    const b = makeFakeBinding(ENTITIES_PASS);  // two entities in binding
    const r = checkGraphFidelity(b, g);
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.rule === "ENTITY_COUNT_MISMATCH" || v.rule === "ENTITY_NOT_IN_GRAPH")).toBe(true);
  });

  it("(GF6) fails when entity node has no data.entityId", () => {
    const g  = makeGraph(ENTITIES_PASS);
    const b  = makeFakeBinding(ENTITIES_PASS);
    // Remove entityId from one node
    const entityNode = g.nodes.find((n) => n.type === "entity")!;
    delete (entityNode.data as Record<string, unknown>)["entityId"];
    const r  = checkGraphFidelity(b, g);
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.rule === "ENTITY_NODE_MISSING_ID")).toBe(true);
  });

  it("(GF7) passes with single entity", () => {
    const ent = [ENTITIES_PASS[0]];
    const r   = checkGraphFidelity(makeFakeBinding(ent), makeGraph(ent));
    expect(r.passed).toBe(true);
  });

  it("(GF8) invariant name is 'GraphFidelity'", () => {
    const r = checkGraphFidelity(makeFakeBinding([]), makeGraph([]));
    expect(r.invariant).toBe("GraphFidelity");
  });

  it("(GF9) description is present", () => {
    const r = checkGraphFidelity(makeFakeBinding([]), makeGraph([]));
    expect(r.description.length).toBeGreaterThan(10);
  });

  it("(GF10) empty binding + empty graph → passes", () => {
    const r = checkGraphFidelity(makeFakeBinding([]), makeGraph([]));
    expect(r.passed).toBe(true);
  });

  it("(GF11) bare-measurement spans (label='') are not required as entity nodes", () => {
    // Spans with label === "" should not trigger ENTITY_NOT_IN_GRAPH
    const b: BindingResult = {
      entities: [{
        id: "bare1", rawText: "30min", normalizedText: "30min",
        amount: 30, unit: "min", normalizedUnit: "min", unitCategory: "time",
        label: "", normalizedLabel: "", category: "duration", role: "unknown",
        confidence: 1.0, tags: [],
      }],
      anchors: [], bindings: [], warnings: [],
    };
    const g: OperandGraph = { nodes: [], edges: [] }; // no entity nodes — correct for bare span
    const r = checkGraphFidelity(b, g);
    expect(r.passed).toBe(true);
  });

  it("(GF12) violation has correct detail fields", () => {
    const g = makeGraph([]);
    const b = makeFakeBinding([ENTITIES_PASS[0]]);
    const r = checkGraphFidelity(b, g);
    const v = r.violations.find((v) => v.rule === "ENTITY_NOT_IN_GRAPH");
    expect(v).toBeDefined();
    expect(v!.detail?.spanId).toBe("f1");
  });

  it("(GF13) GF-05 dual-entityId violation includes both node IDs in detail", () => {
    const ent = [ENTITIES_PASS[0]];
    const g   = makeGraph(ent);
    const b   = makeFakeBinding(ent);
    const dup: GraphNode = { id: "e_f1_2nd", type: "entity", label: "cyclic dextrin", data: { entityId: "f1" } };
    g.nodes.push(dup);
    const r   = checkGraphFidelity(b, g);
    const v   = r.violations.find((v) => v.rule === "DUPLICATE_ENTITY_ID" || v.rule === "ENTITY_DUPLICATED_IN_GRAPH");
    expect(v).toBeDefined();
  });

  it("(GF14) multiple entities all pass when graph is correct", () => {
    const ents = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`, label: `entity ${i}`, amount: i * 10, unit: "g", tags: [],
    }));
    const r = checkGraphFidelity(makeFakeBinding(ents), makeGraph(ents));
    expect(r.passed).toBe(true);
  });

  it("(GF15) violations array is empty on pass", () => {
    const g = makeGraph(ENTITIES_PASS);
    const b = makeFakeBinding(ENTITIES_PASS);
    expect(checkGraphFidelity(b, g).violations).toHaveLength(0);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   ED — ExecutionDeterminism
   ───────────────────────────────────────────────────────────────────────────── */

describe("ExecutionDeterminism invariant", () => {

  it("(ED1) passes for a well-formed graph + spec", () => {
    const g = makeGraph(ENTITIES_PASS);
    const r = checkExecutionDeterminism(g, [SPEC]);
    expect(r.passed).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it("(ED2) invariant name is 'ExecutionDeterminism'", () => {
    expect(checkExecutionDeterminism(makeGraph([]), []).invariant).toBe("ExecutionDeterminism");
  });

  it("(ED3) passes with empty specs (nothing to check)", () => {
    const r = checkExecutionDeterminism(makeGraph(ENTITIES_PASS), []);
    expect(r.passed).toBe(true);
  });

  it("(ED4) passes for multiple specs simultaneously", () => {
    const SPEC2: GraphConstraintSpec = {
      constraintId: "C2", label: "slow carb ≤ 20g",
      selection:    { entityTags: ["slow","carb"] },
      aggregation:  { quantityUnit: "g", aggregation: "sum" },
      operator:     "<=", threshold: 20,
    };
    const g = makeGraph(ENTITIES_PASS);
    const r = checkExecutionDeterminism(g, [SPEC, SPEC2]);
    expect(r.passed).toBe(true);
  });

  it("(ED5) passes for a constraint that fails (fail is also deterministic)", () => {
    // 80g >= 100 → fails deterministically
    const spec: GraphConstraintSpec = { ...SPEC, threshold: 100 };
    const g    = makeGraph(ENTITIES_PASS);
    const r    = checkExecutionDeterminism(g, [spec]);
    expect(r.passed).toBe(true); // determinism check passes even though spec fails
  });

  it("(ED6) passes with window-restricted spec", () => {
    const entities: TestEntity[] = [
      { id: "f1", label: "cyclic dextrin", amount: 80, unit: "g", tags: ["fast","carb"],
        windowMinutes: 30, anchorLabel: "lifting" },
    ];
    const spec: GraphConstraintSpec = {
      constraintId: "C3", label: "windowed spec",
      selection:    { entityTags: ["fast","carb"], anchorLabel: "lifting", relation: "before", windowMinutes: 60 },
      aggregation:  { quantityUnit: "g", aggregation: "sum" },
      operator:     ">=", threshold: 60,
    };
    const g = makeGraph(entities);
    const r = checkExecutionDeterminism(g, [spec]);
    expect(r.passed).toBe(true);
  });

  it("(ED7) description is present", () => {
    expect(checkExecutionDeterminism(makeGraph([]), []).description.length).toBeGreaterThan(10);
  });

  it("(ED8) violations array is empty on pass", () => {
    const r = checkExecutionDeterminism(makeGraph(ENTITIES_PASS), [SPEC]);
    expect(r.violations).toHaveLength(0);
  });

  it("(ED9) passes for max-aggregation spec", () => {
    const spec: GraphConstraintSpec = {
      ...SPEC, aggregation: { quantityUnit: "g", aggregation: "max" },
    };
    expect(checkExecutionDeterminism(makeGraph(ENTITIES_PASS), [spec]).passed).toBe(true);
  });

  it("(ED10) passes for count-aggregation spec", () => {
    const spec: GraphConstraintSpec = {
      ...SPEC, aggregation: { quantityUnit: "g", aggregation: "count" }, operator: ">=", threshold: 1,
    };
    expect(checkExecutionDeterminism(makeGraph(ENTITIES_PASS), [spec]).passed).toBe(true);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   PI — ProofIntegrity
   ───────────────────────────────────────────────────────────────────────────── */

describe("ProofIntegrity invariant", () => {

  function makeTrace(g: OperandGraph): GraphConstraintProofTrace {
    return buildConstraintProofTrace(g, SPEC);
  }

  it("(PI1) passes for a well-formed trace + graph", () => {
    const g  = makeGraph(ENTITIES_PASS);
    const t  = makeTrace(g);
    const r  = checkProofIntegrity([t], g);
    expect(r.passed).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it("(PI2) fails when selectedNodeIds contains a ghost node", () => {
    const g  = makeGraph(ENTITIES_PASS);
    const t  = makeTrace(g);
    // Inject a ghost node ID into step 1's selectedNodeIds
    t.steps[0].selectedNodeIds = [...(t.steps[0].selectedNodeIds ?? []), "GHOST_ID"];
    const r  = checkProofIntegrity([t], g);
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.rule === "GHOST_SELECTED_NODE")).toBe(true);
  });

  it("(PI3) fails when excludedNodeIds contains a ghost node", () => {
    const g  = makeGraph(ENTITIES_PASS);
    const t  = makeTrace(g);
    t.steps[0].excludedNodeIds = ["GHOST_EXCLUDED"];
    const r  = checkProofIntegrity([t], g);
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.rule === "GHOST_EXCLUDED_NODE")).toBe(true);
  });

  it("(PI4) fails when anchorNodeIds contains a ghost node", () => {
    const g  = makeGraph(ENTITIES_PASS);
    const t  = makeTrace(g);
    t.steps[0].anchorNodeIds = ["GHOST_ANCHOR"];
    const r  = checkProofIntegrity([t], g);
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.rule === "GHOST_ANCHOR_NODE")).toBe(true);
  });

  it("(PI5) fails when windowNodeIds contains a ghost node", () => {
    const g  = makeGraph(ENTITIES_PASS);
    const t  = makeTrace(g);
    t.steps[0].windowNodeIds = ["GHOST_WINDOW"];
    const r  = checkProofIntegrity([t], g);
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.rule === "GHOST_WINDOW_NODE")).toBe(true);
  });

  it("(PI6) fails when aggregateSourceNodeIds contains a ghost node", () => {
    const g  = makeGraph(ENTITIES_PASS);
    const t  = makeTrace(g);
    t.steps[0].aggregateSourceNodeIds = ["GHOST_AGGR"];
    const r  = checkProofIntegrity([t], g);
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.rule === "GHOST_AGGREGATE_SOURCE_NODE")).toBe(true);
  });

  it("(PI7) fails when a node is in both selected and excluded in same step (PI-06)", () => {
    const g  = makeGraph(ENTITIES_PASS);
    const t  = makeTrace(g);
    // Make selected and excluded share a node (pathological)
    const nodeId = g.nodes.find((n) => n.type === "entity")!.id;
    t.steps[0].selectedNodeIds = [nodeId];
    t.steps[0].excludedNodeIds = [nodeId];
    const r  = checkProofIntegrity([t], g);
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.rule === "NODE_IN_BOTH_SELECTED_AND_EXCLUDED")).toBe(true);
  });

  it("(PI8) passes with multiple traces", () => {
    const g = makeGraph(ENTITIES_PASS);
    const SPEC2: GraphConstraintSpec = {
      constraintId: "C2", label: "slow carb ≤ 20g",
      selection: { entityTags: ["slow","carb"] },
      aggregation: { quantityUnit: "g", aggregation: "sum" },
      operator: "<=", threshold: 20,
    };
    const traces = [buildConstraintProofTrace(g, SPEC), buildConstraintProofTrace(g, SPEC2)];
    const r = checkProofIntegrity(traces, g);
    expect(r.passed).toBe(true);
  });

  it("(PI9) passes with empty traces array", () => {
    const r = checkProofIntegrity([], makeGraph(ENTITIES_PASS));
    expect(r.passed).toBe(true);
  });

  it("(PI10) invariant name is 'ProofIntegrity'", () => {
    expect(checkProofIntegrity([], makeGraph([])).invariant).toBe("ProofIntegrity");
  });

  it("(PI11) violation detail includes ghost node ID", () => {
    const g  = makeGraph(ENTITIES_PASS);
    const t  = makeTrace(g);
    t.steps[0].selectedNodeIds = ["GHOST_999"];
    const r  = checkProofIntegrity([t], g);
    const v  = r.violations.find((v) => v.rule === "GHOST_SELECTED_NODE");
    expect(v?.detail?.ghostNodeId).toBe("GHOST_999");
  });

  it("(PI12) a real BindingResult → buildOperandGraph trace passes integrity", () => {
    // Use the real pipeline: bind → build → trace
    const rawText = "80g cyclic dextrin 30 minutes before lifting";
    const binding = bindRelations(rawText);
    const graph   = buildOperandGraph(binding);
    const traces  = [SPEC].map((s) => buildConstraintProofTrace(graph, s));
    const r       = checkProofIntegrity(traces, graph);
    // All IDs in the trace must come from the graph
    expect(r.passed).toBe(true);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   MI — ModeInvariance
   ───────────────────────────────────────────────────────────────────────────── */

describe("ModeInvariance invariant", () => {

  const FUELING_TEXT = "80g cyclic dextrin and 30g oats 30 minutes before lifting";

  it("(MI1) passes for a realistic nutrition text", () => {
    const r = checkModeInvariance(FUELING_TEXT, []);
    expect(r.passed).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it("(MI2) passes for empty string (degenerate case)", () => {
    const r = checkModeInvariance("", []);
    expect(r.passed).toBe(true);
  });

  it("(MI3) passes with constraint specs included", () => {
    const spec: GraphConstraintSpec = {
      constraintId: "CX", label: "test",
      selection: { entityTags: [] },
      aggregation: { quantityUnit: "g", aggregation: "sum" },
      operator: ">=", threshold: 0,
    };
    const r = checkModeInvariance(FUELING_TEXT, [spec]);
    expect(r.passed).toBe(true);
  });

  it("(MI4) entity count is stable across N runs", () => {
    // If the check passes, entity count must have been stable
    const r = checkModeInvariance(FUELING_TEXT, []);
    expect(r.violations.some((v) => v.rule === "BINDING_ENTITY_COUNT_UNSTABLE")).toBe(false);
  });

  it("(MI5) node count is stable across N runs", () => {
    const r = checkModeInvariance(FUELING_TEXT, []);
    expect(r.violations.some((v) => v.rule === "GRAPH_NODE_COUNT_UNSTABLE")).toBe(false);
  });

  it("(MI6) evaluation pass/fail is stable across N runs", () => {
    const spec: GraphConstraintSpec = {
      constraintId: "CX", label: "test",
      selection: { entityTags: [] },
      aggregation: { quantityUnit: "g", aggregation: "sum" },
      operator: ">=", threshold: 0,
    };
    const r = checkModeInvariance(FUELING_TEXT, [spec]);
    expect(r.violations.some((v) => v.rule === "EVAL_PASS_FAIL_UNSTABLE")).toBe(false);
  });

  it("(MI7) invariant name is 'ModeInvariance'", () => {
    expect(checkModeInvariance("", []).invariant).toBe("ModeInvariance");
  });

  it("(MI8) description is present", () => {
    expect(checkModeInvariance("", []).description.length).toBeGreaterThan(10);
  });

  it("(MI9) passes for complex multi-entity text", () => {
    const text = "consume 60g fast-digesting carbs and 20g slow carbs within 90 minutes before training";
    const r    = checkModeInvariance(text, []);
    expect(r.passed).toBe(true);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   RN — InvariantRunner + assertInvariants
   ───────────────────────────────────────────────────────────────────────────── */

describe("InvariantRunner + assertInvariants", () => {

  it("(RN1) allPassed=true for a healthy system", () => {
    const g  = makeGraph(ENTITIES_PASS);
    const b  = makeFakeBinding(ENTITIES_PASS);
    const t  = [buildConstraintProofTrace(g, SPEC)];
    const report = runAllInvariants({ binding: b, graph: g, specs: [SPEC], traces: t, rawText: "" });
    expect(report.allPassed).toBe(true);
    expect(report.totalViolations).toBe(0);
  });

  it("(RN2) totalViolations counts across all invariants", () => {
    const g  = makeGraph([]);
    const b  = makeFakeBinding(ENTITIES_PASS); // will cause GF violations
    const report = runAllInvariants({ binding: b, graph: g, specs: [], traces: [], rawText: "" });
    expect(report.totalViolations).toBeGreaterThan(0);
    expect(report.allPassed).toBe(false);
  });

  it("(RN3) results array contains one entry per checked invariant", () => {
    const g  = makeGraph(ENTITIES_PASS);
    const b  = makeFakeBinding(ENTITIES_PASS);
    const t  = [buildConstraintProofTrace(g, SPEC)];
    const report = runAllInvariants({ binding: b, graph: g, specs: [SPEC], traces: t, rawText: "80g cyclic dextrin" });
    // GF, ED, PI, MI all run
    expect(report.results.length).toBe(4);
  });

  it("(RN4) assertInvariants does not throw for healthy system", () => {
    const g = makeGraph(ENTITIES_PASS);
    const b = makeFakeBinding(ENTITIES_PASS);
    const t = [buildConstraintProofTrace(g, SPEC)];
    expect(() => assertInvariants({ binding: b, graph: g, specs: [SPEC], traces: t })).not.toThrow();
  });

  it("(RN5) assertInvariants throws when a violation is present", () => {
    const g = makeGraph([]);
    const b = makeFakeBinding(ENTITIES_PASS); // GF violation: entities not in graph
    expect(() => assertInvariants({ binding: b, graph: g, specs: [], traces: [] })).toThrow();
  });

  it("(RN6) runner skips GF when no binding is provided", () => {
    const g      = makeGraph(ENTITIES_PASS);
    const report = runAllInvariants({ graph: g, specs: [SPEC], traces: [] });
    const names  = report.results.map((r) => r.invariant);
    expect(names).not.toContain("GraphFidelity");
  });

});
