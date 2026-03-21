import { IntentType } from "./domain_templates";
import {
  NutritionParseResult,
  parseNutritionPrompt,
  parseAllNutritionTargetBlocks,
  buildDetectedTargetBlocksByPhase,
} from "./nutrition_parser";

// Re-export nutrition types and functions so downstream code and tests can
// import them from either field_extractor or nutrition_parser.
export type {
  NutritionTargetBlock,
  ParsedNutritionTargetBlock,
  NutritionPhase,
  NutritionParseResult,
} from "./nutrition_parser";
export {
  parseNutritionTargetBlock,
  parseAllNutritionTargetBlocks,
  buildDetectedTargetBlocksByPhase,
  KNOWN_PHASES,
} from "./nutrition_parser";

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
  detectedTargetBlocksByPhase: Record<string, boolean>;
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
  nutritionTargetBlocks: ParsedNutritionTargetBlock[];

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

  // ── Generic extraction (runs for all intents) ─────────────────────────────
  const stateLines = extractBulletedSection(normalized, "STATE");
  const uncertainties = extractBulletedSection(normalized, "UNCERTAINTIES");
  const constraints = extractConstraintLines(normalized);
  const candidates = extractCandidates(normalized);
  const objective = extractObjective(normalized);
  const targets = extractTargets(normalized);

  const detectedFoods = detectFoods(normalized);
  const detectedPhases = detectPhases(normalized);

  let hasMealSystem = detectMealSystem(normalized, detectedPhases);
  const mealSystemText = hasMealSystem
    ? extractMealSystemText(normalized)
    : undefined;

  const labelsMentioned = detectLabels(normalized);
  let hasLabels = labelsMentioned.length > 0;

  let nutritionTargetBlocks = parseAllNutritionTargetBlocks(normalized);
  let hasTargets = targets.length > 0 || nutritionTargetBlocks.length > 0;
  const hasConstraints = constraints.length > 0;
  const hasCandidates = candidates.length > 0;
  const hasObjective = objective !== undefined;
  let parsedMealBlocks = parseMealBlocks(normalized);

  // ── Structured nutrition parser (NUTRITION_AUDIT + phase plan gate) ────────
  //
  // When intent is NUTRITION_AUDIT and the input contains a PHASE: declaration
  // or PHASE PLANS: block, the generic heuristic path is bypassed for all
  // nutrition-specific fields. The structured parser walks:
  //
  //   FOOD_SOURCE_TRUTH → ESTIMATED_DEFAULTS → PHASE blocks
  //     → TARGET_MACRO_BLOCK → MEALS
  //
  // Results override the generic extraction for: hasMealSystem, hasTargets,
  // hasLabels, parsedMealBlocks, nutritionTargetBlocks.

  const hasPhasePlan =
    /^\s*PHASE\s*:/im.test(normalized) ||
    /PHASE PLANS\s*:/i.test(normalized);

  let nutritionParseResult: NutritionParseResult | null = null;

  if (intent === "NUTRITION_AUDIT" && hasPhasePlan) {
    nutritionParseResult = parseNutritionPrompt(normalized);

    if (nutritionParseResult.hasTargets) hasTargets = true;
    if (nutritionParseResult.hasMeals) hasMealSystem = true;
    if (nutritionParseResult.hasFoodSourceTruth) hasLabels = true;

    // Override target blocks — structured parser is authoritative
    if (nutritionParseResult.phases.length > 0) {
      nutritionTargetBlocks = nutritionParseResult.phases
        .filter((p) => p.targetBlock !== null)
        .map((p) => ({ phaseName: p.name, block: p.targetBlock! }));
    }

    // Override meal blocks — structured parser extracts per-phase meals
    if (nutritionParseResult.hasMeals) {
      parsedMealBlocks = nutritionParseResult.phases.flatMap((phase) =>
        phase.meals.map((meal) => ({
          mealNumber: meal.mealNumber,
          foods: meal.foods.map((food) => ({
            foodId: food.foodId,
            amount: food.amount,
            unit: (food.unit === "unit" ? "unit" : "g") as "g" | "unit",
          })),
        }))
      );
    }
  }

  // ── DetectedStructure ─────────────────────────────────────────────────────
  const detectedTargetBlocksByPhase = buildDetectedTargetBlocksByPhase(
    nutritionTargetBlocks
  );
  const phasesDetected =
    detectedPhases.length > 0 ||
    detectPhaseBlocks(normalized) ||
    (nutritionParseResult?.hasPhases ?? false);
  const mealsDetected =
    hasMealSystem ||
    detectRepeatedMealStructure(normalized) ||
    (nutritionParseResult?.hasMeals ?? false);

  const detectedStructure: DetectedStructure = {
    phasesDetected,
    mealsDetected,
    targetsDetected: hasTargets,
    detectedTargetBlocksByPhase,
  };

  // ── Notes ─────────────────────────────────────────────────────────────────
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
    nutritionTargetBlocks,
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

