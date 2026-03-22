/**
 * graph_repair_test.ts
 *
 * Tests for the graph-native repair system.
 *
 * Covers:
 *   1.  Planner — undershoot detection and UPDATE_QUANTITY/ADD_ENTITY selection
 *   2.  Planner — overshoot detection and UPDATE_QUANTITY downward
 *   3.  Planner — window failure detection and UPDATE_RELATION_OFFSET
 *   4.  Planner — structural failure detection and ADD_ENTITY
 *   5.  Planner — alreadyPassing returns empty plan
 *   6.  Executor — UPDATE_QUANTITY modifies graph correctly
 *   7.  Executor — ADD_ENTITY adds node and optional edge
 *   8.  Executor — UPDATE_RELATION_OFFSET modifies edge offset
 *   9.  Executor — REMOVE_ENTITY removes node and incident edges
 *   10. Executor — input graph not mutated
 *   11. Validation — restoredFeasibility=true when repair fixes undershoot
 *   12. Validation — newViolations empty when repair has no side effects
 *   13. Validation — reEvaluated is always true
 *
 * All tests are deterministic.  No LLMs.  No randomness.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  buildGraphRepairPlan,
  resetActionCounter,
  resetPlanCounter,
} from "../repair/graph_repair_planner.ts";
import {
  applyGraphRepairPlan,
  resetExecutorCounters,
} from "../repair/graph_repair_executor.ts";
import { validateGraphRepairPlan } from "../repair/graph_repair_validation.ts";

import type { CanonicalGraph }            from "../graph/canonical_graph_types.ts";
import type { GraphConstraintSpec }       from "../graph/graph_constraint_types.ts";
import type { ConstraintDiffInput }       from "../repair/graph_repair_types.ts";
import type { GraphConstraintProofTrace } from "../graph/graph_proof_types.ts";
import type { GraphNativeDiff }           from "../execution/execution_route_types.ts";

/* =========================================================
   Fixtures
   ========================================================= */

beforeEach(() => {
  resetActionCounter();
  resetPlanCounter();
  resetExecutorCounters();
});

/** A graph with 1 entity node (80g fast+carb) connected before lifting anchor. */
function makeCarbGraph(opts: {
  amount?: number;
  offsetMinutes?: number;
} = {}): CanonicalGraph {
  const amount        = opts.amount        ?? 80;
  const offsetMinutes = opts.offsetMinutes ?? 30;
  return {
    nodes: [
      {
        id: "cgn_me_0", kind: "entity", label: "cyclic dextrin",
        data: {
          tags: ["fast", "carb"],
          measures: [{ amount, unit: "g", unitNormalized: "g", dimension: "mass" }],
          category: "supplement",
        },
      },
      {
        id: "cgn_anc_0", kind: "anchor", label: "lifting",
        data: {},
      },
    ],
    edges: [
      {
        id: "cge_rel_0", kind: "before",
        from: "cgn_me_0", to: "cgn_anc_0",
        data: {
          relationType: "BEFORE", provenance: "registry", confidence: 0.95,
          offset: { amount: offsetMinutes, unit: "min", unitNormalized: "min", dimension: "time" },
        },
      },
    ],
  };
}

/** A graph with 1 "slow" carb entity — wrong tags for fast-carb constraint. */
function makeWrongTagGraph(): CanonicalGraph {
  return {
    nodes: [
      {
        id: "cgn_me_0", kind: "entity", label: "oats",
        data: {
          tags: ["slow", "carb"],
          measures: [{ amount: 40, unit: "g", unitNormalized: "g", dimension: "mass" }],
        },
      },
      { id: "cgn_anc_0", kind: "anchor", label: "lifting", data: {} },
    ],
    edges: [
      {
        id: "cge_rel_0", kind: "before",
        from: "cgn_me_0", to: "cgn_anc_0",
        data: { relationType: "BEFORE", offset: { amount: 30, unit: "min" } },
      },
    ],
  };
}

