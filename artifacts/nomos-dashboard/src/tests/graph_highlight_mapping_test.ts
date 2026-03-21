/**
 * graph_highlight_mapping_test.ts
 *
 * Tests for the proof-step → highlight-state mapping layer.
 *
 * Coverage:
 *   HS — buildHighlightStateFromProofStep: fields populated correctly
 *   PR — Priority ordering: excluded > aggregate-source > selected > window > anchor > inactive
 *   ST — isStepActive: correctly detects active step
 *   CL — clearHighlightState: returns null state
 *   IN — Integration with graph_proof_trace: new fields populated on steps
 *   DE — Determinism: same input always produces same output
 */

import { describe, it, expect } from "vitest";
import {
  buildHighlightStateFromProofStep,
  getNodeHighlightRole,
  isStepActive,
  clearHighlightState,
} from "../ui/graph/graph_highlight_state.ts";
import { NULL_HIGHLIGHT_STATE } from "../ui/graph/graph_highlight_types.ts";
import { buildConstraintProofTrace }    from "../graph/graph_proof_trace.ts";
import type { OperandGraph }            from "../graph/operand_graph_types.ts";
import type { GraphConstraintSpec }     from "../graph/graph_constraint_types.ts";
import type { GraphProofStep }          from "../graph/graph_proof_types.ts";

/* ─────────────────────────────────────────────────────────────────────────────
   Test graph builder (shared with previous test files)
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

const FAST_CARB_SPEC: GraphConstraintSpec = {
  constraintId: "C1",
  label:        "fast carb ≥ 60g within 90min before lifting",
  selection:    { entityTags: ["fast","carb"], anchorLabel: "lifting", relation: "before", windowMinutes: 90 },
  aggregation:  { quantityUnit: "g", aggregation: "sum" },
  operator:     ">=",
  threshold:    60,
};

/* ─────────────────────────────────────────────────────────────────────────────
   HS — buildHighlightStateFromProofStep
   ───────────────────────────────────────────────────────────────────────────── */

