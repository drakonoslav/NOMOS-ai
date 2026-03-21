/**
 * query_evaluator.ts
 *
 * NOMOS query evaluator — LLM-primary with rule-based semantic fallback.
 *
 * Constitutional role:
 * - Applies constitutional reasoning to a structured NomosQuery.
 * - Classifies each candidate action as LAWFUL, DEGRADED, or INVALID
 *   based on the declared state, constraints, uncertainties, and objective.
 * - Does NOT use the physical kernel (physics-based verification is for sensor data).
 * - This is semantic constitutional reasoning over declared state.
 *
 * Evaluation chain:
 * 1. LLM evaluator (NomosQueryEvaluator) — preferred; requires OPENAI_API_KEY.
 * 2. Rule-based evaluator (RuleBasedQueryEvaluator) — always available; semantic
 *    vocabulary matching without an LLM.  Used as fallback when LLM is unavailable.
 */

import OpenAI from "openai";
import { NomosQuery } from "./query_types.js";
import {
  NomosQueryResponse,
  NomosCandidateEvaluation,
  NomosAdjustment,
  NomosActionClassification,
} from "./query_response_types.js";
import { evaluateCandidateAgainstConstraints } from "./constraint_evaluator.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY. Add it to Replit Secrets.");
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return cachedClient;
}

/* =========================================================
   LLM response schema
   ========================================================= */

interface LLMEvaluationResult {
  overallStatus: "LAWFUL" | "DEGRADED" | "INVALID";
  candidateEvaluations: {
    id: string;
    classification: "LAWFUL" | "DEGRADED" | "INVALID";
    reasons: string[];
  }[];
  lawfulSet: string[];
  adjustments: {
    candidateId: string;
    actions: string[];
  }[];
  notes: string[];
}

const EVALUATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    overallStatus: {
      type: "string",
      enum: ["LAWFUL", "DEGRADED", "INVALID"],
    },
    candidateEvaluations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          classification: {
            type: "string",
            enum: ["LAWFUL", "DEGRADED", "INVALID"],
          },
          reasons: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["id", "classification", "reasons"],
      },
    },
    lawfulSet: {
      type: "array",
      items: { type: "string" },
    },
    adjustments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          candidateId: { type: "string" },
          actions: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["candidateId", "actions"],
      },
    },
    notes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["overallStatus", "candidateEvaluations", "lawfulSet", "adjustments", "notes"],
} as const;

const EVALUATOR_SYSTEM_PROMPT = [
  "You are the NOMOS constitutional evaluator for semantic queries.",
  "You receive a structured NomosQuery with declared state, constraints, uncertainties, candidates, and objective.",
  "Apply constitutional reasoning to classify each candidate action.",
  "LAWFUL: candidate satisfies all constraints and is consistent with the objective and declared state.",
  "DEGRADED: candidate is technically possible but operates under reduced margin, uncertainty, or partial constraint satisfaction.",
  "INVALID: candidate violates one or more hard constraints or is infeasible given the declared state.",
  "For each candidate, provide specific reasons referencing the actual constraints and state provided.",
  "overallStatus is the best achievable status across all candidates.",
  "lawfulSet lists candidate IDs with LAWFUL classification.",
  "adjustments lists what would need to change to make DEGRADED or INVALID candidates lawful.",
  "Never fabricate constraints not present in the query.",
  "Be precise. Reference the actual text of constraints and facts in your reasons.",
].join(" ");

/* =========================================================
   LLM-based evaluator (primary)
   ========================================================= */

