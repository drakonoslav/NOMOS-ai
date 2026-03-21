/**
 * candidate_normalizer.ts
 *
 * Converts a raw candidate description into action semantics.
 *
 * Constitutional role:
 * - Extracts verbs, actions, and risk flags from candidate text.
 * - Does not classify legality — only produces structured input for the
 *   deterministic matcher and the LLM evaluator.
 * - Risk flags are named semantic signals, not statuses.
 */

import { NormalizedCandidate } from "./eval_types.js";

const KNOWN_VERBS = [
  "carry",
  "toss",
  "throw",
  "slide",
  "transport",
  "harvest",
  "delay",
  "till",
  "fertilize",
  "reduce",
  "increase",
  "decompose",
  "leave",
  "apply",
  "use",
  "cart",
  "secure",
  "place",
  "move",
  "push",
  "pull",
  "drag",
  "lift",
  "hold",
  "drop",
  "roll",
  "set",
];

export function normalizeCandidate(id: string, raw: string): NormalizedCandidate {
  const lower = raw.toLowerCase();

  const detectedVerbs = KNOWN_VERBS.filter((v) => lower.includes(v));
  const riskFlags: string[] = [];

  // Uncontrolled release — toss/throw means the object leaves controlled contact
  if (lower.includes("toss") || lower.includes("throw") || lower.includes("hurl") || lower.includes("fling")) {
    riskFlags.push("release_control");
  }

  // Reduced control — sliding preserves contact but reduces friction-based control
  if (lower.includes("slide") || lower.includes("drag") || lower.includes("push along")) {
    riskFlags.push("reduced_control");
  }

  // Soil or structural disturbance
  if (lower.includes("till") || lower.includes("turnover") || lower.includes("plow") || lower.includes("excavate")) {
    riskFlags.push("soil_disturbance");
  }

  // Resource intensity signals
  if (
    lower.includes("increase irrigation") ||
    lower.includes("more water") ||
    lower.includes("higher resource") ||
    lower.includes("additional budget")
  ) {
    riskFlags.push("resource_intensity");
  }

  // Structural alteration
  if (
    lower.includes("break") ||
    lower.includes("cut") ||
    lower.includes("disassemble") ||
    lower.includes("remove part")
  ) {
    riskFlags.push("structural_alteration");
  }

  return {
    id,
    raw,
    actions: detectedVerbs,
    detectedVerbs,
    riskFlags,
  };
}
