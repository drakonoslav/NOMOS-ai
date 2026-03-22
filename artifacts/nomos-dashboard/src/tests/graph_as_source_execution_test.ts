/**
 * graph_as_source_execution_test.ts
 *
 * Tests for the graph-as-source execution refactor.
 *
 * Verifies:
 *   1.  ExecutionTrace builders produce correct mode fields
 *   2.  resolveExecutionRoute selects the correct route deterministically
 *   3.  graph_first evaluator produces graph-native proof/diff/repair
 *   4.  Carb timing case runs graph_first end-to-end
 *   5.  Fallback evaluators record fallbackUsed=true
 *   6.  Route invariants: graph_first dominates when graph is present
 *   7.  graph_first and event_fallback agree on pass/fail for simple cases
 *
 * All tests are deterministic — no LLMs, no randomness.
 */

import { describe, it, expect } from "vitest";

import {
  buildGraphFirstTrace,
  buildEventFallbackTrace,
  buildTextFallbackTrace,
  buildExecutionTrace,
} from "../execution/execution_trace.ts";

import {
  resolveExecutionRoute,
  routeDisplayLabel,
  isGraphFirstRoute,
  isFallbackRoute,
} from "../execution/execution_router.ts";

import { evaluateGraphFirst }   from "../execution/graph_first_evaluator.ts";
import { evaluateEventFallback, evaluateTextFallback } from "../execution/fallback_evaluator.ts";

import type { CanonicalGraph }       from "../graph/canonical_graph_types.ts";
import type { GraphConstraintSpec }  from "../graph/graph_constraint_types.ts";
import type { ExecutionRoutingDecision } from "../execution/execution_route_types.ts";
import type { FallbackEvent }        from "../execution/fallback_evaluator.ts";

/* =========================================================
   Test fixtures
   ========================================================= */

/** Minimal CanonicalGraph with one entity + one anchor + a "before" edge */
function makeCarbTimingGraph(): CanonicalGraph {
  return {
    nodes: [
      {
        id:    "cgn_me_0",
        kind:  "entity",
        label: "cyclic dextrin",
        data: {
          tags:     ["fast", "carb"],
          measures: [{ amount: 80, unit: "g", unitNormalized: "g", dimension: "mass" }],
          category: "supplement",
          canonicalEntityId: "me_0",
        },
      },
      {
        id:    "cgn_anc_0",
        kind:  "anchor",
        label: "lifting",
        data:  {},
      },
    ],
    edges: [
      {
        id:   "cge_rel_0",
        kind: "before",
        from: "cgn_me_0",
        to:   "cgn_anc_0",
        data: {
          relationType: "BEFORE",
          provenance:   "registry",
          confidence:   0.95,
          offset:       { amount: 30, unit: "min", unitNormalized: "min", dimension: "time" },
        },
      },
    ],
  };
}

/** Minimal graph with NO entity nodes (empty) */
function makeEmptyGraph(): CanonicalGraph {
  return { nodes: [], edges: [] };
}

/** Standard carb timing constraint: fast carbs ≥60g within 90min before lifting */
const carbTimingConstraint: GraphConstraintSpec = {
  constraintId: "c_carb_timing",
  label:        "fast carbs before lifting",
  selection: {
    entityTags:   ["fast", "carb"],
    anchorLabel:  "lifting",
    relation:     "before",
    windowMinutes: 90,
  },
  aggregation: {
    quantityUnit: "g",
    aggregation:  "sum",
  },
  operator:  ">=",
  threshold: 60,
};

/** Identical constraint but threshold at 100g — should fail with 80g */
const carbTimingConstraintFail: GraphConstraintSpec = {
  ...carbTimingConstraint,
  constraintId: "c_carb_timing_fail",
  threshold:    100,
};

/** Dummy routing decision for graph_first */
const graphFirstDecision: ExecutionRoutingDecision = {
  route:                "graph_first",
  reason:               "canonical graph present with 1 entity node(s) and 1 edge(s)",
  hasCanonicalEntities: true,
  hasCanonicalRelations: true,
  hasCanonicalGraph:    true,
  fallbackAllowed:      false,
};

