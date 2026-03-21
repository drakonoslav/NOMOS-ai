import { describe, it, expect } from "vitest";
import {
  parseNutritionTargetBlock,
  parseAllNutritionTargetBlocks,
  extractFields,
} from "../compiler/field_extractor";
import { autoCompile } from "../compiler/auto_compiler";

// ─── Exact 8-phase prompt structure ─────────────────────────────────────────

const EIGHT_PHASE_PROMPT = `
PHASE: BASE
TARGET_MACRO_BLOCK:
calories: 2400
protein_g: 170
carbs_g: 260
fat_g: 60

PHASE: CARB_UP
TARGET_MACRO_BLOCK:
calories: 2800
protein_g: 175
carbs_g: 340
fat_g: 55

PHASE: CARB_CUT
TARGET_MACRO_BLOCK:
calories: 2200
protein_g: 175
carbs_g: 200
fat_g: 65

PHASE: FAT_CUT
TARGET_MACRO_BLOCK:
calories: 2000
protein_g: 180
carbs_g: 175
fat_g: 55

PHASE: RECOMP
TARGET_MACRO_BLOCK:
calories: 2500
protein_g: 190
carbs_g: 245
fat_g: 60

PHASE: DELOAD
TARGET_MACRO_BLOCK:
calories: 2300
protein_g: 165
carbs_g: 250
fat_g: 58

PHASE: DIET_BREAK
TARGET_MACRO_BLOCK:
calories: 2600
protein_g: 170
carbs_g: 290
fat_g: 62

PHASE: PEAK_BULK
TARGET_MACRO_BLOCK:
calories: 3000
protein_g: 185
carbs_g: 380
fat_g: 65
`.trim();

// ─── parseNutritionTargetBlock unit tests ────────────────────────────────────

describe("parseNutritionTargetBlock", () => {
  it("parses a valid 4-key block", () => {
    const text = `
calories: 2400
protein_g: 170
carbs_g: 260
fat_g: 60
    `.trim();
    const result = parseNutritionTargetBlock(text);
    expect(result).not.toBeNull();
    expect(result!.calories).toBe(2400);
    expect(result!.protein_g).toBe(170);
    expect(result!.carbs_g).toBe(260);
    expect(result!.fat_g).toBe(60);
  });

  it("returns null when any key is missing", () => {
    const text = `
calories: 2400
protein_g: 170
carbs_g: 260
    `.trim();
    expect(parseNutritionTargetBlock(text)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseNutritionTargetBlock("")).toBeNull();
  });

  it("is deterministic — two calls on the same input return deep-equal results", () => {
    const text = "calories: 2000\nprotein_g: 160\ncarbs_g: 200\nfat_g: 55";
    const r1 = parseNutritionTargetBlock(text);
    const r2 = parseNutritionTargetBlock(text);
    expect(r1).toEqual(r2);
  });
});

// ─── parseAllNutritionTargetBlocks unit tests ─────────────────────────────────

describe("parseAllNutritionTargetBlocks", () => {
  it("detects 8 target blocks from the 8-phase prompt", () => {
    const blocks = parseAllNutritionTargetBlocks(EIGHT_PHASE_PROMPT);
    expect(blocks.length).toBe(8);
  });

  it("each block has a non-null phaseName", () => {
    const blocks = parseAllNutritionTargetBlocks(EIGHT_PHASE_PROMPT);
    for (const { phaseName } of blocks) {
      expect(phaseName).not.toBeNull();
    }
  });

  it("phase names match the 8 declared phases in order", () => {
    const blocks = parseAllNutritionTargetBlocks(EIGHT_PHASE_PROMPT);
    const names = blocks.map((b) => b.phaseName);
    expect(names).toEqual([
      "BASE",
      "CARB_UP",
      "CARB_CUT",
      "FAT_CUT",
      "RECOMP",
      "DELOAD",
      "DIET_BREAK",
      "PEAK_BULK",
    ]);
  });

  it("BASE block has correct macro values", () => {
    const blocks = parseAllNutritionTargetBlocks(EIGHT_PHASE_PROMPT);
    const base = blocks.find((b) => b.phaseName === "BASE");
    expect(base).toBeDefined();
    expect(base!.block.calories).toBe(2400);
    expect(base!.block.protein_g).toBe(170);
    expect(base!.block.carbs_g).toBe(260);
    expect(base!.block.fat_g).toBe(60);
  });

  it("PEAK_BULK block has correct macro values", () => {
    const blocks = parseAllNutritionTargetBlocks(EIGHT_PHASE_PROMPT);
    const pb = blocks.find((b) => b.phaseName === "PEAK_BULK");
    expect(pb).toBeDefined();
    expect(pb!.block.calories).toBe(3000);
    expect(pb!.block.protein_g).toBe(185);
    expect(pb!.block.carbs_g).toBe(380);
    expect(pb!.block.fat_g).toBe(65);
  });

  it("standalone block (no PHASE: prefix) gets phaseName: null", () => {
    const text = `TARGET_MACRO_BLOCK:\ncalories: 2000\nprotein_g: 160\ncarbs_g: 200\nfat_g: 55`;
    const blocks = parseAllNutritionTargetBlocks(text);
    expect(blocks.length).toBe(1);
    expect(blocks[0].phaseName).toBeNull();
  });

  it("returns empty array for input with no TARGET_MACRO_BLOCK", () => {
    expect(parseAllNutritionTargetBlocks("some text without any blocks")).toEqual([]);
  });

  it("is deterministic — two calls return deep-equal results", () => {
    const r1 = parseAllNutritionTargetBlocks(EIGHT_PHASE_PROMPT);
    const r2 = parseAllNutritionTargetBlocks(EIGHT_PHASE_PROMPT);
    expect(r1).toEqual(r2);
  });
});

