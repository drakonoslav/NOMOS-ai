/**
 * policy_governance.ts
 *
 * Deterministic manual policy governance for NOMOS.
 *
 * Functions:
 *   getActivePolicyForDomain(governanceState, domain)
 *     Returns the ActivePolicyAssignment for a domain, or null if none.
 *
 *   promotePolicy(governanceState, domain, toPolicyVersionId, reason, timestamp?)
 *     Returns a new governance state with the given policy version promoted
 *     to active for the specified domain.
 *
 *   rollbackPolicy(governanceState, domain, toPolicyVersionId, reason, timestamp?)
 *     Returns a new governance state with the given policy version restored
 *     for the specified domain. Semantically recorded as "rollback".
 *
 *   listPromotionHistory(governanceState, domain?)
 *     Returns governance actions, most recent first. Optionally filtered
 *     by domain.
 *
 * Invariants:
 *   - Input states are never mutated. All functions return new state objects.
 *   - Every action creates a PolicyPromotionRecord appended to history.
 *   - Reason must be a non-empty string — empty reasons throw.
 *   - Frozen policy snapshots are not referenced or modified here.
 *
 * No LLM generation is used.
 */

import type {
  PolicyGovernanceState,
  ActivePolicyAssignment,
  PolicyPromotionRecord,
  GovernanceDomain,
} from "./policy_governance_types";

/* =========================================================
   Deterministic action ID
   ========================================================= */

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash;
}

/**
 * Derives a deterministic action ID from the action parameters.
 * Format: "gov-XXXXXXXX" (8 hex chars).
 *
 * Two identical actions at the same timestamp produce the same ID,
 * which is correct — they represent the same governance decision.
 */
function buildActionId(
  timestamp: string,
  domain: GovernanceDomain,
  action: "promote" | "rollback",
  toPolicyVersionId: string
): string {
  const fingerprint = `${timestamp}|${domain}|${action}|${toPolicyVersionId}`;
  const hash = djb2(fingerprint);
  return `gov-${hash.toString(16).padStart(8, "0")}`;
}

/* =========================================================
   getActivePolicyForDomain
   ========================================================= */

/**
 * Returns the currently active policy assignment for the given domain,
 * or null if no assignment has been made.
 *
 * Does not fall back to "generic" — callers that want fallback must
 * handle it explicitly.
 */
export function getActivePolicyForDomain(
  governanceState: PolicyGovernanceState,
  domain: GovernanceDomain
): ActivePolicyAssignment | null {
  return (
    governanceState.activeAssignments.find((a) => a.domain === domain) ?? null
  );
}

/* =========================================================
   Shared governance action builder
   ========================================================= */

function applyGovernanceAction(
  governanceState: PolicyGovernanceState,
  domain: GovernanceDomain,
  action: "promote" | "rollback",
  toPolicyVersionId: string,
  reason: string,
  timestamp: string
): PolicyGovernanceState {
  if (!reason.trim()) {
    throw new Error(
      `NOMOS governance: reason is required for ${action} actions. Empty reason rejected.`
    );
  }

  const fromAssignment = getActivePolicyForDomain(governanceState, domain);
  const fromPolicyVersionId = fromAssignment?.activePolicyVersionId ?? null;

  const actionId = buildActionId(timestamp, domain, action, toPolicyVersionId);

  const record: PolicyPromotionRecord = {
    actionId,
    timestamp,
    domain,
    action,
    fromPolicyVersionId,
    toPolicyVersionId,
    reason: reason.trim(),
  };

  const newAssignment: ActivePolicyAssignment = {
    domain,
    activePolicyVersionId: toPolicyVersionId,
    assignedAt: timestamp,
    reason: reason.trim(),
  };

  // Replace or add the domain's active assignment (never mutates original)
  const newAssignments = [
    ...governanceState.activeAssignments.filter((a) => a.domain !== domain),
    newAssignment,
  ];

  return {
    activeAssignments: newAssignments,
    promotionHistory: [...governanceState.promotionHistory, record],
  };
}

/* =========================================================
   promotePolicy
   ========================================================= */

/**
 * Promotes a policy version to active for the given domain.
 *
 * Returns a new governance state — does not mutate the input.
 *
 * timestamp defaults to new Date().toISOString() when omitted.
 * Reason must be non-empty, or this function throws.
 *
 * Records action="promote" in the promotion history regardless of
 * whether the target version was previously active or not.
 */
export function promotePolicy(
  governanceState: PolicyGovernanceState,
  domain: GovernanceDomain,
  toPolicyVersionId: string,
  reason: string,
  timestamp: string = new Date().toISOString()
): PolicyGovernanceState {
  return applyGovernanceAction(
    governanceState,
    domain,
    "promote",
    toPolicyVersionId,
    reason,
    timestamp
  );
}

/* =========================================================
   rollbackPolicy
   ========================================================= */

/**
 * Reverts the active policy for the given domain to an earlier version.
 *
 * Semantically identical to promote, but records action="rollback" to
 * distinguish intent in the promotion history.
 *
 * Full promotion history is retained — no records are deleted.
 * The prior active version is superseded but not removed.
 *
 * Returns a new governance state — does not mutate the input.
 * Reason must be non-empty, or this function throws.
 */
export function rollbackPolicy(
  governanceState: PolicyGovernanceState,
  domain: GovernanceDomain,
  toPolicyVersionId: string,
  reason: string,
  timestamp: string = new Date().toISOString()
): PolicyGovernanceState {
  return applyGovernanceAction(
    governanceState,
    domain,
    "rollback",
    toPolicyVersionId,
    reason,
    timestamp
  );
}

/* =========================================================
   listPromotionHistory
   ========================================================= */

/**
 * Returns the promotion history, most recent first.
 *
 * When domain is provided, returns only actions for that domain.
 * When domain is omitted, returns all actions across all domains.
 *
 * Does not mutate the governance state.
 */
export function listPromotionHistory(
  governanceState: PolicyGovernanceState,
  domain?: GovernanceDomain
): PolicyPromotionRecord[] {
  const records = domain
    ? governanceState.promotionHistory.filter((r) => r.domain === domain)
    : [...governanceState.promotionHistory];

  // Most recent first
  return records.slice().reverse();
}
