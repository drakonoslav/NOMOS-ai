import React, { useState } from "react";
import { useScenario } from "@/context/scenario-context";
import { diffRunsWithDecision } from "../../audit/audit_diff";
import type { AuditRun } from "../../audit/audit_log";

function formatRun(run: AuditRun): string {
  const t = new Date(run.startedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return run.label ? `${run.label} — ${t}` : t;
}

function safe(payload: unknown): string {
  if (payload === undefined) return "—";
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export function AuditDiffPanel() {
  const { auditRuns, getRunEntries } = useScenario();
  const [runA, setRunA] = useState<string | null>(null);
  const [runB, setRunB] = useState<string | null>(null);

  const result =
    runA && runB
      ? diffRunsWithDecision(getRunEntries(runA), getRunEntries(runB))
      : null;

  const diffs   = result?.stageDiffs ?? [];
  const decisive = result?.decisive;

  return (
    <div className="panel audit-diff">
      <div className="panel-header">Audit Diff</div>

      <div className="audit-diff__selectors">
        <select
          className="form-input"
          style={{ flex: 1 }}
          onChange={(e) => setRunA(e.target.value || null)}
          value={runA ?? ""}
        >
          <option value="">Select Run A</option>
          {auditRuns.map((r) => (
            <option key={r.runId} value={r.runId}>{formatRun(r)}</option>
          ))}
        </select>

        <select
          className="form-input"
          style={{ flex: 1 }}
          onChange={(e) => setRunB(e.target.value || null)}
          value={runB ?? ""}
        >
          <option value="">Select Run B</option>
          {auditRuns.map((r) => (
            <option key={r.runId} value={r.runId}>{formatRun(r)}</option>
          ))}
        </select>
      </div>

      {decisive && (
        <div className="audit-decisive">
          <div className="audit-decisive__title">Decisive Variable</div>
          <div className="audit-decisive__body">
            <div className="audit-decisive__var">{decisive.variable}</div>
            <div className="audit-decisive__change">
              {String(decisive.before)} → {String(decisive.after)}
            </div>
            <div className="audit-decisive__reason">{decisive.reason}</div>
          </div>
        </div>
      )}

      {result && diffs.length === 0 && (
        <div className="audit-empty">No differences found between selected runs.</div>
      )}

      <div className="audit-diff__list">
        {diffs.map((d) => (
          <div
            key={d.stage}
            className={`audit-diff__item${d.changed ? " changed" : ""}`}
          >
            <div className="audit-diff__stage">{d.stage}</div>
            {d.changed && (
              <div className="audit-diff__payloads">
                <pre>{safe(d.before)}</pre>
                <pre>{safe(d.after)}</pre>
              </div>
            )}
          </div>
        ))}
      </div>

      {!runA || !runB ? (
        <div className="audit-empty" style={{ marginTop: "8px" }}>
          Select two runs above to compare.
        </div>
      ) : null}
    </div>
  );
}
