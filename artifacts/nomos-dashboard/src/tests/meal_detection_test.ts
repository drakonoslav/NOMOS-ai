import { describe, it, expect } from "vitest";
import { extractFields } from "./src/compiler/field_extractor";
import { autoCompile } from "./src/compiler/auto_compiler";

const STRICT_MODE_INPUT = `PHASE PLANS:
BASE (2400/170p/260c/60f):
  Meal 1 (pre-cardio):
  • Oats: 95g
  • Whey: 37g
CARB_UP (2800/175p/340c/55f):
  Meal 1 (pre-lift):
  • Oats: 120g
  • Whey: 37g`;

const NUMBERED_MEALS_INPUT = `Targeting 2695 calories / 174p / 331c / 54f.
Meal 1 (6:30am):
• Oats: 100g
• Whey: 37g
• Flaxseed: 15g
Meal 2 (9:30am):
• Yogurt: 200g
• Dextrin: 40g
Meal 3 (12:30pm):
• Chicken: 180g`;

const EMOJI_MEALS_INPUT = `Targets: (2695/174p/331c/54f)
1️⃣ pre-cardio: oats 95g, whey 37g
2️⃣ post-cardio: yogurt 200g, dextrin 40g
3️⃣ lunch: chicken 180g`;

describe("meal system detection", () => {
  it("PHASE PLANS: triggers strict mode → hasMealSystem true", () => {
    const f = extractFields(STRICT_MODE_INPUT, "NUTRITION_AUDIT");
    expect(f.hasMealSystem).toBe(true);
    expect(f.detectedStructure.phasesDetected).toBe(true);
  });

  it("numbered meals + bullet foods → hasMealSystem true", () => {
    const f = extractFields(NUMBERED_MEALS_INPUT, "NUTRITION_AUDIT");
    expect(f.hasMealSystem).toBe(true);
    expect(f.detectedStructure.mealsDetected).toBe(true);
    expect(f.detectedStructure.targetsDetected).toBe(true);
  });

  it("emoji meals → hasMealSystem true", () => {
    const f = extractFields(EMOJI_MEALS_INPUT, "NUTRITION_AUDIT");
    expect(f.hasMealSystem).toBe(true);
    expect(f.parsedMealBlocks.length).toBeGreaterThanOrEqual(1);
  });

  it("parseMealBlocks extracts food items from bullet lines", () => {
    const f = extractFields(NUMBERED_MEALS_INPUT, "NUTRITION_AUDIT");
    expect(f.parsedMealBlocks.length).toBeGreaterThanOrEqual(2);
    expect(f.parsedMealBlocks[0].mealNumber).toBe(1);
    expect(f.parsedMealBlocks[0].foods.length).toBeGreaterThan(0);
    const oats = f.parsedMealBlocks[0].foods.find(fd => fd.foodId.includes("oat"));
    expect(oats).toBeDefined();
    expect(oats?.amount).toBe(100);
    expect(oats?.unit).toBe("g");
  });

  it("DETECTED_STRUCTURE note appears in compiled draft", () => {
    const { draft } = autoCompile(NUMBERED_MEALS_INPUT, "NUTRITION_AUDIT");
    expect(draft).not.toBeNull();
    const structNote = draft!.notes.find(n => n.startsWith("DETECTED_STRUCTURE:"));
    expect(structNote).toBeDefined();
    expect(structNote).toContain("meals_detected: true");
    expect(structNote).toContain("targets_detected: true");
  });

  it("compound signal: foods + targets + repeated meals → meal_system_or_phase_plan satisfied → isEvaluable when labels present", () => {
    const inputWithLabels = NUMBERED_MEALS_INPUT + `
• Use attached whey, oat, flax labels as source truth.`;
    const { draft } = autoCompile(inputWithLabels, "NUTRITION_AUDIT");
    expect(draft).not.toBeNull();
    expect(draft!.missingRequiredFields).not.toContain("meal_system_or_phase_plan");
  });

  it("PHASE PLANS: produces isEvaluable=true when all fields present", () => {
    const full = STRICT_MODE_INPUT + `
Use food labels for whey and oat. Target: (2400/170p/260c/60f).`;
    const { draft } = autoCompile(full, "NUTRITION_AUDIT");
    expect(draft).not.toBeNull();
    expect(draft!.missingRequiredFields).not.toContain("meal_system_or_phase_plan");
    expect(draft!.missingRequiredFields).not.toContain("target_macros_or_goal");
  });
});
