/**
 * graph_proof_trace_test.ts
 *
 * Tests for graph-native proof trace generation.
 *
 * Coverage:
 *   PT — Proof trace structure: steps present, correct count, correct order
 *   ST — Step content: selected/excluded node IDs, descriptions
 *   EX — Excluded node identification
 *   WN — Window node IDs captured in Window Restriction step
 *   AG — Aggregation step data
 *   CM — Comparison step data (observed, operator, threshold, passed)
 *   EI — Executor integration: result.proof always populated
 *   CB — Carb-timing: multi-candidate, two-constraint scenario
 */

import { describe, it, expect } from "vitest";
import { buildConstraintProofTrace }            from "../graph/graph_proof_trace.ts";
import { executeGraphConstraint,
         executeGraphConstraintSet }             from "../graph/graph_constraint_executor.ts";
import type { OperandGraph }                     from "../graph/operand_graph_types.ts";
import type { GraphConstraintSpec }              from "../graph/graph_constraint_types.ts";
import type { GraphConstraintProofTrace,
              GraphProofStep }                   from "../graph/graph_proof_types.ts";

/* ─────────────────────────────────────────────────────────────────────────────
   Shared test graph builder
   (identical contract to the one in graph_constraint_executor_test.ts)
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

    nodes.push({ id: eId, type: "entity",   label: ent.label,         data: { tags: ent.tags, confidence: "high" } });
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

/* ─────────────────────────────────────────────────────────────────────────────
   Shared specs
   ───────────────────────────────────────────────────────────────────────────── */

const FAST_CARB_60G: GraphConstraintSpec = {
  constraintId: "C1",
  label:        "fast carb ≥ 60g within 90min before lifting",
  selection: { entityTags: ["fast", "carb"], anchorLabel: "lifting", relation: "before", windowMinutes: 90 },
  aggregation: { quantityUnit: "g", aggregation: "sum" },
  operator: ">=", threshold: 60,
};

const SLOW_CARB_MAX_20G: GraphConstraintSpec = {
  constraintId: "C2",
  label:        "slow carb ≤ 20g within 60min before lifting",
  selection: { entityTags: ["slow", "carb"], anchorLabel: "lifting", relation: "before", windowMinutes: 60 },
  aggregation: { quantityUnit: "g", aggregation: "sum" },
  operator: "<=", threshold: 20,
};

/* ─────────────────────────────────────────────────────────────────────────────
   PT — Proof trace structure
   ───────────────────────────────────────────────────────────────────────────── */

