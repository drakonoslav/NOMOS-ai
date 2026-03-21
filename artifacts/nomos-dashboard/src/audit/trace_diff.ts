/**
 * trace_diff.ts
 *
 * Deterministic diff engine for NOMOS trace-aware audit comparison.
 *
 * Compares two saved audit runs at three levels:
 *   - State level:    diffTraceState(before, after)
 *   - Proof level:    diffProofLines(beforeLines, afterLines)
 *   - Constraint level: diffConstraintTrace(beforeTrace, afterTrace)
 *   - Run level:      diffAuditRuns(beforeRecord, afterRecord)
 *
 * Rules:
 *   - Structural equality via JSON.stringify (canonical, sorted keys for objects)
 *   - Proof lines compared as set membership (added / removed / unchanged)
 *   - Decisive variable derived from violationLabel when violated, null when satisfied
 *   - Verdict derived from proof line conclusion text
 *   - Change summaries are derived from diff data — never from LLM generation
 *
 * No LLM text generation is used anywhere in this module.
 */

import type { ConstraintTrace } from "../evaluation/evaluation_report_types";
import type { AuditRecord } from "./audit_types";
import type {
  TraceStateDiff,
  ProofLineDiff,
  ConstraintTraceDiff,
  AuditRunDiff,
} from "./trace_diff_types";

/* =========================================================
   Internal EvaluationResult shape (mirrors eval_types.ts)
   ========================================================= */

interface CandidateEvaluationSnapshot {
  id: string;
  status?: string;
  decisiveVariable?: string | null;
  decisiveConstraintTrace?: ConstraintTrace | null;
  allConstraintTraces?: ConstraintTrace[];
}

interface EvaluationResultSnapshot {
  overallStatus?: string | null;
  decisiveVariable?: string | null;
  candidateEvaluations?: CandidateEvaluationSnapshot[];
}

function isEvaluationResultSnapshot(x: unknown): x is EvaluationResultSnapshot {
  return (
    typeof x === "object" &&
    x !== null &&
    ("overallStatus" in x || "candidateEvaluations" in x)
  );
}

/* =========================================================
   Helpers
   ========================================================= */

/**
 * Stable JSON stringify — sorts object keys so two semantically equal
 * objects always produce the same string regardless of insertion order.
 */
function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, val) => {
      if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(val as object).sort()) {
          sorted[k] = (val as Record<string, unknown>)[k];
        }
        return sorted;
      }
      return val;
    });
  } catch {
    return String(value);
  }
}

/**
 * Derive verdict from proof lines.
 * Returns "violated" if conclusion says "is violated",
 * "satisfied" if conclusion says "is satisfied", null otherwise.
 */
function extractVerdict(proofLines: string[]): string | null {
  const last = proofLines.at(-1)?.toLowerCase() ?? "";
  if (last.includes("is violated")) return "violated";
  if (last.includes("is satisfied")) return "satisfied";
  return null;
}

/**
 * Derive decisive variable from a trace.
 * When violated: returns violationLabel (e.g. "protein placement violation").
 * When satisfied or unknown: returns null.
 */
function extractDecisiveVariable(trace: ConstraintTrace | null): string | null {
  if (!trace) return null;
  const verdict = extractVerdict(trace.proofLines);
  if (verdict === "violated") return trace.violationLabel;
  return null;
}

/* =========================================================
   diffTraceState
   ========================================================= */

/**
 * Compares two state values structurally.
 *
 * Uses stable JSON.stringify for comparison so object key order
 * does not produce spurious diffs.
 */
export function diffTraceState(before: unknown, after: unknown): TraceStateDiff {
  const beforeStr = stableStringify(before);
  const afterStr = stableStringify(after);
  const changed = beforeStr !== afterStr;
  return {
    before,
    after,
    changed,
    summary: changed ? "State differs from previous run." : "State unchanged.",
  };
}

/* =========================================================
   diffProofLines
   ========================================================= */

