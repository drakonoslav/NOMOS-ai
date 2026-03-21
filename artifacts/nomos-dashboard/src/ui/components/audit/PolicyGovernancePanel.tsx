/**
 * PolicyGovernancePanel.tsx
 *
 * Manual policy governance UI for NOMOS.
 *
 * Renders:
 *   1. Active policy per domain (4 domain cards)
 *   2. Governance action form (promote or rollback with required reason)
 *   3. Governance audit trail (full decision context, most recent first)
 *   4. Promotion history log (lightweight, domain-filterable)
 *
 * All governance actions are explicit. The reason field is required.
 * Auto-promotion based on metrics is not supported here.
 *
 * On each governance action, a GovernanceAuditRecord is built and saved to
 * the audit trail containing: current policy, recommended policy, chosen
 * policy, expected gains/tradeoffs/risks, recommendation strength and
 * confidence, the human reason, and bench/recommendation summaries.
 *
 * Does not mutate frozen policy snapshots.
 * Historical audit records are never modified.
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
import { readGovernanceState, writeGovernanceState } from "../../../audit/policy_governance_store";
import {
  buildGovernanceAuditRecord,
  saveGovernanceAuditRecord,
  listGovernanceAuditRecords,
} from "../../../audit/governance_audit_trail";
import type { GovernanceAuditRecord } from "../../../audit/governance_audit_types";

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

function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 4 ? id.slice(4) : id;
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

/* =========================================================
   DomainCard
   ========================================================= */

function DomainCard({
  domain,
  assignment,
}: {
  domain: GovernanceDomain;
  assignment: ActivePolicyAssignment | null;
}) {
  return (
    <div className={`nm-gov__domain-card ${assignment ? "nm-gov__domain-card--active" : ""}`}>
      <div className="nm-gov__domain-label">{DOMAIN_LABELS[domain]}</div>
      {assignment ? (
        <>
          <code className="nm-gov__domain-id">{shortId(assignment.policyVersionId)}</code>
          <div className="nm-gov__domain-since">{formatTimestamp(assignment.assignedAt)}</div>
          <div className="nm-gov__domain-reason">"{assignment.reason}"</div>
        </>
      ) : (
        <div className="nm-gov__domain-none">No active policy</div>
      )}
    </div>
  );
}

/* =========================================================
   Decision context accepted by the action form
   ========================================================= */

interface DecisionContext {
  recommendedPolicyVersionId: string | null;
  expectedGains: string[];
  expectedTradeoffs: string[];
  expectedRisks: string[];
  recommendationStrength: GovernanceAuditRecord["recommendationStrength"];
  recommendationConfidence: GovernanceAuditRecord["recommendationConfidence"];
  benchEvidenceSummary: string[];
  recommendationSummary: string[];
}

const EMPTY_CONTEXT: DecisionContext = {
  recommendedPolicyVersionId: null,
  expectedGains: [],
  expectedTradeoffs: [],
  expectedRisks: [],
  recommendationStrength: "weak",
  recommendationConfidence: "low",
  benchEvidenceSummary: [],
  recommendationSummary: [],
};

/* =========================================================
   Governance action form
   ========================================================= */

interface ActionFormProps {
  availablePolicyVersionIds: string[];
  currentState: PolicyGovernanceState;
  decisionContext: DecisionContext;
  onAction: (newState: PolicyGovernanceState) => void;
}

