/**
 * constraint_normalizer.ts
 *
 * Converts raw constraint text into a typed NormalizedConstraint.
 *
 * Constitutional role:
 * - Classifies constraints by kind so the deterministic matcher can apply
 *   kind-specific evaluation rules.
 * - For quantitative domains (e.g. SLEEP_MIN_DURATION_AND_CONTINUITY), also
 *   extracts numeric params so evaluators don't need to re-parse the raw text.
 * - Does not evaluate candidates — only classifies what the constraint requires.
 * - Produces "UNKNOWN" for constraints that cannot be deterministically classified;
 *   those are forwarded to the LLM semantic evaluator.
 *
 * Nutrition domain additions (NUTRITION_*):
 * - NUTRITION_STRUCTURAL_LOCK  — preserve protein placement, meal order, meal count, dispersal
 * - NUTRITION_ALLOWED_ACTION   — only adjust gram amounts of already-present foods
 * - NUTRITION_TARGET_TOLERANCE — minimize calorie delta or changeset (guidance, not prohibition)
 * - NUTRITION_SOURCE_TRUTH     — declared macros override, estimated defaults, label priority
 */

import { NormalizedConstraint } from "./eval_types.js";

export function normalizeConstraint(raw: string): NormalizedConstraint {
  const text = raw.toLowerCase();

  /* =========================================================
     SLEEP_MIN_DURATION_AND_CONTINUITY — checked first because
     "continuous" / "wake" would otherwise fall through to generic matchers.
     ========================================================= */

  if (
    text.includes("total sleep") ||
    (text.includes("sleep") && text.includes("at least") && (text.includes("hour") || text.includes("continuous"))) ||
    text.includes("no wake period longer than") ||
    (text.includes("sleep") && text.includes("continuous") && text.includes("wake"))
  ) {
    return {
      raw,
      kind: "SLEEP_MIN_DURATION_AND_CONTINUITY",
      decisiveVariable: "sleep duration margin",
      params: {
        minTotalSleepMinutes: parseMinSleepMinutes(text),
        maxWakeGapMinutes: parseMaxWakeGapMinutes(text),
      },
    };
  }

  /* =========================================================
     NUTRITION_STRUCTURAL_LOCK
     — preserve protein placement, meal order, meal count, dispersal
     ========================================================= */

  if (
    text.includes("protein placement") ||
    text.includes("do not move protein") ||
    text.includes("preserve protein placement") ||
    (text.includes("protein") && text.includes("between meals"))
  ) {
    return {
      raw,
      kind: "NUTRITION_STRUCTURAL_LOCK",
      key: "preserve_protein_placement",
      decisiveVariable: "protein placement",
    };
  }

  if (
    text.includes("meal order") ||
    text.includes("do not change meal order") ||
    text.includes("preserve meal order") ||
    text.includes("do not reorder meal")
  ) {
    return {
      raw,
      kind: "NUTRITION_STRUCTURAL_LOCK",
      key: "preserve_meal_order",
      decisiveVariable: "meal order",
    };
  }

  if (
    text.includes("do not remove meals") ||
    text.includes("do not remove meal") ||
    text.includes("preserve meal count") ||
    text.includes("no meal removal") ||
    (text.includes("remove") && text.includes("meal"))
  ) {
    return {
      raw,
      kind: "NUTRITION_STRUCTURAL_LOCK",
      key: "preserve_meal_count",
      decisiveVariable: "meal count",
    };
  }

  if (
    text.includes("dispersal") ||
    text.includes("meal plan dispersal") ||
    text.includes("botch") ||
    (text.includes("timeblock") || text.includes("time block") || text.includes("time-block"))
  ) {
    return {
      raw,
      kind: "NUTRITION_STRUCTURAL_LOCK",
      key: "preserve_meal_dispersal",
      decisiveVariable: "meal dispersal",
    };
  }

  /* =========================================================
     NUTRITION_ALLOWED_ACTION
     — only adjust gram amounts or unit counts of already-present foods
     ========================================================= */

  if (
    text.includes("only adjust gram") ||
    text.includes("already-present foods") ||
    text.includes("already present foods") ||
    text.includes("gram amounts of already") ||
    text.includes("unit counts of already") ||
    (text.includes("adjust") && text.includes("gram") && text.includes("present")) ||
    (text.includes("only adjust") && text.includes("food"))
  ) {
    return {
      raw,
      kind: "NUTRITION_ALLOWED_ACTION",
      key: "adjustment_scope",
      decisiveVariable: "food adjustment scope",
    };
  }

  /* =========================================================
     NUTRITION_TARGET_TOLERANCE
     — minimize calorie delta or total changeset
     ========================================================= */

  if (
    text.includes("calorie") && (
      text.includes("lockdown") ||
      text.includes("lock down") ||
      text.includes("tightly as possible") ||
      text.includes("as tight") ||
      text.includes("as close as possible")
    )
  ) {
    return {
      raw,
      kind: "NUTRITION_TARGET_TOLERANCE",
      key: "calorie_delta_minimize",
      decisiveVariable: "calorie delta",
    };
  }

  if (
    (text.includes("prefer") || text.includes("minimize")) &&
    (
      text.includes("structure-preserving") ||
      text.includes("minimal change") ||
      text.includes("minimal structure") ||
      text.includes("smallest change") ||
      text.includes("fewest changes")
    )
  ) {
    return {
      raw,
      kind: "NUTRITION_TARGET_TOLERANCE",
      key: "minimize_change_magnitude",
      decisiveVariable: "change magnitude",
    };
  }

  /* =========================================================
     NUTRITION_SOURCE_TRUTH
     — declared macros as truth, estimated defaults, label priority
     ========================================================= */

  if (
    (text.includes("declared") && text.includes("macro") && text.includes("truth")) ||
    (text.includes("use declared") && text.includes("macro")) ||
    (text.includes("macro values") && text.includes("truth")) ||
    text.includes("declared macro values as truth")
  ) {
    return {
      raw,
      kind: "NUTRITION_SOURCE_TRUTH",
      key: "declared_macros_override",
      decisiveVariable: "macro source",
    };
  }

  if (
    text.includes("estimated default") ||
    (text.includes("treat") && text.includes("estimated")) ||
    (text.includes("as estimated") && text.includes("default"))
  ) {
    return {
      raw,
      kind: "NUTRITION_SOURCE_TRUTH",
      key: "estimated_defaults_allowed",
      decisiveVariable: "estimated defaults",
    };
  }

  if (
    text.includes("label truth") ||
    text.includes("label priority") ||
    (text.includes("label") && text.includes("override") && text.includes("food")) ||
    (text.includes("labels") && text.includes("provided") && text.includes("override")) ||
    // "Use attached food labels as source truth where provided."
    (text.includes("label") && text.includes("as source truth")) ||
    (text.includes("labels") && text.includes("source truth")) ||
    (text.includes("food label") && text.includes("source truth")) ||
    (text.includes("attached") && text.includes("label") && text.includes("source truth"))
  ) {
    return {
      raw,
      kind: "NUTRITION_SOURCE_TRUTH",
      key: "label_priority",
      decisiveVariable: "macro source conflict",
    };
  }

  // "Do not infer food behavior that is not supported by declared labels or source data."
  // Restricts inferences to only declared/labelled evidence — an allowed-action boundary.
  if (
    (text.includes("do not infer") && text.includes("food")) ||
    (text.includes("not infer") && text.includes("declared")) ||
    text.includes("not supported by declared labels") ||
    text.includes("not supported by declared") ||
    (text.includes("infer") && text.includes("declared labels"))
  ) {
    return {
      raw,
      kind: "NUTRITION_ALLOWED_ACTION",
      key: "inference_scope",
      decisiveVariable: "disallowed food inference",
    };
  }

  /* =========================================================
     NUTRITION_CARB_TIMING
     — "at least Xg of fast-digesting carbs within Y min before lifting"
     — "no more than Xg of slow-digesting carbs within Y min before lifting"
     Must be checked BEFORE BOUNDED_TIME because both contain "within".
     ========================================================= */

  {
    const carbTimingParams = parseCarbTimingParams(text, raw);
    if (carbTimingParams !== null) {
      return {
        raw,
        kind: "NUTRITION_CARB_TIMING",
        decisiveVariable: "carb timing window",
        params: carbTimingParams,
      };
    }
  }

  /* =========================================================
     Action-control domains
     ========================================================= */

  if (
    text.includes("must not be dropped") ||
    text.includes("must not drop") ||
    text.includes("cannot be dropped") ||
    text.includes("object must not be dropped")
  ) {
    return {
      raw,
      kind: "NO_DROP",
      protectedObject: "object",
      decisiveVariable: "drop risk",
    };
  }

  if (
    text.includes("without full turnover") ||
    text.includes("must be preserved") ||
    text.includes("must not be turned over") ||
    text.includes("no turnover")
  ) {
    return {
      raw,
      kind: "NO_TURNOVER",
      decisiveVariable: "soil disturbance",
    };
  }

  if (
    text.includes("preserve structure") ||
    text.includes("structural integrity") ||
    text.includes("must maintain structure")
  ) {
    return {
      raw,
      kind: "PRESERVE_STRUCTURE",
      decisiveVariable: "structural integrity",
    };
  }

  if (
    text.includes("must not release") ||
    text.includes("cannot release") ||
    text.includes("must maintain control") ||
    text.includes("must not lose control")
  ) {
    return {
      raw,
      kind: "NO_RELEASE",
      decisiveVariable: "control continuity",
    };
  }

  if (
    text.includes("within") ||
    text.includes("must not exceed") ||
    text.includes("no more than") ||
    text.includes("time limit") ||
    text.includes("deadline")
  ) {
    const thresholdMatch = raw.match(/(\d+[\s]?\w+)/);
    return {
      raw,
      kind: "BOUNDED_TIME",
      threshold: thresholdMatch?.[1],
      decisiveVariable: "time bound",
    };
  }

  if (
    text.includes("budget") ||
    text.includes("cost") ||
    text.includes("resource") ||
    text.includes("memory") ||
    text.includes("capacity") ||
    text.includes("must not use more than")
  ) {
    return {
      raw,
      kind: "BOUNDED_RESOURCE",
      decisiveVariable: "resource bound",
    };
  }

  return {
    raw,
    kind: "UNKNOWN",
    decisiveVariable: "constraint interpretation",
  };
}

