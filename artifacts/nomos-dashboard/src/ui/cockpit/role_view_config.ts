/**
 * role_view_config.ts
 *
 * Deterministic role-based view configurations for the NOMOS cockpit.
 *
 * getCockpitRoleViewConfig(mode) returns the complete CockpitRoleViewConfig
 * for a given role mode.  All four configurations are defined statically —
 * no runtime inference, no LLM generation, no state mutation.
 *
 * Role view effects:
 *   - card ordering (summaryPriority)
 *   - card visibility (visibleCards)
 *   - visual emphasis (emphasizedCards)
 *   - default expansion state (defaultExpandedCards)
 *
 * The underlying snapshot data is the same for all modes.
 * Only presentation emphasis changes.
 */

import type { CockpitRoleMode, CockpitRoleViewConfig } from "./role_view_types";
import { COCKPIT_CARD_IDS as C } from "./role_view_types";

/* =========================================================
   Static configurations
   ========================================================= */

const BUILDER_CONFIG: CockpitRoleViewConfig = {
  mode: "builder",
  label: "Builder",
  description: "Architecture and constraint integrity",

  visibleCards: [
    C.HEALTH,
    C.TRENDS,
    C.PREDICTION,
    C.ATTENTION,
    C.TRACEABILITY,
    C.DIFF,
    C.AUDIT_HISTORY,
    C.GOVERNANCE,
    C.POLICY,
    C.DOCTRINE,
  ],

  emphasizedCards: [
    C.TRACEABILITY,
    C.DIFF,
    C.ATTENTION,
    C.HEALTH,
  ],

  defaultExpandedCards: [
    C.TRACEABILITY,
    C.DIFF,
    C.ATTENTION,
  ],

  summaryPriority: [
    C.ATTENTION,
    C.TRACEABILITY,
    C.DIFF,
    C.HEALTH,
    C.TRENDS,
    C.PREDICTION,
    C.GOVERNANCE,
    C.POLICY,
    C.DOCTRINE,
    C.AUDIT_HISTORY,
  ],
};

const AUDITOR_CONFIG: CockpitRoleViewConfig = {
  mode: "auditor",
  label: "Auditor",
  description: "Proof, trace, and verification",

  visibleCards: [
    C.HEALTH,
    C.TRENDS,
    C.TRACEABILITY,
    C.AUDIT_HISTORY,
    C.DIFF,
    C.PREDICTION,
    C.GOVERNANCE,
    C.POLICY,
    C.ATTENTION,
    C.DOCTRINE,
  ],

  emphasizedCards: [
    C.TRACEABILITY,
    C.AUDIT_HISTORY,
    C.DIFF,
    C.HEALTH,
  ],

  defaultExpandedCards: [
    C.TRACEABILITY,
    C.AUDIT_HISTORY,
    C.DIFF,
  ],

  summaryPriority: [
    C.TRACEABILITY,
    C.AUDIT_HISTORY,
    C.DIFF,
    C.HEALTH,
    C.TRENDS,
    C.PREDICTION,
    C.GOVERNANCE,
    C.POLICY,
    C.DOCTRINE,
    C.ATTENTION,
  ],
};

const GOVERNOR_CONFIG: CockpitRoleViewConfig = {
  mode: "governor",
  label: "Governor",
  description: "Policy and governance decisions",

  visibleCards: [
    C.GOVERNANCE,
    C.POLICY,
    C.DOCTRINE,
    C.RECOMMENDATION,
    C.DELIBERATION,
    C.AUDIT_HISTORY,
    C.HEALTH,
    C.TRENDS,
    C.ATTENTION,
    C.PREDICTION,
  ],

  emphasizedCards: [
    C.GOVERNANCE,
    C.POLICY,
    C.DOCTRINE,
    C.RECOMMENDATION,
    C.DELIBERATION,
  ],

  defaultExpandedCards: [
    C.GOVERNANCE,
    C.DOCTRINE,
    C.RECOMMENDATION,
  ],

  summaryPriority: [
    C.GOVERNANCE,
    C.RECOMMENDATION,
    C.DOCTRINE,
    C.DELIBERATION,
    C.POLICY,
    C.AUDIT_HISTORY,
    C.HEALTH,
    C.TRENDS,
    C.ATTENTION,
    C.PREDICTION,
  ],
};

const OPERATOR_CONFIG: CockpitRoleViewConfig = {
  mode: "operator",
  label: "Operator",
  description: "Live health and attention routing",

  visibleCards: [
    C.HEALTH,
    C.PREDICTION,
    C.ATTENTION,
    C.TRENDS,
    C.GOVERNANCE,
    C.POLICY,
    C.DOCTRINE,
    C.TRACEABILITY,
    C.AUDIT_HISTORY,
    C.DIFF,
    C.RECOMMENDATION,
    C.DELIBERATION,
  ],

  emphasizedCards: [
    C.HEALTH,
    C.PREDICTION,
    C.ATTENTION,
  ],

  defaultExpandedCards: [
    C.ATTENTION,
  ],

  summaryPriority: [
    C.HEALTH,
    C.PREDICTION,
    C.ATTENTION,
    C.TRENDS,
    C.GOVERNANCE,
    C.POLICY,
    C.DOCTRINE,
    C.TRACEABILITY,
    C.AUDIT_HISTORY,
    C.DIFF,
    C.RECOMMENDATION,
    C.DELIBERATION,
  ],
};

const ROLE_CONFIG_MAP: Record<CockpitRoleMode, CockpitRoleViewConfig> = {
  builder:  BUILDER_CONFIG,
  auditor:  AUDITOR_CONFIG,
  governor: GOVERNOR_CONFIG,
  operator: OPERATOR_CONFIG,
};

/* =========================================================
   getCockpitRoleViewConfig
   ========================================================= */

/**
 * Returns the complete CockpitRoleViewConfig for the given role mode.
 *
 * Deterministic — the same mode always returns the same config.
 * No inputs are mutated.
 */
export function getCockpitRoleViewConfig(
  mode: CockpitRoleMode
): CockpitRoleViewConfig {
  return ROLE_CONFIG_MAP[mode];
}

/**
 * Returns all four role view configs in a stable display order.
 */
export function getAllRoleViewConfigs(): CockpitRoleViewConfig[] {
  return [
    BUILDER_CONFIG,
    AUDITOR_CONFIG,
    GOVERNOR_CONFIG,
    OPERATOR_CONFIG,
  ];
}
