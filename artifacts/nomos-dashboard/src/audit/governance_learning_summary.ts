/**
 * governance_learning_summary.ts
 *
 * Deterministic functions for NOMOS governance learning summary.
 *
 * Summarises recurring patterns across many reviewed governance decisions
 * without generating any governance actions.
 *
 * Pattern detection is entirely deterministic — same input always produces
 * the same patterns. No LLM generation is used.
 *
 * This layer is observational and advisory only.
 * It must not auto-promote, auto-rollback, or self-modify policy.
 */

import type { GovernanceOutcomeReview } from "./post_governance_review_types";
import type {
  GovernanceLearningPattern,
  GovernanceLearningSummary,
} from "./governance_learning_types";

/* =========================================================
   Constants
   ========================================================= */

/** Minimum delta considered a meaningful improvement or regression. */
const DELTA_THRESHOLD = 0.01;

/** Minimum delta considered a material/high regression. */
const HIGH_DELTA_THRESHOLD = 0.10;

/** Minimum per-domain count to report a "recurring" per-domain pattern. */
const RECURRENCE_MIN = 2;

/* =========================================================
   Internal helpers
   ========================================================= */

type ReviewDomain = "nutrition" | "training" | "schedule" | "generic";
type LearnDomain = ReviewDomain | "mixed";

const DOMAINS: ReviewDomain[] = ["nutrition", "training", "schedule", "generic"];

function groupByDomain(
  reviews: GovernanceOutcomeReview[]
): Record<ReviewDomain, GovernanceOutcomeReview[]> {
  const out: Record<ReviewDomain, GovernanceOutcomeReview[]> = {
    nutrition: [],
    training: [],
    schedule: [],
    generic: [],
  };
  for (const r of reviews) out[r.domain].push(r);
  return out;
}

