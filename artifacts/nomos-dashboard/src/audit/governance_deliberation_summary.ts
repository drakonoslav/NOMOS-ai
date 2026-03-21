/**
 * governance_deliberation_summary.ts
 *
 * Deterministic function for building a NOMOS governance deliberation summary.
 *
 * buildGovernanceDeliberationSummary(benchReport, decisionSupport, playbookCrosswalk, decisionContext)
 *   → GovernanceDeliberationSummary
 *
 * All logic is purely deterministic — same inputs produce the same output.
 * No LLM generation is used.
 *
 * This layer is advisory only.
 * It must not auto-promote, auto-rollback, or self-modify policy.
 */

import type { PolicyBenchReport, PolicyBenchMetrics } from "./policy_bench_types";
import type { GovernanceDecisionSupport } from "./governance_decision_support_types";
import type { PlaybookDecisionCrosswalk } from "./playbook_crosswalk_types";
import type { PlaybookDecisionContext } from "./playbook_crosswalk_types";
import type { GovernanceDeliberationSummary } from "./governance_deliberation_types";

/* =========================================================
   Internal helpers
   ========================================================= */

function pct(v: number | null): string {
  if (v === null) return "N/A";
  return `${(v * 100).toFixed(1)}%`;
}

function shortId(id: string | null): string {
  if (!id) return "none";
  return id.length > 12 ? id.slice(-8) : id;
}

/** Build key evidence lines comparing current vs recommended policy metrics. */
function buildKeyEvidenceLines(
  benchReport: PolicyBenchReport,
  currentId: string | null,
  recommendedId: string | null
): string[] {
  const lines: string[] = [];

  const currentM: PolicyBenchMetrics | undefined = benchReport.metricsByPolicy.find(
    (m) => m.policyVersionId === currentId
  );
  const recommendedM: PolicyBenchMetrics | undefined = benchReport.metricsByPolicy.find(
    (m) => m.policyVersionId === recommendedId
  );

  if (!recommendedM && benchReport.metricsByPolicy.length === 0) {
    lines.push("No bench evaluation data is available for this domain.");
    return lines;
  }

  // Exact-match comparison
  if (recommendedM && currentM) {
    const rEM = recommendedM.exactMatchRate;
    const cEM = currentM.exactMatchRate;
    if (rEM !== null && cEM !== null) {
      const delta = rEM - cEM;
      if (Math.abs(delta) < 0.001) {
        lines.push(
          `Exact-match rate is equal across both policies (${pct(rEM)}).`
        );
      } else if (delta > 0) {
        lines.push(
          `Policy ${shortId(recommendedId)} improves exact-match rate from ${pct(cEM)} to ${pct(rEM)}.`
        );
      } else {
        lines.push(
          `Policy ${shortId(recommendedId)} reduces exact-match rate from ${pct(cEM)} to ${pct(rEM)}.`
        );
      }
    } else if (rEM !== null) {
      lines.push(`Recommended policy exact-match rate: ${pct(rEM)}.`);
    }
  } else if (recommendedM) {
    const rEM = recommendedM.exactMatchRate;
    if (rEM !== null) {
      lines.push(`Recommended policy exact-match rate: ${pct(rEM)}.`);
    }
  }

  // Direction-match comparison
  if (recommendedM && currentM) {
    const rDM = recommendedM.directionMatchRate;
    const cDM = currentM.directionMatchRate;
    if (rDM !== null && cDM !== null) {
      const delta = rDM - cDM;
      if (Math.abs(delta) < 0.01) {
        lines.push(`Direction-match rate is similar across both policies (${pct(rDM)}).`);
      } else if (delta > 0) {
        lines.push(
          `Direction-match rate improves from ${pct(cDM)} to ${pct(rDM)}.`
        );
      } else {
        lines.push(
          `Direction-match rate decreases from ${pct(cDM)} to ${pct(rDM)}.`
        );
      }
    }
  }

  // Aggressiveness comparison
  if (recommendedM && currentM) {
    const rAgg = recommendedM.tooAggressiveRate;
    const cAgg = currentM.tooAggressiveRate;
    if (rAgg !== null && cAgg !== null) {
      if (rAgg < cAgg - 0.01) {
        lines.push(
          `Aggressiveness is reduced from ${pct(cAgg)} to ${pct(rAgg)} without penalising exact-match.`
        );
      } else if (rAgg > cAgg + 0.01) {
        lines.push(
          `Aggressiveness increases from ${pct(cAgg)} to ${pct(rAgg)} — review if acceptable.`
        );
      } else {
        lines.push(`Aggressiveness is broadly unchanged (${pct(rAgg)}).`);
      }
    }
  }

  // Unresolved-rate comparison
  if (recommendedM && currentM) {
    const rUR = recommendedM.unresolvedRate;
    const cUR = currentM.unresolvedRate;
    if (rUR !== null && cUR !== null) {
      if (rUR > cUR + 0.01) {
        lines.push(
          `Unresolved-outcome rate increases from ${pct(cUR)} to ${pct(rUR)} — flag as risk.`
        );
      } else if (rUR < cUR - 0.01) {
        lines.push(
          `Unresolved-outcome rate decreases from ${pct(cUR)} to ${pct(rUR)}.`
        );
      } else {
        lines.push(`Unresolved-outcome rate is stable (${pct(rUR)}).`);
      }
    }
  }

  // Fallback to bench summary lines if no comparison was possible
  if (lines.length === 0) {
    benchReport.summaryLines.slice(0, 2).forEach((l) => lines.push(l));
  }

  return lines;
}

