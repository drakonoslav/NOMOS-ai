/**
 * suggestion_engine.ts
 *
 * Suggestion layer: rule-based + validation-derived.
 * Provides non-authoritative refinement proposals.
 * User remains author — nothing is auto-applied.
 */

import type { ConversationDraft } from "./types";
import type { ValidationIssue } from "./validation_engine";

export interface Suggestion {
  id:         string;
  text:       string;
  type:       "constraint" | "intent" | "assumption";
  confidence: "low" | "moderate" | "high";
}

/* =========================================================
   Rule-based suggestions (fast, deterministic)
   ========================================================= */

export function ruleBasedSuggestions(draft: ConversationDraft): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (!draft.constraints?.length) {
    suggestions.push({
      id:         "sleep_constraint",
      type:       "constraint",
      confidence: "high",
      text:       "sleep ≥ 7h",
    });
    suggestions.push({
      id:         "hrv_constraint",
      type:       "constraint",
      confidence: "moderate",
      text:       "HRV ≥ baseline",
    });
  }

  if (!draft.intent) {
    suggestions.push({
      id:         "intent_clarity",
      type:       "intent",
      confidence: "moderate",
      text:       "Define objective with measurable change.",
    });
  }

  if (!draft.assumptions?.length) {
    suggestions.push({
      id:         "assumption_model",
      type:       "assumption",
      confidence: "low",
      text:       "Linear response within training volume range.",
    });
  }

  return suggestions;
}

/* =========================================================
   Validation-derived suggestions (high confidence fixes)
   ========================================================= */

export function validationToSuggestions(issues: ValidationIssue[]): Suggestion[] {
  return issues
    .filter((i) => i.example)
    .map((i) => ({
      id:         `fix_${i.id}`,
      text:       i.example!,
      type:       i.field as Suggestion["type"],
      confidence: "high" as const,
    }));
}

/* =========================================================
   Merge + dedup
   ========================================================= */

export function dedupeSuggestions(list: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();

  return list.filter((s) => {
    const key = s.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function applySuggestion(
  draft: ConversationDraft,
  suggestion: Suggestion
): ConversationDraft {
  if (suggestion.type === "constraint") {
    return {
      ...draft,
      constraints: [...(draft.constraints ?? []), suggestion.text],
    };
  }

  if (suggestion.type === "assumption") {
    return {
      ...draft,
      assumptions: [...(draft.assumptions ?? []), suggestion.text],
    };
  }

  return draft;
}
