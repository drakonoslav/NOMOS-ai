/**
 * nutrition_temporal_fueling_test.ts
 *
 * Regression suite for NUTRITION_TEMPORAL_FUELING query family routing,
 * the new query_family_classifier.ts layer, and end-to-end compilation.
 *
 * Invariants verified:
 *
 * (1)  detectIntent routes the carb-timing query to NUTRITION_TEMPORAL_FUELING.
 * (2)  The compiled draft classifies as NUTRITION_TEMPORAL_FUELING (intent field).
 * (3)  The compiled draft includes the temporal carb constraints verbatim.
 * (4)  The compiled draft includes all four candidates A/B/C/D.
 * (5a) The compiled draft STATE does NOT include meal-system audit warnings.
 * (5b) The compiled draft STATE DOES include nutrition timing framing.
 * (6)  The compiled draft UNCERTAINTIES do NOT include meal-audit defaults
 *      (banana macros / egg macros / yogurt unit / fiber vs net-carb).
 * (7)  The compiled draft NOTES include query_family: NUTRITION_TEMPORAL_FUELING.
 * (8)  The compiled draft is evaluable (has candidates + constraints).
 * (9)  A pure meal-plan audit query routes to NUTRITION_MEAL_AUDIT.
 * (10) A label-verification query routes to NUTRITION_LABEL_TRUTH.
 *
 * Classifier-specific invariants:
 * (C1) CARB_TIMING_QUERY classifies to NUTRITION_TEMPORAL_FUELING via classifyQueryFamily().
 * (C2) MEAL_AUDIT_QUERY classifies to NUTRITION_MEAL_AUDIT via classifyQueryFamily().
 * (C3) LABEL_AUDIT_QUERY classifies to NUTRITION_LABEL_TRUTH via classifyQueryFamily().
 * (C4) Classifier is authoritative: autoCompile(CARB_TIMING_QUERY, "NUTRITION_MEAL_AUDIT")
 *      still resolves to NUTRITION_TEMPORAL_FUELING (overriding the caller-supplied intent).
 * (C5) Classifier is authoritative: autoCompile(CARB_TIMING_QUERY, "NUTRITION_AUDIT")
 *      still resolves to NUTRITION_TEMPORAL_FUELING.
 */

import { describe, it, expect } from "vitest";
import { detectIntent } from "../compiler/intent_detector";
import { autoCompile } from "../compiler/auto_compiler";
import {
  classifyQueryFamily,
  fromExtractedFields,
} from "../compiler/query_family_classifier";
import { extractFields } from "../compiler/field_extractor";

/* ─── Test fixtures ─────────────────────────────────────────────────────────── */

const CARB_TIMING_QUERY = `\
STATE:
Pre-lift nutrition timing

CONSTRAINTS:
- At least 60g of fast-digesting carbohydrates must be consumed within 90 minutes before lifting, and no more than 20g of slow-digesting carbohydrates may be consumed within 60 minutes before lifting.

CANDIDATES:
A: Consume 80g cyclic dextrin 30 minutes before lifting.
B: Consume 120g oats 30 minutes before lifting.
C: Consume 80g cyclic dextrin 2 hours before lifting.
D: Consume 60g cyclic dextrin 75 minutes before lifting and 30g oats 45 minutes before lifting.

OBJECTIVE:
Which candidate is admissible under the carbohydrate timing constraint and has the strongest margin?`;

const MEAL_AUDIT_QUERY = `\
STATE:
Current meal system with three meals. Phase plan is base phase.

CONSTRAINTS:
- Preserve meal order.
- Preserve protein placement by meal.

CANDIDATES:
A: Audit only.
B: Audit plus minimal correction.

OBJECTIVE:
Audit my meal plan and fix my macros without breaking timing or protein placement.`;

const LABEL_AUDIT_QUERY = `\
STATE:
Comparing food label data for whey protein versus dextrin.

OBJECTIVE:
Verify food label data per serving. Compare nutrition facts for per 100g values.
Use the source truth from the attached nutrition label.`;

/* ─── Banned phrase lists ────────────────────────────────────────────────────── */

const BANNED_STATE_PHRASES = [
  "no computable meal system has been declared",
  "target macro blocks were not detected",
];

const BANNED_UNCERTAINTY_PHRASES = [
  "banana macros",
  "egg macros",
  "yogurt unit interpretation",
  "fiber versus net-carb",
];

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function lower(s: string): string {
  return s.toLowerCase();
}

function containsAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => lower(text).includes(lower(p)));
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Routing — intent_detector.ts (display-hint level)
   ═══════════════════════════════════════════════════════════════════════════════ */

