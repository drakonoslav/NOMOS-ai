/**
 * validation_engine.ts
 *
 * Structural validation layer.
 * Runs on every draft update — detects missing thresholds, units, and ambiguous terms.
 * Produces ValidationIssue[] with optional example (used for inline correction display).
 */

import { PHRASES } from "./semantic_phrases";
import type { ConversationDraft } from "./types";

export interface ValidationIssue {
  id: string;
  message: string;
  severity: "error" | "warning";
  field: "intent" | "constraint" | "assumption";
  example?: string;
}

export function detectIssues(draft: ConversationDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ---- INTENT ----
  if (!draft.intent) {
    issues.push({
      id:       "intent_missing",
      field:    "intent",
      severity: "error",
      message:  PHRASES.intent_missing.short,
    });
  }

  // ---- CONSTRAINTS ----
  if (!draft.constraints || draft.constraints.length === 0) {
    issues.push({
      id:       "constraints_missing",
      field:    "constraint",
      severity: "error",
      message:  PHRASES.constraints_missing.short,
    });
  } else {
    draft.constraints.forEach((c, i) => {
      if (!hasThreshold(c)) {
        issues.push({
          id:       `constraint_threshold_${i}`,
          field:    "constraint",
          severity: "error",
          message:  PHRASES.constraint_threshold.short,
          example:  suggestThreshold(c),
        });
      }

      if (!hasUnit(c)) {
        issues.push({
          id:       `constraint_unit_${i}`,
          field:    "constraint",
          severity: "warning",
          message:  PHRASES.constraint_unit.short,
          example:  suggestUnit(c),
        });
      }

      if (isAmbiguous(c)) {
        issues.push({
          id:       `constraint_ambiguous_${i}`,
          field:    "constraint",
          severity: "warning",
          message:  PHRASES.constraint_ambiguous.short,
          example:  suggestClarification(),
        });
      }
    });
  }

  return issues;
}

export function canEvaluate(issues: ValidationIssue[]): boolean {
  return !issues.some((i) => i.severity === "error");
}

/* =========================================================
   Detection helpers
   ========================================================= */

function hasThreshold(text: string): boolean {
  return /[<>]=?|≥|≤|\d/.test(text);
}

function hasUnit(text: string): boolean {
  return /(h|hr|hours?|min(utes?)?|kg|lbs?|%)/i.test(text);
}

function isAmbiguous(text: string): boolean {
  const vague = ["better", "more", "less", "improve", "increase", "reduce"];
  return vague.some((v) => text.toLowerCase().includes(v));
}

/* =========================================================
   Suggestion generators (deterministic)
   ========================================================= */

function suggestThreshold(text: string): string {
  const t = text.toLowerCase();

  if (t.includes("sleep")) return "sleep ≥ 7h";
  if (t.includes("hrv"))   return "HRV ≥ baseline";
  if (t.includes("weight")) return "weight ≤ target";
  if (t.includes("volume")) return "volume ≤ 120% baseline";

  return "Specify threshold using ≥, ≤, or numeric bound.";
}

function suggestUnit(text: string): string {
  if (text.toLowerCase().includes("sleep")) return "sleep ≥ 7h";
  if (text.toLowerCase().includes("time"))  return "time ≤ 60 min";

  return "Add unit (h, min, kg, %).";
}

function suggestClarification(): string {
  return "Replace vague term with measurable variable.";
}
