/**
 * candidate_scoring.ts
 *
 * Orchestrates the full NOMOS evaluation pipeline.
 *
 * Pipeline:
 *   NomosQuery
 *   → normalizeConstraint        (constraint_normalizer)
 *   → normalizeCandidate         (candidate_normalizer)
 *   → evaluateDeterministically  (deterministic_matcher) — preferred path
 *   → evaluateSemantically       (llm_semantic_evaluator) — fallback for UNKNOWN
 *   → computeMarginScore         (margin_scorer) — additive scoring layer
 *   → resolveOverallStatus
 *   → resolveGlobalDecisiveVariable
 *   → resolveBestCandidate / resolveStrongestMarginScore / resolveWeakestAdmissibleMarginScore
 *   → EvaluationResult
 *
 * Constitutional role:
 * - Produces the authoritative EvaluationResult for a NomosQuery.
 * - Worst-status aggregation across multiple constraints.
 * - Margin scores use the minimum across multiple constraints (most conservative).
 * - bestCandidateId and weakestAdmissibleMarginScore filter to LAWFUL candidates only.
 * - strongestMarginScore is the global maximum across all candidates.
 */

import { NomosQuery } from "../query/query_types.js";
import { normalizeConstraint } from "./constraint_normalizer.js";
import { normalizeCandidate } from "./candidate_normalizer.js";
import { evaluateDeterministically } from "./deterministic_matcher.js";
import { evaluateSemantically } from "./llm_semantic_evaluator.js";
import { computeMarginScore, marginLabelFromScore } from "./margin_scorer.js";
import {
  CandidateEvaluation,
  CandidateEvaluationDraft,
  CandidateStatus,
  EvaluationResult,
} from "./eval_types.js";

export async function evaluateQueryCandidates(
  query: NomosQuery
): Promise<EvaluationResult> {
  const constraints = query.state.constraints;

  if (constraints.length === 0 || query.candidates.length === 0) {
    const unconstrained: CandidateEvaluation[] = query.candidates.map((c) => ({
      id: c.id,
      status: "LAWFUL" as CandidateStatus,
      reason: "No constraints declared — candidate is presumptively lawful.",
      decisiveVariable: "none",
      confidence: "high" as const,
      marginScore: 1.00,
      marginLabel: "HIGH" as const,
    }));

    return {
      overallStatus: "LAWFUL",
      lawfulSet: query.candidates.map((c) => c.id),
      candidateEvaluations: unconstrained,
      decisiveVariable: "none",
      notes: ["No constraints declared."],
      bestCandidateId: unconstrained[0]?.id,
      strongestMarginScore: 1.00,
      weakestAdmissibleMarginScore: 1.00,
    };
  }

  const evaluations: CandidateEvaluation[] = [];

  for (const candidate of query.candidates) {
    const normalized = normalizeCandidate(candidate.id, candidate.description);

    let aggregated: CandidateEvaluation | null = null;

    for (const constraintRaw of constraints) {
      const constraint = normalizeConstraint(constraintRaw);

      let draft: CandidateEvaluationDraft | null = evaluateDeterministically(constraint, normalized);
      if (!draft) {
        draft = await evaluateSemantically(constraint, normalized);
      }

      // Promote draft to full CandidateEvaluation by adding margin scoring
      const margin = computeMarginScore(normalized, constraint, draft.status, draft.confidence);
      const withMargin: CandidateEvaluation = {
        ...draft,
        marginScore: margin.marginScore,
        marginLabel: margin.marginLabel,
      };

      if (!aggregated) {
        aggregated = withMargin;
      } else {
        aggregated = mergeEvaluations(aggregated, withMargin);
      }
    }

    evaluations.push(aggregated!);
  }

  const lawfulSet = evaluations
    .filter((e) => e.status === "LAWFUL")
    .map((e) => e.id);

  const overallStatus              = resolveOverallStatus(evaluations);
  const decisiveVariable           = resolveGlobalDecisiveVariable(evaluations);
  const bestCandidateId            = resolveBestCandidate(evaluations);
  const strongestMarginScore       = resolveStrongestMarginScore(evaluations);
  const weakestAdmissibleMarginScore = resolveWeakestAdmissibleMarginScore(evaluations);

  const notes: string[] = [
    `${constraints.length} constraint(s) evaluated against ${query.candidates.length} candidate(s).`,
    `Evaluation method: deterministic${constraints.some((c) => normalizeConstraint(c).kind === "UNKNOWN") ? " + LLM semantic" : ""}.`,
    strongestMarginScore !== undefined
      ? `Strongest margin: ${strongestMarginScore.toFixed(2)}.`
      : "",
  ].filter(Boolean);

  return {
    overallStatus,
    lawfulSet,
    candidateEvaluations: evaluations,
    decisiveVariable,
    notes,
    bestCandidateId,
    strongestMarginScore,
    weakestAdmissibleMarginScore,
  };
}

