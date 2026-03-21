/**
 * trace_diff_types.ts
 *
 * Canonical types for trace-aware diff across NOMOS audit runs.
 *
 * A trace diff compares two saved audit versions at three levels:
 *   1. TraceStateDiff  — raw state comparison (baseline or candidate)
 *   2. ProofLineDiff   — line-level set diff of proof arrays
 *   3. ConstraintTraceDiff — full per-constraint diff record
 *   4. AuditRunDiff    — top-level diff of two AuditRecord runs
 *
 * All comparison is deterministic. No LLM text generation is used here.
 */

/**
 * Comparison of a single state value between two audit runs.
 * Used for both baselineState and candidateState.
 */
export interface TraceStateDiff {
  before: unknown;
  after: unknown;
  changed: boolean;
  summary: string;
}

/**
 * Line-level diff of proof line arrays.
 * Uses set membership — order-independent across "unchanged" detection.
 */
export interface ProofLineDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

/**
 * Full diff for a single constraint trace between two audit runs.
 *
 * decisiveVariableBefore/After: the violationLabel when violated, null when satisfied.
 *   Derived from the trace's proof conclusion — never from prose violationLabel directly.
 *
 * verdictBefore/After: "satisfied" | "violated" | null
 *   Derived from whether the proof conclusion says "is satisfied" or "is violated".
 *
 * changeSummary: one human-readable sentence summarising what changed.
 *   Examples:
 *     "Decisive variable changed from calorie delta to protein placement violation."
 *     "Baseline protein placement state changed."
 *     "Proof added: 'Whey moved from meal 2 to meal 7.'"
 */
export interface ConstraintTraceDiff {
  constraintId: string;
  key: string;
  variableName: string;

  baselineStateDiff: TraceStateDiff;
  candidateStateDiff: TraceStateDiff;

  diffSummaryBefore: string | null;
  diffSummaryAfter: string | null;

  decisiveVariableBefore: string | null;
  decisiveVariableAfter: string | null;

  verdictBefore: string | null;
  verdictAfter: string | null;

  proofLineDiff: ProofLineDiff;

  changed: boolean;
  changeSummary: string;
}

/**
 * Top-level diff of two AuditRecord runs.
 *
 * summaryLines describes what changed at a human-readable level:
 *   "Overall status changed from LAWFUL to DEGRADED."
 *   "Decisive variable changed from calorie delta to protein placement violation."
 *   "Candidate B proof gained: 'Whey moved from meal 2 to meal 7.'"
 */
export interface AuditRunDiff {
  beforeVersionId: string;
  afterVersionId: string;

  overallStatusBefore: string | null;
  overallStatusAfter: string | null;

  decisiveVariableBefore: string | null;
  decisiveVariableAfter: string | null;

  candidateDiffs: ConstraintTraceDiff[];

  changed: boolean;
  summaryLines: string[];
}
