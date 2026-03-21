/**
 * candidate_graph_test.ts
 *
 * Regression tests for candidate-local graph building.
 *
 * Coverage groups:
 *   CB  — CandidateBlock parser                     (10 tests)
 *   MC  — Multi-candidate graph structure            (14 tests)
 *   OW  — Candidate ownership / getCandidateEntities (10 tests)
 *   FB  — Single-candidate fallback                   (6 tests)
 *   OB  — Objective capture                           (6 tests)
 *   BM  — Bare measurement handling                   (6 tests)
 */

import { describe, it, expect } from "vitest";
import { buildRelationGraph, parseCandidateBlocks } from "../graph/relation_graph_builder.ts";
import { getCandidateEntities }                      from "../graph/graph_query_helpers.ts";

/* ─────────────────────────────────────────────────────────────────────────────
   Shared fixture: 4-candidate carb timing example
   ─────────────────────────────────────────────────────────────────────────────
   A — cyclic dextrin (fast carb)
   B — oats (slow carb)
   C — rice (moderate carb)
   D — bread (fast carb)
   ───────────────────────────────────────────────────────────────────────────── */

const FOUR_CANDIDATE_TEXT = `
CANDIDATES:
A: 80g cyclic dextrin 30 minutes before lifting
B: 60g oats 30 minutes before lifting
C: 40g rice 45 minutes before lifting
D: 30g bread 15 minutes before lifting
`.trim();

/* ─────────────────────────────────────────────────────────────────────────────
   CB — CandidateBlock parser
   ───────────────────────────────────────────────────────────────────────────── */

