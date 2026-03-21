/**
 * relation_binder_test.ts
 *
 * Tests for the NOMOS measurement-and-relation grammar layer.
 *
 * Coverage:
 *   B — Binding: the 8 required examples from the spec
 *   M — Multi-entity: multiple bindings in one string
 *   U — Unit registry: new units (distance, extended time, count)
 *   A — Anchor: known vs open-vocabulary anchors
 *   E — Edge cases: no relation, bare quantity, open-vocabulary noun
 */

import { describe, it, expect, beforeEach } from "vitest";
import { bindRelations }              from "../compiler/relation_binder.ts";
import { extractMeasuredEntities, resetEntityCounter }
  from "../compiler/measured_entity_extractor.ts";
import { findRelationMatches }        from "../compiler/relation_lexicon.ts";

/* ─────────────────────────────────────────────────────────────────────────────
   B — Required binding examples
   ───────────────────────────────────────────────────────────────────────────── */

describe("bindRelations — required examples", () => {

  it("(B1) 80g cyclic dextrin 30 minutes before lifting", () => {
    const { entities, bindings, anchors } = bindRelations(
      "80g cyclic dextrin 30 minutes before lifting"
    );

    // Two entities extracted
    expect(entities.length).toBeGreaterThanOrEqual(2);

    const dextrin = entities.find((e) => e.label === "cyclic dextrin");
    const offset  = entities.find((e) => e.normalizedUnit === "min");
    expect(dextrin).toBeDefined();
    expect(dextrin!.amount).toBe(80);
    expect(dextrin!.normalizedUnit).toBe("g");

    expect(offset).toBeDefined();
    expect(offset!.amount).toBe(30);

    // One binding: dextrin before lifting, offset = 30 min
    expect(bindings.length).toBeGreaterThanOrEqual(1);
    const b = bindings[0];
    expect(b.relation).toBe("before");
    expect(b.subjectId).toBe(dextrin!.id);
    expect(b.offsetAmount).toBe(30);
    expect(b.offsetUnit).toBe("min");
    expect(b.objectIsAnchor).toBe(true);

    const anchor = anchors.find((a) => a.id === b.objectId);
    expect(anchor).toBeDefined();
    expect(anchor!.label).toMatch(/lifting/i);
  });

  it("(B2) 5mg melatonin 2 hours before bed", () => {
    const { entities, bindings, anchors } = bindRelations(
      "5mg melatonin 2 hours before bed"
    );

    const melatonin = entities.find((e) => e.label === "melatonin");
    expect(melatonin).toBeDefined();
    expect(melatonin!.amount).toBe(5);
    expect(melatonin!.normalizedUnit).toBe("mg");

    expect(bindings.length).toBeGreaterThanOrEqual(1);
    const b = bindings[0];
    expect(b.relation).toBe("before");
    expect(b.subjectId).toBe(melatonin!.id);
    expect(b.offsetAmount).toBe(2);
    expect(b.offsetUnit).toBe("hr");
    expect(b.objectIsAnchor).toBe(true);

    const anchor = anchors.find((a) => a.id === b.objectId);
    expect(anchor!.label).toMatch(/bed|sleep/i);
  });

  it("(B3) 3 miles after work", () => {
    const { entities, bindings, anchors } = bindRelations("3 miles after work");

    const milesEntity = entities.find((e) => e.normalizedUnit === "mi");
    expect(milesEntity).toBeDefined();
    expect(milesEntity!.amount).toBe(3);

    expect(bindings.length).toBeGreaterThanOrEqual(1);
    const b = bindings[0];
    expect(b.relation).toBe("after");
    expect(b.subjectId).toBe(milesEntity!.id);
    expect(b.offsetAmount).toBeNull();    // no time offset, just entity → after → anchor
    expect(b.objectIsAnchor).toBe(true);

    const anchor = anchors.find((a) => a.id === b.objectId);
    expect(anchor!.label).toMatch(/work/i);
  });

  it("(B4) 2 capsules magnesium with dinner", () => {
    const { entities, bindings, anchors } = bindRelations(
      "2 capsules magnesium with dinner"
    );

    const mag = entities.find((e) => e.label === "magnesium");
    expect(mag).toBeDefined();
    expect(mag!.amount).toBe(2);
    expect(mag!.normalizedUnit).toBe("capsule");

    expect(bindings.length).toBeGreaterThanOrEqual(1);
    const b = bindings[0];
    expect(b.relation).toBe("with");
    expect(b.subjectId).toBe(mag!.id);
    expect(b.objectIsAnchor).toBe(true);

    const anchor = anchors.find((a) => a.id === b.objectId);
    expect(anchor!.label).toMatch(/dinner/i);
  });

  it("(B5) 40 lb dumbbell for 12 reps", () => {
    const { entities, bindings } = bindRelations("40 lb dumbbell for 12 reps");

    const dumbbell = entities.find((e) => e.label === "dumbbell");
    const reps     = entities.find((e) => e.normalizedUnit === "rep");
    expect(dumbbell).toBeDefined();
    expect(reps).toBeDefined();
    expect(reps!.amount).toBe(12);

    expect(bindings.length).toBeGreaterThanOrEqual(1);
    const b = bindings[0];
    expect(b.relation).toBe("for");
    expect(b.subjectId).toBe(dumbbell!.id);
    expect(b.objectId).toBe(reps!.id);
    expect(b.objectIsAnchor).toBe(false);  // right side is a measured entity
    expect(b.offsetAmount).toBeNull();
  });

  it("(B6) 2 months after promotion", () => {
    const { entities, bindings, anchors } = bindRelations(
      "2 months after promotion"
    );

    const months = entities.find((e) => e.normalizedUnit === "mo");
    expect(months).toBeDefined();
    expect(months!.amount).toBe(2);

    expect(bindings.length).toBeGreaterThanOrEqual(1);
    const b = bindings[0];
    expect(b.relation).toBe("after");
    expect(b.subjectId).toBe(months!.id);
    expect(b.offsetAmount).toBeNull(); // single entity → subject only, no offset
    expect(b.objectIsAnchor).toBe(true);

    const anchor = anchors.find((a) => a.id === b.objectId);
    expect(anchor!.label).toMatch(/promotion/i);
  });

  it("(B7) 1 decade before the merger", () => {
    const { entities, bindings, anchors } = bindRelations(
      "1 decade before the merger"
    );

    const decade = entities.find((e) => e.normalizedUnit === "decade");
    expect(decade).toBeDefined();
    expect(decade!.amount).toBe(1);

    expect(bindings.length).toBeGreaterThanOrEqual(1);
    const b = bindings[0];
    expect(b.relation).toBe("before");
    expect(b.subjectId).toBe(decade!.id);
    expect(b.objectIsAnchor).toBe(true);

    const anchor = anchors.find((a) => a.id === b.objectId);
    // "the" is stripped → label = "merger"
    expect(anchor!.label).toMatch(/merger/i);
  });

  it("(B8) 3 meters from the wall", () => {
    const { entities, bindings, anchors } = bindRelations(
      "3 meters from the wall"
    );

    const metersEntity = entities.find((e) => e.normalizedUnit === "m");
    expect(metersEntity).toBeDefined();
    expect(metersEntity!.amount).toBe(3);
    expect(metersEntity!.unitCategory).toBe("distance");

    expect(bindings.length).toBeGreaterThanOrEqual(1);
    const b = bindings[0];
    expect(b.relation).toBe("from");
    expect(b.subjectId).toBe(metersEntity!.id);
    expect(b.objectIsAnchor).toBe(true);

    const anchor = anchors.find((a) => a.id === b.objectId);
    // "the" stripped → "wall"
    expect(anchor!.label).toMatch(/wall/i);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   M — Multi-binding strings
   ───────────────────────────────────────────────────────────────────────────── */

describe("bindRelations — multi-binding", () => {

  it("(M1) compound sentence with two relation clauses produces multiple bindings", () => {
    const text = "5g creatine 30 minutes before lifting and 2g post workout";
    const { bindings } = bindRelations(text);
    expect(bindings.length).toBeGreaterThanOrEqual(2);
  });

  it("(M2) stacked constraints: at least 60g carbs no more than 20g fat", () => {
    const text = "at least 60g carbs no more than 20g fat";
    const { entities, bindings } = bindRelations(text);
    // Two entities: 60g carbs, 20g fat
    expect(entities.some((e) => e.amount === 60)).toBe(true);
    expect(entities.some((e) => e.amount === 20)).toBe(true);
    // Two quantitative bindings
    expect(bindings.some((b) => b.relation === "at least")).toBe(true);
    expect(bindings.some((b) => b.relation === "no more than")).toBe(true);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   U — Unit registry: new categories
   ───────────────────────────────────────────────────────────────────────────── */

describe("extractMeasuredEntities — new unit categories", () => {
  beforeEach(() => resetEntityCounter());

  it("(U1) distance unit: 3 km → unitCategory=distance, normalizedUnit=km", () => {
    const [e] = extractMeasuredEntities("3 km");
    expect(e.unitCategory).toBe("distance");
    expect(e.normalizedUnit).toBe("km");
    expect(e.amount).toBe(3);
  });

  it("(U2) distance: 100 meters → normalizedUnit=m", () => {
    const [e] = extractMeasuredEntities("100 meters");
    expect(e.normalizedUnit).toBe("m");
    expect(e.unitCategory).toBe("distance");
  });

  it("(U3) distance: 26 miles → normalizedUnit=mi", () => {
    const [e] = extractMeasuredEntities("26 miles");
    expect(e.normalizedUnit).toBe("mi");
    expect(e.unitCategory).toBe("distance");
    expect(e.category).toBe("distance");
  });

  it("(U4) extended time: 2 weeks → normalizedUnit=wk", () => {
    const [e] = extractMeasuredEntities("2 weeks");
    expect(e.normalizedUnit).toBe("wk");
    expect(e.unitCategory).toBe("time");
  });

  it("(U5) extended time: 3 months → normalizedUnit=mo", () => {
    const [e] = extractMeasuredEntities("3 months");
    expect(e.normalizedUnit).toBe("mo");
    expect(e.unitCategory).toBe("time");
  });

  it("(U6) extended time: 1 decade → normalizedUnit=decade", () => {
    const [e] = extractMeasuredEntities("1 decade");
    expect(e.normalizedUnit).toBe("decade");
    expect(e.unitCategory).toBe("time");
  });

  it("(U7) extended time: 2 centuries → normalizedUnit=century", () => {
    const [e] = extractMeasuredEntities("2 centuries");
    expect(e.normalizedUnit).toBe("century");
  });

  it("(U8) extended time: 1 millennium → normalizedUnit=millennium", () => {
    const [e] = extractMeasuredEntities("1 millennium");
    expect(e.normalizedUnit).toBe("millennium");
  });

  it("(U9) mass: 500 mcg melatonin → normalizedUnit=mcg", () => {
    const [e] = extractMeasuredEntities("500 mcg melatonin");
    expect(e.normalizedUnit).toBe("mcg");
    expect(e.unitCategory).toBe("mass");
    expect(e.label).toBe("melatonin");
  });

  it("(U10) training: 20 laps pool → normalizedUnit=lap", () => {
    const [e] = extractMeasuredEntities("20 laps pool");
    expect(e.normalizedUnit).toBe("lap");
    expect(e.unitCategory).toBe("training");
  });

  it("(U11) training: 10000 steps daily → normalizedUnit=step", () => {
    const [e] = extractMeasuredEntities("10000 steps daily");
    expect(e.normalizedUnit).toBe("step");
    expect(e.unitCategory).toBe("training");
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   A — Anchor: known vs open-vocabulary
   ───────────────────────────────────────────────────────────────────────────── */

describe("bindRelations — anchor classification", () => {

  it("(A1) known anchor: 'lifting' is recognized", () => {
    const { anchors } = bindRelations("30 minutes before lifting");
    expect(anchors.length).toBeGreaterThanOrEqual(1);
    expect(anchors[0].isKnownAnchor).toBe(true);
    expect(anchors[0].label).toMatch(/lifting/i);
  });

  it("(A2) known anchor: 'dinner' is recognized", () => {
    const { anchors } = bindRelations("1 capsule with dinner");
    expect(anchors.length).toBeGreaterThanOrEqual(1);
    expect(anchors[0].isKnownAnchor).toBe(true);
    expect(anchors[0].label).toMatch(/dinner/i);
  });

  it("(A3) open-vocabulary anchor: 'wall' is not in registry but still captured", () => {
    const { anchors, bindings } = bindRelations("3 meters from the wall");
    expect(anchors.length).toBeGreaterThanOrEqual(1);
    const anchor = anchors.find((a) => /wall/i.test(a.label));
    expect(anchor).toBeDefined();
    expect(anchor!.isKnownAnchor).toBe(false);
    expect(bindings[0].objectId).toBe(anchor!.id);
  });

  it("(A4) open-vocabulary anchor: 'merger' is not in registry but still bound", () => {
    const { anchors, bindings } = bindRelations("1 decade before the merger");
    expect(bindings.length).toBeGreaterThanOrEqual(1);
    const anchor = anchors.find((a) => /merger/i.test(a.label));
    expect(anchor).toBeDefined();
    expect(anchor!.isKnownAnchor).toBe(false);
  });

});

/* ─────────────────────────────────────────────────────────────────────────────
   E — Edge cases
   ───────────────────────────────────────────────────────────────────────────── */

describe("bindRelations — edge cases", () => {

  it("(E1) no relation word → no bindings, entities still extracted", () => {
    const { entities, bindings } = bindRelations("80g cyclic dextrin 30g oats");
    expect(entities.length).toBeGreaterThanOrEqual(2);
    expect(bindings.length).toBe(0);
  });

  it("(E2) bare quantity with no label → moderate confidence", () => {
    resetEntityCounter();
    const [e] = extractMeasuredEntities("500ml");
    expect(e.label).toBe("");
    expect(e.confidence).toBe("moderate");
  });

  it("(E3) open-vocabulary odd noun: '9 grams wishes' → extracted, confidence=high", () => {
    resetEntityCounter();
    const [e] = extractMeasuredEntities("9 grams wishes");
    expect(e.label).toBe("wishes");
    expect(e.confidence).toBe("high");
    expect(e.category).toBe("unknown");
  });

  it("(E4) multi-word label stops before next quantity: '80g cyclic dextrin 30 minutes'", () => {
    resetEntityCounter();
    const entities = extractMeasuredEntities("80g cyclic dextrin 30 minutes");
    const dextrin = entities.find((e) => e.normalizedUnit === "g");
    expect(dextrin).toBeDefined();
    // Label must NOT bleed into "minutes"
    expect(dextrin!.label).toBe("cyclic dextrin");
    expect(dextrin!.label).not.toContain("minutes");
  });

  it("(E5) 'approximately' quantitative relation is detected", () => {
    const matches = findRelationMatches("approximately 200mg caffeine");
    expect(matches.some((m) => m.canonical === "approximately")).toBe(true);
  });

  it("(E6) 'in front of' multi-word spatial relation is detected as one match", () => {
    const matches = findRelationMatches("stand 2 meters in front of the stage");
    const inFront = matches.filter((m) => m.canonical === "in front of");
    expect(inFront.length).toBe(1);
  });

  it("(E7) relation category is propagated: 'before' is temporal", () => {
    const { bindings } = bindRelations("30 minutes before sleep");
    expect(bindings.length).toBeGreaterThanOrEqual(1);
    expect(bindings[0].relationCategory).toBe("temporal");
  });

  it("(E8) relation category: 'from' is spatial", () => {
    const { bindings } = bindRelations("3 meters from the wall");
    expect(bindings[0].relationCategory).toBe("spatial");
  });

});
