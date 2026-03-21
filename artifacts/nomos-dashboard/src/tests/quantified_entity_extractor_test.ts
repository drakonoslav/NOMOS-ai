/**
 * quantified_entity_extractor_test.ts
 *
 * Regression suite for the quantified entity extraction layer.
 *
 * Coverage:
 *   N — Nutrition examples
 *   S — Supplement examples
 *   T — Training load examples
 *   D — Duration examples
 *   R — Robustness (malformed but quantity-bearing)
 *   M — Multi-entity candidate strings
 *   C — Category inference
 *   O — Role inference (section-based)
 */

import { describe, it, expect } from "vitest";
import { extractQuantifiedEntities } from "../compiler/quantified_entity_extractor";

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function firstOf(
  entities: ReturnType<typeof extractQuantifiedEntities>,
  label?: string
) {
  if (label) {
    return entities.find(
      (e) =>
        e.entityLabel.includes(label.toLowerCase()) ||
        e.normalizedText.includes(label.toLowerCase())
    );
  }
  return entities[0];
}

/* ═══════════════════════════════════════════════════════════════════════════════
   N — Nutrition examples
   ═══════════════════════════════════════════════════════════════════════════════ */

describe("extractQuantifiedEntities — nutrition examples", () => {
  it("(N1) 30g oats: amount=30, unit=g, label=oats, category=food", () => {
    const [e] = extractQuantifiedEntities("30g oats");
    expect(e).toBeDefined();
    expect(e.amount).toBe(30);
    expect(e.normalizedUnit).toBe("g");
    expect(e.entityLabel).toBe("oats");
    expect(e.category).toBe("food");
    expect(e.confidence).toBe("high");
  });

  it("(N2) 80g cyclic dextrin: amount=80, label=cyclic dextrin, category=food", () => {
    const [e] = extractQuantifiedEntities("80g cyclic dextrin");
    expect(e).toBeDefined();
    expect(e.amount).toBe(80);
    expect(e.normalizedUnit).toBe("g");
    expect(e.entityLabel).toBe("cyclic dextrin");
    expect(e.category).toBe("food");
  });

  it("(N3) 1 banana: amount=1, unit=banana, label=banana, category=countable_item", () => {
    const [e] = extractQuantifiedEntities("1 banana");
    expect(e).toBeDefined();
    expect(e.amount).toBe(1);
    expect(e.entityLabel).toBe("banana");
    expect(e.category).toBe("countable_item");
  });

  it("(N4) 2 eggs: amount=2, label=egg, category=countable_item", () => {
    const [e] = extractQuantifiedEntities("2 eggs");
    expect(e).toBeDefined();
    expect(e.amount).toBe(2);
    expect(e.category).toBe("countable_item");
  });

  it("(N5) 1 container yogurt: amount=1, unit=container, label=yogurt", () => {
    const [e] = extractQuantifiedEntities("1 container yogurt");
    expect(e).toBeDefined();
    expect(e.amount).toBe(1);
    expect(e.normalizedUnit).toBe("container");
    expect(e.entityLabel).toBe("yogurt");
  });

  it("(N6) 500 mL water: amount=500, normalizedUnit=ml, label=water, category=fluid", () => {
    const [e] = extractQuantifiedEntities("500 mL water");
    expect(e).toBeDefined();
    expect(e.amount).toBe(500);
    expect(e.normalizedUnit).toBe("ml");
    expect(e.entityLabel).toBe("water");
    expect(e.category).toBe("fluid");
  });

  it("(N7) grams surface form normalizes: '30 grams oats' → normalizedUnit=g", () => {
    const [e] = extractQuantifiedEntities("30 grams oats");
    expect(e).toBeDefined();
    expect(e.normalizedUnit).toBe("g");
    expect(e.entityLabel).toBe("oats");
  });

  it("(N8) decimal amounts: 37.5g protein powder", () => {
    const [e] = extractQuantifiedEntities("37.5g protein powder");
    expect(e).toBeDefined();
    expect(e.amount).toBe(37.5);
    expect(e.entityLabel).toBe("protein powder");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   S — Supplement examples
   ═══════════════════════════════════════════════════════════════════════════════ */

describe("extractQuantifiedEntities — supplement examples", () => {
  it("(S1) 2 capsules magnesium: amount=2, label=magnesium, category=supplement", () => {
    const [e] = extractQuantifiedEntities("2 capsules magnesium");
    expect(e).toBeDefined();
    expect(e.amount).toBe(2);
    expect(e.normalizedUnit).toBe("capsule");
    expect(e.entityLabel).toBe("magnesium");
    expect(e.category).toBe("supplement");
  });

  it("(S2) 5g creatine: amount=5, label=creatine, category=supplement", () => {
    const [e] = extractQuantifiedEntities("5g creatine");
    expect(e).toBeDefined();
    expect(e.amount).toBe(5);
    expect(e.entityLabel).toBe("creatine");
    expect(e.category).toBe("supplement");
  });

  it("(S3) 200mg caffeine: amount=200, normalizedUnit=mg, label=caffeine, category=supplement", () => {
    const [e] = extractQuantifiedEntities("200mg caffeine");
    expect(e).toBeDefined();
    expect(e.amount).toBe(200);
    expect(e.normalizedUnit).toBe("mg");
    expect(e.entityLabel).toBe("caffeine");
    expect(e.category).toBe("supplement");
  });

  it("(S4) 2 tablets vitamin D3: amount=2, category=supplement or countable_item", () => {
    const [e] = extractQuantifiedEntities("2 tablets vitamin D3");
    expect(e).toBeDefined();
    expect(e.amount).toBe(2);
    expect(e.normalizedUnit).toBe("tablet");
    expect(e.entityLabel).toContain("vitamin");
  });

  it("(S5) 1 scoop pre-workout: amount=1, unit=scoop", () => {
    const [e] = extractQuantifiedEntities("1 scoop pre-workout");
    expect(e).toBeDefined();
    expect(e.amount).toBe(1);
    expect(e.normalizedUnit).toBe("scoop");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   T — Training load examples
   ═══════════════════════════════════════════════════════════════════════════════ */

describe("extractQuantifiedEntities — training load examples", () => {
  it("(T1) 40 lb dumbbell: amount=40, unit=lb, label=dumbbell, category=load", () => {
    const [e] = extractQuantifiedEntities("40 lb dumbbell");
    expect(e).toBeDefined();
    expect(e.amount).toBe(40);
    expect(e.normalizedUnit).toBe("lb");
    expect(e.entityLabel).toBe("dumbbell");
    expect(e.category).toBe("load");
  });

  it("(T2) 12 reps curls: amount=12, unit=rep, label=curls, category=countable_item", () => {
    const [e] = extractQuantifiedEntities("12 reps curls");
    expect(e).toBeDefined();
    expect(e.amount).toBe(12);
    expect(e.normalizedUnit).toBe("rep");
    expect(e.entityLabel).toBe("curls");
    expect(e.category).toBe("countable_item");
  });

  it("(T3) 3 sets bench press: amount=3, unit=set, label=bench press", () => {
    const [e] = extractQuantifiedEntities("3 sets bench press");
    expect(e).toBeDefined();
    expect(e.amount).toBe(3);
    expect(e.normalizedUnit).toBe("set");
    expect(e.entityLabel).toContain("bench");
    expect(e.category).toBe("countable_item");
  });

  it("(T4) 100 kg barbell: amount=100, label=barbell, category=load", () => {
    const [e] = extractQuantifiedEntities("100 kg barbell");
    expect(e).toBeDefined();
    expect(e.amount).toBe(100);
    expect(e.normalizedUnit).toBe("kg");
    expect(e.entityLabel).toBe("barbell");
    expect(e.category).toBe("load");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   D — Duration examples
   ═══════════════════════════════════════════════════════════════════════════════ */

describe("extractQuantifiedEntities — duration examples", () => {
  it("(D1) 3 hours sleep: amount=3, unit=hr, label=sleep, category=duration", () => {
    const [e] = extractQuantifiedEntities("3 hours sleep");
    expect(e).toBeDefined();
    expect(e.amount).toBe(3);
    expect(e.normalizedUnit).toBe("hr");
    expect(e.entityLabel).toBe("sleep");
    expect(e.category).toBe("duration");
  });

  it("(D2) 45 minutes recovery: amount=45, unit=min, label=recovery, category=duration", () => {
    const [e] = extractQuantifiedEntities("45 minutes recovery");
    expect(e).toBeDefined();
    expect(e.amount).toBe(45);
    expect(e.normalizedUnit).toBe("min");
    expect(e.entityLabel).toBe("recovery");
    expect(e.category).toBe("duration");
  });

  it("(D3) 90 minutes before lifting: amount=90, unit=min, label stops at stop word", () => {
    const [e] = extractQuantifiedEntities("within 90 minutes before lifting");
    expect(e).toBeDefined();
    expect(e.amount).toBe(90);
    expect(e.normalizedUnit).toBe("min");
    // "before" is a stop word — label should not include it
    expect(e.entityLabel).not.toContain("before");
    expect(e.category).toBe("duration");
  });

  it("(D4) 7 days rest: amount=7, unit=d, label=rest, category=duration", () => {
    const [e] = extractQuantifiedEntities("7 days rest");
    expect(e).toBeDefined();
    expect(e.amount).toBe(7);
    expect(e.normalizedUnit).toBe("d");
    expect(e.entityLabel).toBe("rest");
    expect(e.category).toBe("duration");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   R — Robustness: malformed but quantity-bearing phrases
   ═══════════════════════════════════════════════════════════════════════════════ */

describe("extractQuantifiedEntities — robustness examples", () => {
  it("(R1) '9 grams wishes' — odd entity, preserved with moderate confidence", () => {
    const [e] = extractQuantifiedEntities("9 grams wishes");
    expect(e).toBeDefined();
    expect(e.amount).toBe(9);
    expect(e.normalizedUnit).toBe("g");
    expect(e.entityLabel).toBe("wishes");
    // Not in any known word set → moderate
    expect(e.confidence).toBe("moderate");
  });

  it("(R2) missing punctuation: '30g oats 2 eggs' → two entities", () => {
    const entities = extractQuantifiedEntities("30g oats 2 eggs");
    expect(entities.length).toBeGreaterThanOrEqual(2);
    const oats = firstOf(entities, "oats");
    expect(oats).toBeDefined();
    expect(oats!.amount).toBe(30);
  });

  it("(R3) unit directly adjacent to number: '500mL water'", () => {
    const [e] = extractQuantifiedEntities("500mL water");
    expect(e).toBeDefined();
    expect(e.amount).toBe(500);
    expect(e.entityLabel).toBe("water");
  });

  it("(R4) entity label still captured when sentence has no punctuation", () => {
    const [e] = extractQuantifiedEntities("consume 60g fast carbs now");
    expect(e).toBeDefined();
    expect(e.amount).toBe(60);
    expect(e.entityLabel).toContain("fast");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   M — Multi-entity candidate strings
   ═══════════════════════════════════════════════════════════════════════════════ */

describe("extractQuantifiedEntities — multi-entity candidate strings", () => {
  it("(M1) full carb-timing candidate: multiple entities extracted", () => {
    const text =
      "A: Consume 80g cyclic dextrin 30 minutes before lifting.\n" +
      "B: Consume 120g oats 30 minutes before lifting.\n" +
      "C: Consume 80g cyclic dextrin 2 hours before lifting.\n" +
      "D: Consume 60g cyclic dextrin 75 minutes before lifting and 30g oats 45 minutes before lifting.";

    const entities = extractQuantifiedEntities(text);
    expect(entities.length).toBeGreaterThanOrEqual(5);

    // Should find at least one 80g entity
    const e80 = entities.find((e) => e.amount === 80);
    expect(e80).toBeDefined();

    // Should find at least one 120g entity
    const e120 = entities.find((e) => e.amount === 120);
    expect(e120).toBeDefined();
  });

  it("(M2) constraint line: at least 60g + no more than 20g → two entities", () => {
    const text =
      "At least 60g of fast-digesting carbohydrates must be consumed within 90 minutes " +
      "before lifting, and no more than 20g of slow-digesting carbohydrates may be " +
      "consumed within 60 minutes before lifting.";

    const entities = extractQuantifiedEntities(text);
    const sixtyG = entities.find((e) => e.amount === 60);
    const twentyG = entities.find((e) => e.amount === 20);
    expect(sixtyG).toBeDefined();
    expect(twentyG).toBeDefined();
  });

  it("(M3) supplement stack: multiple supplements on one line", () => {
    const text = "Take 5g creatine, 200mg caffeine, and 2 capsules magnesium each morning.";
    const entities = extractQuantifiedEntities(text);
    expect(entities.length).toBeGreaterThanOrEqual(3);

    const creatine = entities.find((e) => e.entityLabel === "creatine");
    const caffeine = entities.find((e) => e.entityLabel === "caffeine");
    const mag = entities.find((e) => e.entityLabel === "magnesium");

    expect(creatine).toBeDefined();
    expect(caffeine).toBeDefined();
    expect(mag).toBeDefined();
  });

  it("(M4) training session block: load + reps + sets", () => {
    const text = "3 sets of 12 reps with 40 lb dumbbells and 2 minutes rest.";
    const entities = extractQuantifiedEntities(text);

    const sets    = entities.find((e) => e.normalizedUnit === "set");
    const reps    = entities.find((e) => e.normalizedUnit === "rep");
    const load    = entities.find((e) => e.normalizedUnit === "lb");
    const rest    = entities.find((e) => e.normalizedUnit === "min");

    expect(sets).toBeDefined();
    expect(reps).toBeDefined();
    expect(load).toBeDefined();
    expect(rest).toBeDefined();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   C — Category inference
   ═══════════════════════════════════════════════════════════════════════════════ */

describe("extractQuantifiedEntities — category inference", () => {
  it("(C1) mass + food noun → food", () => {
    const [e] = extractQuantifiedEntities("200g chicken");
    expect(e).toBeDefined();
    expect(e.category).toBe("food");
  });

  it("(C2) mass + supplement noun → supplement", () => {
    const [e] = extractQuantifiedEntities("3g creatine");
    expect(e).toBeDefined();
    expect(e.category).toBe("supplement");
  });

  it("(C3) volume + fluid noun → fluid", () => {
    const [e] = extractQuantifiedEntities("250 ml milk");
    expect(e).toBeDefined();
    expect(e.category).toBe("fluid");
  });

  it("(C4) mass (lb) + equipment noun → load", () => {
    const [e] = extractQuantifiedEntities("45 lb plate");
    expect(e).toBeDefined();
    expect(e.category).toBe("load");
  });

  it("(C5) time + activity noun → duration", () => {
    const [e] = extractQuantifiedEntities("8 hours sleep");
    expect(e).toBeDefined();
    expect(e.category).toBe("duration");
  });

  it("(C6) count unit → countable_item", () => {
    const [e] = extractQuantifiedEntities("3 servings oats");
    expect(e).toBeDefined();
    expect(e.category).not.toBe("unknown");
  });

  it("(C7) egg (self-entity) → countable_item", () => {
    const [e] = extractQuantifiedEntities("3 eggs");
    expect(e).toBeDefined();
    expect(e.category).toBe("countable_item");
    expect(e.entityLabel).toBeTruthy();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   O — Role inference (section-based)
   ═══════════════════════════════════════════════════════════════════════════════ */

describe("extractQuantifiedEntities — role inference", () => {
  it("(O1) entity in CANDIDATES section → role=candidate_item", () => {
    const text =
      "CANDIDATES:\n" +
      "A: Consume 80g cyclic dextrin 30 minutes before lifting.";

    const entities = extractQuantifiedEntities(text);
    const gramEntity = entities.find((e) => e.amount === 80);
    expect(gramEntity).toBeDefined();
    expect(gramEntity!.role).toBe("candidate_item");
  });

  it("(O2) entity in CONSTRAINTS section → role=constraint_operand", () => {
    const text =
      "CONSTRAINTS:\n" +
      "- At least 60g of fast-digesting carbs within 90 minutes before lifting.";

    const entities = extractQuantifiedEntities(text);
    const sixtyG = entities.find((e) => e.amount === 60);
    expect(sixtyG).toBeDefined();
    expect(sixtyG!.role).toBe("constraint_operand");
  });

  it("(O3) entity in STATE section → role=state_fact", () => {
    const text =
      "STATE:\n" +
      "Current meal system: 3 meals per day, 200g protein target.";

    const entities = extractQuantifiedEntities(text);
    const proteinTarget = entities.find((e) => e.amount === 200);
    expect(proteinTarget).toBeDefined();
    expect(proteinTarget!.role).toBe("state_fact");
  });

  it("(O4) entity in OBJECTIVE section → role=objective_operand", () => {
    const text =
      "OBJECTIVE:\n" +
      "Determine which candidate achieves at least 60g fast carbs within 90 minutes.";

    const entities = extractQuantifiedEntities(text);
    const e = entities.find((e) => e.amount === 60);
    expect(e).toBeDefined();
    expect(e!.role).toBe("objective_operand");
  });

  it("(O5) no section headers → role=unknown", () => {
    const text = "80g cyclic dextrin";
    const [e] = extractQuantifiedEntities(text);
    expect(e).toBeDefined();
    expect(e.role).toBe("unknown");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   I — ID and normalizedText fields
   ═══════════════════════════════════════════════════════════════════════════════ */

describe("extractQuantifiedEntities — id and normalizedText", () => {
  it("(I1) ids are unique within a single extraction call", () => {
    const text = "30g oats and 80g cyclic dextrin and 5g creatine";
    const entities = extractQuantifiedEntities(text);
    const ids = entities.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("(I2) ids start at qe_0", () => {
    const [e] = extractQuantifiedEntities("30g oats");
    expect(e.id).toBe("qe_0");
  });

  it("(I3) normalizedText uses canonical unit, e.g. grams → g", () => {
    const [e] = extractQuantifiedEntities("30 grams oats");
    expect(e.normalizedText).toContain("30g");
  });
});
