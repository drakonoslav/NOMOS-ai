/**
 * nutrition_parser.ts
 *
 * Dedicated structured parser for NUTRITION_AUDIT prompts.
 *
 * Pipeline:
 *   nutrition_prompt
 *     → parse FOOD_SOURCE_TRUTH
 *     → parse ESTIMATED_DEFAULTS
 *     → parse PHASE blocks
 *         → parse TARGET_MACRO_BLOCK inside each PHASE
 *         → parse MEALS inside each PHASE
 *
 * This parser is invoked from extractFields() when:
 *   - intent === "NUTRITION_AUDIT"
 *   - the input contains a PHASE: declaration or PHASE PLANS: block
 *     (i.e. MEAL_SYSTEM_OR_PHASE_PLAN is structurally present)
 *
 * It bypasses generic section heuristics entirely for all nutrition-specific
 * fields. The result is folded back into ExtractedFields by extractFields().
 *
 * Standalone: no imports from field_extractor.ts (avoids circular deps).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NutritionTargetBlock {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface ParsedNutritionTargetBlock {
  phaseName: string | null;
  block: NutritionTargetBlock;
}

export interface NutritionParsedFood {
  foodId: string;
  amount: number;
  unit: string;
}

export interface NutritionParsedMeal {
  mealNumber: number;
  label: string | null;
  foods: NutritionParsedFood[];
}

export interface NutritionPhase {
  name: string;
  targetBlock: NutritionTargetBlock | null;
  meals: NutritionParsedMeal[];
  estimatedDefaults: Record<string, string>;
}

export interface NutritionParseResult {
  foodSourceTruth: string | null;
  globalEstimatedDefaults: Record<string, string>;
  phases: NutritionPhase[];
  hasPhases: boolean;
  hasTargets: boolean;
  hasMeals: boolean;
  hasFoodSourceTruth: boolean;
  detectedPhaseNames: string[];
}

// ─── Known phases ─────────────────────────────────────────────────────────────

export const KNOWN_PHASES = [
  "BASE",
  "CARB_UP",
  "CARB_CUT",
  "FAT_CUT",
  "RECOMP",
  "DELOAD",
  "DIET_BREAK",
  "PEAK_BULK",
] as const;

export type KnownPhaseName = (typeof KNOWN_PHASES)[number];

// ─── parseNutritionTargetBlock ────────────────────────────────────────────────

/**
 * Parses a single TARGET_MACRO_BLOCK body.
 *
 * All four keys must be present on their own lines:
 *   calories: <number>
 *   protein_g: <number>
 *   carbs_g: <number>
 *   fat_g: <number>
 *
 * Returns null if any key is absent or malformed.
 */
export function parseNutritionTargetBlock(
  text: string
): NutritionTargetBlock | null {
  const caloriesMatch = text.match(/^\s*calories\s*:\s*(\d+)\s*$/im);
  const proteinMatch = text.match(/^\s*protein_g\s*:\s*(\d+)\s*$/im);
  const carbsMatch = text.match(/^\s*carbs_g\s*:\s*(\d+)\s*$/im);
  const fatMatch = text.match(/^\s*fat_g\s*:\s*(\d+)\s*$/im);

  if (!caloriesMatch || !proteinMatch || !carbsMatch || !fatMatch) return null;

  return {
    calories: Number(caloriesMatch[1]),
    protein_g: Number(proteinMatch[1]),
    carbs_g: Number(carbsMatch[1]),
    fat_g: Number(fatMatch[1]),
  };
}

// ─── parseAllNutritionTargetBlocks ────────────────────────────────────────────

/**
 * Scans for all PHASE: + TARGET_MACRO_BLOCK: combinations in the input.
 * Line-by-line, fully deterministic — no regex backtracking.
 */
export function parseAllNutritionTargetBlocks(
  text: string
): ParsedNutritionTargetBlock[] {
  const results: ParsedNutritionTargetBlock[] = [];
  const lines = text.split("\n");

  let currentPhase: string | null = null;
  let inTargetBlock = false;
  let blockLines: string[] = [];

  const flushBlock = () => {
    if (!inTargetBlock || blockLines.length === 0) return;
    const parsed = parseNutritionTargetBlock(blockLines.join("\n"));
    if (parsed) results.push({ phaseName: currentPhase, block: parsed });
    blockLines = [];
    inTargetBlock = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const phaseMatch = line.match(/^PHASE\s*:\s*(\w+)/i);
    if (phaseMatch) {
      flushBlock();
      currentPhase = phaseMatch[1].toUpperCase();
      continue;
    }

    if (/^TARGET_MACRO_BLOCK\s*:/i.test(line)) {
      flushBlock();
      inTargetBlock = true;
      continue;
    }

    if (inTargetBlock) {
      if (/^[A-Z][A-Z0-9_ ]+\s*:/.test(line) && line.length > 3) {
        flushBlock();
        const nestedPhase = line.match(/^PHASE\s*:\s*(\w+)/i);
        if (nestedPhase) currentPhase = nestedPhase[1].toUpperCase();
        else if (/^TARGET_MACRO_BLOCK\s*:/i.test(line)) inTargetBlock = true;
        continue;
      }
      if (line.length > 0) blockLines.push(rawLine);
    }
  }

  flushBlock();
  return results;
}

