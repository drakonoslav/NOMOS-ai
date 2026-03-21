/**
 * playbook_to_decision_crosswalk.ts
 *
 * Deterministic functions for NOMOS playbook-to-decision crosswalk.
 *
 * For any live governance decision, evaluates each extracted playbook
 * heuristic against the current decision context and classifies it as:
 *   supports / cautions / neutral / not_relevant
 *
 * All logic is entirely deterministic — same inputs produce the same outputs.
 * No LLM generation is used.
 *
 * This layer is advisory only.
 * It must not auto-promote, auto-block, or self-modify policy.
 */

import type { GovernanceHeuristic } from "./governance_playbook_types";
import type { GovernancePlaybook } from "./governance_playbook_types";
import type {
  PlaybookDecisionContext,
  HeuristicCrosswalkEntry,
  PlaybookDecisionCrosswalk,
} from "./playbook_crosswalk_types";

/* =========================================================
   buildPlaybookDecisionContext
   ========================================================= */

/**
 * Constructs a PlaybookDecisionContext from individual fields.
 * Defensive copies of all array fields are made.
 */
export function buildPlaybookDecisionContext(
  domain: PlaybookDecisionContext["domain"],
  currentPolicyVersionId: string | null,
  recommendedPolicyVersionId: string | null,
  expectedGains: string[],
  expectedTradeoffs: string[],
  expectedRisks: string[],
  recommendationStrength: PlaybookDecisionContext["recommendationStrength"],
  confidence: PlaybookDecisionContext["confidence"]
): PlaybookDecisionContext {
  return {
    domain,
    currentPolicyVersionId,
    recommendedPolicyVersionId,
    expectedGains: [...expectedGains],
    expectedTradeoffs: [...expectedTradeoffs],
    expectedRisks: [...expectedRisks],
    recommendationStrength,
    confidence,
  };
}

/* =========================================================
   Internal: rule-type detection
   ========================================================= */

function ruleL(heuristic: GovernanceHeuristic): string {
  return heuristic.rule.toLowerCase();
}

function isPreferRule(h: GovernanceHeuristic): boolean {
  const r = ruleL(h);
  return r.startsWith("prefer") || r.startsWith("in ");
}

function isCautionRule(h: GovernanceHeuristic): boolean {
  return ruleL(h).startsWith("use caution");
}

function isShallowHistoryRule(h: GovernanceHeuristic): boolean {
  const r = ruleL(h);
  return (r.startsWith("avoid") || r.startsWith("do not")) &&
    (r.includes("shallow") || r.includes("fewer than 3"));
}

function isNoBenchSignalRule(h: GovernanceHeuristic): boolean {
  const r = ruleL(h);
  return (r.startsWith("avoid") || r.startsWith("do not")) &&
    (r.includes("reliable") || r.includes("bench improvement signal"));
}

function isNoTradeoffRule(h: GovernanceHeuristic): boolean {
  const r = ruleL(h);
  return (r.startsWith("avoid") || r.startsWith("do not")) &&
    (r.includes("tradeoffs") || r.includes("documenting expected"));
}

function isElevatedUnresolvedRule(h: GovernanceHeuristic): boolean {
  const r = ruleL(h);
  return (r.startsWith("avoid") || r.startsWith("do not")) &&
    r.includes("unresolved-outcome rate");
}

/* =========================================================
   Internal: reason-line builders
   ========================================================= */

function supportReasonLines(
  h: GovernanceHeuristic,
  ctx: PlaybookDecisionContext
): string[] {
  const lines: string[] = [];

  if (ctx.expectedGains.length > 0) {
    lines.push(
      `This heuristic supports promotion because expected gains align with past ` +
        `successful ${ctx.domain} promotions documented in the playbook.`
    );
  }
  if (ctx.recommendationStrength === "strong") {
    lines.push(
      "Strong bench recommendation is consistent with the historical pattern this doctrine was extracted from."
    );
  } else if (ctx.recommendationStrength === "moderate") {
    lines.push(
      "Moderate bench recommendation aligns with past conditions where this promote pattern succeeded."
    );
  }
  if (lines.length === 0) {
    lines.push("This heuristic supports the current governance approach based on domain alignment.");
  }

  return lines;
}