/** Dummy routing decision for event_fallback */
const eventFallbackDecision: ExecutionRoutingDecision = {
  route:                "event_fallback",
  reason:               "no canonical graph; 1 temporal event(s) available",
  hasCanonicalEntities: false,
  hasCanonicalRelations: false,
  hasCanonicalGraph:    false,
  fallbackAllowed:      true,
};

/** FallbackEvent equivalent of the carb timing graph */
const carbTimingEvent: FallbackEvent = {
  entityLabel:    "cyclic dextrin",
  amount:         80,
  unit:           "g",
  tags:           ["fast", "carb"],
  anchorLabel:    "lifting",
  offsetMinutes:  30,
};

/* =========================================================
   Section 1 — ExecutionTrace builders
   ========================================================= */

describe("ExecutionTrace builders", () => {
  it("buildGraphFirstTrace: route=graph_first, graphUsed=true, fallbackUsed=false", () => {
    const trace = buildGraphFirstTrace({
      routingReason: "test",
      constraintIds: ["c1"],
    });
    expect(trace.route).toBe("graph_first");
    expect(trace.graphUsed).toBe(true);
    expect(trace.fallbackUsed).toBe(false);
  });

  it("buildGraphFirstTrace: all proof/diff/repair modes are 'graph'", () => {
    const trace = buildGraphFirstTrace({ routingReason: "test", constraintIds: [] });
    expect(trace.proofMode).toBe("graph");
    expect(trace.diffMode).toBe("graph");
    expect(trace.repairMode).toBe("graph");
  });

  it("buildEventFallbackTrace: route=event_fallback, fallbackUsed=true, graphUsed=false", () => {
    const trace = buildEventFallbackTrace({
      routingReason: "test",
      constraintIds: ["c1"],
    });
    expect(trace.route).toBe("event_fallback");
    expect(trace.graphUsed).toBe(false);
    expect(trace.fallbackUsed).toBe(true);
  });

  it("buildEventFallbackTrace: all proof/diff/repair modes are 'event'", () => {
    const trace = buildEventFallbackTrace({ routingReason: "test", constraintIds: [] });
    expect(trace.proofMode).toBe("event");
    expect(trace.diffMode).toBe("event");
    expect(trace.repairMode).toBe("event");
  });

  it("buildTextFallbackTrace: route=text_fallback, fallbackUsed=true, graphUsed=false", () => {
    const trace = buildTextFallbackTrace({
      routingReason: "test",
      constraintIds: ["c1"],
    });
    expect(trace.route).toBe("text_fallback");
    expect(trace.graphUsed).toBe(false);
    expect(trace.fallbackUsed).toBe(true);
  });

  it("buildTextFallbackTrace: all proof/diff/repair modes are 'text'", () => {
    const trace = buildTextFallbackTrace({ routingReason: "test", constraintIds: [] });
    expect(trace.proofMode).toBe("text");
    expect(trace.diffMode).toBe("text");
    expect(trace.repairMode).toBe("text");
  });

  it("buildExecutionTrace with route=graph_first delegates correctly", () => {
    const trace = buildExecutionTrace({
      route:         "graph_first",
      routingReason: "test",
      constraintIds: ["c1"],
    });
    expect(trace.route).toBe("graph_first");
    expect(trace.proofMode).toBe("graph");
  });

  it("buildExecutionTrace with route=text_fallback delegates correctly", () => {
    const trace = buildExecutionTrace({
      route:         "text_fallback",
      routingReason: "test",
      constraintIds: ["c2"],
    });
    expect(trace.route).toBe("text_fallback");
    expect(trace.proofMode).toBe("text");
  });
});

/* =========================================================
   Section 2 — ExecutionRouter
   ========================================================= */

