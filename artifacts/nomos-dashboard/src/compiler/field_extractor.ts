import { IntentType } from "./domain_templates";

export interface ExtractedTarget {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  raw: string;
}

export interface ExtractedCandidate {
  id: string;
  text: string;
}

export interface ParsedFoodItem {
  foodId: string;
  amount: number;
  unit: "g" | "unit";
}

export interface ParsedMealBlock {
  mealNumber: number;
  foods: ParsedFoodItem[];
}

export interface DetectedStructure {
  phasesDetected: boolean;
  mealsDetected: boolean;
  targetsDetected: boolean;
}

export interface ExtractedFields {
  intent: IntentType;

  rawInput: string;

  hasMealSystem: boolean;
  mealSystemText?: string;

  hasTargets: boolean;
  targets: ExtractedTarget[];

  hasLabels: boolean;
  labelsMentioned: string[];

  hasConstraints: boolean;
  constraints: string[];

  hasCandidates: boolean;
  candidates: ExtractedCandidate[];

  hasObjective: boolean;
  objective?: string;

  hasState: boolean;
  stateLines: string[];

  hasUncertainties: boolean;
  uncertainties: string[];

  detectedFoods: string[];
  detectedPhases: string[];

  detectedStructure: DetectedStructure;
  parsedMealBlocks: ParsedMealBlock[];

  notes: string[];
}

const FOOD_KEYWORDS = [
  "whey",
  "flax",
  "oat",
  "oats",
  "dextrin",
  "yogurt",
  "banana",
  "egg",
  "eggs",
];

const PHASE_KEYWORDS = [
  "base",
  "carb up",
  "carb_up",
  "carb cut",
  "carb_cut",
  "fat cut",
  "fat_cut",
  "recomp",
  "deload",
  "diet break",
  "diet_break",
  "peak bulk",
  "peak_bulk",
];

const LABEL_HINTS = [
  "images in order",
  "food label",
  "food labels",
  "nutrition facts",
  "attached labels",
  "whey",
  "flax",
  "oat",
  "dextrin",
  "yogurt",
];

const OBJECTIVE_HINTS = [
  "fix macros",
  "audit my meal plan",
  "keep calories on lockdown",
  "do not move protein placements",
  "preserve protein placement",
  "without breaking timing",
  "correct my system",
];

export function extractFields(
  rawInput: string,
  intent: IntentType
): ExtractedFields {
  const normalized = normalizeInput(rawInput);

  const stateLines = extractBulletedSection(normalized, "STATE");
  const uncertainties = extractBulletedSection(normalized, "UNCERTAINTIES");
  const constraints = extractConstraintLines(normalized);
  const candidates = extractCandidates(normalized);
  const objective = extractObjective(normalized);
  const targets = extractTargets(normalized);

  const detectedFoods = detectFoods(normalized);
  const detectedPhases = detectPhases(normalized);

  const hasMealSystem = detectMealSystem(normalized, detectedPhases);
  const mealSystemText = hasMealSystem
    ? extractMealSystemText(normalized)
    : undefined;

  const labelsMentioned = detectLabels(normalized);
  const hasLabels = labelsMentioned.length > 0;

  const hasTargets = targets.length > 0;
  const hasConstraints = constraints.length > 0;
  const hasCandidates = candidates.length > 0;
  const hasObjective = objective !== undefined;

  const detectedStructure: DetectedStructure = {
    phasesDetected: detectedPhases.length > 0 || detectPhaseBlocks(normalized),
    mealsDetected: hasMealSystem || detectRepeatedMealStructure(normalized),
    targetsDetected: hasTargets,
  };

  const parsedMealBlocks = parseMealBlocks(normalized);

  const notes: string[] = [];

  if (!hasMealSystem) {
    notes.push("No computable meal system detected.");
  }

  if (!hasTargets) {
    notes.push("No explicit target macro blocks detected.");
  }

  if (!hasLabels) {
    notes.push("No label or food-source-truth reference detected.");
  }

  if (!hasConstraints) {
    notes.push("No explicit constraints section or hard-limit phrases detected.");
  }

  if (!hasCandidates) {
    notes.push("No explicit candidates detected.");
  }

  if (!hasObjective) {
    notes.push("No explicit objective detected.");
  }

  return {
    intent,
    rawInput,
    hasMealSystem,
    mealSystemText,
    hasTargets,
    targets,
    hasLabels,
    labelsMentioned,
    hasConstraints,
    constraints,
    hasCandidates,
    candidates,
    hasObjective,
    objective,
    hasState: stateLines.length > 0,
    stateLines,
    hasUncertainties: uncertainties.length > 0,
    uncertainties,
    detectedFoods,
    detectedPhases,
    detectedStructure,
    parsedMealBlocks,
    notes,
  };
}

