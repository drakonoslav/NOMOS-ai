/**
 * decision_outcome_linkage.ts
 *
 * Deterministic functions for NOMOS decision → outcome linkage.
 *
 * Functions:
 *   buildGovernanceDecisionRecord   — create a decision record from a deliberation summary
 *   linkDecisionToGovernanceAction  — find the matching audit record for a decision
 *   linkDecisionToOutcomeReview     — find the matching outcome review for a decision
 *   buildDecisionOutcomeLink        — build a fully resolved link record
 *   buildDecisionOutcomeLinkReport  — build the aggregate link report
 *
 * Linking rules:
 *   - All linking is done by stable IDs, not fuzzy matching.
 *   - A hold decision stores the full record but produces no governanceActionId.
 *   - Missing downstream links are represented as null, not omitted.
 *
 * No inputs are mutated.
 * No LLM generation is used.
 * This layer is advisory and traceability only — it does not modify policy.
 */

import type { GovernanceDeliberationSummary } from "./governance_deliberation_types";
import type { GovernanceAuditRecord } from "./governance_audit_types";
import type { GovernanceOutcomeReview } from "./post_governance_review_types";
import type {
  GovernanceDecisionRecord,
  DecisionOutcomeLink,
  DecisionOutcomeLinkReport,
} from "./decision_outcome_link_types";

/* =========================================================
   Internal: djb2 hash
   ========================================================= */

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h;
}

