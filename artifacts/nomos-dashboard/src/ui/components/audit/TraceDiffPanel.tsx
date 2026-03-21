/**
 * TraceDiffPanel.tsx
 *
 * Renders a trace-aware diff between two saved NOMOS audit runs.
 *
 * Accepts two AuditRecord objects, computes the AuditRunDiff deterministically
 * via diffAuditRuns(), and renders:
 *   - Version identifiers (before / after)
 *   - Overall status change
 *   - Decisive variable change
 *   - Per-candidate constraint trace diffs with proof line additions/removals
 *
 * Proof additions are rendered in lawful green.
 * Proof removals are rendered in invalid red.
 * Unchanged proof lines are rendered muted.
 *
 * No LLM text is generated or displayed here.
 */

import React, { useState } from "react";
import type { AuditRecord } from "../../../audit/audit_types";
import type { AuditRunDiff, ConstraintTraceDiff } from "../../../audit/trace_diff_types";
import { diffAuditRuns } from "../../../audit/trace_diff";

/* =========================================================
   Status badge
   ========================================================= */

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="nm-trace-diff__status-none">—</span>;
  const cls =
    status === "LAWFUL"
      ? "nm-trace-diff__status-lawful"
      : status === "DEGRADED"
      ? "nm-trace-diff__status-degraded"
      : status === "INVALID"
      ? "nm-trace-diff__status-invalid"
      : "nm-trace-diff__status-unknown";
  return <span className={cls}>{status}</span>;
}

/* =========================================================
   Arrow between two values
   ========================================================= */

function ChangeArrow({
  before,
  after,
}: {
  before: string | null;
  after: string | null;
}) {
  const unchanged = before === after;
  return (
    <span className={unchanged ? "nm-trace-diff__change--same" : "nm-trace-diff__change--diff"}>
      <span className="nm-trace-diff__change-before">{before ?? "—"}</span>
      {!unchanged && (
        <>
          <span className="nm-trace-diff__change-arrow"> → </span>
          <span className="nm-trace-diff__change-after">{after ?? "—"}</span>
        </>
      )}
    </span>
  );
}

/* =========================================================
   Proof line diff renderer
   ========================================================= */

