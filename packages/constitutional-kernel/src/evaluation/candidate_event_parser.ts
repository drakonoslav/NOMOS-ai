/**
 * candidate_event_parser.ts
 *
 * Deterministic structured event extractor for candidate descriptions.
 *
 * Constitutional role:
 * - Converts a candidate raw string into one or more typed CandidateEvent objects.
 * - This is derivation only — no admissibility logic, no LAWFUL/INVALID assignments.
 * - Falls back to a generic event rather than throwing or silently returning nothing.
 *
 * Supported domains (current):
 *   NUTRITION — quantity in grams + time offset before a reference event
 *
 * Supported domains (passthrough / future):
 *   SLEEP, TRANSPORT, AGRICULTURE, GENERIC
 */

import { CandidateEvent, EventDomain, NutrientSpeed, ParsedCandidateEvents } from "./event_types.js";

/* =========================================================
   Nutrition lookup table — deterministic, not LLM-dependent
   ========================================================= */

interface NutritionEntry {
  nutrientSpeed: NutrientSpeed;
  tags: string[];
}

const NUTRITION_LOOKUP: Record<string, NutritionEntry> = {
  "cyclic dextrin": { nutrientSpeed: "FAST", tags: ["carb", "fast_digesting"] },
  "oats":           { nutrientSpeed: "SLOW", tags: ["carb", "slow_digesting"] },
};

/* =========================================================
   Public API
   ========================================================= */

/**
 * parseCandidateEvents — top-level parser.
 *
 * 1. Splits raw into event phrases.
 * 2. Parses each phrase into a CandidateEvent.
 * 3. Falls back to one generic event if nothing could be extracted.
 */
export function parseCandidateEvents(
  candidateId: string,
  raw: string
): ParsedCandidateEvents {
  const phrases  = splitCandidateIntoEventPhrases(raw);
  const notes: string[] = [];
  const events: CandidateEvent[] = [];

  phrases.forEach((phrase, i) => {
    const event = parsePhrase(candidateId, phrase, i + 1);
    events.push(event);
  });

  if (events.length === 0) {
    events.push(fallbackEvent(candidateId, raw, 1));
    notes.push("No event phrases could be extracted.");
  }

  return { candidateId, raw, events, notes };
}

/**
 * splitCandidateIntoEventPhrases — splits a candidate string into
 * individual event-like phrases.
 *
 * Rules:
 *   1. Split on commas first.
 *   2. Split on " and " only when the right-hand side begins a new event
 *      (starts with a digit or a recognised action verb).
 *   3. Trim whitespace.
 *   4. Remove empty fragments.
 *   5. Preserve phrase order.
 */
export function splitCandidateIntoEventPhrases(raw: string): string[] {
  const commaParts = raw.split(",").map(s => s.trim()).filter(s => s.length > 0);
  const result: string[] = [];

  for (const part of commaParts) {
    const andSegments = part.split(/\s+and\s+/i);

    if (andSegments.length === 1) {
      result.push(part.trim());
      continue;
    }

    let current = andSegments[0].trim();

    for (let i = 1; i < andSegments.length; i++) {
      const seg = andSegments[i].trim();
      if (looksLikeNewEvent(seg)) {
        result.push(current);
        current = seg;
      } else {
        current += " and " + seg;
      }
    }

    result.push(current);
  }

  return result.filter(s => s.length > 0);
}

/* =========================================================
   Helper parsers
   ========================================================= */

/**
 * detectQuantity — extracts a numeric quantity and its units.
 *
 * Handles:
 *   "80g", "80 g", "80 grams", "30ml"
 */
export function detectQuantity(raw: string): { quantity?: number; quantityUnits?: string } {
  const gramMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:grams?|g)\b/i);
  if (gramMatch) return { quantity: parseFloat(gramMatch[1]), quantityUnits: "g" };

  const mlMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:milliliters?|ml)\b/i);
  if (mlMatch) return { quantity: parseFloat(mlMatch[1]), quantityUnits: "ml" };

  return {};
}

/**
 * detectTimeOffset — extracts a signed time offset in minutes.
 *
 * Handles:
 *   "30 minutes before lifting"  → { timeOffsetMinutes: -30, referenceEvent: "lifting" }
 *   "2 hours before lifting"     → { timeOffsetMinutes: -120, referenceEvent: "lifting" }
 *   "45 min before lifting"      → { timeOffsetMinutes: -45, referenceEvent: "lifting" }
 */