describe("buildHighlightStateFromProofStep", () => {

  it("(HS1) maps selectedNodeIds from step", () => {
    const step: GraphProofStep = {
      stepNumber: 1, label: "Candidate Selection",
      description: "Selected 2 entities.",
      selectedNodeIds: ["e_a", "e_b"],
      excludedNodeIds: [],
    };
    const hs = buildHighlightStateFromProofStep(step, "C1-step-1");
    expect(hs.selectedNodeIds).toEqual(["e_a", "e_b"]);
  });

  it("(HS2) maps excludedNodeIds from step", () => {
    const step: GraphProofStep = {
      stepNumber: 2, label: "Tag Filter",
      description: "Filtered.",
      selectedNodeIds: ["e_a"],
      excludedNodeIds: ["e_b"],
    };
    const hs = buildHighlightStateFromProofStep(step, "C1-step-2");
    expect(hs.excludedNodeIds).toEqual(["e_b"]);
  });

  it("(HS3) maps anchorNodeIds from step", () => {
    const step: GraphProofStep = {
      stepNumber: 4, label: "Window Restriction",
      description: "Restricted.",
      selectedNodeIds: ["e_a"],
      excludedNodeIds: [],
      anchorNodeIds: ["a_lifting"],
      windowNodeIds: ["w_a"],
    };
    const hs = buildHighlightStateFromProofStep(step, "C1-step-4");
    expect(hs.anchorNodeIds).toEqual(["a_lifting"]);
  });

  it("(HS4) maps windowNodeIds from step", () => {
    const step: GraphProofStep = {
      stepNumber: 4, label: "Window Restriction",
      description: "Restricted.",
      selectedNodeIds: ["e_a"],
      excludedNodeIds: [],
      anchorNodeIds: ["a_lifting"],
      windowNodeIds: ["w_a"],
    };
    const hs = buildHighlightStateFromProofStep(step, "C1-step-4");
    expect(hs.windowNodeIds).toEqual(["w_a"]);
  });

  it("(HS5) maps aggregateSourceNodeIds from step", () => {
    const step: GraphProofStep = {
      stepNumber: 5, label: "Aggregation",
      description: "Aggregated.",
      selectedNodeIds: ["e_a", "e_b"],
      excludedNodeIds: [],
      aggregateSourceNodeIds: ["e_a"],
    };
    const hs = buildHighlightStateFromProofStep(step, "C1-step-5");
    expect(hs.aggregateSourceNodeIds).toEqual(["e_a"]);
  });

  it("(HS6) activeProofStepId uses provided stepId", () => {
    const step: GraphProofStep = { stepNumber: 3, label: "Label Filter", description: "." };
    const hs = buildHighlightStateFromProofStep(step, "my-step-id");
    expect(hs.activeProofStepId).toBe("my-step-id");
  });

  it("(HS7) activeProofStepId defaults to step-N when not provided", () => {
    const step: GraphProofStep = { stepNumber: 2, label: "Tag Filter", description: "." };
    const hs = buildHighlightStateFromProofStep(step);
    expect(hs.activeProofStepId).toBe("step-2");
  });

  it("(HS8) empty arrays when step fields are undefined", () => {
    const step: GraphProofStep = { stepNumber: 6, label: "Threshold Comparison", description: "." };
    const hs = buildHighlightStateFromProofStep(step, "C1-step-6");
    expect(hs.selectedNodeIds).toEqual([]);
    expect(hs.excludedNodeIds).toEqual([]);
    expect(hs.anchorNodeIds).toEqual([]);
    expect(hs.windowNodeIds).toEqual([]);
    expect(hs.aggregateSourceNodeIds).toEqual([]);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   PR — Priority ordering in getNodeHighlightRole
   ───────────────────────────────────────────────────────────────────────────── */

describe("getNodeHighlightRole priority ordering", () => {

  const BASE_STATE = {
    activeProofStepId:     "C1-step-5",
    selectedNodeIds:       ["e_a", "e_b"],
    excludedNodeIds:       ["e_c"],
    anchorNodeIds:         ["a_lift"],
    windowNodeIds:         ["w_a"],
    aggregateSourceNodeIds: ["e_a"],
  };

  it("(PR1) excluded wins over selected", () => {
    // e_c is excluded but NOT selected — excluded
    expect(getNodeHighlightRole("e_c", BASE_STATE)).toBe("excluded");
  });

  it("(PR2) aggregate-source wins over selected when both are true", () => {
    // e_a is both selected and aggregateSource → aggregate-source wins
    expect(getNodeHighlightRole("e_a", BASE_STATE)).toBe("aggregate-source");
  });

  it("(PR3) selected takes precedence over window/anchor for plain selected node", () => {
    // e_b is selected only
    expect(getNodeHighlightRole("e_b", BASE_STATE)).toBe("selected");
  });

  it("(PR4) window node role returned for window node", () => {
    expect(getNodeHighlightRole("w_a", BASE_STATE)).toBe("window");
  });

  it("(PR5) anchor role returned for anchor node", () => {
    expect(getNodeHighlightRole("a_lift", BASE_STATE)).toBe("anchor");
  });

  it("(PR6) inactive for nodes not in any list", () => {
    expect(getNodeHighlightRole("e_unknown", BASE_STATE)).toBe("inactive");
  });

  it("(PR7) null state → all nodes inactive", () => {
    expect(getNodeHighlightRole("e_a", null)).toBe("inactive");
  });

  it("(PR8) null activeProofStepId → all nodes inactive", () => {
    const state = { ...BASE_STATE, activeProofStepId: null };
    expect(getNodeHighlightRole("e_a", state)).toBe("inactive");
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   ST — isStepActive
   ───────────────────────────────────────────────────────────────────────────── */

describe("isStepActive", () => {

  it("(ST1) returns true when stepId matches activeProofStepId", () => {
    const hs = { ...NULL_HIGHLIGHT_STATE, activeProofStepId: "C1-step-3" };
    expect(isStepActive("C1-step-3", hs)).toBe(true);
  });

  it("(ST2) returns false for non-matching stepId", () => {
    const hs = { ...NULL_HIGHLIGHT_STATE, activeProofStepId: "C1-step-3" };
    expect(isStepActive("C1-step-4", hs)).toBe(false);
  });

  it("(ST3) returns false when state is null", () => {
    expect(isStepActive("C1-step-1", null)).toBe(false);
  });

  it("(ST4) returns false when activeProofStepId is null", () => {
    expect(isStepActive("C1-step-1", NULL_HIGHLIGHT_STATE)).toBe(false);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   CL — clearHighlightState
   ───────────────────────────────────────────────────────────────────────────── */

describe("clearHighlightState", () => {

  it("(CL1) returns state with null activeProofStepId", () => {
    expect(clearHighlightState().activeProofStepId).toBeNull();
  });

  it("(CL2) returns state with all empty arrays", () => {
    const hs = clearHighlightState();
    expect(hs.selectedNodeIds).toHaveLength(0);
    expect(hs.excludedNodeIds).toHaveLength(0);
    expect(hs.anchorNodeIds).toHaveLength(0);
    expect(hs.windowNodeIds).toHaveLength(0);
    expect(hs.aggregateSourceNodeIds).toHaveLength(0);
  });

  it("(CL3) returns a new object each call (no shared reference)", () => {
    const a = clearHighlightState();
    const b = clearHighlightState();
    expect(a).not.toBe(b);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   IN — Integration: new fields on proof steps
   ───────────────────────────────────────────────────────────────────────────── */

describe("Integration: proof steps carry highlighting fields", () => {

  const MIXED_GRAPH = makeGraph([
    { id: "fast1", label: "cyclic dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting" },
    { id: "slow1", label: "oats",           amount: 30, unit: "g",
      tags: ["slow","carb"], windowMinutes: 30, anchorLabel: "lifting" },
  ]);

  it("(IN1) Window Restriction step carries anchorNodeIds", () => {
    const trace   = buildConstraintProofTrace(MIXED_GRAPH, FAST_CARB_SPEC);
    const winStep = trace.steps.find((s) => s.label === "Window Restriction")!;
    expect(winStep.anchorNodeIds).toBeDefined();
    expect(winStep.anchorNodeIds!.length).toBeGreaterThanOrEqual(1);
    expect(winStep.anchorNodeIds).toContain("a_lifting");
  });

  it("(IN2) Window Restriction step carries windowNodeIds", () => {
    const trace   = buildConstraintProofTrace(MIXED_GRAPH, FAST_CARB_SPEC);
    const winStep = trace.steps.find((s) => s.label === "Window Restriction")!;
    expect(winStep.windowNodeIds).toBeDefined();
    expect(winStep.windowNodeIds!).toContain("w_fast1");
  });

  it("(IN3) Aggregation step carries aggregateSourceNodeIds for matching entities", () => {
    const trace   = buildConstraintProofTrace(MIXED_GRAPH, FAST_CARB_SPEC);
    const aggStep = trace.steps.find((s) => s.label === "Aggregation")!;
    expect(aggStep.aggregateSourceNodeIds).toBeDefined();
    expect(aggStep.aggregateSourceNodeIds!).toContain("e_fast1");
  });

  it("(IN4) Threshold Comparison step carries aggregateSourceNodeIds forward", () => {
    const trace   = buildConstraintProofTrace(MIXED_GRAPH, FAST_CARB_SPEC);
    const cmpStep = trace.steps.find((s) => s.label === "Threshold Comparison")!;
    expect(cmpStep.aggregateSourceNodeIds).toBeDefined();
    expect(cmpStep.aggregateSourceNodeIds!.length).toBeGreaterThanOrEqual(1);
  });

  it("(IN5) Candidate Selection step has empty anchorNodeIds and windowNodeIds", () => {
    const trace  = buildConstraintProofTrace(MIXED_GRAPH, FAST_CARB_SPEC);
    const selStep = trace.steps.find((s) => s.label === "Candidate Selection")!;
    expect(selStep.anchorNodeIds).toEqual([]);
    expect(selStep.windowNodeIds).toEqual([]);
  });

  it("(IN6) building highlight from Window step produces correct anchor/window roles", () => {
    const trace   = buildConstraintProofTrace(MIXED_GRAPH, FAST_CARB_SPEC);
    const winStep = trace.steps.find((s) => s.label === "Window Restriction")!;
    const hs      = buildHighlightStateFromProofStep(winStep, "C1-step-win");

    // The anchor node should get 'anchor' role
    expect(getNodeHighlightRole("a_lifting", hs)).toBe("anchor");
    // The window node for the surviving entity should get 'window' role
    expect(getNodeHighlightRole("w_fast1", hs)).toBe("window");
    // The excluded entity (oats, slow carb) should have been excluded in Tag Filter
    // Window step: oats already removed → so e_slow1 is neither selected nor excluded here
    expect(getNodeHighlightRole("e_slow1", hs)).toBe("inactive");
  });

  it("(IN7) building highlight from Aggregation step shows aggregate-source role", () => {
    const trace   = buildConstraintProofTrace(MIXED_GRAPH, FAST_CARB_SPEC);
    const aggStep = trace.steps.find((s) => s.label === "Aggregation")!;
    const hs      = buildHighlightStateFromProofStep(aggStep, "C1-step-agg");

    expect(getNodeHighlightRole("e_fast1", hs)).toBe("aggregate-source");
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   DE — Determinism
   ───────────────────────────────────────────────────────────────────────────── */

describe("Determinism", () => {

  it("(DE1) same step always produces same highlight state", () => {
    const step: GraphProofStep = {
      stepNumber: 2, label: "Tag Filter",
      description: "Filtered.",
      selectedNodeIds: ["e_a", "e_b"],
      excludedNodeIds: ["e_c"],
      anchorNodeIds: [],
      windowNodeIds: [],
      aggregateSourceNodeIds: [],
    };
    const hs1 = buildHighlightStateFromProofStep(step, "C1-step-2");
    const hs2 = buildHighlightStateFromProofStep(step, "C1-step-2");
    expect(hs1).toEqual(hs2);
  });

  it("(DE2) same getNodeHighlightRole call always returns same result", () => {
    const hs = { ...NULL_HIGHLIGHT_STATE, activeProofStepId: "x", selectedNodeIds: ["n1"] };
    expect(getNodeHighlightRole("n1", hs)).toBe("selected");
    expect(getNodeHighlightRole("n1", hs)).toBe("selected");
  });

});
