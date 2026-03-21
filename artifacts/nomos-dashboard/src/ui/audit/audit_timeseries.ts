/**
 * audit_timeseries.ts
 *
 * Time-series extraction and drift analysis for NOMOS audit runs.
 *
 * Reads "run_summary" entries from the audit log and produces
 * a structured series for the DecisiveTrendPanel.
 */

import type { AuditEntry } from "./audit_log";

export interface RunSummary {
  runId: string;
  timestamp: number;
  status: "LAWFUL" | "DEGRADED" | "INVALID";
  decisiveVariable: string;
  modelConfidence?: number;
  robustness?: number;
  feasibility?: boolean;
}

export interface DriftAnalysis {
  drift: boolean;
  variableChanged: boolean;
  statusChanged: boolean;
  direction?: "improving" | "degrading" | "lateral";
}

export function extractRunSummaries(entries: AuditEntry[]): RunSummary[] {
  return entries
    .filter((e) => e.stage === "run_summary")
    .map((e) => {
      const p = e.payload as Record<string, unknown>;
      return {
        runId: e.runId,
        timestamp: e.timestamp,
        status: p.status as "LAWFUL" | "DEGRADED" | "INVALID",
        decisiveVariable: (p.decisiveVariable as string) ?? "unknown",
        modelConfidence: p.modelConfidence as number | undefined,
        robustness: p.robustness as number | undefined,
        feasibility: p.feasibility as boolean | undefined,
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function analyzeDrift(series: RunSummary[]): DriftAnalysis {
  if (series.length < 2) {
    return { drift: false, variableChanged: false, statusChanged: false };
  }

  const prev = series[series.length - 2];
  const last = series[series.length - 1];

  const variableChanged = last.decisiveVariable !== prev.decisiveVariable;
  const statusChanged   = last.status !== prev.status;
  const drift           = variableChanged || statusChanged;

  let direction: DriftAnalysis["direction"];

  if (statusChanged) {
    const rank = { LAWFUL: 2, DEGRADED: 1, INVALID: 0 } as const;
    const d = rank[last.status] - rank[prev.status];
    direction = d > 0 ? "improving" : d < 0 ? "degrading" : "lateral";
  }

  return { drift, variableChanged, statusChanged, direction };
}