/** Build 2–4 synthesis lines. */
function buildSynthesisLines(
  recommendation: GovernanceDeliberationSummary["recommendation"],
  recommendationStrength: GovernanceDeliberationSummary["recommendationStrength"],
  confidence: GovernanceDeliberationSummary["confidence"],
  supportingCount: number,
  cautioningCount: number,
  gainsLines: string[],
  tradeoffLines: string[]
): string[] {
  const lines: string[] = [];

  // Line 1 — evidence alignment
  if (recommendation === "promote") {
    const strengthDesc =
      recommendationStrength === "strong"
        ? "strongly supports"
        : recommendationStrength === "moderate"
        ? "supports"
        : "weakly supports";
    lines.push(
      `Bench evidence ${strengthDesc} promotion of the recommended policy based on measured metric improvements.`
    );
  } else if (recommendation === "rollback") {
    lines.push(
      "Bench evidence indicates the current policy underperforms on key metrics — rollback is advisable."
    );
  } else {
    lines.push(
      "Bench evidence is insufficient to clearly support promotion or rollback at this time."
    );
  }

  // Line 2 — doctrine alignment
  if (supportingCount > 0 && cautioningCount === 0) {
    lines.push(
      `${supportingCount} governance doctrine(s) support this action — no caution doctrines apply.`
    );
  } else if (supportingCount > 0 && cautioningCount > 0) {
    lines.push(
      `${supportingCount} doctrine(s) support this action; ${cautioningCount} caution(s) apply — review cautioning doctrines before proceeding.`
    );
  } else if (cautioningCount > 0) {
    lines.push(
      `${cautioningCount} governance doctrine(s) caution against this action — no supporting doctrines identified.`
    );
  } else {
    lines.push(
      "No playbook doctrines are strongly implicated by the current decision conditions."
    );
  }

  // Line 3 — confidence qualifier
  if (confidence === "low") {
    lines.push(
      "Confidence is low, consistent with a shallow evaluation history — consider holding for additional bench runs."
    );
  } else if (confidence === "high" && recommendation === "promote") {
    lines.push(
      "High confidence in the bench recommendation — evidence base is well-established."
    );
  }

  // Line 4 — tradeoff / gain balance
  if (tradeoffLines.length > 0 && gainsLines.length > 0) {
    lines.push(
      "Expected gains exceed declared tradeoffs — the tradeoff profile is considered acceptable under current conditions."
    );
  } else if (tradeoffLines.length > 0 && gainsLines.length === 0) {
    lines.push(
      "Tradeoffs are acknowledged without clear countervailing gains — review before committing."
    );
  }

  return lines.slice(0, 4);
}

