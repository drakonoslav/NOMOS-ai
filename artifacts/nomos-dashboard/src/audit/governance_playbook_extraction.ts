/**
 * governance_playbook_extraction.ts
 *
 * Deterministic functions for NOMOS governance playbook extraction.
 *
 * Turns repeated governance-learning patterns into explicit human-readable
 * governance heuristics — reusable doctrine a human can review and adopt.
 *
 * Heuristic extraction is entirely deterministic — same input always produces
 * the same heuristics and the same ids. No LLM generation is used.
 *
 * This layer is advisory only.
 * It must not auto-promote, auto-rollback, or self-modify policy.
 */

import type { GovernanceLearningSummary, GovernanceLearningPattern } from "./governance_learning_types";
import type { GovernanceHeuristic, GovernancePlaybook } from "./governance_playbook_types";

/* =========================================================
   Constants
   ========================================================= */

/** prefix for playbook heuristic ids */
const ID_PREFIX = "ph-";

const CONFIDENCE_HIGH_MIN_SUPPORT = 3;
const CONFIDENCE_MOD_MIN_SUPPORT  = 2;
const CONFIDENCE_HIGH_MAX_CONTRA  = 0;
const CONFIDENCE_MOD_MAX_CONTRA   = 0;

/* =========================================================
   Internal: djb2 hash → 8 hex chars
   ========================================================= */

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(-8);
}

function makeId(title: string, domain: string): string {
  return ID_PREFIX + djb2(title + domain);
}

/* =========================================================
   scoreHeuristicConfidence
   ========================================================= */

/**
 * Scores heuristic confidence from three inputs:
 *
 * patternSupportCount:  number of learning patterns (or reviewed actions) that
 *                       support the heuristic.
 * domainConsistency:    true when all supporting patterns are from the same
 *                       governance domain (not mixed).
 * contradictionCount:   number of patterns that directly contradict this
 *                       heuristic (e.g. the same action type succeeded in
 *                       other reviews).
 *
 * Rules:
 *   high     — support >= 3 AND contradictions = 0 AND domain-consistent
 *   moderate — support >= 2 AND contradictions = 0
 *   low      — anything else (support < 2, any contradiction, mixed domain
 *              with low support)
 */
export function scoreHeuristicConfidence(
  patternSupportCount: number,
  domainConsistency: boolean,
  contradictionCount: number
): "low" | "moderate" | "high" {
  if (patternSupportCount < CONFIDENCE_MOD_MIN_SUPPORT || contradictionCount > CONFIDENCE_MOD_MAX_CONTRA) {
    return "low";
  }
  if (
    patternSupportCount >= CONFIDENCE_HIGH_MIN_SUPPORT &&
    contradictionCount <= CONFIDENCE_HIGH_MAX_CONTRA &&
    domainConsistency
  ) {
    return "high";
  }
  return "moderate";
}

/* =========================================================
   Internal: per-pattern-type heuristic builders
   ========================================================= */

function fromSuccessfulPromotion(
  pattern: GovernanceLearningPattern
): GovernanceHeuristic {
  const domainLabel =
    pattern.domain === "mixed" ? "across domains" : `in ${pattern.domain}`;
  const title = `Prefer promotion ${domainLabel} when past changes succeeded`;
  const domain = pattern.domain;

  const rule =
    pattern.domain === "mixed"
      ? "Prefer policy promotion when past cross-domain promotions have repeatedly met expectations — evidence from multiple domains supports this governance approach."
      : `In ${pattern.domain}, prefer policy promotion when past promotions in this domain have met expectations — evidence suggests ${pattern.domain} evaluation is receptive to well-evidenced changes.`;

  const confidence = scoreHeuristicConfidence(
    pattern.supportingActionCount,
    pattern.domain !== "mixed",
    0
  );

  return {
    id: makeId(title, domain),
    domain,
    title,
    rule,
    supportCount: pattern.supportingActionCount,
    confidence,
    sourcePatternLabels: [pattern.label],
    rationaleLines: [
      `${pattern.supportingActionCount} promotion(s) ${domainLabel} met expectations after sufficient follow-up evaluation.`,
      "Exact-match rate improved or unresolved-outcome rate decreased in the successful cases reviewed.",
    ],
    cautionLines: [
      "This heuristic applies when domain context and policy type are similar to past successful changes.",
      "Verify that the unresolved-outcome rate is not already elevated before promoting.",
      "A single promotion meeting expectations is weak evidence — confidence grows with repeated confirmation.",
    ],
  };
}

