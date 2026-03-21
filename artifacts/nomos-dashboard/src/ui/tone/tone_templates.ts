/**
 * tone_templates.ts
 *
 * Phrasing templates for each verification status × tone level.
 *
 * Design rules:
 * - INVALID: shortest possible. No speculation. No emotional escalation.
 * - DEGRADED: controlled, informative. Not alarmist.
 * - LAWFUL: quiet confidence. More compressed = more certain.
 *
 * Each template returns title + summary + optional detail lines.
 * Cards render title + summary always; details only at EXPLAINED/EXPANDED.
 */

import { ToneLevel, ToneResolverInput } from "./tone_types";

export interface ToneMessage {
  title: string;
  summary: string;
  details?: string[];
}

function deriveInvalidReason(input: ToneResolverInput): string {
  if (input.feasibilityOk === false) return "Feasibility violation detected.";
  if (input.observabilityOk === false) return "Observability insufficient for reliable control.";
  if (input.identifiability === "NONE") return "Identifiability failure detected.";
  if (input.modelOk === false) return "Model adequacy below legal threshold.";
  if (input.robustnessOk === false) return "Robustness below minimum required margin.";
  return "Verification failed.";
}

function lawfulMessage(level: ToneLevel, input: ToneResolverInput): ToneMessage {
  switch (level) {
    case "TERSE":
      return {
        title: "LAWFUL",
        summary: "Action authorized.",
      };
    case "CONCISE":
      return {
        title: "LAWFUL",
        summary: "Action authorized under current model assumptions.",
      };
    case "EXPLAINED":
      return {
        title: "LAWFUL",
        summary: "Action authorized with bounded uncertainty.",
        details: [
          `State tolerance εx = ${input.epsilonX.toFixed(3)}`,
          `Model confidence = ${input.modelConfidence.toFixed(2)}`,
        ],
      };
    case "EXPANDED":
      return {
        title: "LAWFUL",
        summary: "Action authorized, but confidence is limited by current uncertainty.",
        details: [
          `State tolerance εx = ${input.epsilonX.toFixed(3)}`,
          `Identifiability = ${input.identifiability}`,
          `Model confidence = ${input.modelConfidence.toFixed(2)}`,
        ],
      };
  }
}

function degradedMessage(level: ToneLevel, input: ToneResolverInput): ToneMessage {
  switch (level) {
    case "TERSE":
      return {
        title: "DEGRADED",
        summary: "Constrained action applied.",
      };
    case "CONCISE":
      return {
        title: "DEGRADED",
        summary: "Constrained action applied under reduced margin.",
      };
    case "EXPLAINED":
      return {
        title: "DEGRADED",
        summary: "Robustness or model confidence is below preferred threshold.",
        details: [
          input.robustnessEpsilon !== undefined && input.robustnessEpsilonMin !== undefined
            ? `Robustness ε = ${input.robustnessEpsilon.toFixed(3)} (min ${input.robustnessEpsilonMin.toFixed(3)})`
            : `Model confidence = ${input.modelConfidence.toFixed(2)}`,
        ],
      };
    case "EXPANDED":
      return {
        title: "DEGRADED",
        summary: "Reliable full-authority action is not supported by the current epistemic state.",
        details: [
          `State tolerance εx = ${input.epsilonX.toFixed(3)}`,
          `Identifiability = ${input.identifiability}`,
          `Model confidence = ${input.modelConfidence.toFixed(2)}`,
          input.robustnessEpsilon !== undefined && input.robustnessEpsilonMin !== undefined
            ? `Robustness ε = ${input.robustnessEpsilon.toFixed(3)} (min ${input.robustnessEpsilonMin.toFixed(3)})`
            : "Robustness margin reduced.",
        ],
      };
  }
}

function invalidMessage(level: ToneLevel, input: ToneResolverInput): ToneMessage {
  // INVALID is always TERSE — final, declarative, no elaboration
  switch (level) {
    case "TERSE":
      return {
        title: "INVALID",
        summary: "Action refused.",
        details: [deriveInvalidReason(input)],
      };
    case "CONCISE":
      return {
        title: "INVALID",
        summary: "No lawful action exists.",
        details: [deriveInvalidReason(input)],
      };
    case "EXPLAINED":
      return {
        title: "INVALID",
        summary: "The current state does not satisfy minimum legality conditions.",
        details: [
          deriveInvalidReason(input),
          `State tolerance εx = ${input.epsilonX.toFixed(3)}`,
        ],
      };
    case "EXPANDED":
      return {
        title: "INVALID",
        summary: "Action refused. Legality cannot be established under current constraints, knowledge state, or model condition.",
        details: [
          deriveInvalidReason(input),
          `Identifiability = ${input.identifiability}`,
          `Model confidence = ${input.modelConfidence.toFixed(2)}`,
          `State tolerance εx = ${input.epsilonX.toFixed(3)}`,
        ],
      };
  }
}

export function buildToneMessage(
  input: ToneResolverInput,
  level: ToneLevel
): ToneMessage {
  switch (input.verificationStatus) {
    case "LAWFUL":
      return lawfulMessage(level, input);
    case "DEGRADED":
      return degradedMessage(level, input);
    case "INVALID":
      return invalidMessage(level, input);
  }
}