/** Build the neutral final decision prompt. */
function buildFinalDecisionPrompt(
  recommendation: GovernanceDeliberationSummary["recommendation"],
  currentId: string | null,
  recommendedId: string | null,
  confidence: GovernanceDeliberationSummary["confidence"],
  gainsLines: string[]
): string {
  const curr = shortId(currentId);
  const rec  = shortId(recommendedId);

  if (recommendation === "promote") {
    const gainClause =
      gainsLines.length > 0
        ? `given ${gainsLines[0].toLowerCase().replace(/\.$/, "")}`
        : "based on available bench evidence";
    return `Promote policy ${rec} over ${curr} ${gainClause}?`;
  }

  if (recommendation === "rollback") {
    return `Rollback from policy ${curr} to ${rec} given degraded current-policy performance?`;
  }

  // hold
  const holdReason =
    confidence === "low"
      ? "pending additional evaluation runs to strengthen the evidence base"
      : "pending clearer bench signal before committing a governance action";
  return `Hold current policy ${curr} ${holdReason}?`;
}

/* =========================================================
   buildGovernanceDeliberationSummary
   ========================================================= */

/**
 * Produces the final advisory governance deliberation summary.
 *
 * Parameters:
 *   benchReport      — raw bench evaluation metrics for the domain.
 *   decisionSupport  — the upstream decision-support record (promoteSuggested,
 *                      rollbackSuggested, expected gains / tradeoffs / risks,
 *                      strength, confidence).
 *   playbookCrosswalk — crosswalk result classifying each heuristic against
 *                       this decision.
 *   decisionContext  — the live decision context (domain, policy IDs,
 *                      expectedGains/Tradeoffs/Risks, strength, confidence).
 *
 * The recommendation field is reflected from decisionSupport, not recomputed.
 * No inputs are mutated.
 */
export function buildGovernanceDeliberationSummary(
  benchReport: PolicyBenchReport,
  decisionSupport: GovernanceDecisionSupport,
  playbookCrosswalk: PlaybookDecisionCrosswalk,
  decisionContext: PlaybookDecisionContext
): GovernanceDeliberationSummary {
  const domain = decisionContext.domain;

  // Reflect recommendation from upstream (not recomputed here)
  const recommendation: GovernanceDeliberationSummary["recommendation"] =
    decisionSupport.promoteSuggested
      ? "promote"
      : decisionSupport.rollbackSuggested
      ? "rollback"
      : "hold";

  const currentPolicyVersionId = decisionContext.currentPolicyVersionId;
  const recommendedPolicyVersionId =
    decisionSupport.recommendedPolicyVersionId;

  // Evidence lines
  const keyEvidenceLines = buildKeyEvidenceLines(
    benchReport,
    currentPolicyVersionId,
    recommendedPolicyVersionId
  );

  // Gains / tradeoffs / risks — from decision support (already synthesised upstream)
  const gainsLines     = [...decisionSupport.expectedGains];
  const tradeoffLines  = [...decisionSupport.expectedTradeoffs];
  const riskLines      = [...decisionSupport.expectedRisks];

  // Playbook heuristic titles
  const supportingHeuristics = playbookCrosswalk.supportingHeuristics.map(
    (h) => h.title
  );
  const cautioningHeuristics = playbookCrosswalk.cautioningHeuristics.map(
    (h) => h.title
  );

  const synthesisLines = buildSynthesisLines(
    recommendation,
    decisionSupport.recommendationStrength,
    decisionSupport.confidence,
    supportingHeuristics.length,
    cautioningHeuristics.length,
    gainsLines,
    tradeoffLines
  );

  const finalDecisionPrompt = buildFinalDecisionPrompt(
    recommendation,
    currentPolicyVersionId,
    recommendedPolicyVersionId,
    decisionSupport.confidence,
    gainsLines
  );

  return {
    domain,
    currentPolicyVersionId,
    recommendedPolicyVersionId,
    recommendation,
    recommendationStrength: decisionSupport.recommendationStrength,
    confidence: decisionSupport.confidence,
    keyEvidenceLines,
    gainsLines,
    tradeoffLines,
    riskLines,
    supportingHeuristics,
    cautioningHeuristics,
    synthesisLines,
    finalDecisionPrompt,
  };
}