describe("parseCandidateBlocks", () => {

  it("(CB1) returns 4 blocks for 4 sub-labeled candidates", () => {
    const blocks = parseCandidateBlocks(FOUR_CANDIDATE_TEXT);
    expect(blocks).toHaveLength(4);
  });

  it("(CB2) candidate IDs are A, B, C, D in order", () => {
    const ids = parseCandidateBlocks(FOUR_CANDIDATE_TEXT).map((b) => b.candidateId);
    expect(ids).toEqual(["A", "B", "C", "D"]);
  });

  it("(CB3) block start/end offsets are strictly increasing", () => {
    const blocks = parseCandidateBlocks(FOUR_CANDIDATE_TEXT);
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].startOffset).toBeGreaterThan(blocks[i - 1].startOffset);
      expect(blocks[i - 1].endOffset).toBe(blocks[i].startOffset);
    }
  });

  it("(CB4) last block endOffset equals end of CANDIDATES body", () => {
    // No next section after CANDIDATES → endOffset must reach end of text
    const blocks = parseCandidateBlocks(FOUR_CANDIDATE_TEXT);
    const last   = blocks[blocks.length - 1];
    expect(last.endOffset).toBeLessThanOrEqual(FOUR_CANDIDATE_TEXT.length + 1);
    expect(last.endOffset).toBeGreaterThan(last.startOffset);
  });

  it("(CB5) each block's text contains the right entity noun", () => {
    const blocks = parseCandidateBlocks(FOUR_CANDIDATE_TEXT);
    const bodies = blocks.map((b) => FOUR_CANDIDATE_TEXT.slice(b.startOffset, b.endOffset));
    expect(bodies[0]).toContain("dextrin");
    expect(bodies[1]).toContain("oats");
    expect(bodies[2]).toContain("rice");
    expect(bodies[3]).toContain("bread");
  });

  it("(CB6) returns [] when there is no CANDIDATES header", () => {
    expect(parseCandidateBlocks("80g dextrin before lifting")).toHaveLength(0);
  });

  it("(CB7) returns [] when CANDIDATES has no sub-labels", () => {
    const text = "CANDIDATES:\n80g cyclic dextrin before lifting\n";
    expect(parseCandidateBlocks(text)).toHaveLength(0);
  });

  it("(CB8) does not match section headers like CONSTRAINTS as sub-labels", () => {
    const text = `
CANDIDATES:
A: 80g dextrin before lifting
B: 60g oats before lifting
CONSTRAINTS:
fast carb >= 60g
`.trim();
    const blocks = parseCandidateBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.candidateId)).toEqual(["A", "B"]);
  });

  it("(CB9) handles numeric sub-labels (1:, 2:, 3:)", () => {
    const text = `
CANDIDATES:
1: 80g dextrin before lifting
2: 60g oats before lifting
3: 40g rice before lifting
`.trim();
    const blocks = parseCandidateBlocks(text);
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.candidateId)).toEqual(["1", "2", "3"]);
  });

  it("(CB10) candidate block text does not leak across boundaries", () => {
    const blocks = parseCandidateBlocks(FOUR_CANDIDATE_TEXT);
    const aBody  = FOUR_CANDIDATE_TEXT.slice(blocks[0].startOffset, blocks[0].endOffset);
    expect(aBody).not.toContain("oats");
    expect(aBody).not.toContain("rice");
    expect(aBody).not.toContain("bread");
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   MC — Multi-candidate graph structure
   ───────────────────────────────────────────────────────────────────────────── */

describe("buildRelationGraph — multi-candidate structure", () => {

  it("(MC1) graph has exactly 4 candidate nodes", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(g.nodes.filter((n) => n.type === "candidate")).toHaveLength(4);
  });

  it("(MC2) candidate node labels are A, B, C, D", () => {
    const g      = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    const labels = g.nodes.filter((n) => n.type === "candidate").map((n) => n.label).sort();
    expect(labels).toEqual(["A", "B", "C", "D"]);
  });

  it("(MC3) each candidate node has data.candidateId matching its label", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    for (const node of g.nodes.filter((n) => n.type === "candidate")) {
      expect((node.data as Record<string, unknown>).candidateId).toBe(node.label);
    }
  });

  it("(MC4) there are exactly 4 BELONGS_TO_CANDIDATE edges (one entity per candidate)", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(g.edges.filter((e) => e.type === "BELONGS_TO_CANDIDATE")).toHaveLength(4);
  });

  it("(MC5) BELONGS_TO_CANDIDATE edges have no duplicate IDs", () => {
    const g   = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    const ids = g.edges.filter((e) => e.type === "BELONGS_TO_CANDIDATE").map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("(MC6) all edge IDs in the full graph are unique", () => {
    const g   = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    const ids = g.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("(MC7) all node IDs in the full graph are unique", () => {
    const g   = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    const ids = g.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("(MC8) dextrin entity node exists in the graph", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(g.nodes.some((n) => n.type === "entity" && n.label === "cyclic dextrin")).toBe(true);
  });

  it("(MC9) oats entity node exists in the graph", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(g.nodes.some((n) => n.type === "entity" && n.label === "oats")).toBe(true);
  });

  it("(MC10) rice entity node exists in the graph", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(g.nodes.some((n) => n.type === "entity" && n.label === "rice")).toBe(true);
  });

  it("(MC11) bread entity node exists in the graph", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(g.nodes.some((n) => n.type === "entity" && n.label === "bread")).toBe(true);
  });

  it("(MC12) BEFORE edge exists (temporal relation preserved)", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(g.edges.some((e) => e.type === "BEFORE")).toBe(true);
  });

  it("(MC13) ANCHORS_TO edge exists (window → anchor preserved)", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(g.edges.some((e) => e.type === "ANCHORS_TO")).toBe(true);
  });

  it("(MC14) window nodes exist for all 4 candidates", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(g.nodes.filter((n) => n.type === "window").length).toBeGreaterThanOrEqual(4);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   OW — Candidate ownership / getCandidateEntities
   ───────────────────────────────────────────────────────────────────────────── */

describe("getCandidateEntities — candidate ownership isolation", () => {

  it("(OW1) candidate A returns exactly 1 entity", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(getCandidateEntities(g, "A")).toHaveLength(1);
  });

  it("(OW2) candidate A entity is cyclic dextrin", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    const entities = getCandidateEntities(g, "A");
    expect(entities[0].label).toBe("cyclic dextrin");
  });

  it("(OW3) candidate B entity is oats", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(getCandidateEntities(g, "B")[0].label).toBe("oats");
  });

  it("(OW4) candidate C entity is rice", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(getCandidateEntities(g, "C")[0].label).toBe("rice");
  });

  it("(OW5) candidate D entity is bread", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(getCandidateEntities(g, "D")[0].label).toBe("bread");
  });

  it("(OW6) candidate A does not contain oats, rice, or bread", () => {
    const g      = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    const labels = getCandidateEntities(g, "A").map((n) => n.label);
    expect(labels).not.toContain("oats");
    expect(labels).not.toContain("rice");
    expect(labels).not.toContain("bread");
  });

  it("(OW7) candidate B does not contain dextrin, rice, or bread", () => {
    const g      = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    const labels = getCandidateEntities(g, "B").map((n) => n.label);
    expect(labels).not.toContain("cyclic dextrin");
    expect(labels).not.toContain("rice");
    expect(labels).not.toContain("bread");
  });

  it("(OW8) no-arg call returns all 4 entities across candidates", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(getCandidateEntities(g)).toHaveLength(4);
  });

  it("(OW9) lookup by graph node ID also works", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    const candidateNode = g.nodes.find(
      (n) => n.type === "candidate" && (n.data as Record<string, unknown>).candidateId === "A"
    )!;
    const byId = getCandidateEntities(g, candidateNode.id);
    expect(byId).toHaveLength(1);
    expect(byId[0].label).toBe("cyclic dextrin");
  });

  it("(OW10) unknown candidate label returns empty array", () => {
    const g = buildRelationGraph(FOUR_CANDIDATE_TEXT);
    expect(getCandidateEntities(g, "Z")).toHaveLength(0);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   FB — Single-candidate fallback
   ───────────────────────────────────────────────────────────────────────────── */

describe("buildRelationGraph — single-candidate fallback", () => {

  it("(FB1) CANDIDATES: with no sub-labels → exactly 1 candidate node", () => {
    const g = buildRelationGraph("CANDIDATES:\n80g cyclic dextrin before lifting\n");
    expect(g.nodes.filter((n) => n.type === "candidate")).toHaveLength(1);
  });

  it("(FB2) fallback candidate node has label 'candidates'", () => {
    const g = buildRelationGraph("CANDIDATES:\n80g cyclic dextrin before lifting\n");
    const cn = g.nodes.find((n) => n.type === "candidate")!;
    expect(cn.label).toBe("candidates");
  });

  it("(FB3) fallback wires candidate_item entity to single candidate node", () => {
    const g = buildRelationGraph("CANDIDATES:\n80g cyclic dextrin before lifting\n");
    expect(g.edges.filter((e) => e.type === "BELONGS_TO_CANDIDATE")).toHaveLength(1);
  });

  it("(FB4) getCandidateEntities with no args returns the entity in fallback mode", () => {
    const g = buildRelationGraph("CANDIDATES:\n80g cyclic dextrin before lifting\n");
    expect(getCandidateEntities(g)).toHaveLength(1);
  });

  it("(FB5) no CANDIDATES section → zero candidate nodes", () => {
    const g = buildRelationGraph("80g cyclic dextrin 30 minutes before lifting");
    expect(g.nodes.filter((n) => n.type === "candidate")).toHaveLength(0);
  });

  it("(FB6) all edge IDs unique in fallback mode", () => {
    const g   = buildRelationGraph("CANDIDATES:\n80g cyclic dextrin before lifting\n");
    const ids = g.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   OB — Objective capture
   ───────────────────────────────────────────────────────────────────────────── */

describe("buildRelationGraph — objective capture", () => {

  it("(OB1) single-line objective is captured", () => {
    const g = buildRelationGraph("OBJECTIVE:\nmaximize protein synthesis\n");
    const obj = g.nodes.find((n) => n.type === "objective");
    expect(obj).toBeDefined();
    expect(obj!.label).toContain("maximize protein synthesis");
  });

  it("(OB2) multi-line objective is captured in full (not truncated at first line)", () => {
    const text = "OBJECTIVE:\nmaximize protein synthesis\nwhile minimizing fat gain\n";
    const g    = buildRelationGraph(text);
    const obj  = g.nodes.find((n) => n.type === "objective")!;
    expect(obj.label).toContain("maximize protein synthesis");
    expect(obj.label).toContain("minimizing fat gain");
  });

  it("(OB3) objective is terminated by next section header, not by first newline", () => {
    const text = `OBJECTIVE:
maximize protein synthesis
while minimizing fat gain
CONSTRAINTS:
fast carb >= 60g`;
    const g   = buildRelationGraph(text);
    const obj = g.nodes.find((n) => n.type === "objective")!;
    // Objective body must not include the CONSTRAINTS section
    expect(obj.label).not.toContain("CONSTRAINTS");
    expect(obj.label).not.toContain("60g");
  });

  it("(OB4) objective node has data.fullText set", () => {
    const g   = buildRelationGraph("OBJECTIVE:\nmaximize recovery\n");
    const obj = g.nodes.find((n) => n.type === "objective")!;
    expect((obj.data as Record<string, unknown>).fullText).toBeTruthy();
  });

  it("(OB5) no OBJECTIVE section → no objective node", () => {
    const g = buildRelationGraph("80g dextrin before lifting");
    expect(g.nodes.filter((n) => n.type === "objective")).toHaveLength(0);
  });

  it("(OB6) objective label is trimmed and has no leading/trailing whitespace", () => {
    const g   = buildRelationGraph("OBJECTIVE:\n  maximize recovery  \n");
    const obj = g.nodes.find((n) => n.type === "objective")!;
    expect(obj.label).toBe(obj.label.trim());
    expect(obj.label).not.toMatch(/^\s/);
    expect(obj.label).not.toMatch(/\s$/);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   BM — Bare measurement handling
   ───────────────────────────────────────────────────────────────────────────── */

describe("buildRelationGraph — bare measurement handling", () => {

  it("(BM1) bare time offset ('30 minutes') does not produce an entity node", () => {
    // Pure offset text — no named entity
    const g = buildRelationGraph("30 minutes before lifting");
    expect(g.nodes.filter((n) => n.type === "entity")).toHaveLength(0);
  });

  it("(BM2) bare time offset produces a quantity node", () => {
    const g = buildRelationGraph("30 minutes before lifting");
    expect(g.nodes.filter((n) => n.type === "quantity")).toHaveLength(1);
  });

  it("(BM3) entity + bare offset → entity node is created for the named entity only", () => {
    const g = buildRelationGraph("80g cyclic dextrin 30 minutes before lifting");
    const entities = g.nodes.filter((n) => n.type === "entity");
    expect(entities).toHaveLength(1);
    expect(entities[0].label).toBe("cyclic dextrin");
  });

  it("(BM4) the window node captures the offset amount from the bare span", () => {
    const g = buildRelationGraph("80g cyclic dextrin 30 minutes before lifting");
    const window = g.nodes.find((n) => n.type === "window");
    expect(window).toBeDefined();
    expect((window!.data as Record<string, unknown>).offsetAmount).toBe(30);
  });

  it("(BM5) the window node captures the offset unit", () => {
    const g = buildRelationGraph("80g cyclic dextrin 30 minutes before lifting");
    const window = g.nodes.find((n) => n.type === "window");
    expect((window!.data as Record<string, unknown>).offsetUnit).toBeTruthy();
  });

  it("(BM6) two entities with different offsets produce two window nodes", () => {
    const g = buildRelationGraph(
      "80g dextrin 30 minutes before lifting and 20g oats 60 minutes before lifting"
    );
    expect(g.nodes.filter((n) => n.type === "window").length).toBeGreaterThanOrEqual(2);
  });

});
