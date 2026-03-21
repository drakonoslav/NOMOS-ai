/**
 * event_types.ts
 *
 * Shared types for the NOMOS structured event model.
 *
 * Constitutional role:
 * - Moves candidate representation from a flat string to a set of typed events.
 * - These types are consumed by candidate_event_parser.ts (derivation layer)
 *   and windowed_aggregator.ts (aggregation layer).
 * - No evaluation or admissibility logic belongs here.
 */

/* =========================================================
   Domain + nutrient speed enumerations
   ========================================================= */

/**
 * High-level domain of a parsed candidate event.
 */
export type EventDomain =
  | "NUTRITION"
  | "SLEEP"
  | "TRANSPORT"
  | "AGRICULTURE"
  | "GENERIC";

/**
 * Digestion speed classification for nutrition events.
 */
export type NutrientSpeed =
  | "FAST"
  | "SLOW"
  | "UNKNOWN";

/* =========================================================
   CandidateEvent
   ========================================================= */

/**
 * One parsed action or state event extracted from a candidate description.
 *
 * A single candidate string may produce multiple CandidateEvents.
 *
 * Examples:
 *   "80g cyclic dextrin 30 minutes before lifting" → one NUTRITION event
 *   "60g cyclic dextrin 75 min before lifting and 30g oats 45 min before lifting"
 *     → two NUTRITION events
 */
export interface CandidateEvent {
  /**
   * Stable local event id within the candidate.
   * Pattern: "<candidateId>_e<index>"
   * Example: "A_e1"
   */
  id: string;

  /**
   * Candidate id this event belongs to.
   * Example: "A"
   */
  candidateId: string;

  /**
   * High-level domain.
   */
  domain: EventDomain;

  /**
   * Raw text fragment that produced this event.
   * Example: "80g cyclic dextrin 30 minutes before lifting"
   */
  raw: string;

  /**
   * Normalized action verb when detectable.
   * Examples: "consume", "sleep", "carry", "toss", "harvest"
   */
  action?: string;

  /**
   * Primary object, substance, or entity involved.
   * Examples: "cyclic dextrin", "oats", "object"
   */
  subject?: string;

  /**
   * Numeric quantity if present.
   * Example: 80
   */
  quantity?: number;

  /**
   * Quantity units.
   * Examples: "g", "ml", "minutes", "hours"
   */
  quantityUnits?: string;

  /**
   * Relative time offset in minutes from the reference event.
   * Pre-event offsets are negative:
   *   30 minutes before lifting → -30
   *   2 hours before lifting   → -120
   * Post-event offsets are positive.
   */
  timeOffsetMinutes?: number;

  /**
   * Named reference anchor from which the time offset is measured.
   * Examples: "lifting", "bedtime", "frost"
   */
  referenceEvent?: string;

  /**
   * Nutrient digestion speed for NUTRITION domain events.
   */
  nutrientSpeed?: NutrientSpeed;

  /**
   * Categorical tags used by evaluators and aggregators.
   * Examples: ["carb", "fast_digesting", "pre_lift"]
   */
  tags: string[];

  /**
   * Parsing confidence for this event in [0.0, 1.0].
   * 0.9 = structured data successfully extracted.
   * 0.2 = fallback — raw text preserved only.
   */
  confidence: number;

  /**
   * Optional notes about parsing ambiguity or fallback conditions.
   */
  notes?: string[];
}

/* =========================================================
   ParsedCandidateEvents
   ========================================================= */

/**
 * Output of the candidate event parser for one candidate.
 */
export interface ParsedCandidateEvents {
  candidateId: string;
  raw: string;
  events: CandidateEvent[];
  notes: string[];
}
