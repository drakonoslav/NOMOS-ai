/**
 * query_family_classifier.ts
 *
 * Deterministic classifier for the nutrition query sub-family.
 *
 * Operates on a ParsedQuery — a lightweight structural view constructed from
 * ExtractedFields AFTER field extraction has run. This is the authoritative
 * classification layer for nutrition sub-routing, and it supersedes any
 * intent-level hint provided by the raw-text intent detector.
 *
 * Usage in auto_compiler.ts:
 *
 *   const extracted = extractFields(rawInput, intent);
 *   const family    = classifyQueryFamily(fromExtractedFields(extracted));
 *   // family is the authoritative template key for nutrition queries
 *
 * Priority:
 *   1. NUTRITION_TEMPORAL_FUELING — candidates + temporal timing signals +
 *      threshold constraints (or explicit admissibility/margin language).
 *   2. NUTRITION_LABEL_TRUTH — label-verification or food-source-truth audit
 *      without temporal framing.
 *   3. NUTRITION_MEAL_AUDIT — default fallback for all other nutrition queries.
 */

import type { ExtractedFields } from "./field_extractor";

/* =========================================================
   QueryFamily type
   ========================================================= */

/**
 * QueryFamily — the three nutrition sub-families.
 *
 * These string values are intentionally identical to the IntentType keys
 * added to domain_templates.ts so that the mapping is zero-cost:
 *   classifyQueryFamily(parsed) as IntentType
 * is always valid.
 */
export type QueryFamily =
  | "NUTRITION_MEAL_AUDIT"
  | "NUTRITION_TEMPORAL_FUELING"
  | "NUTRITION_LABEL_TRUTH";

/* =========================================================
   ParsedQuery — structural view consumed by the classifier
   ========================================================= */

/**
 * ParsedQuery — minimal structural view of a query needed for classification.
 *
 * Constructed from ExtractedFields via fromExtractedFields().
 * Can also be constructed manually for unit tests.
 */
export interface ParsedQuery {
  rawInput: string;
  hasCandidates: boolean;
  hasConstraints: boolean;
  hasLabels: boolean;
  hasMealSystem: boolean;
  hasTargets: boolean;
}

/* =========================================================
   Signal tables
   ========================================================= */

/**
 * Temporal fueling signals — phrases that indicate the query is centered on
 * timed nutrient actions (pre/post workout, within-window constraints).
 *
 * Any single match is sufficient to trigger temporal fueling classification,
 * provided candidates and constraints are also present.
 */
const TEMPORAL_SIGNALS: readonly string[] = [
  "minutes before lifting",
  "minutes before training",
  "minutes before workout",
  "minutes before",
  "within 90 minutes",
  "within 60 minutes",
  "within 45 minutes",
  "within 30 minutes",
  "within 120 minutes",
  "before lifting",
  "pre-lift",
  "pre lift",
  "post-lift",
  "post lift",
  "pre-workout",
  "post-workout",
  "fueling",
  "timing window",
  "carb timing",
  "caffeine timing",
  "protein window",
];

/**
 * Threshold constraint patterns — numeric bound language that indicates
 * the query involves a threshold-style constraint over a nutrient or class.
 *
 * Combined with temporal signals, these confirm a temporal fueling query.
 */
const THRESHOLD_PATTERNS: readonly string[] = [
  "at least ",
  "at most ",
  "no more than ",
  "no less than ",
  "must be at least",
  "must not exceed",
  "must be at most",
  "≥",
  "≤",
  ">=",
  "<=",
];

/**
 * Admissibility / margin language — high-confidence temporal fueling signals
 * that indicate the query is about constraint satisfaction and candidate ranking.
 *
 * Any single match here, combined with candidates, triggers temporal fueling
 * classification without requiring temporal signals or thresholds.
 */
const ADMISSIBILITY_SIGNALS: readonly string[] = [
  "admissibility",
  "strongest margin",
  "admissible",
  "is admissible",
  "not admissible",
];

/**
 * Label truth signals — phrases that indicate the query is about verifying
 * food data against declared label evidence.
 *
 * Two or more matches are required to route to NUTRITION_LABEL_TRUTH
 * (single matches can occur in any nutrition query).
 */
const LABEL_TRUTH_SIGNALS: readonly string[] = [
  "food label",
  "nutrition facts",
  "per serving",
  "per 100g",
  "label data",
  "source truth",
  "serving size",
  "nutrition label",
  "verify label",
  "label audit",
  "label truth",
];

/* =========================================================
   Classifier
   ========================================================= */

/**
 * classifyQueryFamily — deterministic classifier for nutrition sub-families.
 *
 * Priority order (first match wins):
 *
 *   1. NUTRITION_TEMPORAL_FUELING
 *      Triggers when:
 *      - hasCandidates AND
 *      - (temporal signals detected AND (threshold patterns OR hasConstraints))
 *        OR admissibility/margin language detected
 *
 *   2. NUTRITION_LABEL_TRUTH
 *      Triggers when:
 *      - label truth signals ≥ 2 (high specificity threshold prevents false positives)
 *
 *   3. NUTRITION_MEAL_AUDIT (default fallback)
 */
export function classifyQueryFamily(parsed: ParsedQuery): QueryFamily {
  const lower = parsed.rawInput.toLowerCase();

  // ── Rule 1: NUTRITION_TEMPORAL_FUELING ─────────────────────────────────────

  const temporalHit   = hasAny(lower, TEMPORAL_SIGNALS);
  const thresholdHit  = hasAny(lower, THRESHOLD_PATTERNS);
  const admissibility = hasAny(lower, ADMISSIBILITY_SIGNALS);

  if (
    parsed.hasCandidates &&
    temporalHit &&
    (thresholdHit || parsed.hasConstraints)
  ) {
    return "NUTRITION_TEMPORAL_FUELING";
  }

  if (parsed.hasCandidates && admissibility) {
    return "NUTRITION_TEMPORAL_FUELING";
  }

  // ── Rule 2: NUTRITION_LABEL_TRUTH ──────────────────────────────────────────

  const labelScore = countMatches(lower, LABEL_TRUTH_SIGNALS);
  if (labelScore >= 2) {
    return "NUTRITION_LABEL_TRUTH";
  }

  // ── Rule 3: NUTRITION_MEAL_AUDIT (default) ─────────────────────────────────

  return "NUTRITION_MEAL_AUDIT";
}

/* =========================================================
   Utility — construct ParsedQuery from ExtractedFields
   ========================================================= */

/**
 * fromExtractedFields — converts the full ExtractedFields output into the
 * minimal ParsedQuery view consumed by the classifier.
 *
 * Keeps the classifier decoupled from the ExtractedFields implementation.
 */
export function fromExtractedFields(extracted: ExtractedFields): ParsedQuery {
  return {
    rawInput:       extracted.rawInput,
    hasCandidates:  extracted.hasCandidates,
    hasConstraints: extracted.hasConstraints,
    hasLabels:      extracted.hasLabels,
    hasMealSystem:  extracted.hasMealSystem,
    hasTargets:     extracted.hasTargets,
  };
}

/* =========================================================
   Internal helpers
   ========================================================= */

function hasAny(lower: string, signals: readonly string[]): boolean {
  return signals.some((s) => lower.includes(s));
}

function countMatches(lower: string, signals: readonly string[]): number {
  return signals.filter((s) => lower.includes(s)).length;
}