// ─── buildDetectedTargetBlocksByPhase ─────────────────────────────────────────

/**
 * Maps all 8 known phase names to a boolean indicating whether a
 * TARGET_MACRO_BLOCK was found for that phase. Unknown phase names found in
 * the input are included as additional keys.
 */
export function buildDetectedTargetBlocksByPhase(
  blocks: ParsedNutritionTargetBlock[]
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const phase of KNOWN_PHASES) result[phase] = false;
  for (const { phaseName } of blocks) {
    if (phaseName !== null) result[phaseName] = true;
  }
  return result;
}

// ─── Internal meal parser ─────────────────────────────────────────────────────

/**
 * parsePhaseMeals — parses the MEALS section of a single phase.
 *
 * Handles:
 *   Meal 1 (pre-cardio):
 *   • Oats: 95g
 *   • Whey: 37g
 *
 *   Meal 2 (post-cardio):
 *   - Greek yogurt: 200g
 */
function parsePhaseMeals(text: string): NutritionParsedMeal[] {
  const blocks: NutritionParsedMeal[] = [];
  const lines = text.split("\n");

  let current: NutritionParsedMeal | null = null;
  let mealCounter = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const emojiMatch = line.match(/^([1-9])️⃣/);
    const labeledMatch = line.match(/^Meal\s+(\d+)\s*[:(—–\-]?/i);

    if (emojiMatch || labeledMatch) {
      if (current) blocks.push(current);
      mealCounter++;
      const num = emojiMatch
        ? Number(emojiMatch[1])
        : Number(labeledMatch![1]);
      const label =
        line
          .replace(/^([1-9]️⃣|Meal\s+\d+)/i, "")
          .replace(/^[\s:(—–\-]+/, "")
          .replace(/:$/, "")
          .trim() || null;
      current = { mealNumber: num, label, foods: [] };
      continue;
    }

    if (current) {
      const foodMatch = line.match(
        /^[•·\-*]\s+([^:]+):\s*(\d+(?:\.\d+)?)\s*(g|unit|ml|oz|scoop)?\b/i
      );
      if (foodMatch) {
        current.foods.push({
          foodId: foodMatch[1].trim().toLowerCase().replace(/\s+/g, "_"),
          amount: Number(foodMatch[2]),
          unit: foodMatch[3]?.toLowerCase() ?? "g",
        });
      }
    }
  }

  if (current) blocks.push(current);

  // If no labeled meals were found but there are food lines, treat them as a
  // single implicit Meal 1
  if (blocks.length === 0) {
    const foods: NutritionParsedFood[] = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const foodMatch = line.match(
        /^[•·\-*]\s+([^:]+):\s*(\d+(?:\.\d+)?)\s*(g|unit|ml|oz|scoop)?\b/i
      );
      if (foodMatch) {
        foods.push({
          foodId: foodMatch[1].trim().toLowerCase().replace(/\s+/g, "_"),
          amount: Number(foodMatch[2]),
          unit: foodMatch[3]?.toLowerCase() ?? "g",
        });
      }
    }
    if (foods.length > 0) {
      blocks.push({ mealNumber: 1, label: null, foods });
    }
  }

  return blocks;
}

// ─── parseNutritionPrompt ─────────────────────────────────────────────────────

type ParseState =
  | "NONE"
  | "FOOD_SOURCE_TRUTH"
  | "ESTIMATED_DEFAULTS"
  | "PHASE_TOP"
  | "TARGET_MACRO_BLOCK"
  | "MEALS"
  | "PHASE_ESTIMATED_DEFAULTS";

/**
 * parseNutritionPrompt — the top-level structured parser for NUTRITION_AUDIT
 * prompts that contain a PHASE: or PHASE PLANS: declaration.
 *
 * Parses in document order:
 *   FOOD_SOURCE_TRUTH:     → hasFoodSourceTruth, foodSourceTruth
 *   ESTIMATED_DEFAULTS:    → globalEstimatedDefaults
 *   PHASE: <name>          → opens a phase
 *     TARGET_MACRO_BLOCK:  → phase.targetBlock
 *     MEALS:               → phase.meals
 *     ESTIMATED_DEFAULTS:  → phase.estimatedDefaults
 *
 * Fully deterministic — no regex backtracking, no heuristic fallbacks.
 */
