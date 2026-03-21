/**
 * quantified_entity_extractor.ts
 *
 * General-purpose measurable-object parser that runs BEFORE domain routing.
 *
 * This is NOT a food-only parser.  Any noun phrase with a recognized quantity
 * and unit is captured as a QuantifiedEntity, regardless of domain.
 *
 * Architecture:
 *   1. Split raw input into structural sections (STATE / CONSTRAINTS / CANDIDATES /
 *      OBJECTIVE) to infer entity role.
 *   2. For each section, apply the quantity regex to locate (amount + unit) spans.
 *   3. Extract the nearest compatible noun phrase after each unit span.
 *   4. Infer category and confidence from unit type + entity label.
 *   5. Return a flat list of QuantifiedEntity objects.
 *
 * Robustness contract:
 *   If a phrase is syntactically odd but clearly quantity-bearing (e.g.
 *   "9 grams wishes"), preserve the entity rather than dropping it.
 *   Odd entities receive confidence "moderate" (entity label non-empty but
 *   not in a known word set).
 *
 * Exported surface API:
 *   extractQuantifiedEntities(rawInput: string): QuantifiedEntity[]
 */

import type { QuantifiedEntity, QuantifiedEntityCategory, QuantifiedEntityRole } from "./quantified_entity_types";
import { UNIT_REGISTRY, buildUnitRegexPattern, resolveUnit } from "./unit_registry";

/* =========================================================
   Section types
   ========================================================= */

interface TextSection {
  header: string;
  text: string;
  baseRole: QuantifiedEntityRole;
}

/* =========================================================
   Word-set tables for category inference
   ========================================================= */

const FOOD_WORDS = new Set([
  "oats", "oatmeal", "dextrin", "cyclic", "rice", "chicken", "beef", "salmon",
  "tuna", "turkey", "steak", "fish", "pork", "lamb", "shrimp", "protein",
  "whey", "casein", "pasta", "bread", "tortilla", "wrap", "bagel", "potato",
  "sweet", "broccoli", "spinach", "kale", "lettuce", "tomato", "onion",
  "garlic", "berries", "strawberry", "blueberry", "banana", "apple", "mango",
  "yogurt", "cheese", "butter", "cream", "egg", "eggs", "nuts", "almonds",
  "peanut", "walnut", "cashew", "avocado", "oil", "olive", "granola", "bar",
  "cereal", "muesli", "meal", "food", "carb", "carbs", "carbohydrate",
  "carbohydrates", "fat", "fiber", "sugar", "glucose", "fructose", "lactose",
  "flour", "starch", "powder", "shake", "blend", "mix", "sauce", "dressing",
]);

const SUPPLEMENT_WORDS = new Set([
  "creatine", "magnesium", "zinc", "vitamin", "bcaa", "collagen", "omega",
  "caffeine", "leucine", "glycine", "glutamine", "electrolyte", "sodium",
  "potassium", "calcium", "iron", "melatonin", "ashwagandha", "citrulline",
  "arginine", "beta-alanine", "beta", "alanine", "carnosine", "taurine",
  "tyrosine", "phenylalanine", "lysine", "threonine", "valine", "isoleucine",
  "d3", "b12", "b6", "c", "e", "k2", "preworkout", "pre-workout", "inositol",
  "berberine", "quercetin", "resveratrol", "nac", "nad", "coq10",
]);

const FLUID_WORDS = new Set([
  "water", "milk", "juice", "shake", "liquid", "broth", "coffee", "tea",
  "sports", "drink", "beverage", "solution", "electrolytes", "smoothie",
  "formula", "serum", "infusion",
]);

const EQUIPMENT_WORDS = new Set([
  "dumbbell", "dumbbells", "barbell", "barbells", "kettlebell", "kettlebells",
  "weight", "weights", "plate", "plates", "machine", "cable", "band", "bar",
  "trap", "hex",
]);

const ACTIVITY_WORDS = new Set([
  "sleep", "nap", "rest", "recovery", "workout", "training", "run", "jog",
  "walk", "swim", "cycling", "ride", "meditation", "fast", "fasting",
  "exercise", "session", "cardio", "hiit", "stretching",
]);

/* =========================================================
   Stop words — halt entity label extraction
   ========================================================= */

const STOP_WORDS = new Set([
  "before", "after", "within", "and", "or", "must", "should", "per", "of",
  "in", "at", "the", "a", "an", "is", "are", "to", "be", "not", "no",
  "may", "can", "will", "shall", "each", "every", "total", "during",
  "outside", "inside", "when", "then", "for", "with", "without", "from",
  "under", "over", "above", "below", "between", "among", "around",
  "consumed", "taken", "eaten", "drink", "consume", "take", "eat",
  "which", "that", "this", "these", "those", "its", "their", "our",
  "has", "have", "had", "was", "were", "been", "being",
]);

/* =========================================================
   Section detection
   ========================================================= */