function cautionReasonLines(
  h: GovernanceHeuristic,
  ctx: PlaybookDecisionContext
): string[] {
  const lines: string[] = [];

  if (isShallowHistoryRule(h)) {
    lines.push(
      "This heuristic cautions against promotion because the current evidence window is shallow."
    );
    if (ctx.confidence === "low") {
      lines.push(
        "Recommendation confidence is low, which is consistent with a shallow or uncertain evidence base."
      );
    }
    return lines;
  }

  if (isNoBenchSignalRule(h)) {
    lines.push(
      "This heuristic cautions against promotion because the bench recommendation is weak — " +
        "expected improvements are not clearly evidenced."
    );
    return lines;
  }

  if (isNoTradeoffRule(h)) {
    lines.push(
      "This heuristic cautions against promotion because no expected tradeoffs have been declared for this decision."
    );
    lines.push(
      "Documenting tradeoffs before acting reduces the risk of undeclared regressions appearing in the outcome review."
    );
    return lines;
  }

  if (isElevatedUnresolvedRule(h)) {
    lines.push(
      "This heuristic cautions against promotion because elevated unresolved-outcome risk is acknowledged in the decision context."
    );
    return lines;
  }

  // caution/tradeoff rule
  if (ctx.expectedTradeoffs.length > 0) {
    lines.push(
      "This heuristic cautions against promotion because acknowledged tradeoffs match the pattern " +
        "where post-action regressions were repeatedly underestimated."
    );
  }
  if (ctx.expectedRisks.length > 0) {
    lines.push(
      "Acknowledged risks trigger this caution doctrine — past actions with similar risk acknowledgements produced mixed outcomes."
    );
  }
  if (lines.length === 0) {
    lines.push(
      "This heuristic cautions against the current governance action based on the current decision conditions."
    );
  }

  return lines;
}

function neutralReasonLines(
  h: GovernanceHeuristic,
  ctx: PlaybookDecisionContext
): string[] {
  return [
    "This doctrine is domain-relevant but not strongly implicated by the current decision.",
  ];
}

function notRelevantReasonLines(
  h: GovernanceHeuristic,
  ctx: PlaybookDecisionContext
): string[] {
  return [
    `This heuristic applies to ${h.domain} governance; the current decision is for ${ctx.domain}.`,
  ];
}

/* =========================================================
   evaluateHeuristicRelevance
   ========================================================= */

/**
 * Evaluates a single governance heuristic against a live decision context and
 * returns a fully populated HeuristicCrosswalkEntry.
 *
 * Classification rules (applied in order):
 *
 * 1. Domain relevance check:
 *    - If heuristic.domain !== decisionContext.domain AND heuristic.domain !== "mixed"
 *      → "not_relevant"
 *
 * 2. Prefer/promote heuristics:
 *    - "supports" when recommendationStrength is "moderate" or "strong" AND
 *      expectedGains are present
 *    - "neutral" otherwise
 *
 * 3. Use-caution (tradeoff) heuristics:
 *    - "cautions" when expectedTradeoffs or expectedRisks are present
 *    - "neutral" otherwise
 *
 * 4. Avoid/do-not heuristics — sub-classified by condition:
 *    - Shallow-history rule → "cautions" when confidence is "low"
 *    - No-bench-signal rule → "cautions" when recommendationStrength is "weak"
 *    - No-tradeoffs-declared rule → "cautions" when expectedTradeoffs is empty
 *    - Elevated-unresolved rule → "cautions" when expectedRisks are present
 *    - Else → "neutral"
 */
