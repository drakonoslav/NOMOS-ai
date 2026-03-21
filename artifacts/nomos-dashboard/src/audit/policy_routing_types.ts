/**
 * policy_routing_types.ts
 *
 * Canonical types for NOMOS domain-scoped active evaluation routing.
 *
 * Routing resolves the correct active policy for an evaluation before it runs,
 * so every result is traceable to the exact policy version that governed it.
 *
 * Routing is read-only with respect to the governance state — it never
 * promotes, rolls back, or otherwise modifies policy assignments.
 *
 * No auto-switching of policies during evaluation.
 * No LLM generation is used.
 */

import type { GovernanceDomain } from "./policy_governance_types";

/**
 * The resolved routing decision for a single evaluation run.
 *
 * domain:                 the governance domain resolved from the evaluation intent.
 *
 * activePolicyVersionId:  the policy version that will be (or was) used for
 *   this evaluation. Null when no active policy exists for the domain and the
 *   default fallback policy was used.
 *
 * routingReason:          a deterministic, human-readable explanation of why
 *   this domain and policy were chosen. Examples:
 *     "NUTRITION_AUDIT intent mapped to nutrition domain; active nutrition policy pol-a1b2c3d4 applied."
 *     "TRAINING_AUDIT intent mapped to training domain; no active policy — default fallback applied."
 *
 * usingFallback:          true when no active policy exists for the resolved
 *   domain and the deterministic default was used. False otherwise.
 */
export interface EvaluationRoutingDecision {
  domain: GovernanceDomain;
  activePolicyVersionId: string | null;
  routingReason: string;
  usingFallback: boolean;
}

/**
 * Routing snapshot persisted alongside an evaluation/audit record.
 *
 * Stored on every run so every result can be traced back to exactly which
 * policy version governed it, independent of subsequent governance actions.
 *
 * Fields mirror EvaluationRoutingDecision but are treated as immutable
 * once attached to a record.
 */
export interface PersistedRoutingRecord {
  resolvedDomain: GovernanceDomain;
  activePolicyVersionId: string | null;
  routingReason: string;
  usingFallback: boolean;
}

/**
 * The identifier for the deterministic default policy.
 * Used when no active policy has been assigned for a domain.
 */
export const DEFAULT_POLICY_VERSION_ID = "pol-default-v0";

/**
 * Intent-to-domain mapping table.
 * Keeps the mapping declarative and easy to extend.
 */
export const INTENT_DOMAIN_MAP: Record<string, GovernanceDomain> = {
  NUTRITION_AUDIT: "nutrition",
  TRAINING_AUDIT: "training",
  SCHEDULE_AUDIT: "schedule",
  GENERIC_CONSTRAINT_TASK: "generic",
  UNKNOWN: "generic",
};