function ProofLineDiffSection({ diff }: { diff: ConstraintTraceDiff }) {
  const { proofLineDiff } = diff;
  const hasChanges =
    proofLineDiff.added.length > 0 || proofLineDiff.removed.length > 0;

  if (!hasChanges && proofLineDiff.unchanged.length === 0) {
    return (
      <div className="nm-trace-diff__proof-empty">No proof lines recorded.</div>
    );
  }

  return (
    <div className="nm-trace-diff__proof-lines">
      {proofLineDiff.removed.map((line, i) => (
        <div key={`rm-${i}`} className="nm-trace-diff__proof-line nm-trace-diff__proof-line--removed">
          <span className="nm-trace-diff__proof-gutter">−</span>
          <span>{line}</span>
        </div>
      ))}
      {proofLineDiff.unchanged.map((line, i) => (
        <div key={`unch-${i}`} className="nm-trace-diff__proof-line nm-trace-diff__proof-line--unchanged">
          <span className="nm-trace-diff__proof-gutter"> </span>
          <span>{line}</span>
        </div>
      ))}
      {proofLineDiff.added.map((line, i) => (
        <div key={`add-${i}`} className="nm-trace-diff__proof-line nm-trace-diff__proof-line--added">
          <span className="nm-trace-diff__proof-gutter">+</span>
          <span>{line}</span>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   Per-candidate constraint trace diff card
   ========================================================= */

function ConstraintTraceDiffCard({ diff }: { diff: ConstraintTraceDiff }) {
  const [expanded, setExpanded] = useState(diff.changed);

  return (
    <div className={`nm-trace-diff__candidate${diff.changed ? " nm-trace-diff__candidate--changed" : ""}`}>
      <button
        type="button"
        className="nm-trace-diff__candidate-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="nm-trace-diff__candidate-var">{diff.variableName}</span>
        {diff.changed ? (
          <span className="nm-trace-diff__candidate-badge nm-trace-diff__candidate-badge--changed">
            changed
          </span>
        ) : (
          <span className="nm-trace-diff__candidate-badge nm-trace-diff__candidate-badge--same">
            unchanged
          </span>
        )}
        <span className="nm-trace-diff__candidate-toggle">{expanded ? "▴" : "▾"}</span>
      </button>

      {expanded && (
        <div className="nm-trace-diff__candidate-body">
          {/* Decisive variable */}
          <div className="nm-trace-diff__field">
            <span className="nm-trace-diff__field-label">Decisive variable</span>
            <ChangeArrow
              before={diff.decisiveVariableBefore}
              after={diff.decisiveVariableAfter}
            />
          </div>

          {/* Verdict */}
          <div className="nm-trace-diff__field">
            <span className="nm-trace-diff__field-label">Verdict</span>
            <ChangeArrow
              before={diff.verdictBefore}
              after={diff.verdictAfter}
            />
          </div>

          {/* Diff summary */}
          {diff.diffSummaryBefore !== diff.diffSummaryAfter && (
            <div className="nm-trace-diff__field">
              <span className="nm-trace-diff__field-label">Diff summary</span>
              <ChangeArrow
                before={diff.diffSummaryBefore}
                after={diff.diffSummaryAfter}
              />
            </div>
          )}

          {/* Baseline state */}
          {diff.baselineStateDiff.changed && (
            <div className="nm-trace-diff__field nm-trace-diff__field--state">
              <span className="nm-trace-diff__field-label">Baseline state</span>
              <span className="nm-trace-diff__state-changed">{diff.baselineStateDiff.summary}</span>
            </div>
          )}

          {/* Candidate state */}
          {diff.candidateStateDiff.changed && (
            <div className="nm-trace-diff__field nm-trace-diff__field--state">
              <span className="nm-trace-diff__field-label">Candidate state</span>
              <span className="nm-trace-diff__state-changed">{diff.candidateStateDiff.summary}</span>
            </div>
          )}

          {/* Proof line diff */}
          <div className="nm-trace-diff__proof-section">
            <div className="nm-trace-diff__field-label">Proof lines</div>
            <ProofLineDiffSection diff={diff} />
          </div>

          {/* Change summary */}
          {diff.changed && (
            <div className="nm-trace-diff__change-summary">{diff.changeSummary}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   TraceDiffPanel — main export
   ========================================================= */

export interface TraceDiffPanelProps {
  before: AuditRecord;
  after: AuditRecord;
}

export function TraceDiffPanel({ before, after }: TraceDiffPanelProps) {
  const diff: AuditRunDiff = diffAuditRuns(before, after);

  return (
    <div className="nm-trace-diff">
      {/* Header */}
      <div className="nm-trace-diff__header">
        <div className="nm-trace-diff__title">TRACE DIFF</div>
        <div className="nm-trace-diff__versions">
          <span className="nm-trace-diff__version-before" title={before.versionId}>
            {before.title}
          </span>
          <span className="nm-trace-diff__version-arrow"> → </span>
          <span className="nm-trace-diff__version-after" title={after.versionId}>
            {after.title}
          </span>
        </div>
      </div>

      {/* Top-level status and decisive variable */}
      <div className="nm-trace-diff__summary-block">
        <div className="nm-trace-diff__field">
          <span className="nm-trace-diff__field-label">Overall status</span>
          <span className="nm-trace-diff__status-pair">
            <StatusBadge status={diff.overallStatusBefore} />
            {diff.overallStatusBefore !== diff.overallStatusAfter && (
              <>
                <span className="nm-trace-diff__change-arrow"> → </span>
                <StatusBadge status={diff.overallStatusAfter} />
              </>
            )}
          </span>
        </div>

        <div className="nm-trace-diff__field">
          <span className="nm-trace-diff__field-label">Decisive variable</span>
          <ChangeArrow
            before={diff.decisiveVariableBefore}
            after={diff.decisiveVariableAfter}
          />
        </div>
      </div>

      {/* Summary lines */}
      {diff.summaryLines.length > 0 && (
        <div className="nm-trace-diff__summary-lines">
          {diff.summaryLines.map((line, i) => (
            <div key={i} className="nm-trace-diff__summary-line">
              {line}
            </div>
          ))}
        </div>
      )}

      {!diff.changed && (
        <div className="nm-trace-diff__no-changes">
          No differences detected between these two runs.
        </div>
      )}

      {/* Per-candidate trace diffs */}
      {diff.candidateDiffs.length > 0 && (
        <div className="nm-trace-diff__candidates">
          <div className="nm-trace-diff__candidates-label">Constraint traces</div>
          {diff.candidateDiffs.map((cd) => (
            <ConstraintTraceDiffCard key={`${cd.constraintId}-${cd.key}`} diff={cd} />
          ))}
        </div>
      )}

      {diff.changed && diff.candidateDiffs.length === 0 && (
        <div className="nm-trace-diff__no-traces">
          Overall verdict changed but no structured constraint traces are available
          for these runs. Re-run the evaluation to generate trace data.
        </div>
      )}
    </div>
  );
}