describe("ExecutionRouter — resolveExecutionRoute", () => {
  it("canonical graph present → graph_first", () => {
    const decision = resolveExecutionRoute({ canonicalGraph: makeCarbTimingGraph() });
    expect(decision.route).toBe("graph_first");
  });

  it("canonical graph present → hasCanonicalGraph=true", () => {
    const decision = resolveExecutionRoute({ canonicalGraph: makeCarbTimingGraph() });
    expect(decision.hasCanonicalGraph).toBe(true);
  });

  it("empty graph → not sufficient → falls to event_fallback when events present", () => {
    const decision = resolveExecutionRoute({
      canonicalGraph: makeEmptyGraph(),
      eventData:      [{ label: "test" }],
    });
    expect(decision.route).toBe("event_fallback");
  });

  it("no graph, event data present → event_fallback", () => {
    const decision = resolveExecutionRoute({
      canonicalGraph: null,
      eventData:      [{ label: "test" }],
    });
    expect(decision.route).toBe("event_fallback");
    expect(decision.hasCanonicalGraph).toBe(false);
  });

  it("no graph, no events, fallbackAllowed=true → text_fallback", () => {
    const decision = resolveExecutionRoute({
      canonicalGraph: null,
      eventData:      null,
      fallbackAllowed: true,
    });
    expect(decision.route).toBe("text_fallback");
  });

  it("no graph, no events, fallbackAllowed=false → throws", () => {
    expect(() =>
      resolveExecutionRoute({
        canonicalGraph:  null,
        eventData:       null,
        fallbackAllowed: false,
      })
    ).toThrow();
  });

  it("graph present + event data → still graph_first (graph takes priority)", () => {
    const decision = resolveExecutionRoute({
      canonicalGraph: makeCarbTimingGraph(),
      eventData:      [{ label: "test" }],
    });
    expect(decision.route).toBe("graph_first");
  });

  it("routeDisplayLabel returns correct strings for all routes", () => {
    expect(routeDisplayLabel("graph_first")).toBe("Graph-first execution");
    expect(routeDisplayLabel("event_fallback")).toBe("Event fallback");
    expect(routeDisplayLabel("text_fallback")).toBe("Text fallback");
  });

  it("isGraphFirstRoute and isFallbackRoute are mutually exclusive", () => {
    expect(isGraphFirstRoute("graph_first")).toBe(true);
    expect(isFallbackRoute("graph_first")).toBe(false);
    expect(isGraphFirstRoute("event_fallback")).toBe(false);
    expect(isFallbackRoute("event_fallback")).toBe(true);
    expect(isFallbackRoute("text_fallback")).toBe(true);
  });
});

/* =========================================================
   Section 3 — GraphFirstEvaluator
   ========================================================= */