/* =========================================================
   Aggregation — worst status + lowest margin wins
   ========================================================= */

function mergeEvaluations(
  a: CandidateEvaluation,
  b: CandidateEvaluation
): CandidateEvaluation {
  const aRank = statusRank(a.status);
  const bRank = statusRank(b.status);

  const worstMarginScore = Math.min(a.marginScore, b.marginScore);
  const merged = bRank > aRank ? { ...b } : { ...a };

  // Deduplicate reasons — repeated identical sentences from fallback constraints
  // must not appear once per candidate (common when multiple UNKNOWN constraints fire).
  const rawReasons = [a.reason, b.reason].filter(Boolean);
  const uniqueReasons = rawReasons.filter((r, i) => rawReasons.indexOf(r) === i);

  // Collapse repeated interpretation-fallback phrases into one combined note
  const FALLBACK_SIGNAL = "could not be deterministically classified";
  const interpretationCount = uniqueReasons.filter((r) =>
    r.toLowerCase().includes(FALLBACK_SIGNAL)
  ).length;
  const nonFallbackReasons = uniqueReasons.filter(
    (r) => !r.toLowerCase().includes(FALLBACK_SIGNAL)
  );
  const dedupedReasons =
    interpretationCount > 0
      ? [
          ...nonFallbackReasons,
          interpretationCount > 1
            ? `${interpretationCount} constraints require manual review (not deterministically classifiable).`
            : uniqueReasons.find((r) => r.toLowerCase().includes(FALLBACK_SIGNAL))!,
        ]
      : nonFallbackReasons;

  return {
    ...merged,
    reason: dedupedReasons.filter(Boolean).join(" Additionally: "),
    adjustments: dedupeStrings([...(a.adjustments ?? []), ...(b.adjustments ?? [])]),
    marginScore: worstMarginScore,
    marginLabel: marginLabelFromScore(worstMarginScore),
  };
}

function dedupeStrings(values: string[]): string[] {
  return values.filter((v, i) => values.indexOf(v) === i);
}

function statusRank(s: CandidateStatus): number {
  if (s === "INVALID")  return 2;
  if (s === "DEGRADED") return 1;
  return 0;
}

/* =========================================================
   Overall status — best achievable across all candidates
   ========================================================= */

function resolveOverallStatus(evals: CandidateEvaluation[]): CandidateStatus {
  if (evals.length === 0) return "INVALID";
  if (evals.some((e) => e.status === "LAWFUL"))   return "LAWFUL";
  if (evals.some((e) => e.status === "DEGRADED")) return "DEGRADED";
  return "INVALID";
}

/* =========================================================
   Global decisive variable — from the most critical candidate
   ========================================================= */

function resolveGlobalDecisiveVariable(evals: CandidateEvaluation[]): string {
  const invalid  = evals.find((e) => e.status === "INVALID");
  if (invalid) return invalid.decisiveVariable;

  const degraded = evals.find((e) => e.status === "DEGRADED");
  if (degraded) return degraded.decisiveVariable;

  const lawful   = evals.find((e) => e.status === "LAWFUL");
  return lawful?.decisiveVariable ?? "constraint boundary";
}

/* =========================================================
   Margin summary — LAWFUL-only for best and weakest admissible
   ========================================================= */

function resolveBestCandidate(evals: CandidateEvaluation[]): string | undefined {
  const admissible = evals.filter((e) => e.status === "LAWFUL");
  if (admissible.length === 0) return undefined;
  admissible.sort((a, b) => b.marginScore - a.marginScore);
  return admissible[0].id;
}

function resolveStrongestMarginScore(evals: CandidateEvaluation[]): number | undefined {
  if (evals.length === 0) return undefined;
  return Math.max(...evals.map((e) => e.marginScore));
}

function resolveWeakestAdmissibleMarginScore(evals: CandidateEvaluation[]): number | undefined {
  const admissible = evals.filter((e) => e.status === "LAWFUL");
  if (admissible.length === 0) return undefined;
  return Math.min(...admissible.map((e) => e.marginScore));
}
