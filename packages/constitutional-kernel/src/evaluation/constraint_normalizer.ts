/**
 * constraint_normalizer.ts
 *
 * Converts raw constraint text into a typed NormalizedConstraint.
 *
 * Constitutional role:
 * - Classifies constraints by kind so the deterministic matcher can apply
 *   kind-specific evaluation rules.
 * - Does not evaluate candidates — only classifies what the constraint requires.
 * - Produces "UNKNOWN" for constraints that cannot be deterministically classified;
 *   those are forwarded to the LLM semantic evaluator.
 */

import { NormalizedConstraint } from "./eval_types.js";

export function normalizeConstraint(raw: string): NormalizedConstraint {
  const text = raw.toLowerCase();

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