describe("GraphFirstEvaluator", () => {
  it("carb timing case: 80g ≥ 60g → passes", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraint],
      routingDecision: graphFirstDecision,
    });
    expect(result.constraintResults[0].passed).toBe(true);
    expect(result.constraintResults[0].observedValue).toBe(80);
    expect(result.allPassed).toBe(true);
  });

  it("carb timing case: 80g < 100g → fails", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraintFail],
      routingDecision: graphFirstDecision,
    });
    expect(result.constraintResults[0].passed).toBe(false);
    expect(result.constraintResults[0].observedValue).toBe(80);
    expect(result.allPassed).toBe(false);
  });

  it("route in result is graph_first", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraint],
      routingDecision: graphFirstDecision,
    });
    expect(result.route).toBe("graph_first");
  });

  it("trace: graphUsed=true, fallbackUsed=false, proofMode='graph'", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraint],
      routingDecision: graphFirstDecision,
    });
    expect(result.trace.graphUsed).toBe(true);
    expect(result.trace.fallbackUsed).toBe(false);
    expect(result.trace.proofMode).toBe("graph");
    expect(result.trace.diffMode).toBe("graph");
    expect(result.trace.repairMode).toBe("graph");
  });

  it("proof trace has exactly 6 steps", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraint],
      routingDecision: graphFirstDecision,
    });
    const proof = result.constraintResults[0].proof;
    expect(proof.steps).toHaveLength(6);
  });

  it("proof step 1 is 'Candidate Selection'", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraint],
      routingDecision: graphFirstDecision,
    });
    expect(result.constraintResults[0].proof.steps[0].label).toBe("Candidate Selection");
  });

  it("proof step 4 is 'Window Restriction' with anchorNodeIds", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraint],
      routingDecision: graphFirstDecision,
    });
    const step4 = result.constraintResults[0].proof.steps[3];
    expect(step4.label).toBe("Window Restriction");
    expect(step4.anchorNodeIds).toHaveLength(1);
    expect(step4.anchorNodeIds![0]).toBe("cgn_anc_0");
  });

  it("proof: finalObservedValue matches observedValue in result", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraint],
      routingDecision: graphFirstDecision,
    });
    const cr    = result.constraintResults[0];
    expect(cr.proof.finalObservedValue).toBe(cr.observedValue);
  });

  it("proof: passed field matches result.passed", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraintFail],
      routingDecision: graphFirstDecision,
    });
    const cr = result.constraintResults[0];
    expect(cr.proof.passed).toBe(cr.passed);
  });

  it("diff when passing: alreadyPassing=true, deltaRequired=0", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraint],
      routingDecision: graphFirstDecision,
    });
    const diff = result.constraintResults[0].diff;
    expect(diff.alreadyPassing).toBe(true);
    expect(diff.deltaRequired).toBe(0);
  });

  it("diff when failing: deltaRequired=20, unit='g'", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraintFail],
      routingDecision: graphFirstDecision,
    });
    const diff = result.constraintResults[0].diff;
    expect(diff.alreadyPassing).toBe(false);
    expect(diff.deltaRequired).toBe(20);
    expect(diff.unit).toBe("g");
  });

  it("diff when failing: targetNodeIds contains selected entity node", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraintFail],
      routingDecision: graphFirstDecision,
    });
    const diff = result.constraintResults[0].diff;
    expect(diff.targetNodeIds).toContain("cgn_me_0");
  });

  it("repair when passing: alreadyPassing=true, suggestions=[]", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraint],
      routingDecision: graphFirstDecision,
    });
    const repair = result.constraintResults[0].repair;
    expect(repair.alreadyPassing).toBe(true);
    expect(repair.suggestions).toHaveLength(0);
  });

  it("repair when failing: at least one suggestion with kind='adjust_quantity_edge' or 'add_entity_node'", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraintFail],
      routingDecision: graphFirstDecision,
    });
    const repair = result.constraintResults[0].repair;
    expect(repair.alreadyPassing).toBe(false);
    expect(repair.suggestions.length).toBeGreaterThan(0);
    const kinds = repair.suggestions.map((s) => s.kind);
    const hasExpectedKind =
      kinds.includes("adjust_quantity_edge") || kinds.includes("add_entity_node");
    expect(hasExpectedKind).toBe(true);
  });

  it("repair: adjust_quantity_edge suggestion references entity node id", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraintFail],
      routingDecision: graphFirstDecision,
    });
    const repair = result.constraintResults[0].repair;
    const adj = repair.suggestions.find((s) => s.kind === "adjust_quantity_edge");
    expect(adj).toBeDefined();
    expect(adj!.targetNodeId).toBe("cgn_me_0");
  });

  it("multiple constraints: passCount + failCount === total", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraint, carbTimingConstraintFail],
      routingDecision: graphFirstDecision,
    });
    expect(result.passCount + result.failCount).toBe(2);
    expect(result.passCount).toBe(1);
    expect(result.failCount).toBe(1);
  });
});

/* =========================================================
   Section 4 — FallbackEvaluators
   ========================================================= */