/** The standard fast-carb ≥60g constraint. */
const carbSpec: GraphConstraintSpec = {
  constraintId: "c_carb",
  label:        "fast carbs before lifting",
  selection:    { entityTags: ["fast", "carb"], anchorLabel: "lifting", relation: "before", windowMinutes: 90 },
  aggregation:  { quantityUnit: "g", aggregation: "sum" },
  operator:     ">=",
  threshold:    60,
};

/** A ≤20g slow-carb constraint. */
const slowCarbSpec: GraphConstraintSpec = {
  constraintId: "c_slow",
  label:        "slow carbs ≤20g",
  selection:    { entityTags: ["slow", "carb"], anchorLabel: "lifting", relation: "before", windowMinutes: 60 },
  aggregation:  { quantityUnit: "g", aggregation: "sum" },
  operator:     "<=",
  threshold:    20,
};

/** Build a dummy proof trace with configurable step node-ID sets. */
function makeProof(opts: {
  constraintId?: string;
  label?: string;
  operator?: string;
  threshold?: number;
  observed?: number;
  passed?: boolean;
  tagFilterSelected?: string[];
  tagFilterExcluded?: string[];
  windowSelected?: string[];
  windowExcluded?: string[];
  sourceNodeIds?: string[];
}): GraphConstraintProofTrace {
  const {
    constraintId = "c_carb",
    label        = "fast carbs before lifting",
    operator     = ">=",
    threshold    = 60,
    observed     = 40,
    passed       = false,
    tagFilterSelected = ["cgn_me_0"],
    tagFilterExcluded = [],
    windowSelected    = ["cgn_me_0"],
    windowExcluded    = [],
    sourceNodeIds     = ["cgn_me_0"],
  } = opts;

  return {
    constraintId,
    label,
    candidateId: null,
    finalObservedValue: observed,
    operator,
    threshold,
    passed,
    steps: [
      {
        stepNumber: 1, label: "Candidate Selection",
        description: "selected all 1 entity node(s)",
        selectedNodeIds: tagFilterSelected,
        excludedNodeIds: [],
      },
      {
        stepNumber: 2, label: "Tag Filter",
        description: `filtered by tags: ${tagFilterSelected.length} qualified`,
        selectedNodeIds: tagFilterSelected,
        excludedNodeIds: tagFilterExcluded,
      },
      {
        stepNumber: 3, label: "Label Filter",
        description: "no label restriction",
        selectedNodeIds: tagFilterSelected,
        excludedNodeIds: [],
      },
      {
        stepNumber: 4, label: "Window Restriction",
        description: `window restriction: ${windowSelected.length} qualify`,
        selectedNodeIds: windowSelected,
        excludedNodeIds: windowExcluded,
        anchorNodeIds:   ["cgn_anc_0"],
      },
      {
        stepNumber: 5, label: "Aggregation",
        description: `aggregated sum(g) = ${observed}`,
        selectedNodeIds: windowSelected,
        aggregateSourceNodeIds: sourceNodeIds,
      },
      {
        stepNumber: 6, label: "Threshold Comparison",
        description: `compared ${observed} ${operator} ${threshold}`,
        data: { observed, operator, threshold, passed },
      },
    ],
  };
}

/** Build a simple undershoot ConstraintDiffInput. */
function makeUndershootInput(opts: { amount?: number } = {}): ConstraintDiffInput {
  const amount = opts.amount ?? 40;
  const delta  = 60 - amount;
  return {
    spec: carbSpec,
    diff: {
      constraintId:   "c_carb",
      deltaRequired:  delta,
      alreadyPassing: false,
      unit:           "g",
      targetNodeIds:  ["cgn_me_0"],
      summary:        `need ${delta}g more`,
    },
    proof: makeProof({ observed: amount }),
  };
}