/**
 * Compares two proof line arrays as sets.
 *
 * added:     lines present in afterLines but not beforeLines
 * removed:   lines present in beforeLines but not afterLines
 * unchanged: lines present in both
 *
 * Order-stable: added/removed are returned in the order they appear
 * in the after/before arrays respectively.
 */
export function diffProofLines(
  beforeLines: string[],
  afterLines: string[]
): ProofLineDiff {
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  const added = afterLines.filter((l) => !beforeSet.has(l));
  const removed = beforeLines.filter((l) => !afterSet.has(l));
  const unchanged = beforeLines.filter((l) => afterSet.has(l));

  return { added, removed, unchanged };
}

/* =========================================================
   diffConstraintTrace
   ========================================================= */

/**
 * Builds a ConstraintTraceDiff from two ConstraintTrace records (either may be null
 * when one run had no trace for this constraint).
 *
 * The candidateId parameter is used only in the changeSummary label.
 */
export function diffConstraintTrace(
  before: ConstraintTrace | null,
  after: ConstraintTrace | null,
  candidateId?: string
): ConstraintTraceDiff {
  const constraintId = before?.constraintId ?? after?.constraintId ?? "";
  const key = before?.key ?? after?.key ?? "";
  const variableName = before?.variableName ?? after?.variableName ?? "";

  const baselineStateDiff = diffTraceState(
    before?.baselineState ?? null,
    after?.baselineState ?? null
  );
  const candidateStateDiff = diffTraceState(
    before?.candidateState ?? null,
    after?.candidateState ?? null
  );

  const diffSummaryBefore = before?.diffSummary ?? null;
  const diffSummaryAfter = after?.diffSummary ?? null;

  const decisiveVariableBefore = extractDecisiveVariable(before);
  const decisiveVariableAfter = extractDecisiveVariable(after);

  const verdictBefore = before ? extractVerdict(before.proofLines) : null;
  const verdictAfter = after ? extractVerdict(after.proofLines) : null;

  const proofLineDiff = diffProofLines(
    before?.proofLines ?? [],
    after?.proofLines ?? []
  );

  const changed =
    baselineStateDiff.changed ||
    candidateStateDiff.changed ||
    diffSummaryBefore !== diffSummaryAfter ||
    decisiveVariableBefore !== decisiveVariableAfter ||
    verdictBefore !== verdictAfter ||
    proofLineDiff.added.length > 0 ||
    proofLineDiff.removed.length > 0;

  const changeSummary = buildChangeSummary(
    variableName,
    candidateId ?? null,
    baselineStateDiff,
    candidateStateDiff,
    decisiveVariableBefore,
    decisiveVariableAfter,
    verdictBefore,
    verdictAfter,
    proofLineDiff,
    changed
  );

  return {
    constraintId,
    key,
    variableName,
    baselineStateDiff,
    candidateStateDiff,
    diffSummaryBefore,
    diffSummaryAfter,
    decisiveVariableBefore,
    decisiveVariableAfter,
    verdictBefore,
    verdictAfter,
    proofLineDiff,
    changed,
    changeSummary,
  };
}

function buildChangeSummary(
  variableName: string,
  candidateId: string | null,
  baselineStateDiff: TraceStateDiff,
  candidateStateDiff: TraceStateDiff,
  decisiveVarBefore: string | null,
  decisiveVarAfter: string | null,
  verdictBefore: string | null,
  verdictAfter: string | null,
  proofLineDiff: ProofLineDiff,
  changed: boolean
): string {
  if (!changed) return "No changes detected.";

  const prefix = candidateId ? `Candidate ${candidateId}: ` : "";

  if (decisiveVarBefore !== decisiveVarAfter) {
    const from = decisiveVarBefore ?? "none";
    const to = decisiveVarAfter ?? "none";
    return `${prefix}Decisive variable changed from ${from} to ${to}.`;
  }

  if (verdictBefore !== verdictAfter) {
    const from = verdictBefore ?? "unknown";
    const to = verdictAfter ?? "unknown";
    return `${prefix}Verdict for ${variableName} changed from ${from} to ${to}.`;
  }

  if (proofLineDiff.added.length > 0) {
    const line = proofLineDiff.added[0]!;
    return `${prefix}Proof added: '${line}'`;
  }

  if (proofLineDiff.removed.length > 0) {
    const line = proofLineDiff.removed[0]!;
    return `${prefix}Proof removed: '${line}'`;
  }

  if (baselineStateDiff.changed) {
    return `${prefix}Baseline ${variableName} state changed.`;
  }

  if (candidateStateDiff.changed) {
    return `${prefix}Candidate ${variableName} state changed.`;
  }

  return `${prefix}Diff summary changed for ${variableName}.`;
}