export function normalizeInput(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Target macro patterns accepted:
 *
 *   Parenthesized:
 *     (2695/174p/331c/54f)
 *     (2400 / 170p / 260c / 60f)
 *
 *   Keyword-prefixed (no parens):
 *     Targeting 2695 calories / 174p / 331c / 54f
 *     Target: 2695 / 174p / 331c / 54f
 *     Daily targets: 2695 cal / 174p / 331c / 54f
 *
 *   Macro-block style:
 *     Calories: 2695 | Protein: 174g | Carbs: 331g | Fat: 54g
 */
export function extractTargets(text: string): ExtractedTarget[] {
  const targets: ExtractedTarget[] = [];
  const lines = text.split("\n");

  const parenthesizedRegex =
    /\((\d{3,4})\s*\/\s*(\d{2,3})p\s*\/\s*(\d{2,3})c\s*\/\s*(\d{1,3})f\)/i;

  const keywordPrefixedRegex =
    /(?:targeting|target(?:s)?|daily\s+target(?:s)?|macros?)\s*:?\s*(\d{3,4})\s+(?:calories?|cal|kcal)?\s*\/?\s*(\d{2,3})\s*p\s*\/\s*(\d{2,3})\s*c\s*\/\s*(\d{1,3})\s*f/i;

  const inlineMacroBlockRegex =
    /calories?\s*[:\s]+(\d{3,4})[^\d]*protein\s*[:\s]+(\d{2,3})g?[^\d]*carbs?\s*[:\s]+(\d{2,3})g?[^\d]*fat\s*[:\s]+(\d{1,3})g?/i;

  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    let match: RegExpMatchArray | null = null;

    match = trimmed.match(parenthesizedRegex);
    if (!match) match = trimmed.match(keywordPrefixedRegex);
    if (!match) match = trimmed.match(inlineMacroBlockRegex);
    if (!match) continue;

    const key = `${match[1]}/${match[2]}/${match[3]}/${match[4]}`;
    if (seen.has(key)) continue;
    seen.add(key);

    targets.push({
      calories: Number(match[1]),
      protein: Number(match[2]),
      carbs: Number(match[3]),
      fat: Number(match[4]),
      raw: trimmed,
    });
  }

  return targets;
}

export function extractCandidates(text: string): ExtractedCandidate[] {
  const candidates: ExtractedCandidate[] = [];
  const lines = text.split("\n");

  let inCandidatesSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (/^CANDIDATES\s*:/i.test(line)) {
      inCandidatesSection = true;
      continue;
    }

    if (
      inCandidatesSection &&
      /^[A-Z][A-Z _]+\s*:/i.test(line) &&
      !/^[A-Z]\s*:/i.test(line)
    ) {
      break;
    }

    const explicitCandidate = line.match(/^([A-Z])\s*:\s*(.+)$/);
    if (inCandidatesSection && explicitCandidate) {
      candidates.push({
        id: explicitCandidate[1],
        text: explicitCandidate[2].trim(),
      });
    }
  }

  return candidates;
}

export function extractObjective(text: string): string | undefined {
  const explicit = extractSingleSection(text, "OBJECTIVE");
  if (explicit) return explicit;

  const lower = text.toLowerCase();
  for (const hint of OBJECTIVE_HINTS) {
    if (lower.includes(hint)) {
      return sentenceFromHint(text, hint);
    }
  }

  return undefined;
}

export function extractConstraintLines(text: string): string[] {
  const explicit = extractBulletedSection(text, "CONSTRAINTS");
  if (explicit.length > 0) return explicit;

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const inferred = lines.filter((line) => {
    const lower = line.toLowerCase();
    return (
      lower.includes("do not ") ||
      lower.includes("must ") ||
      lower.includes("must not ") ||
      lower.includes("without breaking ") ||
      lower.includes("keep calories on lockdown") ||
      lower.includes("preserve ")
    );
  });

  return uniqueStrings(inferred);
}