/** Build an overshoot ConstraintDiffInput (slow carbs 30g > 20g allowed). */
function makeOvershootInput(): ConstraintDiffInput {
  return {
    spec: slowCarbSpec,
    diff: {
      constraintId:   "c_slow",
      deltaRequired:  10,
      alreadyPassing: false,
      unit:           "g",
      targetNodeIds:  ["cgn_me_0"],
      summary:        "need 10g less",
    },
    proof: makeProof({ constraintId: "c_slow", label: "slow carbs ≤20g", operator: "<=", threshold: 20, observed: 30 }),
  };
}

/** Build a window failure ConstraintDiffInput (entity outside 90-min window). */
function makeWindowFailureInput(): ConstraintDiffInput {
  return {
    spec: carbSpec,
    diff: {
      constraintId:   "c_carb",
      deltaRequired:  60,
      alreadyPassing: false,
      unit:           "g",
      targetNodeIds:  [],
      summary:        "need 60g more — entity outside window",
    },
    proof: makeProof({
      observed:          0,
      tagFilterSelected: ["cgn_me_0"],
      windowSelected:    [],
      windowExcluded:    ["cgn_me_0"],
      sourceNodeIds:     [],
    }),
  };
}

/** Build a structural failure ConstraintDiffInput (no qualifying entities). */
function makeStructuralFailureInput(): ConstraintDiffInput {
  return {
    spec: carbSpec,
    diff: {
      constraintId:   "c_carb",
      deltaRequired:  60,
      alreadyPassing: false,
      unit:           "g",
      targetNodeIds:  [],
      summary:        "no qualifying entities found",
    },
    proof: makeProof({
      observed:          0,
      tagFilterSelected: [],
      tagFilterExcluded: ["cgn_me_0"],
      windowSelected:    [],
      windowExcluded:    [],
      sourceNodeIds:     [],
    }),
  };
}

/** Build an alreadyPassing ConstraintDiffInput. */
function makePassingInput(): ConstraintDiffInput {
  return {
    spec: carbSpec,
    diff: {
      constraintId:   "c_carb",
      deltaRequired:  0,
      alreadyPassing: true,
      unit:           "g",
      targetNodeIds:  [],
      summary:        "already passing",
    },
    proof: makeProof({ observed: 80, passed: true }),
  };
}

/* =========================================================
   Section 1: Planner — alreadyPassing
   ========================================================= */

describe("Planner — alreadyPassing", () => {
  it("alreadyPassing → empty actions", () => {
    const plan = buildGraphRepairPlan(makeCarbGraph(), makePassingInput());
    expect(plan.actions).toHaveLength(0);
  });

  it("alreadyPassing → estimatedMinimalityScore = 1.0", () => {
    const plan = buildGraphRepairPlan(makeCarbGraph(), makePassingInput());
    expect(plan.estimatedMinimalityScore).toBe(1.0);
  });

  it("alreadyPassing → plan.constraintId matches input", () => {
    const plan = buildGraphRepairPlan(makeCarbGraph(), makePassingInput());
    expect(plan.constraintId).toBe("c_carb");
  });
});

/* =========================================================
   Section 2: Planner — undershoot
   ========================================================= */