describe("FallbackEvaluators", () => {
  it("event_fallback: 80g ≥ 60g → passes", () => {
    const result = evaluateEventFallback({
      constraints:     [carbTimingConstraint],
      events:          [carbTimingEvent],
      routingDecision: eventFallbackDecision,
    });
    expect(result.constraintResults[0].passed).toBe(true);
    expect(result.constraintResults[0].observedValue).toBe(80);
  });

  it("event_fallback: 80g < 100g → fails", () => {
    const result = evaluateEventFallback({
      constraints:     [carbTimingConstraintFail],
      events:          [carbTimingEvent],
      routingDecision: eventFallbackDecision,
    });
    expect(result.constraintResults[0].passed).toBe(false);
  });

  it("event_fallback: trace has fallbackUsed=true, graphUsed=false", () => {
    const result = evaluateEventFallback({
      constraints:     [carbTimingConstraint],
      events:          [carbTimingEvent],
      routingDecision: eventFallbackDecision,
    });
    expect(result.trace.fallbackUsed).toBe(true);
    expect(result.trace.graphUsed).toBe(false);
    expect(result.trace.proofMode).toBe("event");
  });

  it("event_fallback: route field on result is 'event_fallback'", () => {
    const result = evaluateEventFallback({
      constraints:     [carbTimingConstraint],
      events:          [carbTimingEvent],
      routingDecision: eventFallbackDecision,
    });
    expect(result.route).toBe("event_fallback");
  });

  it("text_fallback: all constraints pass=false", () => {
    const decision: ExecutionRoutingDecision = {
      route:                "text_fallback",
      reason:               "no graph; text_fallback explicitly allowed",
      hasCanonicalEntities: false,
      hasCanonicalRelations: false,
      hasCanonicalGraph:    false,
      fallbackAllowed:      true,
    };
    const result = evaluateTextFallback({
      constraints:     [carbTimingConstraint],
      rawText:         "80g cyclic dextrin 30 minutes before lifting",
      routingDecision: decision,
    });
    expect(result.constraintResults[0].passed).toBe(false);
    expect(result.allPassed).toBe(false);
  });

  it("text_fallback: trace has fallbackUsed=true, proofMode='text'", () => {
    const decision: ExecutionRoutingDecision = {
      route:                "text_fallback",
      reason:               "test",
      hasCanonicalEntities: false,
      hasCanonicalRelations: false,
      hasCanonicalGraph:    false,
      fallbackAllowed:      true,
    };
    const result = evaluateTextFallback({
      constraints:     [carbTimingConstraint],
      rawText:         "test",
      routingDecision: decision,
    });
    expect(result.trace.fallbackUsed).toBe(true);
    expect(result.trace.proofMode).toBe("text");
    expect(result.route).toBe("text_fallback");
  });
});

/* =========================================================
   Section 5 — Route invariants
   ========================================================= */

describe("Route invariants", () => {
  it("I2: canonical graph present → graph_first; text_fallback not taken silently", () => {
    const decision = resolveExecutionRoute({
      canonicalGraph: makeCarbTimingGraph(),
      fallbackAllowed: true,
    });
    expect(decision.route).toBe("graph_first");
  });

  it("I3: same carb timing input: graph_first and event_fallback agree on pass/fail", () => {
    const graphResult = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraint],
      routingDecision: graphFirstDecision,
    });
    const eventResult = evaluateEventFallback({
      constraints:     [carbTimingConstraint],
      events:          [carbTimingEvent],
      routingDecision: eventFallbackDecision,
    });
    expect(graphResult.constraintResults[0].passed).toBe(
      eventResult.constraintResults[0].passed
    );
  });

  it("I3: same carb timing fail case: graph_first and event_fallback agree on fail", () => {
    const graphResult = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraintFail],
      routingDecision: graphFirstDecision,
    });
    const eventResult = evaluateEventFallback({
      constraints:     [carbTimingConstraintFail],
      events:          [carbTimingEvent],
      routingDecision: eventFallbackDecision,
    });
    expect(graphResult.constraintResults[0].passed).toBe(false);
    expect(eventResult.constraintResults[0].passed).toBe(false);
    expect(graphResult.constraintResults[0].passed).toBe(
      eventResult.constraintResults[0].passed
    );
  });

  it("I1: graph_first → proof.steps are from graph substrate (step 4 has anchorNodeIds)", () => {
    const result = evaluateGraphFirst({
      graph:           makeCarbTimingGraph(),
      constraints:     [carbTimingConstraint],
      routingDecision: graphFirstDecision,
    });
    const step4 = result.constraintResults[0].proof.steps[3];
    expect(Array.isArray(step4.anchorNodeIds)).toBe(true);
    expect(step4.anchorNodeIds!.length).toBeGreaterThan(0);
  });

  it("router decision reason is non-empty string", () => {
    const decision = resolveExecutionRoute({ canonicalGraph: makeCarbTimingGraph() });
    expect(typeof decision.reason).toBe("string");
    expect(decision.reason.length).toBeGreaterThan(0);
  });
});