/* =========================================================
   diffAuditRuns
   ========================================================= */

/**
 * Produces a full AuditRunDiff by comparing two AuditRecord objects.
 *
 * Extracts EvaluationResult from each record's evaluationResult.payload,
 * then compares:
 *   - overallStatus
 *   - decisiveVariable
 *   - per-candidate decisive constraint traces
 *
 * Candidates matched by id. If a candidate appears in only one run,
 * it produces a diff against null on the other side.
 *
 * summaryLines lists all human-readable change sentences.
 */
export function diffAuditRuns(
  before: AuditRecord,
  after: AuditRecord
): AuditRunDiff {
  const beforeEval = isEvaluationResultSnapshot(before.evaluationResult?.payload)
    ? (before.evaluationResult!.payload as EvaluationResultSnapshot)
    : null;
  const afterEval = isEvaluationResultSnapshot(after.evaluationResult?.payload)
    ? (after.evaluationResult!.payload as EvaluationResultSnapshot)
    : null;

  const overallStatusBefore = beforeEval?.overallStatus ?? null;
  const overallStatusAfter = afterEval?.overallStatus ?? null;

  const decisiveVariableBefore = beforeEval?.decisiveVariable ?? null;
  const decisiveVariableAfter = afterEval?.decisiveVariable ?? null;

  // Build candidate maps keyed by id
  const beforeCandidates = new Map<string, CandidateEvaluationSnapshot>(
    (beforeEval?.candidateEvaluations ?? []).map((c) => [c.id, c])
  );
  const afterCandidates = new Map<string, CandidateEvaluationSnapshot>(
    (afterEval?.candidateEvaluations ?? []).map((c) => [c.id, c])
  );

  // Union of all candidate IDs — sorted for determinism
  const allIds = [...new Set([...beforeCandidates.keys(), ...afterCandidates.keys()])].sort();

  const candidateDiffs: ConstraintTraceDiff[] = [];

  for (const id of allIds) {
    const bc = beforeCandidates.get(id) ?? null;
    const ac = afterCandidates.get(id) ?? null;

    const bt = bc?.decisiveConstraintTrace ?? null;
    const at_ = ac?.decisiveConstraintTrace ?? null;

    // Only produce a diff when at least one run has a trace for this candidate
    if (bt !== null || at_ !== null) {
      candidateDiffs.push(diffConstraintTrace(bt, at_, id));
    }
  }

  // Build summary lines
  const summaryLines: string[] = [];

  if (overallStatusBefore !== overallStatusAfter) {
    summaryLines.push(
      `Overall status changed from ${overallStatusBefore ?? "unknown"} to ${overallStatusAfter ?? "unknown"}.`
    );
  }

  if (decisiveVariableBefore !== decisiveVariableAfter) {
    summaryLines.push(
      `Decisive variable changed from ${decisiveVariableBefore ?? "none"} to ${decisiveVariableAfter ?? "none"}.`
    );
  }

  for (const cd of candidateDiffs) {
    if (cd.changed && cd.changeSummary !== "No changes detected.") {
      summaryLines.push(cd.changeSummary);
    }
  }

  const changed =
    overallStatusBefore !== overallStatusAfter ||
    decisiveVariableBefore !== decisiveVariableAfter ||
    candidateDiffs.some((d) => d.changed);

  return {
    beforeVersionId: before.versionId,
    afterVersionId: after.versionId,
    overallStatusBefore,
    overallStatusAfter,
    decisiveVariableBefore,
    decisiveVariableAfter,
    candidateDiffs,
    changed,
    summaryLines,
  };
}