// ─── Canonical section headings ──────────────────────────────────────────────
//
// These are the recognized structural markers for NOMOS submissions.
// Rule: if a user explicitly labels a section with one of these headings,
// the parser MUST trust that label as the primary assignment rule.
// Content under a heading belongs to that section until the next recognized heading.

export const CANONICAL_HEADINGS = [
  "STATE",
  "FACTS",
  "CONSTRAINTS",
  "UNCERTAINTIES",
  "CANDIDATES",
  "OBJECTIVE",
] as const;

export type CanonicalHeading = (typeof CANONICAL_HEADINGS)[number];

/**
 * HEADING_ALIASES — maps natural language heading variants to their canonical form.
 *
 * Users frequently write non-canonical headings like UNKNOWNS, OPTIONS, GOAL, CONTEXT.
 * These are all normalized to the canonical heading before section assignment.
 *
 * Rule: if a user writes a recognized alias, it is treated identically to the
 * canonical heading. Explicit headings always dominate content assignment.
 */
export const HEADING_ALIASES: Record<string, CanonicalHeading> = {
  // UNCERTAINTIES aliases
  unknown:        "UNCERTAINTIES",
  unknowns:       "UNCERTAINTIES",
  question:       "UNCERTAINTIES",
  questions:      "UNCERTAINTIES",
  assumption:     "UNCERTAINTIES",
  assumptions:    "UNCERTAINTIES",
  // CANDIDATES aliases
  option:         "CANDIDATES",
  options:        "CANDIDATES",
  choice:         "CANDIDATES",
  choices:        "CANDIDATES",
  solution:       "CANDIDATES",
  solutions:      "CANDIDATES",
  alternative:    "CANDIDATES",
  alternatives:   "CANDIDATES",
  plan:           "CANDIDATES",
  plans:          "CANDIDATES",
  // OBJECTIVE aliases
  goal:           "OBJECTIVE",
  goals:          "OBJECTIVE",
  purpose:        "OBJECTIVE",
  aim:            "OBJECTIVE",
  aims:           "OBJECTIVE",
  // STATE aliases
  context:        "STATE",
  situation:      "STATE",
  background:     "STATE",
  // CONSTRAINTS aliases
  requirement:    "CONSTRAINTS",
  requirements:   "CONSTRAINTS",
  rule:           "CONSTRAINTS",
  rules:          "CONSTRAINTS",
  limit:          "CONSTRAINTS",
  limits:         "CONSTRAINTS",
  condition:      "CONSTRAINTS",
  conditions:     "CONSTRAINTS",
  // FACTS aliases
  fact:           "FACTS",
};

/**
 * matchHeading — recognizes a line as a section heading and returns the canonical name.
 *
 * Accepts all of:
 *   STATE        STATE:        state:        State :        CONSTRAINTS:
 *   Objective    UNCERTAINTIES CANDIDATES:   facts
 *   UNKNOWNS     UNKNOWNS:     OPTIONS        OPTIONS:
 *   GOAL         GOAL:         goal           context:
 *
 * Rejects content lines that happen to start with a recognized word:
 *   "State description follows here." — has content after the heading word.
 *   "Options are many." — sentence, not a heading.
 *
 * Rules:
 *   - Case-insensitive
 *   - Optional colon, optional surrounding whitespace
 *   - The ENTIRE trimmed line must be the heading word (+ optional colon/space)
 *   - Whole-line match — prevents false positives on sentences
 */