export function parseNutritionPrompt(text: string): NutritionParseResult {
  const lines = text.split("\n");

  let foodSourceTruthLines: string[] = [];
  let globalEstimatedDefaultsLines: string[] = [];
  const phases: NutritionPhase[] = [];

  let state: ParseState = "NONE";

  // Phase accumulation
  let currentPhaseName: string | null = null;
  let currentTargetLines: string[] = [];
  let currentMealLines: string[] = [];
  let currentPhaseDefaultsLines: string[] = [];
  let currentPhaseTargetBlock: NutritionTargetBlock | null = null;
  let currentPhaseMeals: NutritionParsedMeal[] = [];

  const flushTargetBlock = () => {
    if (currentTargetLines.length === 0) return;
    const parsed = parseNutritionTargetBlock(currentTargetLines.join("\n"));
    if (parsed) currentPhaseTargetBlock = parsed;
    currentTargetLines = [];
  };

  const flushMeals = () => {
    if (currentMealLines.length === 0) return;
    currentPhaseMeals = parsePhaseMeals(currentMealLines.join("\n"));
    currentMealLines = [];
  };

  const flushPhaseDefaults = (): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const line of currentPhaseDefaultsLines) {
      const kv = line.trim().match(/^([^:]+)\s*:\s*(.+)$/);
      if (kv) result[kv[1].trim()] = kv[2].trim();
    }
    currentPhaseDefaultsLines = [];
    return result;
  };

  const flushPhase = () => {
    if (currentPhaseName === null) return;
    flushTargetBlock();
    flushMeals();
    const phaseDefaults = flushPhaseDefaults();
    phases.push({
      name: currentPhaseName,
      targetBlock: currentPhaseTargetBlock,
      meals: currentPhaseMeals,
      estimatedDefaults: phaseDefaults,
    });
    currentPhaseName = null;
    currentPhaseTargetBlock = null;
    currentPhaseMeals = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // ── Top-level section headers ────────────────────────────────────────────

    if (/^FOOD_SOURCE_TRUTH\s*:/i.test(line)) {
      flushPhase();
      state = "FOOD_SOURCE_TRUTH";
      continue;
    }

    if (/^ESTIMATED_DEFAULTS\s*:/i.test(line)) {
      flushPhase();
      // If we're inside a phase, this is a phase-level ESTIMATED_DEFAULTS
      if (currentPhaseName !== null) {
        state = "PHASE_ESTIMATED_DEFAULTS";
      } else {
        state = "ESTIMATED_DEFAULTS";
      }
      continue;
    }

    // ── PHASE: <name> ────────────────────────────────────────────────────────

    const phaseMatch = line.match(/^PHASE\s*:\s*(\w[\w_]*)/i);
    if (phaseMatch) {
      flushPhase();
      currentPhaseName = phaseMatch[1].toUpperCase();
      state = "PHASE_TOP";
      continue;
    }

    // ── Phase sub-sections (only active when inside a phase) ─────────────────

    if (
      currentPhaseName !== null &&
      /^TARGET_MACRO_BLOCK\s*:/i.test(line)
    ) {
      flushTargetBlock();
      state = "TARGET_MACRO_BLOCK";
      continue;
    }

    if (currentPhaseName !== null && /^MEALS\s*:/i.test(line)) {
      flushTargetBlock();
      flushMeals();
      state = "MEALS";
      continue;
    }

    // ── Collect content lines ─────────────────────────────────────────────────

    switch (state) {
      case "FOOD_SOURCE_TRUTH":
        if (line.length > 0) foodSourceTruthLines.push(rawLine);
        break;

      case "ESTIMATED_DEFAULTS":
        if (line.length > 0) globalEstimatedDefaultsLines.push(rawLine);
        break;

      case "PHASE_ESTIMATED_DEFAULTS":
        if (line.length > 0) currentPhaseDefaultsLines.push(rawLine);
        break;

      case "TARGET_MACRO_BLOCK":
        if (line.length > 0) currentTargetLines.push(rawLine);
        break;

      case "MEALS":
        // Collect all lines including empty ones (preserve meal structure)
        currentMealLines.push(rawLine);
        break;

      default:
        break;
    }
  }

  flushPhase();

  // ── Build results ──────────────────────────────────────────────────────────

  const globalEstimatedDefaults: Record<string, string> = {};
  for (const line of globalEstimatedDefaultsLines) {
    const kv = line.trim().match(/^([^:]+)\s*:\s*(.+)$/);
    if (kv) globalEstimatedDefaults[kv[1].trim()] = kv[2].trim();
  }

  const foodSourceTruth =
    foodSourceTruthLines.length > 0
      ? foodSourceTruthLines.join("\n").trim()
      : null;

  return {
    foodSourceTruth,
    globalEstimatedDefaults,
    phases,
    hasPhases: phases.length > 0,
    hasTargets: phases.some((p) => p.targetBlock !== null),
    hasMeals: phases.some((p) => p.meals.length > 0),
    hasFoodSourceTruth: foodSourceTruth !== null,
    detectedPhaseNames: phases.map((p) => p.name),
  };
}
