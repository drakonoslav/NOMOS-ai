/**
 * PolicyReplayPanel.tsx
 *
 * Run replay under alternate policy for NOMOS.
 *
 * Allows the user to select a canonical declaration / source audit run,
 * choose one or more frozen policy versions to replay under, and view
 * how the prediction outputs differ across policies.
 *
 * Shows:
 *   1. Source run selector (canonical declaration text + intent)
 *   2. Policy version selector (multi-select from available frozen policies)
 *   3. Replay results per policy (predictedVariable, confidence, direction)
 *   4. Differing fields summary
 *   5. Summary lines
 *
 * Replay is experimental analysis only.
 * Historical audit records are never mutated.
 * No policy is promoted or rolled back here.
 * No LLM generation is used.
 */

import React, { useState } from "react";
import type { AuditRecord } from "../../../audit/audit_types";
import type { FrozenPolicySnapshot } from "../../../audit/policy_versioning_types";
import type {
  PolicyReplayRequest,
  PolicyReplayResult,
  PolicyReplayComparison,
} from "../../../audit/policy_replay_types";
import { buildPolicyReplayComparison } from "../../../audit/policy_replay";

/* =========================================================
   Helpers
   ========================================================= */

function shortId(id: string): string {
  return id.length > 4 ? id.slice(4) : id;
}

const CONFIDENCE_RANK: Record<string, number> = { low: 0, moderate: 1, high: 2 };
const DIRECTION_ICON: Record<string, string> = {
  decreasing: "↓",
  stable: "→",
  rising: "↑",
};
const DIRECTION_CLASS: Record<string, string> = {
  decreasing: "nm-rpl__dir--decreasing",
  stable: "nm-rpl__dir--stable",
  rising: "nm-rpl__dir--rising",
};
const CONFIDENCE_CLASS: Record<string, string> = {
  low: "nm-rpl__conf--low",
  moderate: "nm-rpl__conf--moderate",
  high: "nm-rpl__conf--high",
};

/* =========================================================
   Result card: one per policy
   ========================================================= */

