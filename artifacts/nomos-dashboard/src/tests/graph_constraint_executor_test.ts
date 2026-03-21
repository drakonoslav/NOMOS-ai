/**
 * graph_constraint_executor_test.ts
 *
 * Tests for graph-native constraint execution.
 *
 * Test graphs are constructed directly (not via the full parse pipeline) so
 * that constraint logic can be validated independently of the parser.  This
 * makes failures easy to isolate.
 *
 * Coverage:
 *   CT — Carb-timing candidates A / B / C / D
 *   NM — No matching entities
 *   MQ — Multiple qualifying entities
 *   MX — Mixed fast/slow (both constraints evaluated)
 *   WW — Wrong-window exclusion
 *   QE — Query engine functions in isolation
 *   EX — Explanation lines format
 */

import { describe, it, expect } from "vitest";
import { executeGraphConstraint, executeGraphConstraintSet } from "../graph/graph_constraint_executor.ts";
import {
  selectCandidateEntities,
  filterEntitiesByTags,
  filterEntitiesByLabels,
  restrictEntitiesByAnchorWindow,
  aggregateSelectedQuantity,
  offsetToMinutes,
} from "../graph/graph_query_engine.ts";
import type { OperandGraph } from "../graph/operand_graph_types.ts";
import type { GraphConstraintSpec } from "../graph/graph_constraint_types.ts";

/* ─────────────────────────────────────────────────────────────────────────────
   Test graph builder
   ───────────────────────────────────────────────────────────────────────────── */

interface TestEntity {
  id:            string;
  label:         string;
  amount:        number;
  unit:          string; // canonical (e.g. "g")
  tags:          string[];
  windowMinutes?: number;
  anchorLabel?:  string;
}

/**
 * Build a minimal OperandGraph containing the given entities.
 * Each entity gets: entity node, quantity node, unit node, optional window + anchor.
 * The graph has no candidate nodes — entities are selected globally.
 */
function makeGraph(entities: TestEntity[]): OperandGraph {
  const nodes: OperandGraph["nodes"] = [];
  const edges: OperandGraph["edges"] = [];
  const anchorIndex = new Map<string, string>(); // anchorLabel → anchor node id
  let edgeN = 0;

  const nextEdgeId = () => `ge_${edgeN++}`;

  for (const ent of entities) {
    const eId = `e_${ent.id}`;
    const qId = `q_${ent.id}`;
    const uId = `u_${ent.id}`;

    nodes.push({
      id:    eId,
      type:  "entity",
      label: ent.label,
      data:  { tags: ent.tags, confidence: "high", category: "food" },
    });
    nodes.push({
      id:    qId,
      type:  "quantity",
      label: String(ent.amount),
      data:  { amount: ent.amount },
    });
    nodes.push({
      id:    uId,
      type:  "unit",
      label: ent.unit,
      data:  { normalizedUnit: ent.unit, category: "mass" },
    });

    edges.push({ id: nextEdgeId(), from: eId, to: qId, type: "HAS_QUANTITY" });
    edges.push({ id: nextEdgeId(), from: eId, to: uId, type: "HAS_UNIT" });

    // Window + anchor
    if (ent.anchorLabel != null && ent.windowMinutes != null) {
      let anchorId = anchorIndex.get(ent.anchorLabel);
      if (!anchorId) {
        anchorId = `a_${ent.anchorLabel}`;
        nodes.push({
          id:    anchorId,
          type:  "anchor",
          label: ent.anchorLabel,
          data:  { isKnownAnchor: true },
        });
        anchorIndex.set(ent.anchorLabel, anchorId);
      }

      const wId = `w_${ent.id}`;
      nodes.push({
        id:    wId,
        type:  "window",
        label: `${ent.windowMinutes}min before ${ent.anchorLabel}`,
        data:  {
          offsetAmount: ent.windowMinutes,
          offsetUnit:   "min",
          relation:     "before",
          anchorLabel:  ent.anchorLabel,
        },
      });

      edges.push({ id: nextEdgeId(), from: eId, to: wId,     type: "BEFORE" });
      edges.push({ id: nextEdgeId(), from: wId, to: anchorId, type: "ANCHORS_TO" });
    }
  }

  return { nodes, edges };
}

