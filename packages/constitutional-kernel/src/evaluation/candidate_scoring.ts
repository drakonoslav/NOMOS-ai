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
 *   → resolveSummaryFields
 *   → EvaluationResult
 *
 * Constitutional role:
 * - Produces the authoritative EvaluationResult for a NomosQuery.
 * - Worst-status aggregation across multiple constraints.
 * - Margin scores are minimum across multiple constraints (most conservative).
 * - Does not modify input; does not fabricate constraints.
 */

import { NomosQuery } from "../query/query_types.js";
import { normalizeConstraint } from "./constraint_normalizer.js";
import { normalizeCandidate } from "./candidate_normalizer.js";
import { evaluateDeterministically } from "./deterministic_matcher.js";
import { evaluateSemantically } from "./llm_semantic_evaluator.js";
import { computeMarginScore } from "./margin_scorer.js";
import { CandidateEvaluation, CandidateEvaluationDraft, CandidateStatus, EvaluationResult } from "./eval_types.js";

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
      bestCandidateId: unconstrained[0]?.id ?? null,
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

  const overallStatus        = resolveOverallStatus(evaluations);
  const decisiveVariable     = resolveGlobalDecisiveVariable(evaluations);
  const bestCandidateId      = resolveBestCandidateId(evaluations);
  const strongestMarginScore = resolveStrongestMargin(evaluations);
  const weakestAdmissibleMarginScore = resolveWeakestAdmissibleMargin(evaluations);

  const notes: string[] = [
    `${constraints.length} constraint(s) evaluated against ${query.candidates.length} candidate(s).`,
    `Evaluation method: deterministic${constraints.some((c) => normalizeConstraint(c).kind === "UNKNOWN") ? " + LLM semantic" : ""}.`,
    `Strongest margin: ${strongestMarginScore.toFixed(2)} (${evaluations.find((e) => e.id === bestCandidateId)?.marginLabel ?? "—"}).`,
  ];

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

  return {
    ...merged,
    reason: [a.reason, b.reason].filter(Boolean).join(" Additionally: "),
    adjustments: [...(a.adjustments ?? []), ...(b.adjustments ?? [])],
    marginScore: worstMarginScore,
    marginLabel: worstMarginScore === 0.00
      ? "FAILED"
      : worstMarginScore >= 0.75
      ? "HIGH"
      : worstMarginScore >= 0.50
      ? "MODERATE"
      : "LOW",
  };
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
   Margin summary fields
   ========================================================= */

function resolveBestCandidateId(evals: CandidateEvaluation[]): string | null {
  if (evals.length === 0) return null;
  return [...evals].sort((a, b) => b.marginScore - a.marginScore)[0].id;
}

function resolveStrongestMargin(evals: CandidateEvaluation[]): number {
  if (evals.length === 0) return 0.00;
  return Math.max(...evals.map((e) => e.marginScore));
}

function resolveWeakestAdmissibleMargin(evals: CandidateEvaluation[]): number | null {
  const admissible = evals.filter((e) => e.status !== "INVALID");
  if (admissible.length === 0) return null;
  return Math.min(...admissible.map((e) => e.marginScore));
}