const SECTION_HEADERS: Array<{ pattern: RegExp; role: QuantifiedEntityRole }> = [
  { pattern: /^STATE\s*:/im,        role: "state_fact" },
  { pattern: /^CONSTRAINTS?\s*:/im, role: "constraint_operand" },
  { pattern: /^CANDIDATES?\s*:/im,  role: "candidate_item" },
  { pattern: /^OBJECTIVE\s*:/im,    role: "objective_operand" },
];

function detectSectionRole(line: string): QuantifiedEntityRole | null {
  for (const { pattern, role } of SECTION_HEADERS) {
    if (pattern.test(line)) return role;
  }
  return null;
}

function splitIntoSections(rawInput: string): TextSection[] {
  const lines = rawInput.split("\n");
  const sections: TextSection[] = [];

  let currentRole: QuantifiedEntityRole = "unknown";
  let currentHeader = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const detectedRole = detectSectionRole(line);
    if (detectedRole !== null) {
      if (currentLines.length > 0) {
        sections.push({
          header: currentHeader,
          text: currentLines.join("\n"),
          baseRole: currentRole,
        });
      }
      currentRole = detectedRole;
      currentHeader = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({
      header: currentHeader,
      text: currentLines.join("\n"),
      baseRole: currentRole,
    });
  }

  if (sections.length === 0) {
    return [{ header: "", text: rawInput, baseRole: "unknown" }];
  }

  return sections;
}

/* =========================================================
   Entity label extraction
   ========================================================= */

/**
 * Extract the entity noun phrase from the text immediately following the unit.
 *
 * Consumes up to MAX_LABEL_TOKENS word-tokens, stopping when:
 *   - a STOP_WORD is encountered
 *   - a digit token is encountered (start of a new quantity)
 *   - a sentence-terminating punctuation is reached
 *
 * The result is lowercased and trimmed.
 */
const MAX_LABEL_TOKENS = 5;

function extractEntityLabel(afterUnit: string): string {
  // Stop at punctuation characters that end the phrase
  const stripped = afterUnit.replace(/[.,;:!?].*$/, "").trim();

  const tokens = stripped.split(/\s+/).filter(Boolean);
  const result: string[] = [];

  for (const tok of tokens) {
    const lower = tok.toLowerCase();
    // Stop at digits (next quantity)
    if (/^\d/.test(tok)) break;
    // Stop at stop words
    if (STOP_WORDS.has(lower)) break;
    if (result.length >= MAX_LABEL_TOKENS) break;
    result.push(lower);
  }

  return result.join(" ");
}

/* =========================================================
   Category inference
   ========================================================= */

function inferCategory(
  unitRecord: ReturnType<typeof resolveUnit>,
  entityLabel: string
): QuantifiedEntityCategory {
  if (!unitRecord) return "unknown";

  const tokens = entityLabel.toLowerCase().split(/\s+/);
  const lastToken = tokens[tokens.length - 1] ?? "";

  // Duration: time unit + activity/rest noun
  if (unitRecord.category === "time") {
    if (tokens.some((t) => ACTIVITY_WORDS.has(t)) || entityLabel === "") {
      return "duration";
    }
    return "duration"; // any time unit → duration
  }

  // Training count: rep/set unit
  if (unitRecord.category === "training") {
    return "countable_item";
  }

  // Self-entity count unit (egg, banana) — use countable_item
  if (unitRecord.isSelfEntity) {
    return "countable_item";
  }

  // Load: mass unit (lb/kg/oz) attached to equipment noun
  if (
    unitRecord.category === "mass" &&
    (unitRecord.canonical === "lb" ||
      unitRecord.canonical === "kg" ||
      unitRecord.canonical === "oz") &&
    tokens.some((t) => EQUIPMENT_WORDS.has(t))
  ) {
    return "load";
  }

  // Count (non-self-entity): capsule, tablet, serving, piece
  if (unitRecord.category === "count") {
    // If the entity label is supplement-like → supplement
    if (tokens.some((t) => SUPPLEMENT_WORDS.has(t))) return "supplement";
    return "countable_item";
  }

  // Volume unit → check entity label for fluid/food
  if (unitRecord.category === "volume") {
    if (tokens.some((t) => FLUID_WORDS.has(t))) return "fluid";
    if (tokens.some((t) => FOOD_WORDS.has(t))) return "food";
    return "unknown";
  }

  // Mass unit (g, kg, mg) → check entity label
  if (unitRecord.category === "mass") {
    if (tokens.some((t) => SUPPLEMENT_WORDS.has(t))) return "supplement";
    if (tokens.some((t) => FOOD_WORDS.has(t))) return "food";
    if (tokens.some((t) => FLUID_WORDS.has(t))) return "fluid";
    return "unknown";
  }

  return "unknown";
}

/* =========================================================
   Confidence inference
   ========================================================= */

const ALL_KNOWN_WORDS = new Set([
  ...FOOD_WORDS,
  ...SUPPLEMENT_WORDS,
  ...FLUID_WORDS,
  ...EQUIPMENT_WORDS,
  ...ACTIVITY_WORDS,
]);

