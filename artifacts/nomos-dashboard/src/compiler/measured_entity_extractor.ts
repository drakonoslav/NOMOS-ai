/**
 * measured_entity_extractor.ts
 *
 * Extracts all measured entities from raw text, returning position-aware
 * MeasuredEntitySpan records that the relation binder can order by offset.
 *
 * Open-vocabulary contract:
 *   Any noun phrase following a recognized quantity + unit is extracted,
 *   regardless of whether it appears in a domain word list.
 *   Word lists (FOOD_WORDS, etc.) improve category inference only.
 *   Confidence is structural (unit recognized + label present → high).
 *
 * This layer runs before domain-family routing.
 */

import { UNIT_REGISTRY, resolveUnit, buildUnitRegexPattern } from "./unit_registry.ts";
import type { UnitCategory } from "./unit_registry.ts";
import type {
  MeasuredEntitySpan,
  MeasuredEntityCategory,
  MeasuredEntityRole,
} from "./measured_entity_types.ts";
import { enrichEntityTags } from "./entity_tag_enricher.ts";

/* =========================================================
   Section detection  (for role assignment)
   ========================================================= */

type SectionRole = MeasuredEntityRole;

interface TextSection {
  text:     string;
  baseRole: SectionRole;
  offset:   number; // character offset within the full raw input
}

const SECTION_PATTERN =
  /^(STATE|CONSTRAINTS?|CANDIDATES?|OBJECTIVE)\s*:/im;

const ROLE_MAP: Record<string, SectionRole> = {
  state:       "state_fact",
  constraint:  "constraint_operand",
  constraints: "constraint_operand",
  candidate:   "candidate_item",
  candidates:  "candidate_item",
  objective:   "objective_operand",
};

function splitIntoSections(rawInput: string): TextSection[] {
  const headerRe = /^(STATE|CONSTRAINTS?|CANDIDATES?|OBJECTIVE)\s*:/gim;
  const sections: TextSection[] = [];

  let lastIndex = 0;
  let lastRole: SectionRole = "unknown";

  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(rawInput)) !== null) {
    if (match.index > lastIndex) {
      sections.push({
        text:     rawInput.slice(lastIndex, match.index),
        baseRole: lastRole,
        offset:   lastIndex,
      });
    }
    lastRole  = ROLE_MAP[match[1].toLowerCase()] ?? "unknown";
    lastIndex = match.index + match[0].length;
  }

  sections.push({
    text:     rawInput.slice(lastIndex),
    baseRole: lastRole,
    offset:   lastIndex,
  });

  return sections;
}

/* =========================================================
   Quantity + unit regex
   ========================================================= */

// QE_PATTERN matches `<number><whitespace?><unit>` only — it intentionally
// does NOT capture the noun phrase.  Noun extraction happens separately by
// slicing the text at matchEnd, which allows multiple entities per line.
let _QE_PATTERN: RegExp | null = null;

