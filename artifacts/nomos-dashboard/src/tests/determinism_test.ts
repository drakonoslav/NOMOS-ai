/**
 * determinism_test.ts
 *
 * Verifies that the NOMOS compiler, gap detector, serializer, and patcher are
 * fully deterministic: identical inputs always produce byte-for-byte identical
 * outputs regardless of how many times each function is called.
 *
 * No mocks, no stubs. All functions are exercised against their real
 * implementations.
 */

import { describe, it, expect } from "vitest";
import { autoCompile } from "../compiler/auto_compiler";
import { detectGaps } from "../compiler/gap_detector";
import { getDomainTemplate } from "../compiler/domain_templates";
import { extractFields } from "../compiler/field_extractor";
import { serializeDraft } from "../compiler/draft_serializer";
import { patchDraftField } from "../compiler/draft_patcher";

// ---------------------------------------------------------------------------
// Fixtures — shared inputs used across all suites
// ---------------------------------------------------------------------------

const NUTRITION_INPUT = `
I'm running a 5-meal daily system targeting 2695 calories, 174g protein,
331g carbs, and 54g fat.

Meal 1 (6:30am): Oats 100g, whey protein 37g, flaxseed 15g
Meal 2 (9:30am): Greek yogurt 200g, waxy maize dextrin 40g
Meal 3 (12:30pm): Chicken breast 180g, basmati rice 150g, broccoli 100g
Meal 4 (3:30pm): Whey protein 37g, banana 1 medium, oats 50g
Meal 5 (7:00pm): Whole eggs 3, oats 80g, flaxseed 10g

Minimal correction only. Don't move meals. Don't change protein placement.
`.trim();

const TRAINING_INPUT = `
4-day strength split: Push (Mon), Pull (Tue), Legs (Thu), Full Body (Sat).

Day A — Push: Bench press 5x5, Overhead press 4x6, Incline dumbbell 3x8
Day B — Pull: Barbell row 5x5, Pull-ups 4x6, Barbell curl 3x10
Day C — Legs: Squat 5x5, Romanian deadlift 4x8, Leg press 3x10
Day D — Full: Deadlift 3x3, Weighted pull-up 3x5

Goal: add 2.5kg to main lifts every 2 weeks using linear progression.
`.trim();

const SCHEDULE_INPUT = `
Weekday schedule:
5:00am  Wake, cold shower, coffee (30 min)
5:30am  Deep work (90 min)
7:00am  Breakfast, commute (60 min)
8:00am – 5:00pm  Work
5:45pm  Change, snack (15 min)
6:00pm  Gym (90 min)
7:30pm  Dinner, wind-down (90 min)
9:00pm  Reading (60 min)
10:00pm Bedtime target

Sleep non-negotiable — minimum 7 hours.
Goal: smallest fix to restore 10pm bedtime. Actual bedtime has been 11pm.
`.trim();

// ---------------------------------------------------------------------------
// Suite 1: autoCompile — identical inputs produce identical outputs
// ---------------------------------------------------------------------------