function fromTradeoffPattern(
  pattern: GovernanceLearningPattern
): GovernanceHeuristic {
  const domainLabel =
    pattern.domain === "mixed" ? "across domains" : `in ${pattern.domain}`;
  const title = `Use caution: tradeoff underestimated ${domainLabel}`;
  const domain = pattern.domain;

  const rule =
    "Use caution when promoting a policy that improves direction-match or exact-match but also increases unresolved outcomes — this tradeoff has been repeatedly underestimated at governance decision time.";

  const confidence = scoreHeuristicConfidence(
    pattern.supportingActionCount,
    pattern.domain !== "mixed",
    0
  );

  return {
    id: makeId(title, domain),
    domain,
    title,
    rule,
    supportCount: pattern.supportingActionCount,
    confidence,
    sourcePatternLabels: [pattern.label],
    rationaleLines: [
      `${pattern.supportingActionCount} governance action(s) ${domainLabel} produced mixed outcomes — one metric improved while another worsened.`,
      "The unresolved-outcome rate increase was not fully anticipated at decision time.",
    ],
    cautionLines: [
      "Where expected gains clearly dominate, promotion may still be justified despite the tradeoff.",
      "Document expected tradeoffs explicitly in the audit record before acting to enable future review.",
    ],
  };
}

function fromRiskPattern(
  pattern: GovernanceLearningPattern
): GovernanceHeuristic {
  const isShallow = pattern.label.toLowerCase().includes("shallow");
  const domainLabel =
    pattern.domain === "mixed" ? "across domains" : `in ${pattern.domain}`;
  const title = isShallow
    ? `Avoid strong promotion under shallow-history windows`
    : `Avoid governance actions that materially elevate unresolved outcomes`;
  const domain = pattern.domain;

  const rule = isShallow
    ? "Avoid strong promotion decisions when fewer than 3 follow-up evaluation runs are available for the domain — outcomes cannot be reliably reviewed under shallow history."
    : "Avoid governance actions that are followed by a material increase in the unresolved-outcome rate (>10% delta) — this level of aggressiveness has repeatedly not been anticipated.";

  const confidence = scoreHeuristicConfidence(
    pattern.supportingActionCount,
    pattern.domain !== "mixed",
    0
  );

  return {
    id: makeId(title, domain),
    domain,
    title,
    rule,
    supportCount: pattern.supportingActionCount,
    confidence,
    sourcePatternLabels: [pattern.label],
    rationaleLines: isShallow
      ? [
          `${pattern.supportingActionCount} governance action(s) ${domainLabel} could not be evaluated due to insufficient follow-up evaluation runs.`,
          "Governance outcome review requires a minimum of 3 post-action runs before a reliable verdict is possible.",
        ]
      : [
          `${pattern.supportingActionCount} governance action(s) ${domainLabel} were followed by a material increase in invalid-outcome rate.`,
          "This risk was not sufficiently anticipated at governance decision time.",
        ],
    cautionLines: isShallow
      ? [
          "When timing pressure requires an early governance decision, document the shallow-history risk explicitly.",
          "Rollback may be appropriate if post-action runs confirm the change is not working as expected.",
        ]
      : [
          "This heuristic is based on observed deltas — the threshold (>10%) may need adjustment as more data accumulates.",
          "Some aggressiveness increase may be acceptable if exact-match improvement is sufficiently large.",
        ],
  };
}

function fromMistakePattern(
  pattern: GovernanceLearningPattern
): GovernanceHeuristic {
  const isUndeclaredTradeoff = pattern.label.toLowerCase().includes("tradeoffs");
  const domainLabel =
    pattern.domain === "mixed" ? "across domains" : `in ${pattern.domain}`;
  const title = isUndeclaredTradeoff
    ? `Do not promote without documenting expected tradeoffs`
    : `Do not promote without reliable bench improvement signal`;
  const domain = pattern.domain;

  const rule = isUndeclaredTradeoff
    ? "Do not proceed with governance actions without documenting expected tradeoffs — undeclared tradeoffs have repeatedly appeared as unresolved-outcome regressions after the change."
    : "Do not promote a policy unless bench evidence shows a reliable improvement signal — past promotions without such evidence failed to deliver expected gains.";

  const confidence = scoreHeuristicConfidence(
    pattern.supportingActionCount,
    pattern.domain !== "mixed",
    0
  );

  return {
    id: makeId(title, domain),
    domain,
    title,
    rule,
    supportCount: pattern.supportingActionCount,
    confidence,
    sourcePatternLabels: [pattern.label],
    rationaleLines: isUndeclaredTradeoff
      ? [
          `${pattern.supportingActionCount} governance action(s) ${domainLabel} produced regressions that were not anticipated.`,
          "No tradeoffs were declared at decision time, yet unresolved-outcome rate worsened materially after the change.",
        ]
      : [
          `${pattern.supportingActionCount} governance action(s) ${domainLabel} did not deliver the expected improvements after the change.`,
          "Observed exact-match rate did not improve, contradicting what was expected at decision time.",
        ],
    cautionLines: isUndeclaredTradeoff
      ? [
          "This heuristic does not prohibit all governance actions — it requires explicit tradeoff acknowledgement before acting.",
          "Rollback is often justified when a tradeoff that was not declared materialises in outcome review.",
        ]
      : [
          "Rollback is often justified when aggressiveness rises without exact-match improvement after a promotion.",
          "Where bench evidence is borderline, require higher human confidence before promoting.",
        ],
  };
}