function getQEPattern(): RegExp {
  if (!_QE_PATTERN) {
    const units = buildUnitRegexPattern();
    _QE_PATTERN = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${units})\\b`, "gi");
  }
  return _QE_PATTERN;
}

/* =========================================================
   Label extraction  (open-vocabulary, stop-word bounded)
   ========================================================= */

// Words that terminate label extraction.  Relation words, conjunctions,
// quantifiers, and punctuation all act as stops.
/**
 * Transparent connectors — skipped silently so the noun phrase after them
 * is still captured.  "60g of oats" → label = "oats".
 */
const LABEL_SKIP_TOKENS = new Set(["of", "the", "a", "an"]);

/**
 * True stop words — halt label extraction immediately.
 * Relation words, conjunctions, and function words that signal the label has ended.
 */
const LABEL_STOP_WORDS = new Set([
  "and", "or", "but", "nor", "so", "yet", "for", "with",
  "before", "after", "during", "within", "since", "until", "by",
  "while", "when", "from", "to", "between", "around", "near",
  "above", "below", "under", "over", "inside", "outside",
  "beside", "behind", "pre", "post",
  "at", "in", "on",
  "no", "not", "than", "as", "if", "that", "which",
  "approximately", "exactly",
]);

const MAX_LABEL_TOKENS = 5;

/**
 * Extract a noun-phrase label from the text that follows a unit token.
 *
 * Splits the current line into whitespace-separated tokens and reads them
 * left-to-right, stopping when any of these conditions is met:
 *   - MAX_LABEL_TOKENS collected
 *   - Token starts with a digit (beginning of another quantity)
 *   - Cleaned token is a stop word (relation/function words)
 *   - Token is entirely punctuation
 *
 * This approach correctly terminates at "30 minutes" in
 * "cyclic dextrin 30 minutes before lifting" because "30" is a digit token.
 */
function extractLabel(afterUnit: string): string {
  // Only look at the current line
  const line  = afterUnit.split(/\n/)[0];
  const parts = line.split(/\s+/).filter(Boolean);
  const collected: string[] = [];

  for (const part of parts) {
    if (collected.length >= MAX_LABEL_TOKENS) break;
    // Digit-starting token signals the start of a new quantity → stop
    if (/^\d/.test(part)) break;
    // Strip trailing punctuation for stop-word matching
    const clean = part.replace(/[^a-z-]/gi, "").toLowerCase();
    if (!clean) break; // pure punctuation
    // Skip transparent connectors (of, the, a, an) without stopping
    if (LABEL_SKIP_TOKENS.has(clean)) continue;
    if (LABEL_STOP_WORDS.has(clean)) break;
    collected.push(clean);
  }

  return collected.join(" ").trim();
}

/* =========================================================
   Category inference  (word-set heuristics — informational only)
   ========================================================= */

const FOOD_WORDS = new Set([
  "oats", "oat", "rice", "potato", "potatoes", "pasta", "bread",
  "dextrin", "maltodextrin", "glucose", "fructose", "whey", "casein",
  "protein", "chicken", "beef", "salmon", "tuna", "egg", "yogurt",
  "banana", "apple", "berries", "spinach", "broccoli", "oil", "butter",
  "peanut", "almond", "walnut",
]);

const SUPPLEMENT_WORDS = new Set([
  "creatine", "caffeine", "melatonin", "magnesium", "zinc", "iron",
  "vitamin", "omega", "bcaa", "eaa", "glutamine", "collagen",
  "preworkout", "pre-workout", "citrulline", "beta-alanine",
  "ashwagandha", "rhodiola", "l-theanine",
]);

const FLUID_WORDS = new Set([
  "water", "milk", "juice", "broth", "coffee", "tea", "electrolyte",
  "fluid", "liquid", "beverage",
]);

const EQUIPMENT_WORDS = new Set([
  "dumbbell", "barbell", "kettlebell", "plate", "weight", "cable",
  "machine", "band", "rack", "bench", "pull", "press",
]);

const ACTIVITY_WORDS = new Set([
  "sleep", "rest", "recovery", "walk", "run", "jog", "lift",
  "lifting", "swim", "cycle", "cardio", "meditation", "stretch",
  "warm", "cooldown", "session", "workout",
]);

function inferCategory(
  unitCategory: UnitCategory | null,
  label: string
): MeasuredEntityCategory {
  if (!unitCategory) return "unknown";

  if (unitCategory === "time") return "duration";
  if (unitCategory === "distance") return "distance";
  if (unitCategory === "training") return "countable_item";

  const tokens = label.toLowerCase().split(/\s+/);

  if (unitCategory === "count") {
    if (tokens.some((t) => SUPPLEMENT_WORDS.has(t))) return "supplement";
    if (tokens.some((t) => FOOD_WORDS.has(t))) return "food";
    return "countable_item";
  }

  if (unitCategory === "volume") {
    if (tokens.some((t) => FLUID_WORDS.has(t))) return "fluid";
    if (tokens.some((t) => SUPPLEMENT_WORDS.has(t))) return "supplement";
    if (tokens.some((t) => FOOD_WORDS.has(t))) return "food";
    return "fluid";
  }

  if (unitCategory === "mass") {
    if (tokens.some((t) => SUPPLEMENT_WORDS.has(t))) return "supplement";
    if (tokens.some((t) => FOOD_WORDS.has(t))) return "food";
    if (tokens.some((t) => FLUID_WORDS.has(t))) return "fluid";
    if (tokens.some((t) => EQUIPMENT_WORDS.has(t))) return "load";
    if (tokens.some((t) => ACTIVITY_WORDS.has(t))) return "duration";
    // lb/kg attached to non-food nouns → likely a load
    if (unitCategory === "mass") return "unknown";
  }

  return "unknown";
}

/* =========================================================
   Confidence  (structural, NOT dictionary-based)
   ========================================================= */

/**
 * Confidence is determined by extraction quality alone:
 *   high     — recognized unit + non-empty label (open-vocabulary)
 *   moderate — recognized unit + empty label (bare quantity)
 *   low      — unit not in registry (should not occur in normal flow)
 */
function inferConfidence(
  unitResolved: boolean,
  label: string
): MeasuredEntitySpan["confidence"] {
  if (!unitResolved) return "low";
  return label !== "" ? "high" : "moderate";
}

/* =========================================================
   Public API
   ========================================================= */

let _entityCounter = 0;

/**
 * Reset the entity ID counter.  Call before each top-level extraction to
 * ensure IDs are stable and start at me_0.
 */
export function resetEntityCounter(): void {
  _entityCounter = 0;
}

/**
 * Extract all measured entities from `rawInput`, returning position-aware
 * MeasuredEntitySpan records sorted by startIndex.
 *
 * IDs are unique within a single call.  Call resetEntityCounter() before
 * each independent extraction if you need IDs to start at me_0.
 */
export function extractMeasuredEntities(rawInput: string): MeasuredEntitySpan[] {
  const sections = splitIntoSections(rawInput);
  const spans: MeasuredEntitySpan[] = [];
  const QE_PATTERN = getQEPattern();

  for (const section of sections) {
    QE_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = QE_PATTERN.exec(section.text)) !== null) {
      const matchEnd = match.index + match[0].length;
      const afterUnit = section.text.slice(matchEnd);

      const amount     = parseFloat(match[1]);
      const unitSurface = match[2];
      const unitRecord  = resolveUnit(unitSurface);

      const isSelfEntity = unitRecord?.isSelfEntity === true;
      let label = extractLabel(afterUnit);
      if (label === "" && isSelfEntity) {
        label = unitRecord!.canonical;
      }

      const normalizedLabel = label.toLowerCase().trim();
      const normalizedUnit  = unitRecord?.canonical ?? unitSurface.toLowerCase();
      const unitCategory    = unitRecord?.category ?? null;

      const rawText = label
        ? `${match[0].trim()} ${label}`.trim()
        : match[0].trim();

      const normalizedText = label
        ? `${amount}${normalizedUnit} ${normalizedLabel}`.trim()
        : `${amount}${normalizedUnit}`;

      const category   = inferCategory(unitCategory, normalizedLabel);
      const confidence = inferConfidence(!!unitRecord, label);

      const { tags, tagProvenance } = enrichEntityTags(normalizedLabel, category, unitCategory);

      const absoluteStart = section.offset + match.index;
      // endIndex covers the number+unit; label extraction is separate
      // and may overlap the next entity's start on the same line.
      const absoluteEnd = section.offset + matchEnd;

      spans.push({
        id:              `me_${_entityCounter++}`,
        rawText,
        normalizedText,
        amount,
        unit:            unitSurface,
        normalizedUnit,
        unitCategory,
        label,
        normalizedLabel,
        category,
        role:            section.baseRole,
        confidence,
        tags,
        tagProvenance,
        startIndex:      absoluteStart,
        endIndex:        absoluteEnd,
      });
    }
  }

  spans.sort((a, b) => a.startIndex - b.startIndex);
  return spans;
}
