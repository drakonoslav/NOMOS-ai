/**
 * policy_router.ts
 *
 * Deterministic domain-scoped active evaluation routing for NOMOS.
 *
 * Functions:
 *   resolveEvaluationDomain(intent)
 *     Maps an intent string to a GovernanceDomain. Unknown intents map to
 *     "generic".
 *
 *   resolveActivePolicyForEvaluation(governanceState, intent)
 *     Returns the ActivePolicyAssignment for the resolved domain, or null
 *     when no policy is assigned to that domain.
 *
 *   buildEvaluationRoutingDecision(governanceState, intent)
 *     Builds the complete EvaluationRoutingDecision for an evaluation run,
 *     including domain, active policy version, routing reason, and fallback
 *     flag. This is the primary function for evaluation entry points.
 *
 *   buildPersistedRoutingRecord(decision)
 *     Converts an EvaluationRoutingDecision into the PersistedRoutingRecord
 *     that is stored alongside an audit/evaluation record.
 *
 * Invariants:
 *   - Governance state is never modified. All functions are read-only.
 *   - Policies are never auto-switched during evaluation.
 *   - Every evaluation produces a PersistedRoutingRecord for full traceability.
 *   - Unknown or missing intents route to "generic" with fallback if needed.
 *
 * No LLM generation is used.
 */

import type { PolicyGovernanceState, ActivePolicyAssignment } from "./policy_governance_types";
import type { GovernanceDomain } from "./policy_governance_types";
import { getActivePolicyForDomain } from "./policy_governance";
import type {
  EvaluationRoutingDecision,
  PersistedRoutingRecord,
} from "./policy_routing_types";
import {
  INTENT_DOMAIN_MAP,
  DEFAULT_POLICY_VERSION_ID,
} from "./policy_routing_types";

/* =========================================================
   resolveEvaluationDomain
   ========================================================= */

/**
 * Maps an intent string to a GovernanceDomain.
 *
 * Canonical mappings:
 *   NUTRITION_AUDIT         → nutrition
 *   TRAINING_AUDIT          → training
 *   SCHEDULE_AUDIT          → schedule
 *   GENERIC_CONSTRAINT_TASK → generic
 *   UNKNOWN / anything else → generic
 *
 * Deterministic. Does not read governance state.
 */
export function resolveEvaluationDomain(intent: string): GovernanceDomain {
  return INTENT_DOMAIN_MAP[intent] ?? "generic";
}

/* =========================================================
   resolveActivePolicyForEvaluation
   ========================================================= */

/**
 * Returns the ActivePolicyAssignment for the domain resolved from `intent`,
 * or null when no policy has been assigned to that domain.
 *
 * Does not modify governance state.
 */
export function resolveActivePolicyForEvaluation(
  governanceState: PolicyGovernanceState,
  intent: string
): ActivePolicyAssignment | null {
  const domain = resolveEvaluationDomain(intent);
  return getActivePolicyForDomain(governanceState, domain);
}

/* =========================================================
   buildEvaluationRoutingDecision
   ========================================================= */

/**
 * Builds the complete EvaluationRoutingDecision for an evaluation run.
 *
 * Steps:
 *   1. Resolve domain from intent.
 *   2. Fetch the active policy assignment for that domain.
 *   3. If assignment exists: use it, set usingFallback = false.
 *   4. If no assignment: set activePolicyVersionId = null, usingFallback = true.
 *   5. Build a deterministic routingReason string.
 *
 * Routing is read-only — governance state is never modified.
 * Policies are never auto-switched during routing.
 */
export function buildEvaluationRoutingDecision(
  governanceState: PolicyGovernanceState,
  intent: string
): EvaluationRoutingDecision {
  const domain = resolveEvaluationDomain(intent);
  const assignment = getActivePolicyForDomain(governanceState, domain);

  if (assignment) {
    return {
      domain,
      activePolicyVersionId: assignment.activePolicyVersionId,
      routingReason: `${intent} intent mapped to ${domain} domain; active ${domain} policy ${assignment.activePolicyVersionId} applied.`,
      usingFallback: false,
    };
  }

  return {
    domain,
    activePolicyVersionId: null,
    routingReason: `${intent} intent mapped to ${domain} domain; no active policy assigned — deterministic default fallback (${DEFAULT_POLICY_VERSION_ID}) applied.`,
    usingFallback: true,
  };
}

/* =========================================================
   buildPersistedRoutingRecord
   ========================================================= */

/**
 * Converts an EvaluationRoutingDecision into the PersistedRoutingRecord
 * that is stored immutably alongside an audit/evaluation record.
 *
 * Once persisted, the routing record is never updated, so every result
 * can be traced back to exactly which policy version governed it even
 * after subsequent governance actions.
 */
export function buildPersistedRoutingRecord(
  decision: EvaluationRoutingDecision
): PersistedRoutingRecord {
  return {
    resolvedDomain: decision.domain,
    activePolicyVersionId: decision.activePolicyVersionId,
    routingReason: decision.routingReason,
    usingFallback: decision.usingFallback,
  };
}
