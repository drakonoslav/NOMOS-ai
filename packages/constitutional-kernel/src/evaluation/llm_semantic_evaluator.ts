/**
 * llm_semantic_evaluator.ts
 *
 * LLM-backed semantic evaluator for UNKNOWN constraint kinds.
 *
 * Constitutional role:
 * - Secondary evaluator. Used only when the deterministic matcher returns null.
 * - Does not override deterministic results.
 * - Produces structured output using the same CandidateEvaluation contract.
 * - Falls back to a DEGRADED result with low confidence if the LLM is unavailable.
 */

import OpenAI from "openai";
import { CandidateEvaluationDraft, NormalizedCandidate, NormalizedConstraint } from "./eval_types.js";

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: key });
  }
  return cachedClient;
}

const LLM_FALLBACK_RESULT = (id: string, constraint: string): CandidateEvaluationDraft => ({
  id,
  status: "DEGRADED",
  reason: "Constraint type could not be deterministically classified; evaluation requires manual review.",
  decisiveVariable: "constraint interpretation",
  confidence: "low",
  adjustments: [`Clarify constraint semantics: "${constraint}"`],
});

export async function evaluateSemantically(
  constraint: NormalizedConstraint,
  candidate: NormalizedCandidate
): Promise<CandidateEvaluationDraft> {
  const client = getClient();

  if (!client) {
    return LLM_FALLBACK_RESULT(candidate.id, constraint.raw);
  }

  const prompt = [
    "You are evaluating whether a candidate action satisfies a constitutional constraint.",
    "",
    "Return JSON only — no other text:",
    "{",
    '  "status": "LAWFUL" | "DEGRADED" | "INVALID",',
    '  "reason": "short formal reason (one sentence)",',
    '  "decisiveVariable": "short variable name",',
    '  "confidence": "low" | "moderate" | "high",',
    '  "adjustments": ["optional short adjustment"]',
    "}",
    "",
    `Constraint: ${constraint.raw}`,
    `Candidate: ${candidate.raw}`,
    "",
    "Rules:",
    "- LAWFUL = cleanly satisfies constraint",
    "- DEGRADED = satisfies with reduced margin or elevated risk",
    "- INVALID = violates constraint",
    "- Be concise. No conversational language.",
  ].join("\n");

  try {
    const res = await client.responses.create({
      model: OPENAI_MODEL,
      input: prompt,
    });

    const raw = res.output_text?.trim() ?? "";
    if (!raw) return LLM_FALLBACK_RESULT(candidate.id, constraint.raw);

    const parsed = JSON.parse(raw);

    return {
      id: candidate.id,
      status: parsed.status ?? "DEGRADED",
      reason: parsed.reason ?? "No reason returned.",
      decisiveVariable: parsed.decisiveVariable ?? "constraint interpretation",
      confidence: parsed.confidence ?? "low",
      adjustments: parsed.adjustments ?? [],
    };
  } catch {
    return LLM_FALLBACK_RESULT(candidate.id, constraint.raw);
  }
}