// ─── extractFields integration tests ─────────────────────────────────────────

describe("extractFields — 8-phase nutrition target detection", () => {
  it("hasTargets === true", () => {
    const f = extractFields(EIGHT_PHASE_PROMPT, "NUTRITION_AUDIT");
    expect(f.hasTargets).toBe(true);
  });

  it("nutritionTargetBlocks.length === 8", () => {
    const f = extractFields(EIGHT_PHASE_PROMPT, "NUTRITION_AUDIT");
    expect(f.nutritionTargetBlocks.length).toBe(8);
  });

  it("detectedStructure.targetsDetected === true", () => {
    const f = extractFields(EIGHT_PHASE_PROMPT, "NUTRITION_AUDIT");
    expect(f.detectedStructure.targetsDetected).toBe(true);
  });

  it("all 8 known phases appear as true in detectedTargetBlocksByPhase", () => {
    const f = extractFields(EIGHT_PHASE_PROMPT, "NUTRITION_AUDIT");
    const byPhase = f.detectedStructure.detectedTargetBlocksByPhase;
    for (const phase of [
      "BASE",
      "CARB_UP",
      "CARB_CUT",
      "FAT_CUT",
      "RECOMP",
      "DELOAD",
      "DIET_BREAK",
      "PEAK_BULK",
    ]) {
      expect(byPhase[phase]).toBe(true);
    }
  });

  it("does not emit 'No explicit target macro blocks detected.' note", () => {
    const f = extractFields(EIGHT_PHASE_PROMPT, "NUTRITION_AUDIT");
    expect(f.notes).not.toContain("No explicit target macro blocks detected.");
  });
});

// ─── autoCompile integration tests ───────────────────────────────────────────

describe("autoCompile — 8-phase prompt produces evaluable draft", () => {
  it("compiled draft is not null", () => {
    const { draft } = autoCompile(EIGHT_PHASE_PROMPT, "NUTRITION_AUDIT");
    expect(draft).not.toBeNull();
  });

  it("missingRequiredFields does not include target_macros_or_goal", () => {
    const { draft } = autoCompile(EIGHT_PHASE_PROMPT, "NUTRITION_AUDIT");
    expect(draft!.missingRequiredFields).not.toContain("target_macros_or_goal");
  });

  it("DETECTED_STRUCTURE note shows targets_detected: true", () => {
    const { draft } = autoCompile(EIGHT_PHASE_PROMPT, "NUTRITION_AUDIT");
    const structNote = draft!.notes.find((n) =>
      n.startsWith("DETECTED_STRUCTURE:")
    );
    expect(structNote).toBeDefined();
    expect(structNote).toContain("targets_detected: true");
  });

  it("DETECTED_TARGET_BLOCKS note is present with all 8 phases", () => {
    const { draft } = autoCompile(EIGHT_PHASE_PROMPT, "NUTRITION_AUDIT");
    const headerNote = draft!.notes.find((n) =>
      n.startsWith("DETECTED_TARGET_BLOCKS:")
    );
    expect(headerNote).toBeDefined();
    for (const phase of [
      "BASE",
      "CARB_UP",
      "CARB_CUT",
      "FAT_CUT",
      "RECOMP",
      "DELOAD",
      "DIET_BREAK",
      "PEAK_BULK",
    ]) {
      const phaseNote = draft!.notes.find((n) =>
        n.startsWith(`- ${phase}: true`)
      );
      expect(phaseNote).toBeDefined();
    }
  });
});