export function matchHeading(line: string): CanonicalHeading | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Strip optional trailing colon and whitespace to get the bare word
  const bare = trimmed.replace(/\s*:?\s*$/, "").trim().toLowerCase();
  if (!bare) return null;

  // Check canonical headings directly
  const upper = bare.toUpperCase() as CanonicalHeading;
  if ((CANONICAL_HEADINGS as readonly string[]).includes(upper)) {
    return upper;
  }

  // Check aliases
  const alias = HEADING_ALIASES[bare];
  if (alias) return alias;

  return null;
}

/**
 * segmentSections — single-pass, canonical section segmenter.
 *
 * Design principle: explicit headings dominate assignment.
 * A recognized heading opens a section; all following lines belong to
 * that section until the next recognized heading begins.
 *
 * Headings are recognized robustly:
 *   - Case-insensitive (STATE, state, State all work)
 *   - Optional colon (STATE: and STATE both open the section)
 *   - Whitespace-tolerant
 *
 * Returns:
 *   sections  — map from CanonicalHeading → raw lines under that heading
 *   unlabeled — lines that appear before the first recognized heading
 */
export function segmentSections(text: string): {
  sections: Map<CanonicalHeading, string[]>;
  unlabeled: string[];
} {
  const lines = text.split("\n");
  const sections = new Map<CanonicalHeading, string[]>();
  const unlabeled: string[] = [];

  let current: CanonicalHeading | null = null;

  for (const rawLine of lines) {
    const heading = matchHeading(rawLine);

    if (heading !== null) {
      current = heading;
      if (!sections.has(heading)) {
        sections.set(heading, []);
      }
      continue;
    }

    if (current === null) {
      unlabeled.push(rawLine);
    } else {
      sections.get(current)!.push(rawLine);
    }
  }

  return { sections, unlabeled };
}

/**
 * matchCandidateLine — parses a single line as a candidate entry.
 *
 * Accepted formats (strict — safe for recovery scanning full text):
 *   A: text          (colon — the format taught by the UI template)
 *   A. text          (period)
 *   A) text          (parenthesis)
 *   Candidate A: text
 *   Option A: text
 *
 * Returns { id, text } if the line is a candidate, null otherwise.
 * id is always a single uppercase letter.
 */
export function matchCandidateLine(
  line: string
): ExtractedCandidate | null {
  const t = line.trim();
  if (!t) return null;

  // Short form: A: / A. / A)  followed by text
  const shortMatch = t.match(/^([A-Z])\s*[:.)] \s*(.+)$/i);
  if (shortMatch) {
    return { id: shortMatch[1].toUpperCase(), text: shortMatch[2].trim() };
  }

  // Short form without space after punctuation: A:text / A.text / A)text
  const shortNoSpaceMatch = t.match(/^([A-Z])[:.)](.+)$/i);
  if (shortNoSpaceMatch) {
    const text = shortNoSpaceMatch[2].trim();
    if (text.length > 0) {
      return { id: shortNoSpaceMatch[1].toUpperCase(), text };
    }
  }

  // Long form: Candidate A: text  /  Option A: text
  const longMatch = t.match(/^(?:candidate|option)\s+([A-Z])\s*[:.)]?\s*(.+)$/i);
  if (longMatch) {
    return { id: longMatch[1].toUpperCase(), text: longMatch[2].trim() };
  }

  return null;
}

/**
 * matchCandidateInSection — parses a candidate line within an explicit section context.
 *
 * Accepts all formats from matchCandidateLine PLUS the bare space format:
 *   A text           (single uppercase letter A-D, space, then content of 2+ chars)
 *
 * The bare format is only safe within an explicit candidate section (OPTIONS, CANDIDATES)
 * because it could false-positive on ordinary sentences in free text.
 */
function matchCandidateInSection(line: string): ExtractedCandidate | null {
  const strict = matchCandidateLine(line);
  if (strict) return strict;

  // Bare format: "A eggs and oats" — restricted to A-D, 2+ char text
  const t = line.trim();
  const bare = t.match(/^([A-D])\s+(.{2,})$/i);
  if (bare) {
    return { id: bare[1].toUpperCase(), text: bare[2].trim() };
  }

  return null;
}

/**
 * extractCandidates — two-layer candidate detection with recovery.
 *
 * Layer 1 (primary): collect candidates from the CANDIDATES section (including aliases
 *   like OPTIONS, CHOICES, SOLUTIONS). Uses section-contextual matching which also
 *   accepts the bare "A text" format (A-D only) within the section.
 *   The section is detected by matchHeading (robust, colon not required, alias-aware).
 *
 * Layer 2 (recovery): if no candidates found in the section (or if there
 *   was no candidate-aliased section at all), scan the entire input for candidate-like
 *   lines using the strict (punctuated) format only.
 *   This ensures visible candidate-like entries are never silently discarded.
 */
