/**
 * PolicyGovernancePanel.tsx
 *
 * Manual policy governance UI for NOMOS.
 *
 * Renders:
 *   1. Active policy per domain (4 domain cards)
 *   2. Governance action form (promote or rollback with required reason)
 *   3. Promotion history log (most recent first, filterable by domain)
 *
 * All governance actions are explicit. The reason field is required.
 * Auto-promotion based on metrics is not supported here.
 *
 * Accepts governanceState + available policy version IDs as props.
 * Calls onGovernanceAction when a governance action is taken — the parent
 * is responsible for persisting the new state.
 *
 * Does not mutate frozen policy snapshots.
 * All logic is deterministic; no LLM generation is used.
 */

import React, { useState } from "react";
import type {
  PolicyGovernanceState,
  ActivePolicyAssignment,
  PolicyPromotionRecord,
  GovernanceDomain,
} from "../../../audit/policy_governance_types";
import { EMPTY_GOVERNANCE_STATE } from "../../../audit/policy_governance_types";
import {
  getActivePolicyForDomain,
  promotePolicy,
  rollbackPolicy,
  listPromotionHistory,
} from "../../../audit/policy_governance";

/* =========================================================
   Helpers
   ========================================================= */

const DOMAINS: GovernanceDomain[] = ["nutrition", "training", "schedule", "generic"];

const DOMAIN_LABELS: Record<GovernanceDomain, string> = {
  nutrition: "Nutrition",
  training: "Training",
  schedule: "Schedule",
  generic: "Generic",
};

const DOMAIN_COLOURS: Record<GovernanceDomain, string> = {
  nutrition: "nm-gov__domain--nutrition",
  training: "nm-gov__domain--training",
  schedule: "nm-gov__domain--schedule",
  generic: "nm-gov__domain--generic",
};