/* =========================================================
   Carb timing constraint parser
   ========================================================= */

/**
 * parseCarbTimingParams — detects carb-timing constraints and extracts
 * numeric params for fast-carb min and slow-carb max sub-constraints.
 *
 * Returns null when the constraint text does not match the carb-timing pattern.
 *
 * Patterns handled:
 *   "at least Xg of fast-digesting carbohydrates ... within Y minutes"
 *   "no more than Zg of slow-digesting carbohydrates ... within W minutes"
 *   Compound sentences containing both patterns joined by ", and".
 */
function parseCarbTimingParams(text: string, raw: string): Record<string, number> | null {
  const hasFast =
    text.includes("fast-digesting") ||
    text.includes("fast digesting") ||
    text.includes("fast carb") ||
    text.includes("fast-carb");

  const hasSlow =
    text.includes("slow-digesting") ||
    text.includes("slow digesting") ||
    text.includes("slow carb") ||
    text.includes("slow-carb");

  const hasCarb =
    text.includes("carbohydrate") || text.includes("carb");

  const hasTiming =
    text.includes("before lifting") ||
    text.includes("before workout") ||
    text.includes("before training") ||
    text.includes("before exercise") ||
    text.includes("pre-lift") ||
    text.includes("pre-workout");

  // Require at least one speed signal + carb signal + timing signal
  if (!((hasFast || hasSlow) && hasCarb && hasTiming)) return null;

  // Split at ", and " to separate the two sub-constraints if compound
  const parts = raw.split(/,\s*and\s*/i);
  const part1 = parts[0] ?? "";
  const part2 = parts[1] ?? raw; // fallback to whole text for single-constraint form

  const result: Record<string, number> = {};

  // Fast carb minimum: "at least Xg ... within Y min"
  const fastMinGramMatch = part1.match(/at\s+least\s+(\d+)\s*g/i);
  const fastWindowMatch  = part1.match(/within\s+(\d+)\s*(?:min|minutes?|hrs?|hours?)/i);
  if (fastMinGramMatch && fastWindowMatch) {
    const rawWindow = part1.match(/within\s+(\d+)\s*(min|minutes?|hrs?|hours?)/i);
    const windowValue = rawWindow ? parseInt(rawWindow[1], 10) : 0;
    const isHours = rawWindow ? /hrs?|hours?/i.test(rawWindow[2]) : false;
    result["fastCarbMinGrams"]    = parseInt(fastMinGramMatch[1], 10);
    result["fastCarbWindowMinutes"] = isHours ? windowValue * 60 : windowValue;
  }

  // Slow carb maximum: "no more than Xg ... within Y min"
  const slowPart = parts.length > 1 ? part2 : raw;
  const slowMaxGramMatch = slowPart.match(/no\s+more\s+than\s+(\d+)\s*g/i);
  const slowWindowMatch  = slowPart.match(/within\s+(\d+)\s*(?:min|minutes?|hrs?|hours?)/i);
  if (slowMaxGramMatch && slowWindowMatch) {
    const rawWindow = slowPart.match(/within\s+(\d+)\s*(min|minutes?|hrs?|hours?)/i);
    const windowValue = rawWindow ? parseInt(rawWindow[1], 10) : 0;
    const isHours = rawWindow ? /hrs?|hours?/i.test(rawWindow[2]) : false;
    result["slowCarbMaxGrams"]    = parseInt(slowMaxGramMatch[1], 10);
    result["slowCarbWindowMinutes"] = isHours ? windowValue * 60 : windowValue;
  }

  // Single-part slow constraint (e.g. "no more than 20g slow carbs within 60 min before lifting")
  if (!result["slowCarbMaxGrams"] && hasSlow) {
    const singleSlowGram   = raw.match(/no\s+more\s+than\s+(\d+)\s*g/i);
    const singleSlowWindow = raw.match(/within\s+(\d+)\s*(min|minutes?|hrs?|hours?)/i);
    if (singleSlowGram && singleSlowWindow) {
      const windowValue = parseInt(singleSlowWindow[1], 10);
      const isHours = /hrs?|hours?/i.test(singleSlowWindow[2]);
      result["slowCarbMaxGrams"]    = parseInt(singleSlowGram[1], 10);
      result["slowCarbWindowMinutes"] = isHours ? windowValue * 60 : windowValue;
    }
  }

  // Single-part fast constraint (e.g. "at least 60g fast carbs within 90 min before lifting")
  if (!result["fastCarbMinGrams"] && hasFast) {
    const singleFastGram   = raw.match(/at\s+least\s+(\d+)\s*g/i);
    const singleFastWindow = raw.match(/within\s+(\d+)\s*(min|minutes?|hrs?|hours?)/i);
    if (singleFastGram && singleFastWindow) {
      const windowValue = parseInt(singleFastWindow[1], 10);
      const isHours = /hrs?|hours?/i.test(singleFastWindow[2]);
      result["fastCarbMinGrams"]    = parseInt(singleFastGram[1], 10);
      result["fastCarbWindowMinutes"] = isHours ? windowValue * 60 : windowValue;
    }
  }

  // Must have at least one parsed param to qualify
  return Object.keys(result).length > 0 ? result : null;
}