export function extractBulletedSection(
  text: string,
  sectionName: string
): string[] {
  const lines = text.split("\n");
  const out: string[] = [];

  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (new RegExp(`^${escapeRegExp(sectionName)}\\s*:`, "i").test(line)) {
      inSection = true;
      continue;
    }

    if (inSection && /^[A-Z][A-Z _]+\s*:/i.test(line)) {
      break;
    }

    if (!inSection) continue;

    const bullet = line.match(/^[-•]\s*(.+)$/);
    if (bullet) {
      out.push(bullet[1].trim());
      continue;
    }

    if (line.length > 0) {
      out.push(line);
    }
  }

  return uniqueStrings(out.filter(Boolean));
}

export function extractSingleSection(
  text: string,
  sectionName: string
): string | undefined {
  const lines = text.split("\n");
  const parts: string[] = [];
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (new RegExp(`^${escapeRegExp(sectionName)}\\s*:`, "i").test(line)) {
      inSection = true;
      continue;
    }

    if (inSection && /^[A-Z][A-Z _]+\s*:/i.test(line)) {
      break;
    }

    if (inSection && line.length > 0) {
      parts.push(line.replace(/^[-•]\s*/, ""));
    }
  }

  const joined = parts.join(" ").trim();
  return joined || undefined;
}

export function detectFoods(text: string): string[] {
  const lower = text.toLowerCase();
  return FOOD_KEYWORDS.filter((food) => lower.includes(food));
}

export function detectPhases(text: string): string[] {
  const lower = text.toLowerCase();
  return PHASE_KEYWORDS.filter((phase) => lower.includes(phase));
}

export function detectLabels(text: string): string[] {
  const lower = text.toLowerCase();
  const found = LABEL_HINTS.filter((hint) => lower.includes(hint));
  return uniqueStrings(found);
}

/**
 * detectMealSystem — determines whether a computable meal system is present.
 *
 * Uses OR-based signal detection. Any single strong signal is sufficient.
 * "PHASE PLANS:" triggers strict mode — bypasses all heuristics entirely.
 */
