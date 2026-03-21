/**
 * post_governance_outcome_review.ts
 *
 * Deterministic functions for NOMOS post-governance outcome review.
 *
 * Compares expected gains/tradeoffs/risks (recorded at governance decision time)
 * against actual post-action evaluation outcomes, then classifies whether the
 * governance action delivered its expected value.
 *
 * This layer is measurement and review only.
 * It never promotes, rolls back, or otherwise modifies policy assignments.
 * No LLM generation is used.
 */

import type { AuditRecord } from "./audit_types";
import type { GovernanceAuditRecord } from "./governance_audit_types";
import type { GovernanceDomain } from "./policy_governance_types";
import { INTENT_DOMAIN_MAP } from "./policy_routing_types";
import type {
  GovernanceOutcomeExpectation,
  GovernanceOutcomeObserved,
  GovernanceOutcomeReview,
  GovernanceOutcomeReviewReport,
} from "./post_governance_review_types";

/* =========================================================
   Constants
   ========================================================= */

/** Minimum follow-up runs before a strong outcome verdict is possible. */
const MIN_FOLLOW_UP_RUNS = 3;

/** Minimum delta (absolute) before a metric change is considered meaningful. */
const IMPROVEMENT_THRESHOLD = 0.03;

/* =========================================================
   Internal helpers
   ========================================================= */

/** Internal per-period metric rates computed from EvalSnapshot overallStatus. */
interface MetricRates {
  lawfulRate: number;
  degradedRate: number;
  invalidRate: number;
  total: number;
}

/** Shape expected inside evaluationResult.payload from an EvalSnapshot. */
interface EvalSnapshotPayload {
  overallStatus?: string | null;
}

function tryGetOverallStatus(record: AuditRecord): string | null {
  const payload = record.evaluationResult?.payload;
  if (!payload || typeof payload !== "object") return null;
  const p = payload as EvalSnapshotPayload;
  return typeof p.overallStatus === "string" ? p.overallStatus : null;
}

function getRecordDomain(record: AuditRecord): GovernanceDomain {
  if (record.routingRecord?.domain) return record.routingRecord.domain;
  const mapped = INTENT_DOMAIN_MAP[record.intent];
  return mapped ?? "generic";
}

function computeRates(records: AuditRecord[]): MetricRates | null {
  if (records.length === 0) return null;
  let lawful = 0;
  let degraded = 0;
  let invalid = 0;
  for (const r of records) {
    const s = tryGetOverallStatus(r);
    if (s === "LAWFUL") lawful++;
    else if (s === "DEGRADED") degraded++;
    else if (s === "INVALID") invalid++;
  }
  const total = records.length;
  return {
    lawfulRate: lawful / total,
    degradedRate: degraded / total,
    invalidRate: invalid / total,
    total,
  };
}

function fmtPct(n: number): string {
  return `${(Math.abs(n) * 100).toFixed(1)}%`;
}

/* =========================================================
   collectPostGovernanceRuns
   ========================================================= */

/**
 * Returns AuditRecords in the same domain that occurred AFTER the governance
 * action, ordered chronologically (oldest first).
 *
 * Records at the exact same millisecond as the governance action are excluded —
 * the action and any record created in the same instant are considered
 * simultaneous and therefore not a valid post-action observation.
 */
export function collectPostGovernanceRuns(
  governanceAction: GovernanceAuditRecord,
  auditRecords: AuditRecord[]
): AuditRecord[] {
  const actionTs = new Date(governanceAction.timestamp).getTime();
  const domain = governanceAction.domain;

  return auditRecords
    .filter((r) => {
      const ts = new Date(r.timestamp).getTime();
      return ts > actionTs && getRecordDomain(r) === domain;
    })
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
}

/* =========================================================
   comparePrePostGovernanceMetrics
   ========================================================= */

/**
 * Computes observed metric deltas by comparing domain-filtered AuditRecords
 * before and after the governance action timestamp.
 *
 * Delta fields are (post − pre):  positive = metric increased after action.
 * Null means the delta cannot be computed (e.g. no pre-action records).
 *
 * tooAggressiveDelta and tooWeakDelta are always null — they cannot be
 * determined from EvalSnapshot.overallStatus alone without replay bench data.
 */