function inferConfidence(
  unitRecord: ReturnType<typeof resolveUnit>,
  entityLabel: string,
  isSelfEntity: boolean
): QuantifiedEntity["confidence"] {
  if (!unitRecord) return "low";
  if (isSelfEntity && entityLabel !== "") return "high";

  if (entityLabel === "") return "low";

  const tokens = entityLabel.toLowerCase().split(/\s+/);
  const inKnownSet = tokens.some((t) => ALL_KNOWN_WORDS.has(t));

  return inKnownSet ? "high" : "moderate";
}

/* =========================================================
   Core entity builder
   ========================================================= */

interface RawMatch {
  /** The matched number + unit text only (NOT including the following noun phrase). */
  numUnitText: string;
  amount: number;
  unitSurface: string;
  /** The full section text from the position immediately after the unit match. */
  afterUnit: string;
  startIndex: number;
}

function buildEntity(
  raw: RawMatch,
  sectionRole: QuantifiedEntityRole,
  idIndex: number
): QuantifiedEntity | null {
  const unitRecord = resolveUnit(raw.unitSurface);
  if (!unitRecord) return null;

  const isSelfEntity = unitRecord.isSelfEntity === true;

  // Entity label: noun phrase following the unit (or unit canonical if self-entity)
  let entityLabel = extractEntityLabel(raw.afterUnit);
  if (entityLabel === "" && isSelfEntity) {
    entityLabel = unitRecord.canonical;
  }

  const normalizedEntityLabel = entityLabel.toLowerCase().trim();
  const normalizedUnit = unitRecord.canonical;

  const rawText = entityLabel
    ? `${raw.numUnitText.trim()} ${entityLabel}`.trim()
    : raw.numUnitText.trim();

  const normalizedText = entityLabel
    ? `${raw.amount}${normalizedUnit} ${normalizedEntityLabel}`.trim()
    : `${raw.amount}${normalizedUnit}`;

  const category = inferCategory(unitRecord, normalizedEntityLabel);
  const confidence = inferConfidence(unitRecord, normalizedEntityLabel, isSelfEntity);

  return {
    id:                    `qe_${idIndex}`,
    rawText,
    normalizedText,
    amount:                raw.amount,
    unit:                  raw.unitSurface,
    normalizedUnit,
    entityLabel:           normalizedEntityLabel,
    normalizedEntityLabel,
    category,
    role:                  sectionRole,
    modifiers:             [],
    tags:                  [],
    confidence,
  };
}

/* =========================================================
   Quantity regex (built once at module load)
   ========================================================= */

const UNIT_REGEX_PART = buildUnitRegexPattern();

/**
 * Matches: <amount> <unit>
 *
 * Deliberately does NOT capture the noun phrase following the unit.
 * The noun phrase is sliced from the raw section text after the match ends,
 * which allows multiple consecutive entities on the same line to all be found
 * (the regex advances to just after the unit, not to end-of-line).
 *
 * Group 1: amount (integer or decimal)
 * Group 2: unit surface form
 */
const QE_PATTERN = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s*(${UNIT_REGEX_PART})\\b`,
  "gi"
);

/* =========================================================
   Main extractor
   ========================================================= */

/**
 * extractQuantifiedEntities — the primary API.
 *
 * Parses rawInput and returns all detected QuantifiedEntity objects,
 * ordered by position of first occurrence.
 *
 * The extractor:
 *   1. Splits the input into structural sections to assign entity roles.
 *   2. Applies the quantity regex within each section.
 *   3. Builds a QuantifiedEntity for each match.
 *
 * Robustness: syntactically odd but quantity-bearing phrases are preserved.
 */
export function extractQuantifiedEntities(rawInput: string): QuantifiedEntity[] {
  const sections = splitIntoSections(rawInput);
  const entities: QuantifiedEntity[] = [];
  let idIndex = 0;

  for (const section of sections) {
    // Reset regex lastIndex before each section (stateful global flag)
    QE_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;

    while ((match = QE_PATTERN.exec(section.text)) !== null) {
      // matchEnd is the position in section.text right after the unit token.
      // Slicing from here gives the noun phrase that follows (on the same line).
      const matchEnd = match.index + match[0].length;

      const raw: RawMatch = {
        numUnitText:  match[0],
        amount:       parseFloat(match[1]),
        unitSurface:  match[2],
        afterUnit:    section.text.slice(matchEnd),
        startIndex:   match.index,
      };

      const entity = buildEntity(raw, section.baseRole, idIndex);
      if (entity !== null) {
        entities.push(entity);
        idIndex++;
      }
    }
  }

  return entities;
}

/* =========================================================
   Convenience re-exports
   ========================================================= */

// Re-export types so callers can import everything from this file.
export type {
  QuantifiedEntity,
  QuantifiedEntityCategory,
  QuantifiedEntityRole,
} from "./quantified_entity_types";
