/**
 * evaluation_report_summaries.ts
 *
 * Generates human-readable summary strings from OverallEvaluationReport fields.
 *
 * Rules:
 * - Text is derived from typed counts and flags only — never from reason prose.
 * - "passed" may only appear if constraintsViolated === 0 AND
 *   constraintsNotEvaluated === 0 for the relevant scope.
 * - "deterministically" describes the CLASSIFICATION phase, not satisfaction.
 * - "violations detected" describes the SATISFACTION phase, not classification.
 * - All three summaries are independent and must never be conflated.
 */

import type { CandidateEvaluationReport, OverallEvaluationReport } from "./evaluation_report_types";

/* =========================================================
   Classification summary
   Answers: HOW was each constraint evaluated?
   ========================================================= */

/**
 * Returns a sentence about how constraints were classified
 * (deterministic vs interpretation-required).
 *
 * This sentence MUST NOT imply anything about whether constraints
 * were satisfied or violated.
 */
export function generateClassificationSummary(report: OverallEvaluationReport): string {
  const { constraintsDeterministicallyClassified, constraintsInterpretationRequired, constraintsTotal } =
    report.totals;

  if (constraintsTotal === 0) {
    return "No constraints declared.";
  }

  if (constraintsInterpretationRequired === 0) {
    return "All constraints were evaluated deterministically.";
  }

  if (constraintsDeterministicallyClassified === 0) {
    return `All ${constraintsTotal} constraint${constraintsTotal > 1 ? "s" : ""} require manual review.`;
  }

  return (
    `${constraintsDeterministicallyClassified} of ${constraintsTotal} constraint${constraintsTotal > 1 ? "s" : ""} ` +
    `were evaluated deterministically; ` +
    `${constraintsInterpretationRequired} require${constraintsInterpretationRequired === 1 ? "s" : ""} manual review.`
  );
}

/* =========================================================
   Satisfaction summary
   Answers: DID candidates satisfy their constraints?
   ========================================================= */

/**
 * Returns a sentence about how many candidates are constraint-admissible.
 *
 * This sentence MUST NOT claim "all passed" if any violation exists.
 * It is derived entirely from candidatesEvaluated and the lawfulSet length.
 */
export function generateSatisfactionSummary(report: OverallEvaluationReport): string {
  const total     = report.totals.candidatesEvaluated;
  const lawful    = report.lawfulCandidateIds.length;
  const violated  = total - lawful;

  if (total === 0) return "No candidates evaluated.";

  if (violated === 0) {
    return `All ${total} candidate${total > 1 ? "s" : ""} are constraint-admissible.`;
  }

  if (lawful === 0) {
    return `Constraint violations detected across all ${total} candidate${total > 1 ? "s" : ""}.`;
  }

  return (
    `${lawful} of ${total} candidate${total > 1 ? "s" : ""} are constraint-admissible; ` +
    `${violated} have violations.`
  );
}

/**
 * Constraint-level satisfaction summary for a single candidate.
 * Used for per-card detail notes.
 */
export function generateCandidateSatisfactionSummary(candidate: CandidateEvaluationReport): string {
  const { constraintsSatisfied, constraintsViolated, constraintsNotEvaluated, constraintsTotal } =
    candidate;

  if (constraintsTotal === 0) return "No constraints evaluated.";

  const parts: string[] = [];

  if (constraintsViolated > 0) {
    parts.push(
      `${constraintsViolated} constraint${constraintsViolated > 1 ? "s" : ""} violated`
    );
  }
  if (constraintsSatisfied > 0) {
    parts.push(
      `${constraintsSatisfied} satisfied`
    );
  }
  if (constraintsNotEvaluated > 0) {
    parts.push(
      `${constraintsNotEvaluated} require${constraintsNotEvaluated === 1 ? "s" : ""} manual review`
    );
  }

  return parts.join("; ") + ".";
}

/* =========================================================
   Verdict summary
   Answers: What is the overall admission decision?
   ========================================================= */

/**
 * Returns a sentence about the overall admission verdict.
 * Derived from overallStatus and lawfulCandidateIds only.
 */
export function generateVerdictSummary(report: OverallEvaluationReport): string {
  switch (report.overallStatus) {
    case "lawful":
      if (report.lawfulCandidateIds.length > 0) {
        return `System is admissible. Best candidate: ${report.lawfulCandidateIds[0]}.`;
      }
      return "System is admissible.";

    case "degraded":
      if (report.lawfulCandidateIds.length > 0) {
        return (
          `System is degraded but partially admissible. ` +
          `Candidate${report.lawfulCandidateIds.length > 1 ? "s" : ""} ` +
          `${report.lawfulCandidateIds.join(", ")} remain${report.lawfulCandidateIds.length === 1 ? "s" : ""} lawful.`
        );
      }
      return "System is degraded. No fully admissible candidate exists.";

    case "invalid":
      return "System is invalid. No candidate satisfies the declared constraints.";
  }
}

/* =========================================================
   Decisive variable selection
   Priority: violated STRUCTURAL_LOCK > violated SOURCE_TRUTH >
             violated ALLOWED_ACTION > violated TARGET_TOLERANCE >
             interpretation_required > satisfied (any kind)
   ========================================================= */

const KIND_PRIORITY: Record<string, number> = {
  STRUCTURAL_LOCK:       0,
  SOURCE_TRUTH:          1,
  ALLOWED_ACTION:        2,
  TARGET_TOLERANCE:      3,
  INTERPRETATION_REQUIRED: 4,
};

/**
 * Picks the decisive variable from the highest-priority violated constraint
 * in a candidate report. Returns null if no violated constraint has a
 * decisiveVariable.
 */
export function resolveReportDecisiveVariable(
  candidate: CandidateEvaluationReport
): string | null {
  const violated = candidate.constraintEvaluations.filter(
    (r) => r.satisfactionStatus === "violated" && r.decisiveVariable
  );

  if (violated.length === 0) return candidate.decisiveVariable;

  violated.sort(
    (a, b) =>
      (KIND_PRIORITY[a.constraintKind] ?? 9) -
      (KIND_PRIORITY[b.constraintKind] ?? 9)
  );

  return violated[0]!.decisiveVariable;
}