function ReplayResultCard({
  result,
  differingFields,
  isBaseline,
}: {
  result: PolicyReplayResult;
  differingFields: string[];
  isBaseline: boolean;
}) {
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <div className={`nm-rpl__card ${isBaseline ? "nm-rpl__card--baseline" : ""}`}>
      <div className="nm-rpl__card-header">
        <code className="nm-rpl__card-id">{shortId(result.policyVersionId)}</code>
        {isBaseline && <span className="nm-rpl__baseline-tag">baseline</span>}
      </div>

      <div className="nm-rpl__card-fields">
        {/* predictedVariable */}
        <div className="nm-rpl__field">
          <div className={`nm-rpl__field-label ${differingFields.includes("predictedVariable") ? "nm-rpl__field-label--differing" : ""}`}>
            predicted variable
          </div>
          <div className="nm-rpl__field-value nm-rpl__var">
            {result.predictedVariable ?? <span className="nm-rpl__none">—</span>}
          </div>
        </div>

        {/* confidence */}
        <div className="nm-rpl__field">
          <div className={`nm-rpl__field-label ${differingFields.includes("confidence") ? "nm-rpl__field-label--differing" : ""}`}>
            confidence
          </div>
          <div className={`nm-rpl__field-value nm-rpl__conf ${CONFIDENCE_CLASS[result.confidence]}`}>
            {result.confidence}
          </div>
        </div>

        {/* riskDirection */}
        <div className="nm-rpl__field">
          <div className={`nm-rpl__field-label ${differingFields.includes("riskDirection") ? "nm-rpl__field-label--differing" : ""}`}>
            risk direction
          </div>
          <div className={`nm-rpl__field-value nm-rpl__dir ${DIRECTION_CLASS[result.riskDirection]}`}>
            {DIRECTION_ICON[result.riskDirection]} {result.riskDirection}
          </div>
        </div>
      </div>

      <button
        className="nm-rpl__explain-toggle"
        onClick={() => setShowExplanation((v) => !v)}
        aria-expanded={showExplanation}
      >
        {showExplanation ? "▾ explanation" : "▸ explanation"}
      </button>

      {showExplanation && (
        <ul className="nm-rpl__explain-lines">
          {result.explanationLines.map((line, i) => (
            <li key={i} className="nm-rpl__explain-line">{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* =========================================================
   Differing fields summary
   ========================================================= */

function DiffSummary({ comparison }: { comparison: PolicyReplayComparison }) {
  if (comparison.results.length < 2) return null;

  return (
    <div className="nm-rpl__diff">
      <div className="nm-rpl__section-label">DIVERGING FIELDS</div>
      {comparison.differingFields.length === 0 ? (
        <div className="nm-rpl__diff-none">
          All policies produced identical outputs.
        </div>
      ) : (
        <div className="nm-rpl__diff-tags">
          {comparison.differingFields.map((field) => (
            <span key={field} className="nm-rpl__diff-tag">
              {field}
            </span>
          ))}
        </div>
      )}
      <ul className="nm-rpl__summary-lines">
        {comparison.summaryLines.map((line, i) => (
          <li key={i} className="nm-rpl__summary-line">{line}</li>
        ))}
      </ul>
    </div>
  );
}

/* =========================================================
   PolicyReplayPanel — main export
   ========================================================= */

export interface PolicyReplayPanelProps {
  /** Available audit records (historical runs) to select as the source. */
  auditRecords: AuditRecord[];
  /** Available frozen policy snapshots to replay under. */
  frozenPolicies: FrozenPolicySnapshot[];
}

export function PolicyReplayPanel({
  auditRecords,
  frozenPolicies,
}: PolicyReplayPanelProps) {
  const [selectedRecordId, setSelectedRecordId] = useState<string>(
    auditRecords[0]?.id ?? ""
  );
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<PolicyReplayComparison | null>(null);

  const selectedRecord = auditRecords.find((r) => r.id === selectedRecordId) ?? null;

  function togglePolicy(id: string) {
    setSelectedPolicyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setComparison(null);
  }

  function handleReplay() {
    if (!selectedRecord || selectedPolicyIds.length === 0) return;

    const request: PolicyReplayRequest = {
      canonicalDeclaration: selectedRecord.canonicalDeclaration,
      intent: selectedRecord.intent as PolicyReplayRequest["intent"],
      baselineAuditRecordId: selectedRecord.id,
      replayPolicyVersionIds: selectedPolicyIds,
    };

    const result = buildPolicyReplayComparison(
      request,
      frozenPolicies,
      auditRecords
    );

    setComparison(result);
  }

  const canReplay = !!selectedRecord && selectedPolicyIds.length > 0;

  return (
    <div className="nm-rpl">
      <div className="nm-rpl__header">
        <div className="nm-rpl__title">POLICY REPLAY</div>
        <div className="nm-rpl__meta">experimental analysis · read-only · same input, different policy</div>
      </div>

      {/* Source run selector */}
      <div className="nm-rpl__block">
        <div className="nm-rpl__section-label">SOURCE RUN</div>
        {auditRecords.length === 0 ? (
          <div className="nm-rpl__empty">No audit records available.</div>
        ) : (
          <>
            <select
              className="nm-rpl__select"
              value={selectedRecordId}
              onChange={(e) => {
                setSelectedRecordId(e.target.value);
                setComparison(null);
              }}
            >
              {auditRecords.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · {r.intent} · {r.timestamp.slice(0, 10)}
                </option>
              ))}
            </select>

            {selectedRecord && (
              <div className="nm-rpl__declaration">
                <div className="nm-rpl__field-label">canonical declaration</div>
                <pre className="nm-rpl__declaration-text">
                  {selectedRecord.canonicalDeclaration.slice(0, 300)}
                  {selectedRecord.canonicalDeclaration.length > 300 ? "…" : ""}
                </pre>
              </div>
            )}
          </>
        )}
      </div>

      {/* Policy version selector */}
      <div className="nm-rpl__block">
        <div className="nm-rpl__section-label">REPLAY UNDER POLICIES</div>
        {frozenPolicies.length === 0 ? (
          <div className="nm-rpl__empty">No frozen policies available.</div>
        ) : (
          <div className="nm-rpl__policy-list">
            {frozenPolicies.map((p) => {
              const selected = selectedPolicyIds.includes(p.policyVersionId);
              return (
                <button
                  key={p.policyVersionId}
                  className={`nm-rpl__policy-btn ${selected ? "nm-rpl__policy-btn--selected" : ""}`}
                  onClick={() => togglePolicy(p.policyVersionId)}
                  type="button"
                >
                  <code>{shortId(p.policyVersionId)}</code>
                  {selected && <span className="nm-rpl__policy-check">✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Run replay button */}
      <button
        className="nm-rpl__run-btn"
        onClick={handleReplay}
        disabled={!canReplay}
        type="button"
      >
        Run replay ({selectedPolicyIds.length} {selectedPolicyIds.length === 1 ? "policy" : "policies"})
      </button>

      {/* Replay results */}
      {comparison && (
        <>
          <div className="nm-rpl__block">
            <div className="nm-rpl__section-label">
              REPLAY RESULTS · hash {comparison.canonicalDeclarationHash}
            </div>
            <div className="nm-rpl__cards">
              {comparison.results.map((result, i) => (
                <ReplayResultCard
                  key={result.policyVersionId}
                  result={result}
                  differingFields={comparison.differingFields}
                  isBaseline={i === 0}
                />
              ))}
            </div>
          </div>

          <DiffSummary comparison={comparison} />
        </>
      )}

      {/* Notice */}
      <div className="nm-rpl__notice">
        Replay varies policy only. Input and audit context are identical across
        all replays. Results are experimental — no history is modified and no
        policy is promoted by this panel.
      </div>
    </div>
  );
}