function shortId(id: string): string {
  return id.length > 4 ? id.slice(4) : id;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/* =========================================================
   Domain cards: active policy per domain
   ========================================================= */

function DomainCard({
  domain,
  assignment,
}: {
  domain: GovernanceDomain;
  assignment: ActivePolicyAssignment | null;
}) {
  return (
    <div className={`nm-gov__domain-card ${DOMAIN_COLOURS[domain]}`}>
      <div className="nm-gov__domain-label">{DOMAIN_LABELS[domain]}</div>
      {assignment ? (
        <>
          <code className="nm-gov__domain-version">
            {shortId(assignment.activePolicyVersionId)}
          </code>
          <div className="nm-gov__domain-meta">
            {formatTimestamp(assignment.assignedAt)}
          </div>
          <div className="nm-gov__domain-reason">"{assignment.reason}"</div>
        </>
      ) : (
        <div className="nm-gov__domain-none">No active policy</div>
      )}
    </div>
  );
}

/* =========================================================
   Governance action form
   ========================================================= */

interface ActionFormProps {
  availablePolicyVersionIds: string[];
  currentState: PolicyGovernanceState;
  onAction: (newState: PolicyGovernanceState) => void;
}

function ActionForm({ availablePolicyVersionIds, currentState, onAction }: ActionFormProps) {
  const [domain, setDomain] = useState<GovernanceDomain>("generic");
  const [actionType, setActionType] = useState<"promote" | "rollback">("promote");
  const [targetVersionId, setTargetVersionId] = useState<string>(
    availablePolicyVersionIds[0] ?? ""
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!targetVersionId) {
      setError("Select a policy version.");
      return;
    }
    if (!reason.trim()) {
      setError("Reason is required for all governance actions.");
      return;
    }

    try {
      const ts = new Date().toISOString();
      const newState =
        actionType === "promote"
          ? promotePolicy(currentState, domain, targetVersionId, reason, ts)
          : rollbackPolicy(currentState, domain, targetVersionId, reason, ts);

      onAction(newState);
      setReason("");
      setSuccess(
        `${actionType === "promote" ? "Promoted" : "Rolled back"} ${shortId(targetVersionId)} for ${DOMAIN_LABELS[domain]}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Governance action failed.");
    }
  }

  return (
    <form className="nm-gov__form" onSubmit={handleSubmit}>
      <div className="nm-gov__form-title">GOVERNANCE ACTION</div>

      <div className="nm-gov__form-row">
        {/* Action type */}
        <div className="nm-gov__form-group">
          <label className="nm-gov__form-label">Action</label>
          <div className="nm-gov__toggle-pair">
            {(["promote", "rollback"] as const).map((a) => (
              <button
                key={a}
                type="button"
                className={`nm-gov__toggle-btn ${actionType === a ? "nm-gov__toggle-btn--active" : ""}`}
                onClick={() => setActionType(a)}
              >
                {a === "promote" ? "Promote" : "Rollback"}
              </button>
            ))}
          </div>
        </div>

        {/* Domain */}
        <div className="nm-gov__form-group">
          <label className="nm-gov__form-label">Domain</label>
          <select
            className="nm-gov__select"
            value={domain}
            onChange={(e) => setDomain(e.target.value as GovernanceDomain)}
          >
            {DOMAINS.map((d) => (
              <option key={d} value={d}>
                {DOMAIN_LABELS[d]}
              </option>
            ))}
          </select>
        </div>

        {/* Policy version */}
        <div className="nm-gov__form-group nm-gov__form-group--grow">
          <label className="nm-gov__form-label">Policy version</label>
          {availablePolicyVersionIds.length > 0 ? (
            <select
              className="nm-gov__select nm-gov__select--mono"
              value={targetVersionId}
              onChange={(e) => setTargetVersionId(e.target.value)}
            >
              {availablePolicyVersionIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          ) : (
            <div className="nm-gov__no-versions">No frozen policy versions available.</div>
          )}
        </div>
      </div>

      {/* Reason */}
      <div className="nm-gov__form-group">
        <label className="nm-gov__form-label">
          Reason <span className="nm-gov__required">required</span>
        </label>
        <input
          className="nm-gov__input"
          type="text"
          placeholder="State a reason for this governance action..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
        />
      </div>

      {/* Errors / success */}
      {error && <div className="nm-gov__form-error">{error}</div>}
      {success && <div className="nm-gov__form-success">{success}</div>}

      {/* Submit */}
      <button
        type="submit"
        className={`nm-gov__submit ${actionType === "rollback" ? "nm-gov__submit--rollback" : ""}`}
        disabled={availablePolicyVersionIds.length === 0}
      >
        {actionType === "promote" ? "Promote" : "Rollback"} →{" "}
        {targetVersionId ? shortId(targetVersionId) : "—"} for {DOMAIN_LABELS[domain]}
      </button>
    </form>
  );
}

/* =========================================================
   Promotion history log
   ========================================================= */

function HistoryLog({
  governanceState,
  filter,
  onFilterChange,
}: {
  governanceState: PolicyGovernanceState;
  filter: GovernanceDomain | "all";
  onFilterChange: (f: GovernanceDomain | "all") => void;
}) {
  const records = listPromotionHistory(
    governanceState,
    filter === "all" ? undefined : filter
  );

  return (
    <div className="nm-gov__history">
      <div className="nm-gov__history-header">
        <div className="nm-gov__section-label">PROMOTION HISTORY</div>
        <div className="nm-gov__filter-row">
          {(["all", ...DOMAINS] as const).map((f) => (
            <button
              key={f}
              className={`nm-gov__filter-btn ${filter === f ? "nm-gov__filter-btn--active" : ""}`}
              onClick={() => onFilterChange(f)}
            >
              {f === "all" ? "All" : DOMAIN_LABELS[f as GovernanceDomain]}
            </button>
          ))}
        </div>
      </div>

      {records.length === 0 ? (
        <div className="nm-gov__history-empty">
          No governance actions recorded{filter !== "all" ? ` for ${DOMAIN_LABELS[filter as GovernanceDomain]}` : ""}.
        </div>
      ) : (
        <div className="nm-gov__history-list">
          {records.map((r) => (
            <HistoryRow key={r.actionId} record={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryRow({ record }: { record: PolicyPromotionRecord }) {
  return (
    <div className="nm-gov__history-row">
      <div className="nm-gov__history-meta">
        <span
          className={`nm-gov__action-badge ${
            record.action === "promote"
              ? "nm-gov__action-badge--promote"
              : "nm-gov__action-badge--rollback"
          }`}
        >
          {record.action}
        </span>
        <span className="nm-gov__history-domain">
          {DOMAIN_LABELS[record.domain]}
        </span>
        <span className="nm-gov__history-time">{formatTimestamp(record.timestamp)}</span>
      </div>
      <div className="nm-gov__history-versions">
        {record.fromPolicyVersionId ? (
          <>
            <code className="nm-gov__history-id nm-gov__history-id--from">
              {shortId(record.fromPolicyVersionId)}
            </code>
            <span className="nm-gov__history-arrow">→</span>
          </>
        ) : (
          <span className="nm-gov__history-first">initial</span>
        )}
        <code className="nm-gov__history-id nm-gov__history-id--to">
          {shortId(record.toPolicyVersionId)}
        </code>
      </div>
      <div className="nm-gov__history-reason">"{record.reason}"</div>
    </div>
  );
}

/* =========================================================
   PolicyGovernancePanel — main export
   ========================================================= */

export interface PolicyGovernancePanelProps {
  /** The current governance state. */
  governanceState?: PolicyGovernanceState;
  /** Known policy version IDs available for promotion/rollback. */
  availablePolicyVersionIds?: string[];
  /** Called when a governance action produces a new state. */
  onGovernanceAction?: (newState: PolicyGovernanceState) => void;
}

export function PolicyGovernancePanel({
  governanceState: externalState,
  availablePolicyVersionIds = [],
  onGovernanceAction,
}: PolicyGovernancePanelProps) {
  const [internalState, setInternalState] = useState<PolicyGovernanceState>(
    externalState ?? EMPTY_GOVERNANCE_STATE
  );
  const [historyFilter, setHistoryFilter] = useState<GovernanceDomain | "all">("all");

  const state = externalState ?? internalState;

  function handleAction(newState: PolicyGovernanceState) {
    setInternalState(newState);
    onGovernanceAction?.(newState);
  }

  return (
    <div className="nm-gov">
      <div className="nm-gov__header">
        <div className="nm-gov__title">POLICY GOVERNANCE</div>
        <div className="nm-gov__meta">manual · explicit · auditable</div>
      </div>

      {/* Active policy per domain */}
      <div className="nm-gov__section-label">ACTIVE POLICY BY DOMAIN</div>
      <div className="nm-gov__domain-grid">
        {DOMAINS.map((d) => (
          <DomainCard
            key={d}
            domain={d}
            assignment={getActivePolicyForDomain(state, d)}
          />
        ))}
      </div>

      {/* Governance action form */}
      <ActionForm
        availablePolicyVersionIds={availablePolicyVersionIds}
        currentState={state}
        onAction={handleAction}
      />

      {/* Promotion history */}
      <HistoryLog
        governanceState={state}
        filter={historyFilter}
        onFilterChange={setHistoryFilter}
      />

      {/* Governance notice */}
      <div className="nm-gov__notice">
        Policy governance is manual and explicit. No policy is promoted or
        rolled back automatically. Every action requires a stated reason.
        Frozen policy snapshots are never modified by governance actions.
      </div>
    </div>
  );
}