describe("NUTRITION_TEMPORAL_FUELING — routing", () => {
  it("(1) carb-timing query routes to NUTRITION_TEMPORAL_FUELING", () => {
    expect(detectIntent(CARB_TIMING_QUERY)).toBe("NUTRITION_TEMPORAL_FUELING");
  });

  it("(9) meal-audit query routes to NUTRITION_MEAL_AUDIT", () => {
    expect(detectIntent(MEAL_AUDIT_QUERY)).toBe("NUTRITION_MEAL_AUDIT");
  });

  it("(10) label-audit query routes to NUTRITION_LABEL_TRUTH", () => {
    expect(detectIntent(LABEL_AUDIT_QUERY)).toBe("NUTRITION_LABEL_TRUTH");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   Classifier — query_family_classifier.ts (authoritative level)
   ═══════════════════════════════════════════════════════════════════════════════ */

describe("query_family_classifier — classifyQueryFamily()", () => {
  function classify(raw: string, baseIntent: "NUTRITION_AUDIT" | "NUTRITION_MEAL_AUDIT" = "NUTRITION_AUDIT") {
    const extracted = extractFields(raw, baseIntent);
    return classifyQueryFamily(fromExtractedFields(extracted));
  }

  it("(C1) carb-timing query classifies to NUTRITION_TEMPORAL_FUELING", () => {
    expect(classify(CARB_TIMING_QUERY)).toBe("NUTRITION_TEMPORAL_FUELING");
  });

  it("(C2) meal-audit query classifies to NUTRITION_MEAL_AUDIT", () => {
    expect(classify(MEAL_AUDIT_QUERY)).toBe("NUTRITION_MEAL_AUDIT");
  });

  it("(C3) label-audit query classifies to NUTRITION_LABEL_TRUTH", () => {
    expect(classify(LABEL_AUDIT_QUERY)).toBe("NUTRITION_LABEL_TRUTH");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   Classifier authority — autoCompile overrides caller-supplied intent
   ═══════════════════════════════════════════════════════════════════════════════ */

describe("query_family_classifier — authoritative override in autoCompile()", () => {
  it("(C4) autoCompile(CARB_TIMING, NUTRITION_MEAL_AUDIT) → NUTRITION_TEMPORAL_FUELING", () => {
    const result = autoCompile(CARB_TIMING_QUERY, "NUTRITION_MEAL_AUDIT");
    expect(result.intent).toBe("NUTRITION_TEMPORAL_FUELING");
    expect(result.draft?.intent).toBe("NUTRITION_TEMPORAL_FUELING");
  });

  it("(C5) autoCompile(CARB_TIMING, NUTRITION_AUDIT) → NUTRITION_TEMPORAL_FUELING", () => {
    const result = autoCompile(CARB_TIMING_QUERY, "NUTRITION_AUDIT");
    expect(result.intent).toBe("NUTRITION_TEMPORAL_FUELING");
    expect(result.draft?.intent).toBe("NUTRITION_TEMPORAL_FUELING");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   Compiled draft — correctness assertions
   ═══════════════════════════════════════════════════════════════════════════════ */

describe("NUTRITION_TEMPORAL_FUELING — compiled draft", () => {
  const result = autoCompile(CARB_TIMING_QUERY, "NUTRITION_TEMPORAL_FUELING");
  const draft   = result.draft!;

  it("draft is not null", () => {
    expect(draft).toBeTruthy();
  });

  it("(2) draft.intent === NUTRITION_TEMPORAL_FUELING", () => {
    expect(draft.intent).toBe("NUTRITION_TEMPORAL_FUELING");
  });

  it("(3) draft.constraints includes temporal carb constraint", () => {
    const combined = draft.constraints.join(" ").toLowerCase();
    const hasTemporalConstraint =
      combined.includes("60g") ||
      combined.includes("fast-digesting") ||
      combined.includes("90 minutes");
    expect(hasTemporalConstraint).toBe(true);
  });

  it("(4) draft.candidates includes A, B, C, D", () => {
    const ids = draft.candidates.map((c) => c.id).sort();
    expect(ids).toEqual(["A", "B", "C", "D"]);
  });

  it("(5a) draft.state does NOT include meal-system audit warning", () => {
    const stateText = draft.state.join(" ");
    expect(containsAny(stateText, BANNED_STATE_PHRASES)).toBe(false);
  });

  it("(5b) draft.state includes nutrition timing framing", () => {
    const stateText = draft.state.join(" ").toLowerCase();
    const hasTimingFrame =
      stateText.includes("timing") ||
      stateText.includes("temporal") ||
      stateText.includes("fueling") ||
      stateText.includes("admissibility");
    expect(hasTimingFrame).toBe(true);
  });

  it("(6) draft.uncertainties do NOT include meal-audit defaults", () => {
    const uncertText = draft.uncertainties.join(" ");
    expect(containsAny(uncertText, BANNED_UNCERTAINTY_PHRASES)).toBe(false);
  });

  it("(7) draft.notes includes query_family: NUTRITION_TEMPORAL_FUELING", () => {
    const notesText = draft.notes.join(" ");
    expect(notesText).toContain("query_family: NUTRITION_TEMPORAL_FUELING");
  });

  it("(8) draft.isEvaluable is true (has candidates + constraints)", () => {
    expect(draft.isEvaluable).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   Cross-route equivalence — auto-detect vs explicit routing
   ═══════════════════════════════════════════════════════════════════════════════ */

describe("NUTRITION_TEMPORAL_FUELING — via auto-detect route", () => {
  it("detectIntent then autoCompile produces same result as explicit routing", () => {
    const intent      = detectIntent(CARB_TIMING_QUERY);
    const viaDetect   = autoCompile(CARB_TIMING_QUERY, intent);
    const viaExplicit = autoCompile(CARB_TIMING_QUERY, "NUTRITION_TEMPORAL_FUELING");

    expect(viaDetect.draft?.intent).toBe(viaExplicit.draft?.intent);
    expect(viaDetect.draft?.candidates.length).toBe(viaExplicit.draft?.candidates.length);
    expect(viaDetect.draft?.constraints.length).toBe(viaExplicit.draft?.constraints.length);
  });
});