describe("Proof trace structure", () => {

  it("(PT1) buildConstraintProofTrace returns a trace with steps array", () => {
    const g = makeGraph([{
      id: "d", label: "dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const trace = buildConstraintProofTrace(g, FAST_CARB_60G);
    expect(Array.isArray(trace.steps)).toBe(true);
    expect(trace.steps.length).toBeGreaterThanOrEqual(4);
  });

  it("(PT2) steps are numbered sequentially from 1", () => {
    const g = makeGraph([{
      id: "d", label: "dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const trace = buildConstraintProofTrace(g, FAST_CARB_60G);
    trace.steps.forEach((step, i) => {
      expect(step.stepNumber).toBe(i + 1);
    });
  });

  it("(PT3) first step is always Candidate Selection", () => {
    const g = makeGraph([]);
    const trace = buildConstraintProofTrace(g, FAST_CARB_60G);
    expect(trace.steps[0].label).toBe("Candidate Selection");
  });

  it("(PT4) last step is always Threshold Comparison", () => {
    const g = makeGraph([{
      id: "d", label: "dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const trace = buildConstraintProofTrace(g, FAST_CARB_60G);
    const last = trace.steps[trace.steps.length - 1];
    expect(last.label).toBe("Threshold Comparison");
  });

  it("(PT5) trace top-level fields match spec and result", () => {
    const g = makeGraph([{
      id: "d", label: "dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const trace = buildConstraintProofTrace(g, FAST_CARB_60G);
    expect(trace.constraintId).toBe("C1");
    expect(trace.operator).toBe(">=");
    expect(trace.threshold).toBe(60);
    expect(trace.finalObservedValue).toBe(80);
    expect(trace.passed).toBe(true);
  });

  it("(PT6) trace has Tag Filter step when entityTags are specified", () => {
    const g = makeGraph([]);
    const trace = buildConstraintProofTrace(g, FAST_CARB_60G);
    expect(trace.steps.some((s) => s.label === "Tag Filter")).toBe(true);
  });

  it("(PT7) trace has Window Restriction step when anchorLabel is specified", () => {
    const g = makeGraph([]);
    const trace = buildConstraintProofTrace(g, FAST_CARB_60G);
    expect(trace.steps.some((s) => s.label === "Window Restriction")).toBe(true);
  });

  it("(PT8) trace has Aggregation step", () => {
    const g = makeGraph([]);
    const trace = buildConstraintProofTrace(g, FAST_CARB_60G);
    expect(trace.steps.some((s) => s.label === "Aggregation")).toBe(true);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   ST — Step content
   ───────────────────────────────────────────────────────────────────────────── */

describe("Step content", () => {

  it("(ST1) Candidate Selection step lists selected node IDs", () => {
    const g = makeGraph([
      { id: "a", label: "dextrin", amount: 80, unit: "g", tags: ["fast","carb"] },
      { id: "b", label: "oats",    amount: 30, unit: "g", tags: ["slow","carb"] },
    ]);
    const trace = buildConstraintProofTrace(g, FAST_CARB_60G);
    const step  = trace.steps.find((s) => s.label === "Candidate Selection")!;
    expect(step.selectedNodeIds).toHaveLength(2);
    expect(step.excludedNodeIds).toHaveLength(0);
  });

  it("(ST2) Tag Filter step shrinks selectedNodeIds and populates excludedNodeIds", () => {
    const g = makeGraph([
      { id: "a", label: "dextrin", amount: 80, unit: "g", tags: ["fast","carb"],
        windowMinutes: 30, anchorLabel: "lifting" },
      { id: "b", label: "oats",    amount: 30, unit: "g", tags: ["slow","carb"],
        windowMinutes: 30, anchorLabel: "lifting" },
    ]);
    const trace  = buildConstraintProofTrace(g, FAST_CARB_60G);
    const tagStep = trace.steps.find((s) => s.label === "Tag Filter")!;
    // fast+carb → only dextrin survives
    expect(tagStep.selectedNodeIds).toHaveLength(1);
    expect(tagStep.excludedNodeIds).toHaveLength(1);
  });

  it("(ST3) Aggregation step description mentions the unit and value", () => {
    const g = makeGraph([{
      id: "d", label: "dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const trace = buildConstraintProofTrace(g, FAST_CARB_60G);
    const aggStep = trace.steps.find((s) => s.label === "Aggregation")!;
    expect(aggStep.description).toMatch(/g/i);
    expect(aggStep.description).toMatch(/80/);
  });

  it("(ST4) Threshold Comparison description references observed and threshold", () => {
    const g = makeGraph([{
      id: "d", label: "dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const trace = buildConstraintProofTrace(g, FAST_CARB_60G);
    const cmpStep = trace.steps.find((s) => s.label === "Threshold Comparison")!;
    expect(cmpStep.description).toMatch(/80/);
    expect(cmpStep.description).toMatch(/60/);
    expect(cmpStep.description).toMatch(/>=/);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   EX — Excluded node identification
   ───────────────────────────────────────────────────────────────────────────── */

describe("Excluded node identification", () => {

  it("(EX1) tag-filtered-out entity ID appears in Tag Filter excludedNodeIds", () => {
    const g = makeGraph([
      { id: "fast", label: "dextrin", amount: 80, unit: "g",
        tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting" },
      { id: "slow", label: "oats",    amount: 30, unit: "g",
        tags: ["slow","carb"], windowMinutes: 30, anchorLabel: "lifting" },
    ]);
    const trace   = buildConstraintProofTrace(g, FAST_CARB_60G);
    const tagStep = trace.steps.find((s) => s.label === "Tag Filter")!;
    // oats (id=e_slow) should be in excludedNodeIds
    expect(tagStep.excludedNodeIds).toContain("e_slow");
  });

  it("(EX2) window-excluded entity ID appears in Window Restriction excludedNodeIds", () => {
    const g = makeGraph([
      { id: "inside",  label: "dextrin", amount: 40, unit: "g",
        tags: ["fast","carb"], windowMinutes: 90,  anchorLabel: "lifting" }, // 90min = at limit
      { id: "outside", label: "glucose", amount: 40, unit: "g",
        tags: ["fast","carb"], windowMinutes: 120, anchorLabel: "lifting" }, // over limit
    ]);
    const trace   = buildConstraintProofTrace(g, FAST_CARB_60G);
    const winStep = trace.steps.find((s) => s.label === "Window Restriction")!;
    // glucose (e_outside) should be excluded
    expect(winStep.excludedNodeIds).toContain("e_outside");
    expect(winStep.selectedNodeIds).toContain("e_inside");
  });

  it("(EX3) description mentions excluded entity labels", () => {
    const g = makeGraph([
      { id: "fast1", label: "dextrin", amount: 80, unit: "g", tags: ["fast","carb"],
        windowMinutes: 30, anchorLabel: "lifting" },
      { id: "slow1", label: "oats",    amount: 30, unit: "g", tags: ["slow","carb"],
        windowMinutes: 30, anchorLabel: "lifting" },
    ]);
    const trace   = buildConstraintProofTrace(g, FAST_CARB_60G);
    const tagStep = trace.steps.find((s) => s.label === "Tag Filter")!;
    expect(tagStep.description).toMatch(/oats/i);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   WN — Window node IDs
   ───────────────────────────────────────────────────────────────────────────── */

describe("Window node IDs in Window Restriction step", () => {

  it("(WN1) data.windowNodeIds is populated for qualifying entities", () => {
    const g = makeGraph([{
      id: "d", label: "dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const trace   = buildConstraintProofTrace(g, FAST_CARB_60G);
    const winStep = trace.steps.find((s) => s.label === "Window Restriction")!;
    const wids    = winStep.data?.windowNodeIds as string[] | undefined;
    expect(Array.isArray(wids)).toBe(true);
    expect(wids!.length).toBeGreaterThanOrEqual(1);
    // The window node id should be w_d (from makeGraph naming)
    expect(wids).toContain("w_d");
  });

  it("(WN2) data.anchorLabel is preserved in the Window Restriction step", () => {
    const g = makeGraph([{
      id: "d", label: "dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const trace   = buildConstraintProofTrace(g, FAST_CARB_60G);
    const winStep = trace.steps.find((s) => s.label === "Window Restriction")!;
    expect(winStep.data?.anchorLabel).toBe("lifting");
    expect(winStep.data?.offsetMinutes).toBe(90);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   AG — Aggregation step
   ───────────────────────────────────────────────────────────────────────────── */

describe("Aggregation step data", () => {

  it("(AG1) data.aggregate equals the sum of qualifying amounts", () => {
    const g = makeGraph([
      { id: "a", label: "dextrin",  amount: 40, unit: "g",
        tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting" },
      { id: "b", label: "fructose", amount: 25, unit: "g",
        tags: ["fast","carb"], windowMinutes: 60, anchorLabel: "lifting" },
    ]);
    const trace  = buildConstraintProofTrace(g, FAST_CARB_60G);
    const aggStep = trace.steps.find((s) => s.label === "Aggregation")!;
    expect(aggStep.data?.aggregate).toBe(65);
  });

  it("(AG2) data.method reflects the aggregation type", () => {
    const g = makeGraph([]);
    const trace   = buildConstraintProofTrace(g, FAST_CARB_60G);
    const aggStep = trace.steps.find((s) => s.label === "Aggregation")!;
    expect(aggStep.data?.method).toBe("sum");
  });

  it("(AG3) data.count reflects the number of qualifying entities", () => {
    const g = makeGraph([
      { id: "a", label: "dextrin",  amount: 40, unit: "g",
        tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting" },
      { id: "b", label: "fructose", amount: 25, unit: "g",
        tags: ["fast","carb"], windowMinutes: 60, anchorLabel: "lifting" },
    ]);
    const trace   = buildConstraintProofTrace(g, FAST_CARB_60G);
    const aggStep = trace.steps.find((s) => s.label === "Aggregation")!;
    expect(aggStep.data?.count).toBe(2);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   CM — Comparison step data
   ───────────────────────────────────────────────────────────────────────────── */

describe("Comparison step data", () => {

  it("(CM1) data.passed is true when constraint is satisfied", () => {
    const g = makeGraph([{
      id: "d", label: "dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const trace  = buildConstraintProofTrace(g, FAST_CARB_60G);
    const cmpStep = trace.steps.find((s) => s.label === "Threshold Comparison")!;
    expect(cmpStep.data?.passed).toBe(true);
    expect(cmpStep.data?.observed).toBe(80);
    expect(cmpStep.data?.operator).toBe(">=");
    expect(cmpStep.data?.threshold).toBe(60);
  });

  it("(CM2) data.passed is false when constraint is not satisfied", () => {
    const g = makeGraph([{
      id: "d", label: "dextrin", amount: 30, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const trace   = buildConstraintProofTrace(g, FAST_CARB_60G);
    const cmpStep = trace.steps.find((s) => s.label === "Threshold Comparison")!;
    expect(cmpStep.data?.passed).toBe(false);
    expect(cmpStep.data?.observed).toBe(30);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   EI — Executor integration: result.proof is always populated
   ───────────────────────────────────────────────────────────────────────────── */

describe("Executor integration — result.proof", () => {

  it("(EI1) executeGraphConstraint returns result.proof", () => {
    const g = makeGraph([{
      id: "d", label: "dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const r = executeGraphConstraint(g, FAST_CARB_60G);
    expect(r.proof).toBeDefined();
    expect(r.proof.constraintId).toBe("C1");
  });

  it("(EI2) result.proof.passed matches result.passed", () => {
    const g = makeGraph([{
      id: "d", label: "dextrin", amount: 10, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const r = executeGraphConstraint(g, FAST_CARB_60G);
    expect(r.proof.passed).toBe(r.passed);
    expect(r.proof.finalObservedValue).toBe(r.observedValue);
  });

  it("(EI3) executeGraphConstraintSet attaches proof to every result", () => {
    const g = makeGraph([{
      id: "d", label: "dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const results = executeGraphConstraintSet(g, [FAST_CARB_60G, SLOW_CARB_MAX_20G]);
    results.forEach((r) => {
      expect(r.proof).toBeDefined();
      expect(r.proof.steps.length).toBeGreaterThan(0);
    });
  });

  it("(EI4) proof and result agree on observedValue", () => {
    const g = makeGraph([
      { id: "a", label: "dextrin",  amount: 40, unit: "g",
        tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting" },
      { id: "b", label: "fructose", amount: 25, unit: "g",
        tags: ["fast","carb"], windowMinutes: 60, anchorLabel: "lifting" },
    ]);
    const r = executeGraphConstraint(g, FAST_CARB_60G);
    expect(r.proof.finalObservedValue).toBe(r.observedValue);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   CB — Carb-timing two-constraint scenario
   ───────────────────────────────────────────────────────────────────────────── */

describe("Carb-timing two-constraint proof scenario", () => {

  const MIXED_GRAPH = makeGraph([
    { id: "fast1", label: "cyclic dextrin", amount: 60, unit: "g",
      tags: ["fast","carb"], windowMinutes: 45, anchorLabel: "lifting" },
    { id: "slow1", label: "oats",           amount: 30, unit: "g",
      tags: ["slow","carb"], windowMinutes: 30, anchorLabel: "lifting" },
  ]);

  it("(CB1) C1 proof: fast carb passes (60 >= 60)", () => {
    const trace = buildConstraintProofTrace(MIXED_GRAPH, FAST_CARB_60G);
    expect(trace.passed).toBe(true);
    expect(trace.finalObservedValue).toBe(60);
  });

  it("(CB2) C1 proof Tag Filter excludes oats (slow carb)", () => {
    const trace   = buildConstraintProofTrace(MIXED_GRAPH, FAST_CARB_60G);
    const tagStep = trace.steps.find((s) => s.label === "Tag Filter")!;
    expect(tagStep.excludedNodeIds).toContain("e_slow1");
  });

  it("(CB3) C2 proof: slow carb fails (30 > 20)", () => {
    const trace = buildConstraintProofTrace(MIXED_GRAPH, SLOW_CARB_MAX_20G);
    expect(trace.passed).toBe(false);
    expect(trace.finalObservedValue).toBe(30);
  });

  it("(CB4) C2 proof Tag Filter excludes dextrin (fast carb)", () => {
    const trace   = buildConstraintProofTrace(MIXED_GRAPH, SLOW_CARB_MAX_20G);
    const tagStep = trace.steps.find((s) => s.label === "Tag Filter")!;
    expect(tagStep.excludedNodeIds).toContain("e_fast1");
  });

  it("(CB5) both proofs together produced by executeGraphConstraintSet", () => {
    const results = executeGraphConstraintSet(MIXED_GRAPH, [FAST_CARB_60G, SLOW_CARB_MAX_20G]);
    const [r1, r2] = results;
    expect(r1.proof.passed).toBe(true);
    expect(r2.proof.passed).toBe(false);
    // C2 failure: slow carb exceeds 20g limit
    const cmpStep2 = r2.proof.steps.find((s) => s.label === "Threshold Comparison")!;
    expect(cmpStep2.description).toMatch(/fail/i);
  });

});