/* =========================================================
   extractGovernanceHeuristics
   ========================================================= */

/**
 * Extracts governance heuristics from a GovernanceLearningSummary.
 *
 * Each non-empty pattern category produces at least one heuristic.
 * Heuristics are sorted: confidence high → moderate → low, then
 * supportCount descending for ties.
 *
 * Input is never mutated.
 */
export function extractGovernanceHeuristics(
  governanceLearningSummary: GovernanceLearningSummary
): GovernanceHeuristic[] {
  const heuristics: GovernanceHeuristic[] = [];

  for (const p of governanceLearningSummary.successfulPromotionPatterns) {
    heuristics.push(fromSuccessfulPromotion(p));
  }

  for (const p of governanceLearningSummary.recurringTradeoffPatterns) {
    heuristics.push(fromTradeoffPattern(p));
  }

  for (const p of governanceLearningSummary.recurringRiskPatterns) {
    heuristics.push(fromRiskPattern(p));
  }

  for (const p of governanceLearningSummary.recurringGovernanceMistakes) {
    heuristics.push(fromMistakePattern(p));
  }

  const CONF_ORDER: Record<string, number> = { high: 0, moderate: 1, low: 2 };

  return [...heuristics].sort((a, b) => {
    const cd = CONF_ORDER[a.confidence] - CONF_ORDER[b.confidence];
    if (cd !== 0) return cd;
    return b.supportCount - a.supportCount;
  });
}

/* =========================================================
   buildGovernancePlaybook
   ========================================================= */

/**
 * Builds the full GovernancePlaybook from a GovernanceLearningSummary.
 *
 * Calls extractGovernanceHeuristics, then generates aggregate summary lines.
 * Input is never mutated.
 */
export function buildGovernancePlaybook(
  governanceLearningSummary: GovernanceLearningSummary
): GovernancePlaybook {
  const heuristics = extractGovernanceHeuristics(governanceLearningSummary);
  const summaryLines = buildSummaryLines(heuristics, governanceLearningSummary);

  return {
    totalHeuristics: heuristics.length,
    heuristics,
    summaryLines,
  };
}

/* =========================================================
   Internal: summary lines
   ========================================================= */

function buildSummaryLines(
  heuristics: GovernanceHeuristic[],
  summary: GovernanceLearningSummary
): string[] {
  if (summary.totalGovernanceActions === 0 || heuristics.length === 0) {
    return [
      "No governance heuristics have been extracted yet.",
      "Heuristics are generated as governance outcomes accumulate and patterns recur.",
    ];
  }

  const lines: string[] = [];

  lines.push(
    `${heuristics.length} governance heuristic(s) extracted from ` +
      `${summary.reviewableActions} reviewable governance action(s).`
  );

  const high = heuristics.filter((h) => h.confidence === "high").length;
  const mod  = heuristics.filter((h) => h.confidence === "moderate").length;
  const low  = heuristics.filter((h) => h.confidence === "low").length;

  if (high > 0) {
    lines.push(`${high} high-confidence heuristic(s) are ready for operational use.`);
  }
  if (mod > 0) {
    lines.push(
      `${mod} moderate-confidence heuristic(s) should be reviewed before adoption.`
    );
  }
  if (low > 0) {
    lines.push(
      `${low} low-confidence heuristic(s) require more governance data before they can be relied upon.`
    );
  }

  const preferHeuristics = heuristics.filter((h) =>
    h.rule.toLowerCase().startsWith("prefer")
  );
  const avoidHeuristics = heuristics.filter(
    (h) =>
      h.rule.toLowerCase().startsWith("avoid") ||
      h.rule.toLowerCase().startsWith("do not")
  );
  const cautionHeuristics = heuristics.filter((h) =>
    h.rule.toLowerCase().startsWith("use caution")
  );

  if (preferHeuristics.length > 0) {
    lines.push(
      `${preferHeuristics.length} "prefer" doctrine(s) identify governance approaches that have worked.`
    );
  }
  if (avoidHeuristics.length > 0) {
    lines.push(
      `${avoidHeuristics.length} "avoid/do not" doctrine(s) identify governance approaches that have failed.`
    );
  }
  if (cautionHeuristics.length > 0) {
    lines.push(
      `${cautionHeuristics.length} "use caution" doctrine(s) flag conditions where outcomes were mixed.`
    );
  }

  return lines;
}
