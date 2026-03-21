/**
 * semantic_map.ts
 *
 * Dictionary of NOMOS domain terms with definitions and optional
 * dynamic context lines derived from the current ToneResolverInput.
 */

import type { ToneResolverInput } from "../tone/tone_types";

export interface SemanticEntry {
  label: string;
  description: string;
  dynamic?: (ctx: ToneResolverInput) => string;
}

export const SEMANTIC_MAP: Record<string, SemanticEntry> = {
  "robustness margin": {
    label: "Robustness Margin",
    description: "Distance between current operating point and failure threshold.",
    dynamic: (ctx) =>
      ctx.robustnessEpsilon !== undefined
        ? `ε = ${ctx.robustnessEpsilon} (min ${ctx.robustnessEpsilonMin ?? "—"})`
        : "",
  },

  "feasibility constraint": {
    label: "Feasibility Constraint",
    description: "A required condition that must be satisfied for any valid action.",
    dynamic: (ctx) =>
      ctx.activeConstraint ? `Violated: ${ctx.activeConstraint}` : "",
  },

  "model confidence": {
    label: "Model Confidence",
    description: "Estimated reliability of the system model under current conditions.",
    dynamic: (ctx) =>
      ctx.modelConfidence !== undefined
        ? `Confidence: ${ctx.modelConfidence.toFixed(2)}`
        : "",
  },

  "observability": {
    label: "Observability",
    description: "Ability to infer internal system state from available measurements.",
  },

  "identifiability": {
    label: "Identifiability",
    description: "Ability to uniquely determine system parameters from data.",
  },

  "adaptation": {
    label: "Adaptation",
    description: "Capacity of the system to update its model in response to new observations.",
  },
};