export function evaluateHeuristicRelevance(
  heuristic: GovernanceHeuristic,
  decisionContext: PlaybookDecisionContext
): HeuristicCrosswalkEntry {
  const base = {
    heuristicId: heuristic.id,
    title:       heuristic.title,
    rule:        heuristic.rule,
    domain:      heuristic.domain,
  };

  const {
    domain,
    recommendationStrength,
    confidence,
    expectedGains,
    expectedTradeoffs,
    expectedRisks,
  } = decisionContext;

  // Step 1 — domain relevance
  if (heuristic.domain !== "mixed" && heuristic.domain !== domain) {
    return {
      ...base,
      relevance: "not_relevant",
      reasonLines: notRelevantReasonLines(heuristic, decisionContext),
    };
  }

  // Step 2 — prefer/promote heuristics
  if (isPreferRule(heuristic)) {
    const supports =
      recommendationStrength !== "weak" && expectedGains.length > 0;
    return {
      ...base,
      relevance: supports ? "supports" : "neutral",
      reasonLines: supports
        ? supportReasonLines(heuristic, decisionContext)
        : neutralReasonLines(heuristic, decisionContext),
    };
  }

  // Step 3 — use-caution heuristics
  if (isCautionRule(heuristic)) {
    const cautions = expectedTradeoffs.length > 0 || expectedRisks.length > 0;
    return {
      ...base,
      relevance: cautions ? "cautions" : "neutral",
      reasonLines: cautions
        ? cautionReasonLines(heuristic, decisionContext)
        : neutralReasonLines(heuristic, decisionContext),
    };
  }

  // Step 4 — avoid / do-not heuristics
  if (isShallowHistoryRule(heuristic)) {
    const cautions = confidence === "low";
    return {
      ...base,
      relevance: cautions ? "cautions" : "neutral",
      reasonLines: cautions
        ? cautionReasonLines(heuristic, decisionContext)
        : neutralReasonLines(heuristic, decisionContext),
    };
  }

  if (isNoBenchSignalRule(heuristic)) {
    const cautions = recommendationStrength === "weak";
    return {
      ...base,
      relevance: cautions ? "cautions" : "neutral",
      reasonLines: cautions
        ? cautionReasonLines(heuristic, decisionContext)
        : neutralReasonLines(heuristic, decisionContext),
    };
  }

  if (isNoTradeoffRule(heuristic)) {
    const cautions = expectedTradeoffs.length === 0;
    return {
      ...base,
      relevance: cautions ? "cautions" : "neutral",
      reasonLines: cautions
        ? cautionReasonLines(heuristic, decisionContext)
        : neutralReasonLines(heuristic, decisionContext),
    };
  }

  if (isElevatedUnresolvedRule(heuristic)) {
    const cautions = expectedRisks.length > 0;
    return {
      ...base,
      relevance: cautions ? "cautions" : "neutral",
      reasonLines: cautions
        ? cautionReasonLines(heuristic, decisionContext)
        : neutralReasonLines(heuristic, decisionContext),
    };
  }

  // Fallback — domain-relevant but not specifically implicated
  return {
    ...base,
    relevance: "neutral",
    reasonLines: neutralReasonLines(heuristic, decisionContext),
  };
}

/* =========================================================
   buildPlaybookDecisionCrosswalk
   ========================================================= */

/**
 * Builds the full PlaybookDecisionCrosswalk by evaluating every heuristic in
 * the playbook against the decision context.
 *
 * not_relevant heuristics are excluded from all three output lists.
 * Input arrays are never mutated.
 */
export function buildPlaybookDecisionCrosswalk(
  playbook: GovernancePlaybook,
  decisionContext: PlaybookDecisionContext
): PlaybookDecisionCrosswalk {
  const supporting: HeuristicCrosswalkEntry[] = [];
  const cautioning: HeuristicCrosswalkEntry[] = [];
  const neutral:    HeuristicCrosswalkEntry[] = [];

  for (const heuristic of playbook.heuristics) {
    const entry = evaluateHeuristicRelevance(heuristic, decisionContext);
    if (entry.relevance === "supports")     supporting.push(entry);
    else if (entry.relevance === "cautions") cautioning.push(entry);
    else if (entry.relevance === "neutral")  neutral.push(entry);
    // not_relevant excluded
  }

  const summaryLines = buildSummaryLines(
    decisionContext,
    supporting,
    cautioning,
    neutral
  );

  return {
    domain: decisionContext.domain,
    supportingHeuristics: supporting,
    cautioningHeuristics: cautioning,
    neutralHeuristics:    neutral,
    summaryLines,
  };
}

/* =========================================================
   Internal: summary lines
   ========================================================= */

function buildSummaryLines(
  ctx: PlaybookDecisionContext,
  supporting: HeuristicCrosswalkEntry[],
  cautioning: HeuristicCrosswalkEntry[],
  neutral:    HeuristicCrosswalkEntry[]
): string[] {
  const total = supporting.length + cautioning.length + neutral.length;

  if (total === 0) {
    return [
      "No playbook heuristics are applicable to the current governance decision.",
      "Heuristics accumulate as governance outcomes are reviewed and patterns recur.",
    ];
  }

  const lines: string[] = [];

  lines.push(
    `${total} playbook heuristic(s) evaluated for the current ${ctx.domain} governance decision.`
  );

  if (supporting.length > 0) {
    lines.push(
      `${supporting.length} doctrine(s) support this action based on historical governance patterns.`
    );
  }
  if (cautioning.length > 0) {
    lines.push(
      `${cautioning.length} doctrine(s) caution against this action — review before committing.`
    );
  }
  if (neutral.length > 0) {
    lines.push(
      `${neutral.length} doctrine(s) are domain-relevant but not strongly implicated by current conditions.`
    );
  }

  if (cautioning.length > supporting.length) {
    lines.push(
      "Caution doctrines outnumber supporting doctrines — consider reviewing the cautioning heuristics before acting."
    );
  } else if (supporting.length > 0 && cautioning.length === 0) {
    lines.push(
      "No caution doctrines apply — playbook evidence supports proceeding with this governance action."
    );
  }

  return lines;
}