export function detectTimeOffset(raw: string): { timeOffsetMinutes?: number; referenceEvent?: string } {
  const beforeRx = /(\d+(?:\.\d+)?)\s*(minutes?|min|hours?|hrs?|hr)\s+before\s+([a-z][a-z ]*?)(?:[.,!?]|\s*$)/i;
  const m = raw.match(beforeRx);
  if (m) {
    const value = parseFloat(m[1]);
    const unit  = m[2].toLowerCase();
    const ref   = m[3].trim();
    const minutes = (unit.startsWith("hour") || unit === "hr" || unit === "hrs")
      ? value * 60
      : value;
    return { timeOffsetMinutes: -minutes, referenceEvent: ref };
  }
  return {};
}

/**
 * detectNutritionSubject — returns the matched nutrition substance,
 * its digestion speed, and base tags from NUTRITION_LOOKUP.
 */
export function detectNutritionSubject(raw: string): {
  subject?: string;
  nutrientSpeed?: NutrientSpeed;
  tags: string[];
} {
  const lower = raw.toLowerCase();
  // Longest key first to avoid partial matches
  const keys = Object.keys(NUTRITION_LOOKUP).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    if (lower.includes(key)) {
      const entry = NUTRITION_LOOKUP[key];
      return { subject: key, nutrientSpeed: entry.nutrientSpeed, tags: [...entry.tags] };
    }
  }
  return { tags: [] };
}

/**
 * detectAction — returns a normalised action verb.
 *
 * For NUTRITION domain, defaults to "consume" when food substance present
 * and no explicit verb is found.
 */
export function detectAction(raw: string, domain: EventDomain): string | undefined {
  const lower = raw.toLowerCase();
  const verbs = ["consume", "eat", "drink", "sleep", "carry", "toss", "throw", "slide", "harvest", "till"];

  for (const verb of verbs) {
    if (new RegExp(`\\b${verb}\\b`, "i").test(lower)) return verb;
  }

  if (domain === "NUTRITION") return "consume";
  return undefined;
}

/* =========================================================
   Internal helpers
   ========================================================= */

function parsePhrase(candidateId: string, phrase: string, index: number): CandidateEvent {
  const { quantity, quantityUnits } = detectQuantity(phrase);
  const { timeOffsetMinutes, referenceEvent } = detectTimeOffset(phrase);
  const { subject, nutrientSpeed, tags: baseTags } = detectNutritionSubject(phrase);

  const isNutrition = subject !== undefined || (quantity !== undefined && quantityUnits === "g");
  const domain: EventDomain = isNutrition ? "NUTRITION" : "GENERIC";
  const action = detectAction(phrase, domain);

  const tags: string[] = [...baseTags];
  if (timeOffsetMinutes !== undefined && referenceEvent !== undefined) {
    tags.push("pre_lift"); // generalise later when more reference events are supported
  }

  const hasStructuredData = subject !== undefined || quantity !== undefined;

  if (!hasStructuredData) {
    return fallbackEvent(candidateId, phrase, index);
  }

  return {
    id: `${candidateId}_e${index}`,
    candidateId,
    domain,
    raw: phrase,
    action,
    subject,
    quantity,
    quantityUnits,
    timeOffsetMinutes,
    referenceEvent,
    nutrientSpeed,
    tags,
    confidence: 0.9,
  };
}

function fallbackEvent(candidateId: string, raw: string, index: number): CandidateEvent {
  return {
    id: `${candidateId}_e${index}`,
    candidateId,
    domain: "GENERIC",
    raw,
    tags: [],
    confidence: 0.2,
    notes: ["Deterministic event parsing failed."],
  };
}

/**
 * A phrase looks like a new event when it starts with a digit (quantity),
 * or with a recognised action verb.
 */
function looksLikeNewEvent(phrase: string): boolean {
  const trimmed = phrase.trim();
  if (/^\d/.test(trimmed)) return true;
  if (/^(consume|eat|drink|sleep|carry|toss|throw|slide|harvest|till)\b/i.test(trimmed)) return true;
  return false;
}