export function comparePrePostGovernanceMetrics(
  governanceAction: GovernanceAuditRecord,
  auditRecords: AuditRecord[]
): GovernanceOutcomeObserved {
  const actionTs = new Date(governanceAction.timestamp).getTime();
  const domain = governanceAction.domain;

  const domainRecords = auditRecords.filter(
    (r) => getRecordDomain(r) === domain
  );

  const preRecords = domainRecords.filter(
    (r) => new Date(r.timestamp).getTime() < actionTs
  );
  const postRecords = domainRecords.filter(
    (r) => new Date(r.timestamp).getTime() > actionTs
  );

  const preRates = computeRates(preRecords);
  const postRates = computeRates(postRecords);

  const postActionRuns = postRecords.length;

  const exactMatchDelta: number | null =
    preRates !== null && postRates !== null
      ? postRates.lawfulRate - preRates.lawfulRate
      : postRates !== null
      ? postRates.lawfulRate
      : null;

  const directionMatchDelta: number | null =
    preRates !== null && postRates !== null
      ? postRates.degradedRate - preRates.degradedRate
      : postRates !== null
      ? postRates.degradedRate
      : null;

  const unresolvedDelta: number | null =
    preRates !== null && postRates !== null
      ? postRates.invalidRate - preRates.invalidRate
      : postRates !== null
      ? postRates.invalidRate
      : null;

  const summaryLines: string[] = [];

  if (postActionRuns === 0) {
    summaryLines.push(
      "No follow-up runs available for this governance action."
    );
  } else {
    if (exactMatchDelta !== null) {
      const dir =
        exactMatchDelta > 0.005
          ? "improved"
          : exactMatchDelta < -0.005
          ? "declined"
          : "unchanged";
      summaryLines.push(
        `Lawful-outcome rate ${dir} by ${fmtPct(exactMatchDelta)} after action.`
      );
    }
    if (unresolvedDelta !== null) {
      const dir =
        unresolvedDelta > 0.005
          ? "increased"
          : unresolvedDelta < -0.005
          ? "decreased"
          : "unchanged";
      summaryLines.push(
        `Invalid-outcome rate ${dir} by ${fmtPct(unresolvedDelta)} after action.`
      );
    }
  }

  return {
    postActionRuns,
    exactMatchDelta,
    directionMatchDelta,
    tooAggressiveDelta: null,
    tooWeakDelta: null,
    unresolvedDelta,
    summaryLines,
  };
}

/* =========================================================
   classifyGovernanceOutcome
   ========================================================= */

/**
 * Classifies whether the governance action delivered its expected value.
 *
 * Hard guard: if postActionRuns < 3, the class is always
 * "insufficient_followup" — the review window is too shallow for a reliable
 * verdict regardless of the observed deltas.
 *
 * Classification logic (applied only when postActionRuns >= 3):
 *   met_expectations   — exact-match rate improved beyond threshold AND
 *                        unresolved rate did not worsen materially.
 *   partially_met      — some positive signal but also a contradictory
 *                        regression (exactMatchDelta > 0 but unresolvedDelta
 *                        also increased materially).
 *   did_not_meet       — expected gains did not materialise (exactMatchDelta
 *                        not positive) and gains were expected.
 *   partially_met      — mixed signals when no gains were expected but some
 *                        deltas occurred.
 */
export function classifyGovernanceOutcome(
  expectation: GovernanceOutcomeExpectation,
  observed: GovernanceOutcomeObserved
): GovernanceOutcomeReview["outcomeClass"] {
  if (observed.postActionRuns < MIN_FOLLOW_UP_RUNS) {
    return "insufficient_followup";
  }

  const positiveGain = (observed.exactMatchDelta ?? 0) > IMPROVEMENT_THRESHOLD;
  const noMaterialRegression =
    (observed.unresolvedDelta ?? 0) <= IMPROVEMENT_THRESHOLD;
  const materialRegression =
    (observed.unresolvedDelta ?? 0) > IMPROVEMENT_THRESHOLD;
  const gainsExpected = expectation.expectedGains.length > 0;

  if (positiveGain && noMaterialRegression) {
    return "met_expectations";
  }

  if (positiveGain && materialRegression) {
    return "partially_met";
  }

  if (!positiveGain && gainsExpected) {
    return "did_not_meet";
  }

  return "partially_met";
}

/* =========================================================
   Internal: review lines
   ========================================================= */

function buildReviewLines(
  outcomeClass: GovernanceOutcomeReview["outcomeClass"],
  observed: GovernanceOutcomeObserved
): string[] {
  if (outcomeClass === "insufficient_followup") {
    return [
      "Follow-up window is too shallow for a reliable governance outcome review.",
      `Only ${observed.postActionRuns} follow-up run(s) recorded; at least ${MIN_FOLLOW_UP_RUNS} required.`,
    ];
  }

  const lines: string[] = [];
  const exactDelta = observed.exactMatchDelta ?? 0;
  const unresDelta = observed.unresolvedDelta ?? 0;

  if (outcomeClass === "met_expectations") {
    lines.push("Observed outcomes aligned with expected gains.");
    if (exactDelta > IMPROVEMENT_THRESHOLD) {
      lines.push(
        "Exact-match rate improved after promotion, consistent with expected gains."
      );
    }
    if (unresDelta <= 0) {
      lines.push("No increase in unresolved outcomes was observed.");
    }
  } else if (outcomeClass === "partially_met") {
    lines.push("Observed outcomes were mixed.");
    if (exactDelta > 0) {
      lines.push("Some improvement in lawful-outcome rate was observed.");
    }
    if (unresDelta > IMPROVEMENT_THRESHOLD) {
      lines.push("Aggressiveness fell, but unresolved outcomes increased.");
    }
  } else if (outcomeClass === "did_not_meet") {
    lines.push("Observed outcomes did not support the expected improvement.");
    if (exactDelta <= 0) {
      lines.push(
        "Exact-match rate did not improve after the governance action."
      );
    }
    if (unresDelta > IMPROVEMENT_THRESHOLD) {
      lines.push("Invalid-outcome rate increased, which was not expected.");
    }
  }

  return lines;
}

