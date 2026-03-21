/**
 * completeness_engine.ts
 *
 * Deterministic completeness scoring (0–100%).
 * Weights:
 *   Intent defined        30%
 *   Constraints present   25%
 *   Constraints valid     25%
 *   Assumptions defined   10%
 *   No critical errors    10%
 */

import { PHRASES } from "./semantic_phrases";
import type { ConversationDraft } from "./types";
import type { ValidationIssue } from "./validation_engine";

export interface CompletenessResult {
  score: number;
  breakdown: {
    intent:              boolean;
    constraintsPresent:  boolean;
    constraintsValid:    boolean;
    assumptions:         boolean;
    noErrors:            boolean;
  };
  guidance?: string;
}

export function computeCompleteness(
  draft: ConversationDraft,
  issues: ValidationIssue[]
): CompletenessResult {
  const hasIntent       = !!draft.intent;
  const constraints     = draft.constraints ?? [];
  const hasConstraints  = constraints.length > 0;
  const hasErrors       = issues.some((i) => i.severity === "error");
  const constraintsValid =
    hasConstraints &&
    !issues.some((i) => i.field === "constraint" && i.severity === "error");
  const hasAssumptions  = !!draft.assumptions && draft.assumptions.length > 0;
  const noErrors        = !hasErrors;

  let score = 0;
  if (hasIntent)          score += 30;
  if (hasConstraints)     score += 25;
  if (constraintsValid)   score += 25;
  if (hasAssumptions)     score += 10;
  if (noErrors)           score += 10;

  const breakdown = {
    intent:             hasIntent,
    constraintsPresent: hasConstraints,
    constraintsValid,
    assumptions:        hasAssumptions,
    noErrors,
  };

  return {
    score,
    breakdown,
    guidance: generateCompletenessGuidance(issues, breakdown),
  };
}

function generateCompletenessGuidance(
  issues: ValidationIssue[],
  breakdown: CompletenessResult["breakdown"]
): string | undefined {
  const thresholdErr   = issues.find((i) => i.id.includes("threshold"));
  const unitWarn       = issues.find((i) => i.id.includes("unit"));
  const ambiguousWarn  = issues.find((i) => i.id.includes("ambiguous"));

  if (thresholdErr)                  return PHRASES.constraint_threshold.guidance;
  if (unitWarn)                      return PHRASES.constraint_unit.guidance;
  if (ambiguousWarn)                 return PHRASES.constraint_ambiguous.guidance;
  if (!breakdown.intent)             return PHRASES.intent_missing.guidance;
  if (!breakdown.constraintsPresent) return PHRASES.constraints_missing.guidance;
  if (!breakdown.constraintsValid)   return PHRASES.constraint_threshold.guidance;
  if (!breakdown.assumptions)        return PHRASES.assumptions_missing.guidance;
  if (breakdown.noErrors)            return PHRASES.valid.guidance;

  return undefined;
}