describe("determinism: autoCompile", () => {
  it("NUTRITION_AUDIT — two calls produce deep-equal results", () => {
    const run1 = autoCompile(NUTRITION_INPUT, "NUTRITION_AUDIT");
    const run2 = autoCompile(NUTRITION_INPUT, "NUTRITION_AUDIT");
    expect(run1).toStrictEqual(run2);
  });

  it("TRAINING_AUDIT — two calls produce deep-equal results", () => {
    const run1 = autoCompile(TRAINING_INPUT, "TRAINING_AUDIT");
    const run2 = autoCompile(TRAINING_INPUT, "TRAINING_AUDIT");
    expect(run1).toStrictEqual(run2);
  });

  it("SCHEDULE_AUDIT — two calls produce deep-equal results", () => {
    const run1 = autoCompile(SCHEDULE_INPUT, "SCHEDULE_AUDIT");
    const run2 = autoCompile(SCHEDULE_INPUT, "SCHEDULE_AUDIT");
    expect(run1).toStrictEqual(run2);
  });

  it("empty input — two calls produce deep-equal results", () => {
    const run1 = autoCompile("", "NUTRITION_AUDIT");
    const run2 = autoCompile("", "NUTRITION_AUDIT");
    expect(run1).toStrictEqual(run2);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: detectGaps — identical inputs produce identical outputs
// ---------------------------------------------------------------------------

describe("determinism: detectGaps", () => {
  it("NUTRITION_AUDIT — two calls produce deep-equal results", () => {
    const template = getDomainTemplate("NUTRITION_AUDIT")!;
    const extracted = extractFields(NUTRITION_INPUT, "NUTRITION_AUDIT");

    const gaps1 = detectGaps(template, extracted);
    const gaps2 = detectGaps(template, extracted);
    expect(gaps1).toStrictEqual(gaps2);
  });

  it("TRAINING_AUDIT — two calls produce deep-equal results", () => {
    const template = getDomainTemplate("TRAINING_AUDIT")!;
    const extracted = extractFields(TRAINING_INPUT, "TRAINING_AUDIT");

    const gaps1 = detectGaps(template, extracted);
    const gaps2 = detectGaps(template, extracted);
    expect(gaps1).toStrictEqual(gaps2);
  });

  it("SCHEDULE_AUDIT — two calls produce deep-equal results", () => {
    const template = getDomainTemplate("SCHEDULE_AUDIT")!;
    const extracted = extractFields(SCHEDULE_INPUT, "SCHEDULE_AUDIT");

    const gaps1 = detectGaps(template, extracted);
    const gaps2 = detectGaps(template, extracted);
    expect(gaps1).toStrictEqual(gaps2);
  });

  it("gap result is stable across independent extractions of the same input", () => {
    const template = getDomainTemplate("NUTRITION_AUDIT")!;

    const extractedA = extractFields(NUTRITION_INPUT, "NUTRITION_AUDIT");
    const extractedB = extractFields(NUTRITION_INPUT, "NUTRITION_AUDIT");

    const gaps1 = detectGaps(template, extractedA);
    const gaps2 = detectGaps(template, extractedB);
    expect(gaps1).toStrictEqual(gaps2);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: serializeDraft — identical drafts produce identical canonical text
// ---------------------------------------------------------------------------

describe("determinism: serializeDraft", () => {
  it("NUTRITION_AUDIT draft — two serializations produce identical strings", () => {
    const { draft } = autoCompile(NUTRITION_INPUT, "NUTRITION_AUDIT");
    expect(draft).not.toBeNull();

    const text1 = serializeDraft(draft!);
    const text2 = serializeDraft(draft!);
    expect(text1).toBe(text2);
  });

  it("TRAINING_AUDIT draft — two serializations produce identical strings", () => {
    const { draft } = autoCompile(TRAINING_INPUT, "TRAINING_AUDIT");
    expect(draft).not.toBeNull();

    const text1 = serializeDraft(draft!);
    const text2 = serializeDraft(draft!);
    expect(text1).toBe(text2);
  });

  it("SCHEDULE_AUDIT draft — two serializations produce identical strings", () => {
    const { draft } = autoCompile(SCHEDULE_INPUT, "SCHEDULE_AUDIT");
    expect(draft).not.toBeNull();

    const text1 = serializeDraft(draft!);
    const text2 = serializeDraft(draft!);
    expect(text1).toBe(text2);
  });

  it("serialization is stable across independent compile runs", () => {
    const { draft: draftA } = autoCompile(NUTRITION_INPUT, "NUTRITION_AUDIT");
    const { draft: draftB } = autoCompile(NUTRITION_INPUT, "NUTRITION_AUDIT");
    expect(draftA).not.toBeNull();
    expect(draftB).not.toBeNull();

    const text1 = serializeDraft(draftA!);
    const text2 = serializeDraft(draftB!);
    expect(text1).toBe(text2);
  });

  it("canonical output always begins with STATE:", () => {
    const { draft } = autoCompile(NUTRITION_INPUT, "NUTRITION_AUDIT");
    expect(draft).not.toBeNull();
    expect(serializeDraft(draft!).startsWith("STATE:")).toBe(true);
  });

  it("canonical output sections appear in fixed order: STATE → CONSTRAINTS → UNCERTAINTIES → CANDIDATES → OBJECTIVE", () => {
    const { draft } = autoCompile(NUTRITION_INPUT, "NUTRITION_AUDIT");
    expect(draft).not.toBeNull();

    const text = serializeDraft(draft!);
    const stateIdx = text.indexOf("STATE:");
    const constraintsIdx = text.indexOf("CONSTRAINTS:");
    const uncertaintiesIdx = text.indexOf("UNCERTAINTIES:");
    const candidatesIdx = text.indexOf("CANDIDATES:");
    const objectiveIdx = text.indexOf("OBJECTIVE:");

    expect(stateIdx).toBeLessThan(constraintsIdx);
    expect(constraintsIdx).toBeLessThan(uncertaintiesIdx);
    expect(uncertaintiesIdx).toBeLessThan(candidatesIdx);
    expect(candidatesIdx).toBeLessThan(objectiveIdx);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: patchDraftField — identical inputs produce identical outputs
// ---------------------------------------------------------------------------

describe("determinism: patchDraftField", () => {
  it("food_source_truth_or_labels patch — two calls produce deep-equal results", () => {
    const { draft } = autoCompile(NUTRITION_INPUT, "NUTRITION_AUDIT");
    expect(draft).not.toBeNull();

    const patchValue = { whey: true, flax: true, oats: true, dextrin: true, yogurt: true };

    const patched1 = patchDraftField(draft!, "food_source_truth_or_labels", patchValue);
    const patched2 = patchDraftField(draft!, "food_source_truth_or_labels", patchValue);
    expect(patched1).toStrictEqual(patched2);
  });

  it("hard_constraints patch — two calls produce deep-equal results", () => {
    const { draft } = autoCompile(TRAINING_INPUT, "TRAINING_AUDIT");
    expect(draft).not.toBeNull();

    const patchValue =
      "No more than 2 consecutive training days. Deload after 3 failed sessions. No training if sleep under 6h.";

    const patched1 = patchDraftField(draft!, "hard_constraints", patchValue);
    const patched2 = patchDraftField(draft!, "hard_constraints", patchValue);
    expect(patched1).toStrictEqual(patched2);
  });

  it("anchor_constraints patch — two calls produce deep-equal results", () => {
    const { draft } = autoCompile(SCHEDULE_INPUT, "SCHEDULE_AUDIT");
    expect(draft).not.toBeNull();

    const patchValue = "Wake 5am fixed. Work 8am-5pm fixed. Sleep min 7h. Gym 6pm fixed.";

    const patched1 = patchDraftField(draft!, "anchor_constraints", patchValue);
    const patched2 = patchDraftField(draft!, "anchor_constraints", patchValue);
    expect(patched1).toStrictEqual(patched2);
  });

  it("patchDraftField does not mutate the original draft", () => {
    const { draft } = autoCompile(NUTRITION_INPUT, "NUTRITION_AUDIT");
    expect(draft).not.toBeNull();

    const originalState = JSON.parse(JSON.stringify(draft!));
    patchDraftField(draft!, "food_source_truth_or_labels", { whey: true });

    expect(draft!.state).toStrictEqual(originalState.state);
    expect(draft!.constraints).toStrictEqual(originalState.constraints);
    expect(draft!.uncertainties).toStrictEqual(originalState.uncertainties);
    expect(draft!.missingRequiredFields).toStrictEqual(originalState.missingRequiredFields);
  });

  it("applying the same patch twice to independent compilations yields deep-equal results", () => {
    const { draft: draftA } = autoCompile(NUTRITION_INPUT, "NUTRITION_AUDIT");
    const { draft: draftB } = autoCompile(NUTRITION_INPUT, "NUTRITION_AUDIT");
    expect(draftA).not.toBeNull();
    expect(draftB).not.toBeNull();

    const patchValue = { whey: true, oats: true };

    const patchedA = patchDraftField(draftA!, "food_source_truth_or_labels", patchValue);
    const patchedB = patchDraftField(draftB!, "food_source_truth_or_labels", patchValue);
    expect(patchedA).toStrictEqual(patchedB);
  });

  it("a patched draft serializes to the same canonical text on repeated calls", () => {
    const { draft } = autoCompile(NUTRITION_INPUT, "NUTRITION_AUDIT");
    expect(draft).not.toBeNull();

    const patched = patchDraftField(draft!, "food_source_truth_or_labels", { whey: true });

    const text1 = serializeDraft(patched);
    const text2 = serializeDraft(patched);
    expect(text1).toBe(text2);
  });
});
