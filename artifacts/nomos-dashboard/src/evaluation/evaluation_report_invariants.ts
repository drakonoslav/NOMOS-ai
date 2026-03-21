/**
 * evaluation_report_invariants.ts
 *
 * Enforces constitutional correctness invariants on OverallEvaluationReport.
 *
 * Call assertEvaluationReportInvariants() immediately after building a report.
 * In production it logs errors and returns a list of violations rather than
 * throwing, so the UI degrades gracefully. In test environments, callers
 * should check the returned array and assert it is empty.
 *
 * Invariants enforced:
 *
 *  I1. Violated constraints must never coexist with a "passed" summary.
 *  I2. If constraintsInterpretationRequired === 0, no manual-review text
 *      may appear in summaryReason.
 *  I3. A "lawful" candidate cannot have any violated constraints.
 *  I4. If the decisive variable names a violation, constraintsViolated must
 *      be greater than zero.
 *  I5. The overall satisfactionSummary must not say "passed" when
 *      constraintsViolated > 0 at the global level.
 *  I6. ConstraintEvaluationRecord.variableName must never contain the word
 *      "violation" — it is the measured variable, not the violation label.
 */

import type { OverallEvaluationReport } from "./evaluation_report_types";

export interface InvariantViolation {
  invariant: string;
  candidateId?: string;
  detail: string;
}

/**
 * Checks all invariants on the given report.
 *
 * @returns An array of InvariantViolation objects. Empty array means the report
 *          is internally consistent. Non-empty array surfaces every violation.
 *
 * Side effects: console.error for each violation found.
 */
export function assertEvaluationReportInvariants(
  report: OverallEvaluationReport
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  for (const candidate of report.candidates) {
    /* I1: violated constraints must never coexist with a "passed" summary */
    if (
      candidate.constraintsViolated > 0 &&
      candidate.summaryReason.toLowerCase().includes("all constraints passed")
    ) {
      violations.push({
        invariant: "I1",
        candidateId: candidate.candidateId,
        detail: `Candidate ${candidate.candidateId} has ${candidate.constraintsViolated} violated constraint(s) but summaryReason says "all constraints passed".`,
      });
    }

    /* I2: no manual-review text if interpretationRequired === 0 */
    if (
      candidate.constraintsInterpretationRequired === 0 &&
      candidate.summaryReason.toLowerCase().includes("manual review")
    ) {
      violations.push({
        invariant: "I2",
        candidateId: candidate.candidateId,
        detail: `Candidate ${candidate.candidateId} summaryReason mentions "manual review" but constraintsInterpretationRequired === 0.`,
      });
    }

    /* I3: lawful candidate cannot have violated constraints */
    if (candidate.verdict === "lawful" && candidate.constraintsViolated > 0) {
      violations.push({
        invariant: "I3",
        candidateId: candidate.candidateId,
        detail: `Candidate ${candidate.candidateId} has verdict "lawful" but ${candidate.constraintsViolated} violated constraint(s).`,
      });
    }

    /* I4: decisive variable naming a violation requires violatedCount > 0 */
    if (
      candidate.decisiveVariable?.toLowerCase().includes("violation") &&
      candidate.constraintsViolated === 0
    ) {
      violations.push({
        invariant: "I4",
        candidateId: candidate.candidateId,
        detail: `Candidate ${candidate.candidateId} decisiveVariable is "${candidate.decisiveVariable}" (names a violation) but constraintsViolated === 0.`,
      });
    }

    /* I6: ConstraintEvaluationRecord.variableName must never contain "violation" */
    for (const record of candidate.constraintEvaluations) {
      if (record.variableName?.toLowerCase().includes("violation")) {
        violations.push({
          invariant: "I6",
          candidateId: candidate.candidateId,
          detail: `Candidate ${candidate.candidateId}: ConstraintEvaluationRecord[${record.key ?? record.constraintId}].variableName="${record.variableName}" contains "violation". variableName must be the variable, not the violation label.`,
        });
      }
    }
  }

  /* I5: global — no "passed" note if any violations exist globally */
  const globalViolated = report.totals.constraintsViolated;
  if (globalViolated > 0) {
    const badNote = report.notes.find((n) => n.toLowerCase().includes("passed"));
    if (badNote) {
      violations.push({
        invariant: "I5",
        detail: `Report notes contain "passed" ("${badNote}") but totals.constraintsViolated === ${globalViolated}.`,
      });
    }
  }

  for (const v of violations) {
    console.error(
      `[NOMOS] Invariant ${v.invariant} violated${v.candidateId ? ` (candidate ${v.candidateId})` : ""}:`,
      v.detail
    );
  }

  return violations;
}

/**
 * Throws on the first invariant violation found.
 * Use in tests or strict-mode contexts where you want immediate failure.
 */
export function assertEvaluationReportInvariantsStrict(
  report: OverallEvaluationReport
): void {
  const violations = assertEvaluationReportInvariants(report);
  if (violations.length > 0) {
    throw new Error(
      `EvaluationReport invariant failure: ${violations[0]!.detail}`
    );
  }
}