function hex8(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

/** Derive a stable deliberation summary ID from summary content. */
function deriveDeliberationSummaryId(
  summary: GovernanceDeliberationSummary
): string {
  const key = [
    summary.recommendation,
    summary.domain,
    summary.currentPolicyVersionId ?? "",
    summary.recommendedPolicyVersionId ?? "",
    summary.recommendationStrength,
    summary.confidence,
    summary.finalDecisionPrompt.slice(0, 40),
  ].join("|");
  return "dls-" + hex8(djb2(key));
}

/** Derive a stable decision ID from the decision record inputs. */
function deriveDecisionId(
  deliberationSummaryId: string,
  humanDecision: GovernanceDecisionRecord["decision"],
  humanReason: string
): string {
  const key = [deliberationSummaryId, humanDecision, humanReason.slice(0, 60)].join("|");
  return "dec-" + hex8(djb2(key));
}

function shortId(id: string | null): string {
  if (!id) return "none";
  return id.length > 12 ? `…${id.slice(-8)}` : id;
}

/* =========================================================
   buildGovernanceDecisionRecord
   ========================================================= */

/**
 * Creates a GovernanceDecisionRecord from a reviewed deliberation summary and
 * the human's decision.
 *
 * humanDecision:  "promote" | "rollback" | "hold"
 * humanReason:    free-text reason for the choice
 *
 * The deliberationSummaryId and decisionId are derived deterministically from
 * the summary content and decision inputs.
 *
 * For "hold" decisions, chosenPolicyVersionId is set to null.
 * For "promote", chosenPolicyVersionId = summary.recommendedPolicyVersionId.
 * For "rollback", chosenPolicyVersionId = summary.currentPolicyVersionId.
 *
 * timestamp is set to the current UTC ISO string at call time.
 */
export function buildGovernanceDecisionRecord(
  deliberationSummary: GovernanceDeliberationSummary,
  humanDecision: GovernanceDecisionRecord["decision"],
  humanReason: string
): GovernanceDecisionRecord {
  const deliberationSummaryId = deriveDeliberationSummaryId(deliberationSummary);
  const decisionId = deriveDecisionId(deliberationSummaryId, humanDecision, humanReason);

  const chosenPolicyVersionId =
    humanDecision === "promote"
      ? deliberationSummary.recommendedPolicyVersionId
      : humanDecision === "rollback"
      ? deliberationSummary.currentPolicyVersionId
      : null;

  return {
    decisionId,
    timestamp: new Date().toISOString(),
    domain: deliberationSummary.domain,
    deliberationSummaryId,
    currentPolicyVersionId: deliberationSummary.currentPolicyVersionId,
    recommendedPolicyVersionId: deliberationSummary.recommendedPolicyVersionId,
    decision: humanDecision,
    chosenPolicyVersionId,
    expectedGains: [...deliberationSummary.gainsLines],
    expectedTradeoffs: [...deliberationSummary.tradeoffLines],
    expectedRisks: [...deliberationSummary.riskLines],
    humanReason,
  };
}

/* =========================================================
   linkDecisionToGovernanceAction
   ========================================================= */

/**
 * Finds the GovernanceAuditRecord that resulted from a decision record.
 *
 * Matching rules (all must hold — stable ID matching only):
 *   1. auditRecord.domain === decisionRecord.domain
 *   2. auditRecord.action === decisionRecord.decision
 *      (hold decisions cannot produce an audit record)
 *   3. auditRecord.chosenPolicyVersionId === decisionRecord.chosenPolicyVersionId
 *
 * Returns null when:
 *   - decision is "hold" (hold produces no governance action)
 *   - chosenPolicyVersionId is null
 *   - no matching record is found in the trail
 */
export function linkDecisionToGovernanceAction(
  decisionRecord: GovernanceDecisionRecord,
  governanceAuditTrail: GovernanceAuditRecord[]
): GovernanceAuditRecord | null {
  if (decisionRecord.decision === "hold") return null;
  if (!decisionRecord.chosenPolicyVersionId) return null;

  for (const record of governanceAuditTrail) {
    if (
      record.domain === decisionRecord.domain &&
      record.action === decisionRecord.decision &&
      record.chosenPolicyVersionId === decisionRecord.chosenPolicyVersionId
    ) {
      return record;
    }
  }
  return null;
}

/* =========================================================
   linkDecisionToOutcomeReview
   ========================================================= */

/**
 * Finds the GovernanceOutcomeReview that matches a decision record.
 *
 * Matching rules (stable ID matching only):
 *   1. review.domain === decisionRecord.domain
 *   2. review.toPolicyVersionId === decisionRecord.chosenPolicyVersionId
 *
 * Returns null when:
 *   - chosenPolicyVersionId is null (hold decision)
 *   - no matching review exists in the provided list
 */
export function linkDecisionToOutcomeReview(
  decisionRecord: GovernanceDecisionRecord,
  governanceOutcomeReviews: GovernanceOutcomeReview[]
): GovernanceOutcomeReview | null {
  if (!decisionRecord.chosenPolicyVersionId) return null;

  for (const review of governanceOutcomeReviews) {
    if (
      review.domain === decisionRecord.domain &&
      review.toPolicyVersionId === decisionRecord.chosenPolicyVersionId
    ) {
      return review;
    }
  }
  return null;
}

/* =========================================================
   Internal: linkage summary lines
   ========================================================= */

function buildLinkageSummaryLines(
  decisionRecord: GovernanceDecisionRecord,
  auditRecord: GovernanceAuditRecord | null,
  outcomeReview: GovernanceOutcomeReview | null
): string[] {
  const lines: string[] = [];
  const policy = shortId(decisionRecord.chosenPolicyVersionId);

  // Line 1 — what the deliberation led to
  if (decisionRecord.decision === "promote") {
    lines.push(
      `This deliberation led to promotion of policy ${policy}.`
    );
  } else if (decisionRecord.decision === "rollback") {
    lines.push(
      `This deliberation led to rollback to policy ${policy}.`
    );
  } else {
    lines.push(
      "This deliberation resulted in a hold — no governance action was taken."
    );
  }

  // Line 2 — expected gains summary
  if (decisionRecord.expectedGains.length > 0) {
    lines.push(
      `Expected gains included: ${decisionRecord.expectedGains.slice(0, 2).join("; ").toLowerCase().replace(/\.$/, "")}.`
    );
  }

  // Line 3 — governance action linkage
  if (auditRecord) {
    lines.push(
      `Governance action ${shortId(auditRecord.actionId)} recorded in the audit trail.`
    );
  } else if (decisionRecord.decision !== "hold") {
    lines.push(
      "No matching governance action has been linked yet — audit record may be pending."
    );
  }

  // Line 4 — outcome review
  if (outcomeReview) {
    lines.push(
      `Later outcome review classified the action as ${outcomeReview.outcomeClass.replace(/_/g, " ")}.`
    );
    if (outcomeReview.reviewLines.length > 0) {
      lines.push(`Observed outcome: ${outcomeReview.reviewLines[0].toLowerCase()}`);
    }
  } else if (decisionRecord.decision !== "hold") {
    lines.push(
      "No outcome review has been linked yet — follow-up evaluation runs may still be accumulating."
    );
  }

  return lines;
}

/* =========================================================
   buildDecisionOutcomeLink
   ========================================================= */

/**
 * Builds a fully resolved DecisionOutcomeLink for a single decision record.
 *
 * Links are formed by stable ID matching only. Missing downstream links
 * are represented as null, not inferred. No inputs are mutated.
 */
export function buildDecisionOutcomeLink(
  decisionRecord: GovernanceDecisionRecord,
  governanceAuditTrail: GovernanceAuditRecord[],
  governanceOutcomeReviews: GovernanceOutcomeReview[]
): DecisionOutcomeLink {
  const auditRecord = linkDecisionToGovernanceAction(
    decisionRecord,
    governanceAuditTrail
  );
  const outcomeReview = linkDecisionToOutcomeReview(
    decisionRecord,
    governanceOutcomeReviews
  );

  const actualOutcomeLines: string[] = outcomeReview
    ? [
        ...outcomeReview.reviewLines,
        ...outcomeReview.observed.summaryLines,
      ]
    : [];

  const linkageSummaryLines = buildLinkageSummaryLines(
    decisionRecord,
    auditRecord,
    outcomeReview
  );

  return {
    decisionId:                decisionRecord.decisionId,
    deliberationSummaryId:     decisionRecord.deliberationSummaryId,
    governanceActionId:        auditRecord?.actionId ?? null,
    governanceOutcomeReviewId: outcomeReview?.actionId ?? null,
    decision:                  decisionRecord.decision,
    chosenPolicyVersionId:     decisionRecord.chosenPolicyVersionId,
    expectedGains:             [...decisionRecord.expectedGains],
    expectedTradeoffs:         [...decisionRecord.expectedTradeoffs],
    expectedRisks:             [...decisionRecord.expectedRisks],
    actualOutcomeClass:        outcomeReview?.outcomeClass ?? null,
    actualOutcomeLines,
    linkageSummaryLines,
  };
}

/* =========================================================
   buildDecisionOutcomeLinkReport
   ========================================================= */

/**
 * Builds the aggregate DecisionOutcomeLinkReport across all decision records.
 *
 * Each decision record is independently resolved — order is preserved.
 * No inputs are mutated.
 */
export function buildDecisionOutcomeLinkReport(
  decisionRecords: GovernanceDecisionRecord[],
  governanceAuditTrail: GovernanceAuditRecord[],
  governanceOutcomeReviews: GovernanceOutcomeReview[]
): DecisionOutcomeLinkReport {
  const links = decisionRecords.map((r) =>
    buildDecisionOutcomeLink(r, governanceAuditTrail, governanceOutcomeReviews)
  );

  const summaryLines = buildReportSummaryLines(links);

  return {
    totalLinkedDecisions: links.length,
    links,
    summaryLines,
  };
}

function buildReportSummaryLines(links: DecisionOutcomeLink[]): string[] {
  if (links.length === 0) {
    return ["No governance decision records have been linked yet."];
  }

  const lines: string[] = [];
  const promotes  = links.filter((l) => l.decision === "promote").length;
  const rollbacks = links.filter((l) => l.decision === "rollback").length;
  const holds     = links.filter((l) => l.decision === "hold").length;

  lines.push(
    `${links.length} governance decision(s) tracked: ${promotes} promotion(s), ${rollbacks} rollback(s), ${holds} hold(s).`
  );

  const reviewed  = links.filter((l) => l.actualOutcomeClass !== null);
  if (reviewed.length > 0) {
    const met        = reviewed.filter((l) => l.actualOutcomeClass === "met_expectations").length;
    const partial    = reviewed.filter((l) => l.actualOutcomeClass === "partially_met").length;
    const didNot     = reviewed.filter((l) => l.actualOutcomeClass === "did_not_meet").length;
    const insuf      = reviewed.filter((l) => l.actualOutcomeClass === "insufficient_followup").length;
    lines.push(
      `${reviewed.length} outcome review(s) linked: ${met} met expectations, ${partial} partially met, ${didNot} did not meet, ${insuf} insufficient follow-up.`
    );
  } else {
    lines.push("No outcome reviews have been linked to these decisions yet.");
  }

  const unlinked = links.filter(
    (l) => l.decision !== "hold" && l.governanceActionId === null
  ).length;
  if (unlinked > 0) {
    lines.push(
      `${unlinked} action(s) not yet linked to an audit record — these may be pending.`
    );
  }

  return lines;
}
