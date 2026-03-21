/**
 * role_view_types.ts
 *
 * Canonical types for NOMOS cockpit role-based view modes.
 *
 * Role modes are a view-layer concern only.
 * They do not change truth, evaluation, or policy.
 * They only change emphasis, layout priority, visible cards,
 * default expansions, and navigation focus.
 *
 * No LLM generation. No state mutation.
 */

/**
 * The four role-based operating modes for the NOMOS cockpit.
 *
 * builder   — architecture, constraints, diff traces, formulas, invariants.
 * auditor   — proof traces, baseline vs candidate diffs, exact pass/fail reasons.
 * governor  — policy comparison, recommendations, doctrine, deliberation.
 * operator  — live health, current alerts, active policy, current prediction.
 */
export type CockpitRoleMode =
  | "builder"
  | "auditor"
  | "governor"
  | "operator";

/**
 * View configuration for a specific role mode.
 *
 * mode:                 which role mode this config applies to.
 *
 * label:                display name for the mode switcher.
 *
 * description:          one-line description of the mode's purpose,
 *                       shown below the mode label in the switcher.
 *
 * visibleCards:         card IDs shown in this mode.
 *                       Cards not in this list are hidden (not removed).
 *
 * emphasizedCards:      subset of visibleCards to render at larger size
 *                       or higher visual weight.
 *
 * defaultExpandedCards: card IDs that begin expanded (detail-open) in this mode.
 *
 * summaryPriority:      card IDs in the order they should appear at the top
 *                       of the cockpit for this mode.
 */
export interface CockpitRoleViewConfig {
  mode: CockpitRoleMode;
  label: string;
  description: string;

  visibleCards: string[];
  emphasizedCards: string[];
  defaultExpandedCards: string[];

  summaryPriority: string[];
}

/**
 * Canonical card IDs used across all role view configurations.
 *
 * These match the card component identifiers in EcosystemCockpitPage.
 */
export const COCKPIT_CARD_IDS = {
  HEALTH:           "health",
  TRENDS:           "trends",
  PREDICTION:       "prediction",
  GOVERNANCE:       "governance",
  POLICY:           "policy",
  DOCTRINE:         "doctrine",
  ATTENTION:        "attention",
  TRACEABILITY:     "traceability",
  AUDIT_HISTORY:    "audit-history",
  DIFF:             "diff",
  RECOMMENDATION:   "recommendation",
  DELIBERATION:     "deliberation",
} as const;
