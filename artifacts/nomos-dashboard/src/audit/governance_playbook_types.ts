/**
 * governance_playbook_types.ts
 *
 * Canonical types for NOMOS governance playbook extraction.
 *
 * Turns repeated governance-learning patterns into explicit human-readable
 * governance heuristics — reusable doctrine extracted from reviewed history.
 *
 * This layer is advisory only.
 * It must not auto-promote, auto-rollback, or self-modify policy.
 * No LLM generation is used.
 */

/**
 * A single governance heuristic extracted from repeated reviewed outcomes.
 *
 * id:                   Deterministic identifier for this heuristic.
 *                       Format: "ph-XXXXXXXX" (8 hex chars from djb2 of title + domain).
 *
 * domain:               The governance domain this heuristic applies to.
 *                       "mixed" when the heuristic spans multiple domains.
 *
 * title:                Short name for this heuristic.
 *
 * rule:                 The doctrine statement in imperative form.
 *                       Examples:
 *                         "Prefer conservative policy promotion in nutrition when
 *                          unresolved-rate is already elevated."
 *                         "Avoid strong promotion under shallow-history windows."
 *                         "Do not promote without documented expected tradeoffs."
 *
 * supportCount:         Number of governance-learning patterns that contributed
 *                       evidence for this heuristic.
 *
 * confidence:           Strength of the heuristic.
 *                       "low"      — small support count, mixed domain, or contradictions.
 *                       "moderate" — repeated with some consistency.
 *                       "high"     — repeated clearly, low contradiction, domain-consistent.
 *
 * sourcePatternLabels:  Labels of the GovernanceLearningPatterns that sourced
 *                       this heuristic.
 *
 * rationaleLines:       Lines explaining what repeated reviewed outcomes support
 *                       this heuristic.
 *
 * cautionLines:         Lines explaining where this heuristic may not generalise
 *                       or where the evidence is limited.
 */
export interface GovernanceHeuristic {
  id: string;
  domain: "nutrition" | "training" | "schedule" | "generic" | "mixed";

  title: string;
  rule: string;

  supportCount: number;
  confidence: "low" | "moderate" | "high";

  sourcePatternLabels: string[];
  rationaleLines: string[];
  cautionLines: string[];
}

/**
 * The full governance playbook: all heuristics extracted from the learning
 * summary, plus aggregate metadata.
 *
 * totalHeuristics:   always equals heuristics.length.
 * heuristics:        ordered by confidence descending, then supportCount descending.
 * summaryLines:      human-readable overview of the playbook.
 */
export interface GovernancePlaybook {
  totalHeuristics: number;
  heuristics: GovernanceHeuristic[];
  summaryLines: string[];
}
