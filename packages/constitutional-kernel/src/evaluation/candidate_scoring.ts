/**
 * candidate_scoring.ts
 *
 * Orchestrates the full NOMOS evaluation pipeline.
 *
 * Pipeline:
 *   NomosQuery
 *   → normalizeConstraint      (constraint_normalizer)
 *   → normalizeCandidate       (candidate_normalizer)
 *   → evaluateDeterministically (deterministic_matcher) — preferred path
 *   → evaluateSemantically     (llm_semantic_evaluator) — fallback for UNKNOWN
 *   → resolveOverallStatus
 *   → resolveGlobalDecisiveVariable
 *   → EvaluationResult
 *
 * Constitutional role:
 * - Produces the authoritative EvaluationResult for a NomosQuery.
 * - Uses only the first declared constraint for deterministic classification.
 *   Multiple constraints are evaluated additively with worst-status aggregation.
 * - Does not modify input; does not fabricate constraints.
 */

import { NomosQuery } from "../query/query_types.js";
import { normalizeConstraint } from "./constraint_normalizer.js";
import { normalizeCandidate } from "./candidate_normalizer.js";
import { evaluateDeterministically } from "./deterministic_matcher.js";
import { evaluateSemantically } from "./llm_semantic_evaluator.js";
import { CandidateEvaluation, CandidateStatus, EvaluationResult } from "./eval_types.js";

export async function evaluateQueryCandidates(
  query: NomosQuery
): Promise<EvaluationResult> {
  const constraints = query.state.constraints;

  if (constraints.length === 0 || query.candidates.length === 0) {
    return {
      overallStatus: "LAWFUL",
      lawfulSet: query.candidates.map((c) => c.id),
      candidateEvaluations: query.candidates.map((c) => ({
        id: c.id,
        status: "LAWFUL",
        reason: "No constraints declared — candidate is presumptively lawful.",
        decisiveVariable: "none",
        confidence: "high",
      })),
      decisiveVariable: "none",
      notes: ["No constraints declared."],
    };
  }

  const evaluations: CandidateEvaluation[] = [];

  for (const candidate of query.candidates) {
    const normalized = normalizeCandidate(candidate.id, candidate.description);

    // Evaluate against all declared constraints and aggregate (worst-status wins)
    let aggregated: CandidateEvaluation | null = null;

    for (const constraintRaw of constraints) {
      const constraint = normalizeConstraint(constraintRaw);

      let result = evaluateDeterministically(constraint, normalized);
      if (!result) {
        result = await evaluateSemantically(constraint, normalized);
      }

      if (!aggregated) {
        aggregated = result;
      } else {
        aggregated = mergeEvaluations(aggregated, result);
      }
    }

    evaluations.push(aggregated!);
  }

  const lawfulSet = evaluations
    .filter((e) => e.status === "LAWFUL")
    .map((e) => e.id);

  const overallStatus = resolveOverallStatus(evaluations);
  const decisiveVariable = resolveGlobalDecisiveVariable(evaluations);

  const notes: string[] = [
    `${constraints.length} constraint(s) evaluated against ${query.candidates.length} candidate(s).`,
    `Evaluation method: deterministic${constraints.some((c) => normalizeConstraint(c).kind === "UNKNOWN") ? " + LLM semantic" : ""}.`,
  ];

  return {
    overallStatus,
    lawfulSet,
    candidateEvaluations: evaluations,
    decisiveVariable,
    notes,
  };
}

/* =========================================================
   Aggregation — worst status wins across multiple constraints
   ========================================================= */

function mergeEvaluations(
  a: CandidateEvaluation,
  b: CandidateEvaluation
): CandidateEvaluation {
  const aRank = statusRank(a.status);
  const bRank = statusRank(b.status);

  if (bRank > aRank) {
    return {
      ...b,
      reason: [a.reason, b.reason].filter(Boolean).join(" Additionally: "),
      adjustments: [...(a.adjustments ?? []), ...(b.adjustments ?? [])],
    };
  }

  return {
    ...a,
    reason: [a.reason, b.reason].filter(Boolean).join(" Additionally: "),
    adjustments: [...(a.adjustments ?? []), ...(b.adjustments ?? [])],
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
