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