describe("Planner — undershoot", () => {
  it("undershoot → exactly one action", () => {
    const plan = buildGraphRepairPlan(makeCarbGraph({ amount: 40 }), makeUndershootInput({ amount: 40 }));
    expect(plan.actions).toHaveLength(1);
  });

  it("undershoot with qualifying node → UPDATE_QUANTITY", () => {
    const plan = buildGraphRepairPlan(makeCarbGraph({ amount: 40 }), makeUndershootInput({ amount: 40 }));
    expect(plan.actions[0].type).toBe("UPDATE_QUANTITY");
  });

  it("UPDATE_QUANTITY targets existing entity node", () => {
    const plan = buildGraphRepairPlan(makeCarbGraph({ amount: 40 }), makeUndershootInput({ amount: 40 }));
    expect(plan.actions[0].targetNodeId).toBe("cgn_me_0");
  });

  it("UPDATE_QUANTITY newAmount = current + delta", () => {
    const plan = buildGraphRepairPlan(makeCarbGraph({ amount: 40 }), makeUndershootInput({ amount: 40 }));
    expect(plan.actions[0].payload.newAmount).toBe(60); // 40 + 20
  });

  it("UPDATE_QUANTITY previousAmount is current value", () => {
    const plan = buildGraphRepairPlan(makeCarbGraph({ amount: 40 }), makeUndershootInput({ amount: 40 }));
    expect(plan.actions[0].payload.previousAmount).toBe(40);
  });

  it("undershoot → violationType = 'undershoot'", () => {
    const plan = buildGraphRepairPlan(makeCarbGraph({ amount: 40 }), makeUndershootInput({ amount: 40 }));
    expect(plan.violationType).toBe("undershoot");
  });

  it("undershoot with UPDATE_QUANTITY → minimalityScore = 0.9", () => {
    const plan = buildGraphRepairPlan(makeCarbGraph({ amount: 40 }), makeUndershootInput({ amount: 40 }));
    expect(plan.estimatedMinimalityScore).toBe(0.9);
  });

  it("undershoot with no qualifying node → ADD_ENTITY", () => {
    const emptyGraph: CanonicalGraph = { nodes: [{ id: "cgn_anc_0", kind: "anchor", label: "lifting", data: {} }], edges: [] };
    const plan = buildGraphRepairPlan(emptyGraph, makeUndershootInput({ amount: 0 }));
    expect(plan.actions[0].type).toBe("ADD_ENTITY");
  });

  it("ADD_ENTITY payload has correct tags", () => {
    const emptyGraph: CanonicalGraph = { nodes: [{ id: "cgn_anc_0", kind: "anchor", label: "lifting", data: {} }], edges: [] };
    const plan = buildGraphRepairPlan(emptyGraph, makeUndershootInput({ amount: 0 }));
    expect(plan.actions[0].payload.tags).toEqual(["fast", "carb"]);
  });

  it("plan.expectedRepairEffect is non-empty", () => {
    const plan = buildGraphRepairPlan(makeCarbGraph({ amount: 40 }), makeUndershootInput({ amount: 40 }));
    expect(plan.expectedRepairEffect.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Section 3: Planner — overshoot
   ========================================================= */

describe("Planner — overshoot", () => {
  it("overshoot → UPDATE_QUANTITY downward", () => {
    const graph = makeWrongTagGraph();
    graph.nodes[0].data.tags = ["slow", "carb"];
    graph.nodes[0].data.measures = [{ amount: 30, unit: "g", unitNormalized: "g" }];
    const plan = buildGraphRepairPlan(graph, makeOvershootInput());
    expect(plan.actions[0].type).toBe("UPDATE_QUANTITY");
  });

  it("overshoot newAmount < previousAmount", () => {
    const graph = makeWrongTagGraph();
    graph.nodes[0].data.tags = ["slow", "carb"];
    graph.nodes[0].data.measures = [{ amount: 30, unit: "g", unitNormalized: "g" }];
    const plan = buildGraphRepairPlan(graph, makeOvershootInput());
    const prev = plan.actions[0].payload.previousAmount as number;
    const next = plan.actions[0].payload.newAmount     as number;
    expect(next).toBeLessThan(prev);
  });

  it("overshoot → violationType = 'overshoot'", () => {
    const graph = makeWrongTagGraph();
    graph.nodes[0].data.tags = ["slow", "carb"];
    const plan = buildGraphRepairPlan(graph, makeOvershootInput());
    expect(plan.violationType).toBe("overshoot");
  });

  it("overshoot → minimalityScore = 0.9 (UPDATE_QUANTITY)", () => {
    const graph = makeWrongTagGraph();
    graph.nodes[0].data.tags = ["slow", "carb"];
    graph.nodes[0].data.measures = [{ amount: 30, unit: "g", unitNormalized: "g" }];
    const plan = buildGraphRepairPlan(graph, makeOvershootInput());
    expect(plan.estimatedMinimalityScore).toBe(0.9);
  });
});

/* =========================================================
   Section 4: Planner — window failure
   ========================================================= */

describe("Planner — window failure", () => {
  it("window failure → UPDATE_RELATION_OFFSET when edge found", () => {
    const graph = makeCarbGraph({ offsetMinutes: 120 });
    const plan  = buildGraphRepairPlan(graph, makeWindowFailureInput());
    expect(plan.actions[0].type).toBe("UPDATE_RELATION_OFFSET");
  });

  it("UPDATE_RELATION_OFFSET targets correct edge", () => {
    const graph = makeCarbGraph({ offsetMinutes: 120 });
    const plan  = buildGraphRepairPlan(graph, makeWindowFailureInput());
    expect(plan.actions[0].targetEdgeId).toBe("cge_rel_0");
  });

  it("UPDATE_RELATION_OFFSET newOffset < windowMinutes", () => {
    const graph = makeCarbGraph({ offsetMinutes: 120 });
    const plan  = buildGraphRepairPlan(graph, makeWindowFailureInput());
    const newOffset = plan.actions[0].payload.newOffsetAmount as number;
    expect(newOffset).toBeLessThan(90); // windowMinutes = 90
  });

  it("window failure → violationType = 'window_failure'", () => {
    const graph = makeCarbGraph({ offsetMinutes: 120 });
    const plan  = buildGraphRepairPlan(graph, makeWindowFailureInput());
    expect(plan.violationType).toBe("window_failure");
  });

  it("window failure UPDATE_RELATION_OFFSET → minimalityScore = 0.8", () => {
    const graph = makeCarbGraph({ offsetMinutes: 120 });
    const plan  = buildGraphRepairPlan(graph, makeWindowFailureInput());
    expect(plan.estimatedMinimalityScore).toBe(0.8);
  });
});

/* =========================================================
   Section 5: Planner — structural failure
   ========================================================= */

describe("Planner — structural failure", () => {
  it("structural failure → ADD_ENTITY", () => {
    const plan = buildGraphRepairPlan(makeWrongTagGraph(), makeStructuralFailureInput());
    expect(plan.actions[0].type).toBe("ADD_ENTITY");
  });

  it("structural failure → violationType = 'structural_failure'", () => {
    const plan = buildGraphRepairPlan(makeWrongTagGraph(), makeStructuralFailureInput());
    expect(plan.violationType).toBe("structural_failure");
  });

  it("structural ADD_ENTITY payload has correct tags", () => {
    const plan = buildGraphRepairPlan(makeWrongTagGraph(), makeStructuralFailureInput());
    expect(plan.actions[0].payload.tags).toEqual(["fast", "carb"]);
  });
});

/* =========================================================
   Section 6: Executor — UPDATE_QUANTITY
   ========================================================= */

describe("Executor — UPDATE_QUANTITY", () => {
  it("UPDATE_QUANTITY increases measure amount in repaired graph", () => {
    const graph = makeCarbGraph({ amount: 40 });
    const plan  = buildGraphRepairPlan(graph, makeUndershootInput({ amount: 40 }));
    const result = applyGraphRepairPlan(graph, plan);
    const node = result.repairedGraph.nodes.find((n) => n.id === "cgn_me_0")!;
    const measures = node.data.measures as Array<{ amount: number; unit: string }>;
    expect(measures[0].amount).toBe(60);
  });

  it("UPDATE_QUANTITY does not mutate the original graph", () => {
    const graph = makeCarbGraph({ amount: 40 });
    const plan  = buildGraphRepairPlan(graph, makeUndershootInput({ amount: 40 }));
    applyGraphRepairPlan(graph, plan);
    const original = graph.nodes.find((n) => n.id === "cgn_me_0")!;
    const measures = original.data.measures as Array<{ amount: number }>;
    expect(measures[0].amount).toBe(40); // unchanged
  });

  it("UPDATE_QUANTITY changeLog has entry", () => {
    const graph = makeCarbGraph({ amount: 40 });
    const plan  = buildGraphRepairPlan(graph, makeUndershootInput({ amount: 40 }));
    const result = applyGraphRepairPlan(graph, plan);
    expect(result.changeLog.some((l) => l.includes("40g") && l.includes("60g"))).toBe(true);
  });

  it("UPDATE_QUANTITY applied action IDs contains the action", () => {
    const graph = makeCarbGraph({ amount: 40 });
    const plan  = buildGraphRepairPlan(graph, makeUndershootInput({ amount: 40 }));
    const result = applyGraphRepairPlan(graph, plan);
    expect(result.appliedActionIds).toContain(plan.actions[0].id);
  });
});

/* =========================================================
   Section 7: Executor — ADD_ENTITY
   ========================================================= */

describe("Executor — ADD_ENTITY", () => {
  it("ADD_ENTITY adds a new node to the repaired graph", () => {
    const emptyGraph: CanonicalGraph = { nodes: [{ id: "cgn_anc_0", kind: "anchor", label: "lifting", data: {} }], edges: [] };
    const plan = buildGraphRepairPlan(emptyGraph, makeUndershootInput({ amount: 0 }));
    const result = applyGraphRepairPlan(emptyGraph, plan);
    expect(result.repairedGraph.nodes.length).toBeGreaterThan(emptyGraph.nodes.length);
  });

  it("ADD_ENTITY new node has correct tags", () => {
    const emptyGraph: CanonicalGraph = { nodes: [{ id: "cgn_anc_0", kind: "anchor", label: "lifting", data: {} }], edges: [] };
    const plan = buildGraphRepairPlan(emptyGraph, makeUndershootInput({ amount: 0 }));
    const result = applyGraphRepairPlan(emptyGraph, plan);
    const added = result.repairedGraph.nodes.find((n) => n.id.startsWith("cgn_repair_"))!;
    expect(added).toBeDefined();
    const tags = added.data.tags as string[];
    expect(tags).toContain("fast");
    expect(tags).toContain("carb");
  });

  it("ADD_ENTITY with anchorLabel also adds an edge", () => {
    const emptyGraph: CanonicalGraph = { nodes: [{ id: "cgn_anc_0", kind: "anchor", label: "lifting", data: {} }], edges: [] };
    const plan = buildGraphRepairPlan(emptyGraph, makeUndershootInput({ amount: 0 }));
    const result = applyGraphRepairPlan(emptyGraph, plan);
    expect(result.repairedGraph.edges.length).toBeGreaterThan(0);
  });

  it("ADD_ENTITY edge has kind='before'", () => {
    const emptyGraph: CanonicalGraph = { nodes: [{ id: "cgn_anc_0", kind: "anchor", label: "lifting", data: {} }], edges: [] };
    const plan = buildGraphRepairPlan(emptyGraph, makeUndershootInput({ amount: 0 }));
    const result = applyGraphRepairPlan(emptyGraph, plan);
    const edge = result.repairedGraph.edges[0];
    expect(edge.kind).toBe("before");
  });
});

/* =========================================================
   Section 8: Executor — UPDATE_RELATION_OFFSET
   ========================================================= */

describe("Executor — UPDATE_RELATION_OFFSET", () => {
  it("UPDATE_RELATION_OFFSET changes edge offset amount", () => {
    const graph  = makeCarbGraph({ offsetMinutes: 120 });
    const plan   = buildGraphRepairPlan(graph, makeWindowFailureInput());
    const result = applyGraphRepairPlan(graph, plan);
    const edge   = result.repairedGraph.edges.find((e) => e.id === "cge_rel_0")!;
    const offset = edge.data.offset as { amount: number };
    expect(offset.amount).toBeLessThan(120);
  });

  it("UPDATE_RELATION_OFFSET does not mutate original edge", () => {
    const graph  = makeCarbGraph({ offsetMinutes: 120 });
    const plan   = buildGraphRepairPlan(graph, makeWindowFailureInput());
    applyGraphRepairPlan(graph, plan);
    const origEdge = graph.edges.find((e) => e.id === "cge_rel_0")!;
    const offset   = origEdge.data.offset as { amount: number };
    expect(offset.amount).toBe(120); // unchanged
  });

  it("UPDATE_RELATION_OFFSET appears in changeLog", () => {
    const graph  = makeCarbGraph({ offsetMinutes: 120 });
    const plan   = buildGraphRepairPlan(graph, makeWindowFailureInput());
    const result = applyGraphRepairPlan(graph, plan);
    expect(result.changeLog.some((l) => l.includes("120min"))).toBe(true);
  });

  it("UPDATE_RELATION_OFFSET on missing edge → skipped", () => {
    const graph = makeCarbGraph({ offsetMinutes: 120 });
    const plan  = buildGraphRepairPlan(graph, makeWindowFailureInput());
    // Corrupt the edge ID in the plan
    plan.actions[0].targetEdgeId = "NONEXISTENT_EDGE";
    const result = applyGraphRepairPlan(graph, plan);
    expect(result.skippedActionIds).toContain(plan.actions[0].id);
  });
});

/* =========================================================
   Section 9: Executor — REMOVE_ENTITY
   ========================================================= */

describe("Executor — REMOVE_ENTITY", () => {
  it("REMOVE_ENTITY removes node and incident edges", () => {
    const graph = makeCarbGraph();
    const plan  = buildGraphRepairPlan(graph, makeOvershootInput());
    // Manually override the action to test REMOVE_ENTITY directly
    plan.actions[0] = {
      id:           plan.actions[0].id,
      type:         "REMOVE_ENTITY",
      targetNodeId: "cgn_me_0",
      targetEdgeId: null,
      payload:      { label: "cyclic dextrin" },
      rationale:    "test removal",
    };
    const result = applyGraphRepairPlan(graph, plan);
    const nodeGone = result.repairedGraph.nodes.find((n) => n.id === "cgn_me_0");
    const edgeGone = result.repairedGraph.edges.find((e) => e.from === "cgn_me_0" || e.to === "cgn_me_0");
    expect(nodeGone).toBeUndefined();
    expect(edgeGone).toBeUndefined();
  });

  it("REMOVE_ENTITY on missing node → skipped", () => {
    const graph = makeCarbGraph();
    const plan  = buildGraphRepairPlan(graph, makeOvershootInput());
    plan.actions[0] = {
      id:           plan.actions[0].id,
      type:         "REMOVE_ENTITY",
      targetNodeId: "NONEXISTENT_NODE",
      targetEdgeId: null,
      payload:      { label: "ghost" },
      rationale:    "test skip",
    };
    const result = applyGraphRepairPlan(graph, plan);
    expect(result.skippedActionIds).toContain(plan.actions[0].id);
  });
});

/* =========================================================
   Section 10: Validation
   ========================================================= */

describe("Validation — restores feasibility", () => {
  it("reEvaluated is always true", () => {
    const graph  = makeCarbGraph({ amount: 40 });
    const plan   = buildGraphRepairPlan(graph, makeUndershootInput({ amount: 40 }));
    const exec   = applyGraphRepairPlan(graph, plan);
    const result = validateGraphRepairPlan({
      repairPlanId:       plan.id,
      targetConstraintId: "c_carb",
      constraintSet:      [carbSpec],
      originalGraph:      graph,
      repairedGraph:      exec.repairedGraph,
    });
    expect(result.reEvaluated).toBe(true);
  });

  it("restoredFeasibility=true after UPDATE_QUANTITY fixes undershoot", () => {
    const graph  = makeCarbGraph({ amount: 40 });
    const plan   = buildGraphRepairPlan(graph, makeUndershootInput({ amount: 40 }));
    const exec   = applyGraphRepairPlan(graph, plan);
    const result = validateGraphRepairPlan({
      repairPlanId:       plan.id,
      targetConstraintId: "c_carb",
      constraintSet:      [carbSpec],
      originalGraph:      graph,
      repairedGraph:      exec.repairedGraph,
    });
    expect(result.restoredFeasibility).toBe(true);
  });

  it("summaryLines is non-empty", () => {
    const graph  = makeCarbGraph({ amount: 40 });
    const plan   = buildGraphRepairPlan(graph, makeUndershootInput({ amount: 40 }));
    const exec   = applyGraphRepairPlan(graph, plan);
    const result = validateGraphRepairPlan({
      repairPlanId:       plan.id,
      targetConstraintId: "c_carb",
      constraintSet:      [carbSpec],
      originalGraph:      graph,
      repairedGraph:      exec.repairedGraph,
    });
    expect(result.summaryLines.length).toBeGreaterThan(0);
  });

  it("summaryLines contains 'restored' when feasibility restored", () => {
    const graph  = makeCarbGraph({ amount: 40 });
    const plan   = buildGraphRepairPlan(graph, makeUndershootInput({ amount: 40 }));
    const exec   = applyGraphRepairPlan(graph, plan);
    const result = validateGraphRepairPlan({
      repairPlanId:       plan.id,
      targetConstraintId: "c_carb",
      constraintSet:      [carbSpec],
      originalGraph:      graph,
      repairedGraph:      exec.repairedGraph,
    });
    const allText = result.summaryLines.join(" ");
    expect(allText).toContain("restored");
  });

  it("newViolations empty when repair introduces no side effects", () => {
    const graph  = makeCarbGraph({ amount: 40 });
    const plan   = buildGraphRepairPlan(graph, makeUndershootInput({ amount: 40 }));
    const exec   = applyGraphRepairPlan(graph, plan);
    const result = validateGraphRepairPlan({
      repairPlanId:       plan.id,
      targetConstraintId: "c_carb",
      constraintSet:      [carbSpec],
      originalGraph:      graph,
      repairedGraph:      exec.repairedGraph,
    });
    expect(result.newViolations).toHaveLength(0);
  });

  it("remainingViolations empty when all constraints pass after repair", () => {
    const graph  = makeCarbGraph({ amount: 40 });
    const plan   = buildGraphRepairPlan(graph, makeUndershootInput({ amount: 40 }));
    const exec   = applyGraphRepairPlan(graph, plan);
    const result = validateGraphRepairPlan({
      repairPlanId:       plan.id,
      targetConstraintId: "c_carb",
      constraintSet:      [carbSpec],
      originalGraph:      graph,
      repairedGraph:      exec.repairedGraph,
    });
    expect(result.remainingViolations).toHaveLength(0);
  });

  it("restoredFeasibility=true after UPDATE_RELATION_OFFSET fixes window failure", () => {
    const graph  = makeCarbGraph({ amount: 80, offsetMinutes: 120 });
    const plan   = buildGraphRepairPlan(graph, makeWindowFailureInput());
    const exec   = applyGraphRepairPlan(graph, plan);
    const result = validateGraphRepairPlan({
      repairPlanId:       plan.id,
      targetConstraintId: "c_carb",
      constraintSet:      [carbSpec],
      originalGraph:      graph,
      repairedGraph:      exec.repairedGraph,
    });
    expect(result.restoredFeasibility).toBe(true);
  });
});
