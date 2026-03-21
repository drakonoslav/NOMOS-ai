/**
 * semantic_phrases.ts
 *
 * Canonical phrase registry.
 * One issue → one phrase → reused across validation, completeness, and tone layers.
 * No paraphrasing. No drift.
 */

export const PHRASES = {
  constraint_threshold: {
    short:    "Constraint lacks threshold.",
    guidance: "Completeness limited by missing constraint thresholds.",
  },

  constraint_unit: {
    short:    "Constraint missing unit.",
    guidance: "Completeness limited by missing units.",
  },

  constraint_ambiguous: {
    short:    "Constraint ambiguous.",
    guidance: "Completeness limited by ambiguous constraints.",
  },

  intent_missing: {
    short:    "Intent not declared.",
    guidance: "Completeness limited by undefined intent.",
  },

  constraints_missing: {
    short:    "No constraints declared.",
    guidance: "Completeness limited by missing constraints.",
  },

  assumptions_missing: {
    short:    "Assumptions not defined.",
    guidance: "Completeness limited by missing assumptions.",
  },

  valid: {
    short:    "Submission structurally complete.",
    guidance: "Submission structurally complete.",
  },
} as const;
