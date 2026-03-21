/**
 * EvaluationRoutingBadge.tsx
 *
 * Displays the domain routing decision for a single evaluation run.
 *
 * Shows:
 *   - Resolved domain (nutrition / training / schedule / generic)
 *   - Active policy version used (or "default fallback" label)
 *   - Routing reason line
 *   - Fallback warning when no active policy was assigned
 *
 * Accepts either an EvaluationRoutingDecision (live, from just-completed run)
 * or a PersistedRoutingRecord (historical, from a saved AuditRecord).
 * Both expose the same fields needed for display.
 *
 * Read-only — displays routing provenance, does not trigger governance actions.
 * No LLM generation is used.
 */

import React from "react";
import type { EvaluationRoutingDecision } from "../../../audit/policy_routing_types";
import type { PersistedRoutingRecord } from "../../../audit/policy_routing_types";

type RoutingDisplay = {
  domain: string;
  activePolicyVersionId: string | null;
  routingReason: string;
  usingFallback: boolean;
};

export interface EvaluationRoutingBadgeProps {
  /** From a live evaluation run. Takes priority over persisted when both provided. */
  routingDecision?: EvaluationRoutingDecision;
  /** From a saved AuditRecord. Used when showing historical records. */
  persistedRouting?: PersistedRoutingRecord;
}

function normalizeDomain(domain: string): string {
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

function shortId(id: string): string {
  return id.length > 4 ? id.slice(4) : id;
}

export function EvaluationRoutingBadge({
  routingDecision,
  persistedRouting,
}: EvaluationRoutingBadgeProps) {
  const display: RoutingDisplay | null = routingDecision
    ? {
        domain: routingDecision.domain,
        activePolicyVersionId: routingDecision.activePolicyVersionId,
        routingReason: routingDecision.routingReason,
        usingFallback: routingDecision.usingFallback,
      }
    : persistedRouting
    ? {
        domain: persistedRouting.resolvedDomain,
        activePolicyVersionId: persistedRouting.activePolicyVersionId,
        routingReason: persistedRouting.routingReason,
        usingFallback: persistedRouting.usingFallback,
      }
    : null;

  if (!display) return null;

  const domainClass = `nm-erb__domain--${display.domain}`;

  return (
    <div className="nm-erb">
      <div className="nm-erb__header">
        <div className="nm-erb__label">POLICY ROUTING</div>
        {display.usingFallback && (
          <div className="nm-erb__fallback-tag">default fallback</div>
        )}
      </div>

      <div className="nm-erb__row">
        {/* Domain pill */}
        <div className={`nm-erb__domain-pill ${domainClass}`}>
          {normalizeDomain(display.domain)}
        </div>

        {/* Policy version */}
        <div className="nm-erb__policy">
          <span className="nm-erb__policy-label">policy</span>
          {display.activePolicyVersionId ? (
            <code className="nm-erb__policy-id">
              {shortId(display.activePolicyVersionId)}
            </code>
          ) : (
            <span className="nm-erb__policy-none">none assigned</span>
          )}
        </div>
      </div>

      <div className="nm-erb__reason">{display.routingReason}</div>
    </div>
  );
}