/* =========================================================
   buildGovernanceOutcomeReview
   ========================================================= */

/**
 * Builds a single GovernanceOutcomeReview for one governance audit record.
 *
 * The expectation is copied defensively from the audit record so the review
 * is self-contained. Input arrays are never mutated.
 */
export function buildGovernanceOutcomeReview(
  governanceAction: GovernanceAuditRecord,
  auditRecords: AuditRecord[]
): GovernanceOutcomeReview {
  const expectation: GovernanceOutcomeExpectation = {
    expectedGains: [...governanceAction.expectedGains],
    expectedTradeoffs: [...governanceAction.expectedTradeoffs],
    expectedRisks: [...governanceAction.expectedRisks],
  };

  const observed = comparePrePostGovernanceMetrics(governanceAction, auditRecords);
  const outcomeClass = classifyGovernanceOutcome(expectation, observed);
  const reviewLines = buildReviewLines(outcomeClass, observed);

  return {
    actionId: governanceAction.actionId,
    domain: governanceAction.domain,
    action: governanceAction.action,
    fromPolicyVersionId: governanceAction.currentPolicyVersionId ?? null,
    toPolicyVersionId: governanceAction.chosenPolicyVersionId,
    expectation,
    observed,
    outcomeClass,
    reviewLines,
  };
}

/* =========================================================
   buildGovernanceOutcomeReviewReport
   ========================================================= */

/**
 * Builds the aggregate GovernanceOutcomeReviewReport across an entire
 * governance audit trail.
 *
 * One GovernanceOutcomeReview is built per audit record. The report
 * summarises outcome distribution and identifies patterns across actions.
 * Input arrays are never mutated.
 */
export function buildGovernanceOutcomeReviewReport(
  governanceAuditTrail: GovernanceAuditRecord[],
  auditRecords: AuditRecord[]
): GovernanceOutcomeReviewReport {
  const reviews = governanceAuditTrail.map((ga) =>
    buildGovernanceOutcomeReview(ga, auditRecords)
  );

  const outcomeCounts: GovernanceOutcomeReviewReport["outcomeCounts"] = {
    met_expectations: 0,
    partially_met: 0,
    did_not_meet: 0,
    insufficient_followup: 0,
  };

  for (const r of reviews) {
    outcomeCounts[r.outcomeClass]++;
  }

  const reviewableActions = reviews.filter(
    (r) => r.outcomeClass !== "insufficient_followup"
  ).length;

  const summaryLines = buildReportSummaryLines(
    reviews,
    outcomeCounts,
    reviewableActions
  );

  return {
    totalGovernanceActions: governanceAuditTrail.length,
    reviewableActions,
    outcomeCounts,
    reviews,
    summaryLines,
  };
}

/* =========================================================
   Internal: report summary lines
   ========================================================= */

function buildReportSummaryLines(
  reviews: GovernanceOutcomeReview[],
  counts: GovernanceOutcomeReviewReport["outcomeCounts"],
  reviewableActions: number
): string[] {
  if (reviews.length === 0) {
    return ["No governance actions have been recorded yet."];
  }

  const lines: string[] = [];
  const total = reviews.length;

  lines.push(
    `${total} governance action(s) reviewed; ${reviewableActions} have sufficient follow-up data.`
  );

  if (reviewableActions === 0) {
    lines.push(
      "All governance actions are awaiting sufficient follow-up evaluation runs."
    );
    return lines;
  }

  if (counts.met_expectations > 0) {
    lines.push(
      `${counts.met_expectations} action(s) met expectations after follow-up.`
    );
  }
  if (counts.partially_met > 0) {
    lines.push(
      `${counts.partially_met} action(s) partially met expectations — some tradeoffs or regressions observed.`
    );
  }
  if (counts.did_not_meet > 0) {
    lines.push(
      `${counts.did_not_meet} action(s) did not meet expectations — expected gains did not materialise.`
    );
  }
  if (counts.insufficient_followup > 0) {
    lines.push(
      `${counts.insufficient_followup} action(s) still awaiting sufficient follow-up runs.`
    );
  }

  return lines;
}