function dominantDomain(reviews: GovernanceOutcomeReview[]): LearnDomain {
  const domains = new Set(reviews.map((r) => r.domain));
  if (domains.size === 1) return [...domains][0] as ReviewDomain;
  return "mixed";
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* =========================================================
   buildSuccessfulPromotionPatterns
   ========================================================= */

/**
 * Identifies domains where promote actions repeatedly met expectations.
 *
 * Returns one pattern per domain that has at least one qualifying
 * promote + met_expectations review.  Enriches the summary when a
 * consistent improvement signal (exact-match increase or unresolved
 * decrease) appears across the supporting actions.
 */
export function buildSuccessfulPromotionPatterns(
  governanceOutcomeReviews: GovernanceOutcomeReview[]
): GovernanceLearningPattern[] {
  const patterns: GovernanceLearningPattern[] = [];

  const metExpectations = governanceOutcomeReviews.filter(
    (r) => r.action === "promote" && r.outcomeClass === "met_expectations"
  );

  if (metExpectations.length === 0) return patterns;

  const grouped = groupByDomain(metExpectations);

  for (const domain of DOMAINS) {
    const domReviews = grouped[domain];
    if (domReviews.length === 0) continue;

    const withExactImprovement = domReviews.filter(
      (r) => (r.observed.exactMatchDelta ?? 0) > DELTA_THRESHOLD
    );
    const withLessUnresolved = domReviews.filter(
      (r) => (r.observed.unresolvedDelta ?? 0) < -DELTA_THRESHOLD
    );

    let summary =
      `${domReviews.length} promotion(s) in ${domain} met expectations ` +
      `after sufficient follow-up.`;

    if (withExactImprovement.length > 0) {
      summary +=
        " Exact-match rate improvement was a consistent factor in success.";
    }
    if (withLessUnresolved.length > 0) {
      summary += " Unresolved-outcome rate decreased in the successful cases.";
    }
    if (withExactImprovement.length === 0 && withLessUnresolved.length === 0) {
      summary +=
        " Outcomes improved overall despite limited individual metric signals.";
    }

    patterns.push({
      label: `${capFirst(domain)} promotions that met expectations`,
      domain,
      supportingActionCount: domReviews.length,
      summary,
    });
  }

  return patterns;
}

/* =========================================================
   buildRecurringTradeoffPatterns
   ========================================================= */

/**
 * Identifies recurring cases where one metric improved but another worsened —
 * tradeoffs that were underestimated or undisclosed at decision time.
 *
 * Emits a cross-domain pattern when exact-match improved but unresolved
 * outcomes also worsened across the partially-met group.  Also emits
 * per-domain patterns when 2+ partially-met reviews share the same domain.
 */
export function buildRecurringTradeoffPatterns(
  governanceOutcomeReviews: GovernanceOutcomeReview[]
): GovernanceLearningPattern[] {
  const patterns: GovernanceLearningPattern[] = [];

  const partiallyMet = governanceOutcomeReviews.filter(
    (r) => r.outcomeClass === "partially_met"
  );

  // Cross-domain pattern: exact-match up AND unresolved up
  const exactUpUnresolvedUp = partiallyMet.filter(
    (r) =>
      (r.observed.exactMatchDelta ?? 0) > DELTA_THRESHOLD &&
      (r.observed.unresolvedDelta ?? 0) > DELTA_THRESHOLD
  );

  if (exactUpUnresolvedUp.length > 0) {
    const domain = dominantDomain(exactUpUnresolvedUp);
    patterns.push({
      label: "Unresolved-rate increases underestimated after policy changes",
      domain,
      supportingActionCount: exactUpUnresolvedUp.length,
      summary:
        `In ${exactUpUnresolvedUp.length} case(s), exact-match rate improved but ` +
        "unresolved outcomes also increased — this tradeoff was repeatedly " +
        "underestimated at governance decision time.",
    });
  }

  // Per-domain recurring pattern: 2+ partially-met in same domain
  const grouped = groupByDomain(partiallyMet);
  for (const domain of DOMAINS) {
    const domReviews = grouped[domain];
    if (domReviews.length < RECURRENCE_MIN) continue;

    patterns.push({
      label: `Repeated mixed outcomes in ${domain} governance`,
      domain,
      supportingActionCount: domReviews.length,
      summary:
        `${domReviews.length} governance action(s) in ${domain} produced mixed ` +
        "outcomes — gains occurred alongside unresolved regressions that were " +
        "not fully anticipated.",
    });
  }

  return patterns;
}

/* =========================================================
   buildRecurringRiskPatterns
   ========================================================= */

/**
 * Identifies recurring risks: shallow follow-up history, materially elevated
 * unresolved-outcome rates, or aggressiveness increases that were not
 * anticipated at decision time.
 *
 * Returns one pattern per risk class found in the review set.
 */
export function buildRecurringRiskPatterns(
  governanceOutcomeReviews: GovernanceOutcomeReview[]
): GovernanceLearningPattern[] {
  const patterns: GovernanceLearningPattern[] = [];

  // Shallow-history risk
  const insufficient = governanceOutcomeReviews.filter(
    (r) => r.outcomeClass === "insufficient_followup"
  );
  if (insufficient.length > 0) {
    const domain = dominantDomain(insufficient);
    patterns.push({
      label: "Shallow-history promotions most often produced inconclusive outcomes",
      domain,
      supportingActionCount: insufficient.length,
      summary:
        `${insufficient.length} governance action(s) could not be evaluated ` +
        "because fewer than 3 follow-up evaluation runs were available after " +
        "the change. Governance decisions made under shallow history are at " +
        "higher risk of inconclusive review.",
    });
  }

  // High unresolved-rate elevation after reviewable actions
  const highUnresolved = governanceOutcomeReviews.filter(
    (r) =>
      r.outcomeClass !== "insufficient_followup" &&
      (r.observed.unresolvedDelta ?? 0) > HIGH_DELTA_THRESHOLD
  );
  if (highUnresolved.length > 0) {
    const domain = dominantDomain(highUnresolved);
    patterns.push({
      label: "Elevated unresolved-outcome rate after governance actions",
      domain,
      supportingActionCount: highUnresolved.length,
      summary:
        `${highUnresolved.length} governance action(s) were followed by a ` +
        "material increase in invalid-outcome rate (>10% delta). This level of " +
        "aggressiveness was not sufficiently anticipated at decision time.",
    });
  }

  return patterns;
}

/* =========================================================
   buildRecurringGovernanceMistakes
   ========================================================= */

/**
 * Identifies recurring governance mistakes: expected gains that did not
 * materialise, and tradeoffs that were not declared at decision time but
 * appeared in outcomes.
 */
export function buildRecurringGovernanceMistakes(
  governanceOutcomeReviews: GovernanceOutcomeReview[]
): GovernanceLearningPattern[] {
  const patterns: GovernanceLearningPattern[] = [];

  // Expected gains did not materialise
  const didNotMeet = governanceOutcomeReviews.filter(
    (r) => r.outcomeClass === "did_not_meet"
  );
  if (didNotMeet.length > 0) {
    const domain = dominantDomain(didNotMeet);
    patterns.push({
      label: "Expected gains did not materialise",
      domain,
      supportingActionCount: didNotMeet.length,
      summary:
        `${didNotMeet.length} governance action(s) did not deliver the ` +
        "improvements that were expected when the decision was made. " +
        "Observed outcomes failed to show the anticipated exact-match " +
        "rate improvement.",
    });
  }

  // Tradeoffs underestimated: partially met AND no tradeoffs declared AND
  // unresolved worsened
  const undeclaredTradeoff = governanceOutcomeReviews.filter(
    (r) =>
      r.outcomeClass === "partially_met" &&
      r.expectation.expectedTradeoffs.length === 0 &&
      (r.observed.unresolvedDelta ?? 0) > DELTA_THRESHOLD
  );
  if (undeclaredTradeoff.length > 0) {
    const domain = dominantDomain(undeclaredTradeoff);
    patterns.push({
      label: "Tradeoffs repeatedly underestimated at decision time",
      domain,
      supportingActionCount: undeclaredTradeoff.length,
      summary:
        `${undeclaredTradeoff.length} governance action(s) produced ` +
        "regressions that were not anticipated — no tradeoffs were declared " +
        "at decision time but unresolved outcomes worsened materially after " +
        "the change.",
    });
  }

  return patterns;
}

/* =========================================================
   buildGovernanceLearningSummary
   ========================================================= */

/**
 * Builds the full GovernanceLearningSummary across all outcome reviews.
 *
 * Composes all four pattern builders and generates aggregate summary lines.
 * Input array is never mutated.
 */
export function buildGovernanceLearningSummary(
  governanceOutcomeReviews: GovernanceOutcomeReview[]
): GovernanceLearningSummary {
  const reviewableActions = governanceOutcomeReviews.filter(
    (r) => r.outcomeClass !== "insufficient_followup"
  ).length;

  const successfulPromotionPatterns = buildSuccessfulPromotionPatterns(
    governanceOutcomeReviews
  );
  const recurringTradeoffPatterns = buildRecurringTradeoffPatterns(
    governanceOutcomeReviews
  );
  const recurringRiskPatterns = buildRecurringRiskPatterns(
    governanceOutcomeReviews
  );
  const recurringGovernanceMistakes = buildRecurringGovernanceMistakes(
    governanceOutcomeReviews
  );

  const summaryLines = buildSummaryLines(
    governanceOutcomeReviews,
    reviewableActions,
    successfulPromotionPatterns,
    recurringTradeoffPatterns,
    recurringRiskPatterns,
    recurringGovernanceMistakes
  );

  return {
    totalGovernanceActions: governanceOutcomeReviews.length,
    reviewableActions,
    successfulPromotionPatterns,
    recurringTradeoffPatterns,
    recurringRiskPatterns,
    recurringGovernanceMistakes,
    summaryLines,
  };
}

/* =========================================================
   Internal: aggregate summary lines
   ========================================================= */

function buildSummaryLines(
  reviews: GovernanceOutcomeReview[],
  reviewableActions: number,
  successfulPatterns: GovernanceLearningPattern[],
  tradeoffPatterns: GovernanceLearningPattern[],
  riskPatterns: GovernanceLearningPattern[],
  mistakePatterns: GovernanceLearningPattern[]
): string[] {
  if (reviews.length === 0) {
    return ["No governance actions have been recorded yet."];
  }

  const lines: string[] = [];

  lines.push(
    `${reviews.length} governance action(s) reviewed; ` +
      `${reviewableActions} had sufficient follow-up data.`
  );

  if (reviewableActions === 0) {
    lines.push(
      "All governance actions are awaiting sufficient follow-up evaluation runs."
    );
    return lines;
  }

  // Successful promotions
  for (const p of successfulPatterns) {
    const domLabel =
      p.domain === "mixed" ? "across domains" : `in ${p.domain}`;
    lines.push(
      `${capFirst(p.domain)} promotions that reduced aggressiveness most often ` +
        `met expectations (${p.supportingActionCount} case(s) ${domLabel}).`
    );
  }

  // Tradeoffs
  for (const p of tradeoffPatterns) {
    lines.push(
      `Unresolved-rate increases were repeatedly underestimated after ` +
        `${p.domain === "mixed" ? "governance" : p.domain + " governance"} ` +
        `changes (${p.supportingActionCount} case(s)).`
    );
  }

  // Risks
  const shallowRisk = riskPatterns.find((p) =>
    p.label.includes("Shallow-history")
  );
  if (shallowRisk) {
    lines.push(
      `Shallow-history promotions most often produced inconclusive outcomes ` +
        `(${shallowRisk.supportingActionCount} case(s)).`
    );
  }
  const aggressiveRisk = riskPatterns.find((p) =>
    p.label.includes("Elevated unresolved")
  );
  if (aggressiveRisk) {
    lines.push(
      `Rollback actions after aggressive policies were more often corrective ` +
        `than promotional changes ` +
        `(${aggressiveRisk.supportingActionCount} case(s) with high unresolved delta).`
    );
  }

  // Mistakes
  for (const p of mistakePatterns) {
    lines.push(
      `${p.label}: ${p.supportingActionCount} case(s) identified.`
    );
  }

  return lines;
}