export function extractCandidates(text: string): ExtractedCandidate[] {
  const { sections } = segmentSections(text);

  // Layer 1: parse from explicit CANDIDATES section (includes OPTIONS, CHOICES aliases)
  const sectionLines = sections.get("CANDIDATES") ?? [];
  const fromSection: ExtractedCandidate[] = [];

  for (const rawLine of sectionLines) {
    const match = matchCandidateInSection(rawLine);
    if (match && !fromSection.find((c) => c.id === match.id)) {
      fromSection.push(match);
    }
  }

  if (fromSection.length > 0) return fromSection;

  // Layer 2: recovery pass — scan full input for candidate-like lines (strict format only).
  // Only activates when the primary pass found nothing.
  const allLines = text.split("\n");
  const recovered: ExtractedCandidate[] = [];

  for (const rawLine of allLines) {
    const match = matchCandidateLine(rawLine);
    if (match && !recovered.find((c) => c.id === match.id)) {
      recovered.push(match);
    }
  }

  return recovered;
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

/**
 * extractBulletedSection — extracts bullet/line items from a named section.
 *
 * Uses segmentSections for robust heading detection:
 *   - Section opens at any recognized heading matching sectionName
 *   - Section closes at the next recognized heading (no colon required)
 *   - Content is stripped of bullet markers (-, •, *)
 *
 * Only works for canonical headings (STATE, FACTS, CONSTRAINTS,
 * UNCERTAINTIES, CANDIDATES, OBJECTIVE). For non-canonical names,
 * falls back to the regex-based approach.
 */
export function extractBulletedSection(
  text: string,
  sectionName: string
): string[] {
  const upperName = sectionName.toUpperCase();
  const isCanonical = (CANONICAL_HEADINGS as readonly string[]).includes(upperName);

  if (isCanonical) {
    const { sections } = segmentSections(text);
    const sectionLines = sections.get(upperName as CanonicalHeading) ?? [];
    const out: string[] = [];

    for (const rawLine of sectionLines) {
      const line = rawLine.trim();
      const bullet = line.match(/^[-•*]\s*(.+)$/);
      if (bullet) {
        out.push(bullet[1].trim());
      } else if (line.length > 0) {
        out.push(line);
      }
    }

    return uniqueStrings(out.filter(Boolean));
  }

  // Fallback for non-canonical section names (nutrition-specific headings, etc.)
  const lines = text.split("\n");
  const out: string[] = [];
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (new RegExp(`^${escapeRegExp(sectionName)}\\s*:?`, "i").test(line)) {
      inSection = true;
      continue;
    }

    if (inSection && matchHeading(line) !== null) {
      break;
    }

    if (!inSection) continue;

    const bullet = line.match(/^[-•*]\s*(.+)$/);
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

/**
 * extractSingleSection — extracts the full text content of a named section
 * as a single joined string. Used for OBJECTIVE and other single-value sections.
 *
 * Uses segmentSections for robust heading detection.
 */
export function extractSingleSection(
  text: string,
  sectionName: string
): string | undefined {
  const upperName = sectionName.toUpperCase();
  const isCanonical = (CANONICAL_HEADINGS as readonly string[]).includes(upperName);

  if (isCanonical) {
    const { sections } = segmentSections(text);
    const sectionLines = sections.get(upperName as CanonicalHeading) ?? [];
    const parts: string[] = [];

    for (const rawLine of sectionLines) {
      const line = rawLine.trim();
      if (line.length > 0) {
        parts.push(line.replace(/^[-•*]\s*/, ""));
      }
    }

    const joined = parts.join(" ").trim();
    return joined || undefined;
  }

  // Fallback for non-canonical names
  const lines = text.split("\n");
  const parts: string[] = [];
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (new RegExp(`^${escapeRegExp(sectionName)}\\s*:?`, "i").test(line)) {
      inSection = true;
      continue;
    }

    if (inSection && matchHeading(line) !== null) {
      break;
    }

    if (inSection && line.length > 0) {
      parts.push(line.replace(/^[-•*]\s*/, ""));
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