function ActionForm({
  availablePolicyVersionIds,
  currentState,
  decisionContext,
  onAction,
}: ActionFormProps) {
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
      const currentAssignment = getActivePolicyForDomain(currentState, domain);
      const currentPolicyVersionId = currentAssignment?.policyVersionId ?? null;

      const newState =
        actionType === "promote"
          ? promotePolicy(currentState, domain, targetVersionId, reason, ts)
          : rollbackPolicy(currentState, domain, targetVersionId, reason, ts);

      // Build and persist the governance audit record
      const auditRecord = buildGovernanceAuditRecord({
        timestamp: ts,
        domain,
        action: actionType,
        currentPolicyVersionId,
        recommendedPolicyVersionId: decisionContext.recommendedPolicyVersionId,
        chosenPolicyVersionId: targetVersionId,
        expectedGains: decisionContext.expectedGains,
        expectedTradeoffs: decisionContext.expectedTradeoffs,
        expectedRisks: decisionContext.expectedRisks,
        recommendationStrength: decisionContext.recommendationStrength,
        recommendationConfidence: decisionContext.recommendationConfidence,
        humanReason: reason.trim(),
        benchEvidenceSummary: decisionContext.benchEvidenceSummary,
        recommendationSummary: decisionContext.recommendationSummary,
      });
      saveGovernanceAuditRecord(auditRecord);

      onAction(newState);
      setReason("");
      setSuccess(
        `${actionType === "promote" ? "Promoted" : "Rolled back"} ${shortId(targetVersionId)} for ${DOMAIN_LABELS[domain]}. Audit record saved.`
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

      {/* Decision context summary (if present) */}
      {(decisionContext.expectedGains.length > 0 ||
        decisionContext.expectedRisks.length > 0) && (
        <div className="nm-gov__context-summary">
          <div className="nm-gov__context-label">DECISION CONTEXT</div>
          <div className="nm-gov__context-grid">
            {decisionContext.expectedGains.length > 0 && (
              <div className="nm-gov__context-col nm-gov__context-col--gains">
                <div className="nm-gov__context-col-label">Gains</div>
                <ul className="nm-gov__context-list">
                  {decisionContext.expectedGains.slice(0, 3).map((g, i) => (
                    <li key={i} className="nm-gov__context-item nm-gov__context-item--gain">{g}</li>
                  ))}
                </ul>
              </div>
            )}
            {decisionContext.expectedRisks.length > 0 && (
              <div className="nm-gov__context-col nm-gov__context-col--risks">
                <div className="nm-gov__context-col-label">Risks</div>
                <ul className="nm-gov__context-list">
                  {decisionContext.expectedRisks.slice(0, 3).map((r, i) => (
                    <li key={i} className="nm-gov__context-item nm-gov__context-item--risk">{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="nm-gov__context-badge">
            {decisionContext.recommendationStrength} · {decisionContext.recommendationConfidence} confidence
          </div>
        </div>
      )}

      {/* Reason — required */}
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
        <div className="nm-gov__reason-hint">
          This reason will be stored permanently in the governance audit trail.
        </div>
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
   Governance audit trail log
   ========================================================= */

function AuditRow({ record }: { record: GovernanceAuditRecord }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="nm-gov__audit-row">
      <div className="nm-gov__audit-meta">
        <span
          className={`nm-gov__action-badge ${
            record.action === "promote"
              ? "nm-gov__action-badge--promote"
              : "nm-gov__action-badge--rollback"
          }`}
        >
          {record.action}
        </span>
        <span className="nm-gov__audit-domain">{DOMAIN_LABELS[record.domain]}</span>
        <span className="nm-gov__history-time">{formatTimestamp(record.timestamp)}</span>
        <span className="nm-gov__audit-strength">
          {record.recommendationStrength} · {record.recommendationConfidence}
        </span>
      </div>

      <div className="nm-gov__audit-versions">
        {record.currentPolicyVersionId ? (
          <>
            <code className="nm-gov__history-id nm-gov__history-id--from">
              {shortId(record.currentPolicyVersionId)}
            </code>
            <span className="nm-gov__history-arrow">→</span>
          </>
        ) : (
          <span className="nm-gov__history-first">initial</span>
        )}
        <code className="nm-gov__history-id nm-gov__history-id--to">
          {shortId(record.chosenPolicyVersionId)}
        </code>
        {record.recommendedPolicyVersionId &&
          record.recommendedPolicyVersionId !== record.chosenPolicyVersionId && (
            <span className="nm-gov__audit-deviated">
              (rec: {shortId(record.recommendedPolicyVersionId)})
            </span>
          )}
      </div>

      <div className="nm-gov__history-reason">"{record.humanReason}"</div>

      <button
        className="nm-gov__audit-expand"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        type="button"
      >
        {expanded ? "▾ hide detail" : "▸ show decision context"}
      </button>

      {expanded && (
        <div className="nm-gov__audit-detail">
          {record.expectedGains.length > 0 && (
            <div className="nm-gov__audit-section">
              <div className="nm-gov__audit-section-label">Expected gains</div>
              <ul className="nm-gov__audit-list nm-gov__audit-list--gains">
                {record.expectedGains.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
          )}
          {record.expectedTradeoffs.length > 0 && (
            <div className="nm-gov__audit-section">
              <div className="nm-gov__audit-section-label">Expected tradeoffs</div>
              <ul className="nm-gov__audit-list nm-gov__audit-list--tradeoffs">
                {record.expectedTradeoffs.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
          {record.expectedRisks.length > 0 && (
            <div className="nm-gov__audit-section">
              <div className="nm-gov__audit-section-label">Expected risks</div>
              <ul className="nm-gov__audit-list nm-gov__audit-list--risks">
                {record.expectedRisks.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
          {record.benchEvidenceSummary.length > 0 && (
            <div className="nm-gov__audit-section">
              <div className="nm-gov__audit-section-label">Bench evidence</div>
              <ul className="nm-gov__audit-list">
                {record.benchEvidenceSummary.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {record.recommendationSummary.length > 0 && (
            <div className="nm-gov__audit-section">
              <div className="nm-gov__audit-section-label">Recommendation</div>
              <ul className="nm-gov__audit-list">
                {record.recommendationSummary.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          <div className="nm-gov__audit-id">audit ID: {record.actionId}</div>
        </div>
      )}
    </div>
  );
}

function AuditTrail({
  filter,
  onFilterChange,
  refreshTick,
}: {
  filter: GovernanceDomain | "all";
  onFilterChange: (f: GovernanceDomain | "all") => void;
  refreshTick: number;
}) {
  const records = listGovernanceAuditRecords(
    filter === "all" ? undefined : filter
  );

  // refreshTick is used to force re-render when a new record is saved

  return (
    <div className="nm-gov__audit">
      <div className="nm-gov__audit-header">
        <div className="nm-gov__section-label">GOVERNANCE AUDIT TRAIL</div>
        <div className="nm-gov__filter-row">
          {(["all", ...DOMAINS] as const).map((f) => (
            <button
              key={f}
              className={`nm-gov__filter-btn ${filter === f ? "nm-gov__filter-btn--active" : ""}`}
              onClick={() => onFilterChange(f)}
              type="button"
            >
              {f === "all" ? "All" : DOMAIN_LABELS[f as GovernanceDomain]}
            </button>
          ))}
        </div>
      </div>

      {records.length === 0 ? (
        <div className="nm-gov__history-empty">
          No governance audit records{filter !== "all" ? ` for ${DOMAIN_LABELS[filter as GovernanceDomain]}` : ""}.
        </div>
      ) : (
        <div className="nm-gov__audit-list">
          {records.map((r) => (
            <AuditRow key={r.actionId} record={r} />
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Promotion history log (lightweight)
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
              type="button"
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

  /**
   * Decision support context from GovernanceDecisionSupportPanel.
   * When provided, the audit record includes expected gains, tradeoffs,
   * risks, recommendation metadata, and bench/recommendation summaries.
   */
  recommendedPolicyVersionId?: string | null;
  expectedGains?: string[];
  expectedTradeoffs?: string[];
  expectedRisks?: string[];
  recommendationStrength?: GovernanceAuditRecord["recommendationStrength"];
  recommendationConfidence?: GovernanceAuditRecord["recommendationConfidence"];
  benchEvidenceSummary?: string[];
  recommendationSummary?: string[];
}

export function PolicyGovernancePanel({
  governanceState: externalState,
  availablePolicyVersionIds = [],
  onGovernanceAction,
  recommendedPolicyVersionId = null,
  expectedGains = [],
  expectedTradeoffs = [],
  expectedRisks = [],
  recommendationStrength = "weak",
  recommendationConfidence = "low",
  benchEvidenceSummary = [],
  recommendationSummary = [],
}: PolicyGovernancePanelProps) {
  const [internalState, setInternalState] = useState<PolicyGovernanceState>(
    externalState ?? EMPTY_GOVERNANCE_STATE
  );
  const [historyFilter, setHistoryFilter] = useState<GovernanceDomain | "all">("all");
  const [auditFilter, setAuditFilter] = useState<GovernanceDomain | "all">("all");
  const [auditRefreshTick, setAuditRefreshTick] = useState(0);

  const state = externalState ?? internalState;

  const decisionContext: DecisionContext = {
    recommendedPolicyVersionId,
    expectedGains,
    expectedTradeoffs,
    expectedRisks,
    recommendationStrength,
    recommendationConfidence,
    benchEvidenceSummary,
    recommendationSummary,
  };

  function handleAction(newState: PolicyGovernanceState) {
    setInternalState(newState);
    writeGovernanceState(newState);
    setAuditRefreshTick((t) => t + 1);
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
        decisionContext={decisionContext}
        onAction={handleAction}
      />

      {/* Governance audit trail */}
      <AuditTrail
        filter={auditFilter}
        onFilterChange={setAuditFilter}
        refreshTick={auditRefreshTick}
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
        All governance actions are saved to the audit trail with full decision context.
        Frozen policy snapshots are never modified by governance actions.
      </div>
    </div>
  );
}