/**
 * Add a candidate node to a graph, wiring all existing entity nodes to it.
 */
function addCandidateNode(
  graph:       OperandGraph,
  candidateId: string,
  entityIds:   string[]
): OperandGraph {
  const candidateNodeId = `c_${candidateId}`;
  graph.nodes.push({
    id:    candidateNodeId,
    type:  "candidate",
    label: candidateId,
  });
  let edgeN = graph.edges.length;
  for (const eid of entityIds) {
    graph.edges.push({
      id:   `ge_cand_${edgeN++}`,
      from: eid,
      to:   candidateNodeId,
      type: "BELONGS_TO_CANDIDATE",
    });
  }
  return graph;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Shared constraint specs
   ───────────────────────────────────────────────────────────────────────────── */

const FAST_CARB_60G: GraphConstraintSpec = {
  constraintId: "C1",
  label:        "fast carb ≥ 60g within 90min before lifting",
  selection: {
    entityTags:    ["fast", "carb"],
    anchorLabel:   "lifting",
    relation:      "before",
    windowMinutes: 90,
  },
  aggregation: { quantityUnit: "g", aggregation: "sum" },
  operator:    ">=",
  threshold:   60,
};

const SLOW_CARB_MAX_20G: GraphConstraintSpec = {
  constraintId: "C2",
  label:        "slow carb ≤ 20g within 60min before lifting",
  selection: {
    entityTags:    ["slow", "carb"],
    anchorLabel:   "lifting",
    relation:      "before",
    windowMinutes: 60,
  },
  aggregation: { quantityUnit: "g", aggregation: "sum" },
  operator:    "<=",
  threshold:   20,
};

/* ─────────────────────────────────────────────────────────────────────────────
   CT — Carb-timing A/B/C/D
   ───────────────────────────────────────────────────────────────────────────── */

describe("Carb-timing candidate A (80g fast carb, 30min before lifting)", () => {
  const GRAPH_A = makeGraph([{
    id: "dextrin", label: "cyclic dextrin", amount: 80, unit: "g",
    tags: ["fast", "carb"], windowMinutes: 30, anchorLabel: "lifting",
  }]);

  it("(CT-A1) C1 passes: 80g fast carb >= 60g", () => {
    const r = executeGraphConstraint(GRAPH_A, FAST_CARB_60G);
    expect(r.passed).toBe(true);
    expect(r.observedValue).toBe(80);
  });

  it("(CT-A2) C2 passes: 0g slow carb <= 20g", () => {
    const r = executeGraphConstraint(GRAPH_A, SLOW_CARB_MAX_20G);
    expect(r.passed).toBe(true);
    expect(r.observedValue).toBe(0);
  });
});

describe("Carb-timing candidate B (30g slow oats + 45g slow rice, 30min)", () => {
  const GRAPH_B = makeGraph([
    { id: "oats", label: "oats", amount: 30, unit: "g",
      tags: ["slow", "carb"], windowMinutes: 30, anchorLabel: "lifting" },
    { id: "rice", label: "white rice", amount: 45, unit: "g",
      tags: ["slow", "carb"], windowMinutes: 30, anchorLabel: "lifting" },
  ]);

  it("(CT-B1) C1 fails: 0g fast carb < 60g", () => {
    const r = executeGraphConstraint(GRAPH_B, FAST_CARB_60G);
    expect(r.passed).toBe(false);
    expect(r.observedValue).toBe(0);
  });

  it("(CT-B2) C2 fails: 75g slow carb > 20g", () => {
    const r = executeGraphConstraint(GRAPH_B, SLOW_CARB_MAX_20G);
    expect(r.passed).toBe(false);
    expect(r.observedValue).toBe(75);
  });
});

describe("Carb-timing candidate C (60g dextrin + 15g fructose, fast carb, 45min)", () => {
  const GRAPH_C = makeGraph([
    { id: "dex",  label: "cyclic dextrin", amount: 60, unit: "g",
      tags: ["fast", "carb"], windowMinutes: 45, anchorLabel: "lifting" },
    { id: "fruc", label: "fructose",       amount: 15, unit: "g",
      tags: ["fast", "carb"], windowMinutes: 45, anchorLabel: "lifting" },
  ]);

  it("(CT-C1) C1 passes: 75g fast carb >= 60g", () => {
    const r = executeGraphConstraint(GRAPH_C, FAST_CARB_60G);
    expect(r.passed).toBe(true);
    expect(r.observedValue).toBe(75);
    expect(r.selectedNodeIds).toHaveLength(2);
  });

  it("(CT-C2) C2 passes: 0g slow carb <= 20g", () => {
    const r = executeGraphConstraint(GRAPH_C, SLOW_CARB_MAX_20G);
    expect(r.passed).toBe(true);
    expect(r.observedValue).toBe(0);
  });
});

describe("Carb-timing candidate D (40g fast carb but 120min before lifting — outside window)", () => {
  const GRAPH_D = makeGraph([{
    id: "dex2", label: "dextrin", amount: 40, unit: "g",
    tags: ["fast", "carb"], windowMinutes: 120, anchorLabel: "lifting",
  }]);

  it("(CT-D1) C1 fails: fast carb exists but 120min > 90min window → excluded", () => {
    const r = executeGraphConstraint(GRAPH_D, FAST_CARB_60G);
    expect(r.passed).toBe(false);
    expect(r.observedValue).toBe(0);
    expect(r.selectedNodeIds).toHaveLength(0);
  });

  it("(CT-D2) C2 passes: 0g slow carb <= 20g", () => {
    const r = executeGraphConstraint(GRAPH_D, SLOW_CARB_MAX_20G);
    expect(r.passed).toBe(true);
    expect(r.observedValue).toBe(0);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   NM — No matching entities
   ───────────────────────────────────────────────────────────────────────────── */

describe("No matching entities", () => {

  it("(NM1) graph with no entities → observedValue=0, failed", () => {
    const g = makeGraph([]);
    const r = executeGraphConstraint(g, FAST_CARB_60G);
    expect(r.passed).toBe(false);
    expect(r.observedValue).toBe(0);
    expect(r.selectedNodeIds).toHaveLength(0);
  });

  it("(NM2) entity exists but no matching tags → observedValue=0", () => {
    const g = makeGraph([{
      id: "prot", label: "whey protein", amount: 30, unit: "g",
      tags: ["protein"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const r = executeGraphConstraint(g, FAST_CARB_60G); // requires fast+carb
    expect(r.passed).toBe(false);
    expect(r.observedValue).toBe(0);
  });

  it("(NM3) entity has correct tags but wrong unit → observedValue=0", () => {
    const g = makeGraph([{
      id: "fluid", label: "glucose drink", amount: 500, unit: "ml",
      tags: ["fast", "carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const r = executeGraphConstraint(g, FAST_CARB_60G); // aggregates in grams
    expect(r.passed).toBe(false);
    expect(r.observedValue).toBe(0);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   MQ — Multiple qualifying entities
   ───────────────────────────────────────────────────────────────────────────── */

describe("Multiple qualifying entities", () => {

  it("(MQ1) three fast-carb entities all within window → sum is correct", () => {
    const g = makeGraph([
      { id: "a", label: "dextrin",  amount: 30, unit: "g",
        tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting" },
      { id: "b", label: "glucose",  amount: 25, unit: "g",
        tags: ["fast","carb"], windowMinutes: 60, anchorLabel: "lifting" },
      { id: "c", label: "fructose", amount: 20, unit: "g",
        tags: ["fast","carb"], windowMinutes: 90, anchorLabel: "lifting" },
    ]);
    const r = executeGraphConstraint(g, FAST_CARB_60G);
    expect(r.passed).toBe(true);
    expect(r.observedValue).toBe(75); // 30+25+20
    expect(r.selectedNodeIds).toHaveLength(3);
  });

  it("(MQ2) count aggregation returns number of qualifying entities", () => {
    const g = makeGraph([
      { id: "a", label: "dextrin", amount: 40, unit: "g",
        tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting" },
      { id: "b", label: "glucose", amount: 40, unit: "g",
        tags: ["fast","carb"], windowMinutes: 45, anchorLabel: "lifting" },
    ]);
    const spec: GraphConstraintSpec = {
      ...FAST_CARB_60G,
      constraintId: "count-test",
      aggregation:  { quantityUnit: "g", aggregation: "count" },
      operator:     ">=",
      threshold:    2,
    };
    const r = executeGraphConstraint(g, spec);
    expect(r.observedValue).toBe(2);
    expect(r.passed).toBe(true);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   MX — Mixed fast/slow entities
   ───────────────────────────────────────────────────────────────────────────── */

describe("Mixed fast/slow entities", () => {

  const MIXED_GRAPH = makeGraph([
    { id: "fast1", label: "cyclic dextrin", amount: 40, unit: "g",
      tags: ["fast", "carb"], windowMinutes: 60, anchorLabel: "lifting" },
    { id: "slow1", label: "oats",           amount: 30, unit: "g",
      tags: ["slow", "carb"], windowMinutes: 60, anchorLabel: "lifting" },
  ]);

  it("(MX1) C1 fails: 40g fast carb < 60g", () => {
    const r = executeGraphConstraint(MIXED_GRAPH, FAST_CARB_60G);
    expect(r.passed).toBe(false);
    expect(r.observedValue).toBe(40);
  });

  it("(MX2) C2 fails: 30g slow carb > 20g", () => {
    const r = executeGraphConstraint(MIXED_GRAPH, SLOW_CARB_MAX_20G);
    expect(r.passed).toBe(false);
    expect(r.observedValue).toBe(30);
  });

  it("(MX3) executeGraphConstraintSet returns result for each spec", () => {
    const results = executeGraphConstraintSet(MIXED_GRAPH, [FAST_CARB_60G, SLOW_CARB_MAX_20G]);
    expect(results).toHaveLength(2);
    expect(results[0].constraintId).toBe("C1");
    expect(results[1].constraintId).toBe("C2");
    expect(results[0].passed).toBe(false);
    expect(results[1].passed).toBe(false);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   WW — Wrong-window exclusion
   ───────────────────────────────────────────────────────────────────────────── */

describe("Window exclusion", () => {

  it("(WW1) entity outside 90min window is excluded; entity inside 90min passes", () => {
    const g = makeGraph([
      { id: "inside",  label: "dextrin", amount: 40, unit: "g",
        tags: ["fast","carb"], windowMinutes: 90,  anchorLabel: "lifting" }, // exactly at limit
      { id: "outside", label: "glucose", amount: 40, unit: "g",
        tags: ["fast","carb"], windowMinutes: 91,  anchorLabel: "lifting" }, // just over
    ]);
    const r = executeGraphConstraint(g, FAST_CARB_60G);
    // Only the 40g entity within 90min qualifies → total 40g → fail
    expect(r.selectedNodeIds).toHaveLength(1);
    expect(r.observedValue).toBe(40);
    expect(r.passed).toBe(false);
  });

  it("(WW2) entity is before the correct anchor but not within window → excluded", () => {
    const g = makeGraph([{
      id: "far", label: "dextrin", amount: 100, unit: "g",
      tags: ["fast","carb"], windowMinutes: 180, anchorLabel: "lifting",
    }]);
    const r = executeGraphConstraint(g, FAST_CARB_60G);
    expect(r.passed).toBe(false);
    expect(r.observedValue).toBe(0);
  });

  it("(WW3) entity targets different anchor → excluded", () => {
    const g = makeGraph([{
      id: "post", label: "dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "dinner", // not lifting
    }]);
    const r = executeGraphConstraint(g, FAST_CARB_60G);
    expect(r.passed).toBe(false);
    expect(r.observedValue).toBe(0);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   QE — Query engine functions in isolation
   ───────────────────────────────────────────────────────────────────────────── */

describe("Query engine isolation", () => {

  it("(QE1) offsetToMinutes: seconds → correct fraction", () => {
    expect(offsetToMinutes(120, "s")).toBeCloseTo(2);
  });

  it("(QE2) offsetToMinutes: hours → correct multiple", () => {
    expect(offsetToMinutes(2, "hr")).toBe(120);
  });

  it("(QE3) offsetToMinutes: days → correct multiple", () => {
    expect(offsetToMinutes(1, "d")).toBe(1440);
  });

  it("(QE4) filterEntitiesByTags: requires ALL tags present", () => {
    const g = makeGraph([
      { id: "a", label: "dextrin", amount: 80, unit: "g", tags: ["fast","carb"] },
      { id: "b", label: "oats",    amount: 30, unit: "g", tags: ["slow","carb"] },
    ]);
    const all = g.nodes.filter((n) => n.type === "entity").map((n) => n.id);
    const filtered = filterEntitiesByTags(g, all, ["fast", "carb"]);
    expect(filtered).toHaveLength(1);
    // Verify the surviving id maps to the dextrin entity node
    const survivingNode = g.nodes.find((n) => n.id === filtered[0]);
    expect(survivingNode?.label).toContain("dextrin");
  });

  it("(QE5) filterEntitiesByLabels: case-insensitive substring match", () => {
    const g = makeGraph([
      { id: "a", label: "cyclic dextrin", amount: 80, unit: "g", tags: [] },
      { id: "b", label: "oats",           amount: 30, unit: "g", tags: [] },
    ]);
    const all = g.nodes.filter((n) => n.type === "entity").map((n) => n.id);
    const filtered = filterEntitiesByLabels(g, all, ["dextrin"]);
    expect(filtered).toHaveLength(1);
  });

  it("(QE6) selectCandidateEntities: returns all quantified entities when no candidateId", () => {
    const g = makeGraph([
      { id: "a", label: "oats", amount: 30, unit: "g", tags: [] },
      { id: "b", label: "rice", amount: 45, unit: "g", tags: [] },
    ]);
    const selected = selectCandidateEntities(g, null);
    expect(selected).toHaveLength(2);
  });

  it("(QE7) aggregateSelectedQuantity: max aggregation", () => {
    const g = makeGraph([
      { id: "a", label: "a", amount: 30, unit: "g", tags: [] },
      { id: "b", label: "b", amount: 70, unit: "g", tags: [] },
    ]);
    const ids = g.nodes.filter((n) => n.type === "entity").map((n) => n.id);
    expect(aggregateSelectedQuantity(g, ids, "g", "max")).toBe(70);
  });

  it("(QE8) aggregateSelectedQuantity: min aggregation", () => {
    const g = makeGraph([
      { id: "a", label: "a", amount: 30, unit: "g", tags: [] },
      { id: "b", label: "b", amount: 70, unit: "g", tags: [] },
    ]);
    const ids = g.nodes.filter((n) => n.type === "entity").map((n) => n.id);
    expect(aggregateSelectedQuantity(g, ids, "g", "min")).toBe(30);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   EX — Explanation lines
   ───────────────────────────────────────────────────────────────────────────── */

describe("Explanation lines", () => {

  it("(EX1) lines describe each pipeline step in order", () => {
    const g = makeGraph([{
      id: "dex", label: "cyclic dextrin", amount: 80, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const r = executeGraphConstraint(g, FAST_CARB_60G);

    expect(r.explanationLines.length).toBeGreaterThanOrEqual(4);
    // First line: selection
    expect(r.explanationLines[0]).toMatch(/selected/i);
    // Line containing tag filter
    expect(r.explanationLines.some((l) => /fast.*carb/i.test(l))).toBe(true);
    // Line containing window restriction
    expect(r.explanationLines.some((l) => /90min.*before.*lifting/i.test(l))).toBe(true);
    // Line containing aggregate
    expect(r.explanationLines.some((l) => /aggregated.*sum.*80/i.test(l))).toBe(true);
    // Final comparison line
    const last = r.explanationLines[r.explanationLines.length - 1];
    expect(last).toMatch(/80\s*>=\s*60/);
    expect(last).toMatch(/pass/i);
  });

  it("(EX2) fail result shows → fail in final explanation line", () => {
    const g = makeGraph([{
      id: "tiny", label: "oats", amount: 10, unit: "g",
      tags: ["fast","carb"], windowMinutes: 30, anchorLabel: "lifting",
    }]);
    const r = executeGraphConstraint(g, FAST_CARB_60G);
    expect(r.passed).toBe(false);
    const last = r.explanationLines[r.explanationLines.length - 1];
    expect(last).toMatch(/fail/i);
  });

});