export class NomosQueryEvaluator {
  public async evaluate(query: NomosQuery): Promise<NomosQueryResponse> {
    // Attempt LLM evaluation first
    if (OPENAI_API_KEY) {
      try {
        return await this.evaluateWithLLM(query);
      } catch (err) {
        // Fall through to rule-based on any LLM failure
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[NomosQueryEvaluator] LLM evaluation failed (${message}), falling back to rule-based evaluator.`);
      }
    }

    // Rule-based fallback
    const ruleBasedEvaluator = new RuleBasedQueryEvaluator();
    return ruleBasedEvaluator.evaluate(query);
  }

  private async evaluateWithLLM(query: NomosQuery): Promise<NomosQueryResponse> {
    const client = getClient();

    const response = await client.responses.create({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: EVALUATOR_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            state: query.state,
            candidates: query.candidates,
            objective: query.objective,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "nomos_query_evaluation",
          schema: EVALUATION_SCHEMA,
          strict: true,
        },
      },
    });

    const raw = response.output_text;
    if (!raw || raw.trim().length === 0) {
      throw new Error("NomosQueryEvaluator received empty structured output.");
    }

    const result = JSON.parse(raw) as LLMEvaluationResult;

    const adjustments: NomosAdjustment[] = (result.adjustments ?? []).filter(
      (a) => a.actions && a.actions.length > 0
    );

    return {
      submissionQuality: query.completeness,
      overallStatus: result.overallStatus,
      candidateEvaluations: result.candidateEvaluations as NomosCandidateEvaluation[],
      lawfulSet: result.lawfulSet ?? [],
      adjustments: adjustments.length > 0 ? adjustments : undefined,
      notes: result.notes ?? [],
      evaluationMethod: "llm",
    };
  }
}

/* =========================================================
   Rule-based evaluator (semantic fallback — always available)
   ========================================================= */

export class RuleBasedQueryEvaluator {
  /**
   * Evaluate all candidates against all declared constraints using
   * semantic vocabulary matching — no LLM required.
   */
  public evaluate(query: NomosQuery): NomosQueryResponse {
    const constraints = query.state.constraints;

    const candidateEvaluations: NomosCandidateEvaluation[] = query.candidates.map(
      (candidate) => {
        const summary = evaluateCandidateAgainstConstraints(candidate, constraints);
        return {
          id: candidate.id,
          classification: summary.status,
          reasons: summary.reasons,
          violatedConstraints: summary.violatedConstraints.length > 0
            ? summary.violatedConstraints
            : undefined,
        };
      }
    );

    const overallStatus = this.computeOverall(candidateEvaluations.map((e) => e.classification));
    const lawfulSet = candidateEvaluations
      .filter((e) => e.classification === "LAWFUL")
      .map((e) => e.id);

    const adjustments: NomosAdjustment[] = candidateEvaluations
      .filter((e) => e.classification !== "LAWFUL")
      .map((e) => ({
        candidateId: e.id,
        actions: this.buildAdjustments(e.classification, e.violatedConstraints ?? []),
      }))
      .filter((a) => a.actions.length > 0);

    const notes: string[] = [
      "Rule-based semantic evaluator used (LLM unavailable or not configured).",
      "Evaluation based on vocabulary matching against declared constraint types.",
      ...(constraints.length === 0
        ? ["No constraints were declared — all candidates presumptively LAWFUL."]
        : [`${constraints.length} constraint(s) evaluated against ${query.candidates.length} candidate(s).`]),
    ];

    return {
      submissionQuality: query.completeness,
      overallStatus,
      candidateEvaluations,
      lawfulSet,
      adjustments: adjustments.length > 0 ? adjustments : undefined,
      notes,
      evaluationMethod: "rule-based",
    };
  }

  private computeOverall(statuses: NomosActionClassification[]): NomosActionClassification {
    if (statuses.length === 0) return "INVALID";
    if (statuses.some((s) => s === "LAWFUL")) return "LAWFUL";
    if (statuses.some((s) => s === "DEGRADED")) return "DEGRADED";
    return "INVALID";
  }

  private buildAdjustments(
    classification: NomosActionClassification,
    violatedConstraints: string[]
  ): string[] {
    if (violatedConstraints.length === 0) return [];
    const prefix = classification === "INVALID"
      ? "Remove or replace the action that violates"
      : "Mitigate risk against";
    return violatedConstraints.map((vc) => `${prefix}: "${vc}"`);
  }
}
