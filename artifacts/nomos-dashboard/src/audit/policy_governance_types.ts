/**
 * policy_governance_types.ts
 *
 * Canonical types for NOMOS manual policy governance.
 *
 * Policy governance is explicit, reversible, domain-aware, and non-automatic.
 * Every promotion and rollback must be initiated by a deliberate human action
 * and recorded with a stated reason.
 *
 * Active policy assignments change ONLY through governance actions.
 * No silent mutation of the active policy is permitted.
 * Frozen policy snapshots are never modified.
 *
 * No LLM generation is used.
 */

/**
 * The four governance domains. Each domain maintains its own active policy
 * assignment independently.
 *
 * "generic" is the fallback domain when no domain-specific assignment exists.
 */
export type GovernanceDomain = "nutrition" | "training" | "schedule" | "generic";

/**
 * Records the currently active policy version for a single domain.
 *
 * domain:                  the governance domain this assignment covers.
 * activePolicyVersionId:   the policyVersionId currently in effect.
 * assignedAt:              ISO-8601 timestamp when this assignment was made.
 * reason:                  the stated reason for this assignment.
 */
export interface ActivePolicyAssignment {
  domain: GovernanceDomain;
  activePolicyVersionId: string;
  assignedAt: string;
  reason: string;
}

/**
 * An immutable record of a single governance action (promote or rollback).
 *
 * actionId:               deterministic identifier for this action.
 * timestamp:              ISO-8601 timestamp of the action.
 * domain:                 the domain affected.
 *
 * action:                 "promote" — advancing to a new policy version.
 *                         "rollback" — reverting to a prior policy version.
 *                         The distinction is semantic — both are governed
 *                         reassignments with full history retention.
 *
 * fromPolicyVersionId:    the policy previously active for this domain.
 *                         Null if no prior assignment existed.
 * toPolicyVersionId:      the policy being made active.
 *
 * reason:                 the stated reason. Required — governance actions
 *                         without reasons must be rejected.
 */
export interface PolicyPromotionRecord {
  actionId: string;
  timestamp: string;
  domain: GovernanceDomain;

  action: "promote" | "rollback";
  fromPolicyVersionId: string | null;
  toPolicyVersionId: string;

  reason: string;
}

/**
 * The complete governance state for NOMOS.
 *
 * activeAssignments:   current active policy per domain (0–4 entries).
 *   At most one per domain. Absence = no active policy for that domain.
 *
 * promotionHistory:    full ordered log of every governance action taken,
 *   oldest first. Never modified — only appended to through governance
 *   functions that return a new state.
 */
export interface PolicyGovernanceState {
  activeAssignments: ActivePolicyAssignment[];
  promotionHistory: PolicyPromotionRecord[];
}

/**
 * The empty starting state. Use this as the initial governance state before
 * any promotions have occurred.
 */
export const EMPTY_GOVERNANCE_STATE: PolicyGovernanceState = {
  activeAssignments: [],
  promotionHistory: [],
};