export function detectMealSystem(
  text: string,
  detectedPhases: string[]
): boolean {
  // Strict mode: "PHASE PLANS:" block → deterministic parse, immediately true.
  if (/PHASE PLANS\s*:/i.test(text)) return true;

  // Phase block headers: BASE:, CARB_UP:, CARB UP:, etc.
  const hasPhaseBlockHeaders =
    /^\s*(BASE|CARB[_ ]UP|CARB[_ ]CUT|FAT[_ ]CUT|RECOMP|DELOAD|PEAK[_ ]BULK|DIET[_ ]BREAK)\s*[:(]/im.test(text);

  // Explicit "target:" block or numeric macro target in (cal/Pp/Cc/Ff) format
  const hasTargetBlock =
    /^\s*target\s*:/im.test(text) ||
    /\(\d{3,4}\s*\/\s*\d{2,3}p\s*\/\s*\d{2,3}c\s*\/\s*\d{1,3}f\)/i.test(text);

  // "meals:" or "meal N:" / "meal N (" patterns
  const hasMealKeyword =
    /^\s*meals\s*:/im.test(text) ||
    /^\s*meal\s*\d+\s*[:(]/im.test(text);

  // Emoji meal numbers 1️⃣–9️⃣
  const hasEmojiMeals = /[1-9]️⃣/.test(text);

  // Named timing slots (pre/post cardio or lift)
  const hasNamedSlots =
    /\b(pre-cardio|post-cardio|pre-lift|post-lift|pre-workout|post-workout)\b/i.test(text);

  // Bullet foods with gram amounts: "• Oats: 95g", "- Whey: 37g"
  const hasBulletFoods =
    /^[•·\-*]\s+\w[^:\n]*:\s*\d+(?:\.\d+)?\s*g\b/im.test(text);

  // Repeated "Meal N" labels (≥ 2 occurrences)
  const numberedMealCount = (text.match(/\bMeal\s+\d+\b/gi) ?? []).length;
  const hasRepeatedMealNumbers = numberedMealCount >= 2;

  const hasFoods = detectFoods(text).length >= 2;
  const hasTargets = hasTargetBlock;

  // Single-signal strong detectors
  if (hasPhaseBlockHeaders) return true;
  if (hasEmojiMeals) return true;
  if (hasNamedSlots) return true;

  // Compound detectors: need at least one structural + content signal
  if (hasMealKeyword && hasFoods) return true;
  if (hasBulletFoods && hasTargets) return true;
  if (hasRepeatedMealNumbers && hasFoods) return true;

  // Legacy: phases + foods + targets (original compound requirement, kept as fallback)
  if (detectedPhases.length > 0 && hasFoods && hasTargets) return true;

  return false;
}

/**
 * detectPhaseBlocks — detects named phase block headers independently
 * of the full meal system detection, used for detectedStructure reporting.
 */
export function detectPhaseBlocks(text: string): boolean {
  return /^\s*(BASE|CARB[_ ]UP|CARB[_ ]CUT|FAT[_ ]CUT|RECOMP|DELOAD|PEAK[_ ]BULK|DIET[_ ]BREAK|PHASE PLANS)\s*[:(]/im.test(text);
}

/**
 * detectRepeatedMealStructure — detects repeated meal structure signals
 * without requiring full meal system detection, used for gap detection
 * and detectedStructure reporting.
 */
export function detectRepeatedMealStructure(text: string): boolean {
  const numberedMealCount = (text.match(/\bMeal\s+\d+\b/gi) ?? []).length;
  if (numberedMealCount >= 2) return true;
  if (/[1-9]️⃣/.test(text)) return true;
  if (/^\s*meal\s*\d+\s*[:(]/im.test(text)) return true;
  if (/\b(pre-cardio|post-cardio|pre-lift|post-lift)\b/i.test(text)) return true;
  return false;
}

/**
 * parseMealBlocks — fallback parser that converts emoji-numbered or
 * labeled meal blocks with bullet foods into structured ParsedMealBlock[].
 *
 * Handles:
 *   1️⃣ Meal 1 (pre-cardio)
 *   • Oats: 95g
 *   • Whey: 37g
 *
 *   Meal 2 (post-cardio):
 *   - Greek yogurt: 200g
 */
export function parseMealBlocks(text: string): ParsedMealBlock[] {
  const blocks: ParsedMealBlock[] = [];
  const lines = text.split("\n");

  let current: ParsedMealBlock | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Emoji meal header: 1️⃣, 2️⃣, …
    const emojiMatch = line.match(/^([1-9])️⃣/);
    // Labeled meal header: "Meal 1:", "Meal 1 (pre-cardio):", "meal 3 —"
    const labeledMatch = line.match(/^Meal\s+(\d+)\s*[:(—–-]/i);

    if (emojiMatch || labeledMatch) {
      if (current) blocks.push(current);
      const num = emojiMatch ? Number(emojiMatch[1]) : Number(labeledMatch![1]);
      current = { mealNumber: num, foods: [] };
      continue;
    }

    if (current) {
      // Bullet food line: "• Oats: 95g", "- Whey protein: 37g", "* Eggs: 3unit"
      const foodMatch = line.match(
        /^[•·\-*]\s+([^:]+):\s*(\d+(?:\.\d+)?)\s*(g|unit|ml|oz|scoop)?\b/i
      );
      if (foodMatch) {
        const foodId = foodMatch[1]
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_");
        const amount = parseFloat(foodMatch[2]);
        const rawUnit = (foodMatch[3] ?? "g").toLowerCase();
        const unit: "g" | "unit" = rawUnit === "unit" || rawUnit === "scoop"
          ? "unit"
          : "g";
        current.foods.push({ foodId, amount, unit });
      }
    }
  }

  if (current) blocks.push(current);
  return blocks;
}

export function extractMealSystemText(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];

  let keep = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (containsPhaseHeader(line) || /PHASE PLANS\s*:/i.test(line)) {
      keep = true;
    }

    if (keep) {
      kept.push(rawLine);
    }
  }

  return kept.join("\n").trim();
}

function containsPhaseHeader(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    PHASE_KEYWORDS.some((phase) => lower.includes(phase)) && /\(/.test(line)
  );
}

function sentenceFromHint(text: string, hint: string): string {
  const lines = text.split("\n");
  const found = lines.find((l) => l.toLowerCase().includes(hint));
  return found?.trim() ?? hint;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