/* =========================================================
   Sleep constraint param parsers
   ========================================================= */

function parseMinSleepMinutes(text: string): number {
  // "at least 7 hours" → 420
  const hourMatch = text.match(/at\s+least\s+(\d+(?:\.\d+)?)\s*hours?/);
  if (hourMatch) return parseFloat(hourMatch[1]) * 60;

  // "at least 420 minutes"
  const minMatch = text.match(/at\s+least\s+(\d+)\s*minutes?/);
  if (minMatch) return parseInt(minMatch[1], 10);

  return 420; // default: 7 hours
}

function parseMaxWakeGapMinutes(text: string): number {
  // "no wake period longer than 20 minutes"
  const minMatch = text.match(/no\s+wake\s+period\s+longer\s+than\s+(\d+)\s*minutes?/);
  if (minMatch) return parseInt(minMatch[1], 10);

  // "wake period no longer than 20 minutes" (alternate phrasing)
  const altMatch = text.match(/wake\s+period.*?(\d+)\s*minutes?/);
  if (altMatch) return parseInt(altMatch[1], 10);

  // "no wake period longer than 1 hour"
  const hourMatch = text.match(/no\s+wake\s+period\s+longer\s+than\s+(\d+)\s*hours?/);
  if (hourMatch) return parseInt(hourMatch[1], 10) * 60;

  return 20; // default: 20 minutes
}
