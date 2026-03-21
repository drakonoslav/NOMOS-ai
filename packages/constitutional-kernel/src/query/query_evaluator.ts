/**
 * query_evaluator.ts
 *
 * LLM-based NOMOS query evaluator.
 *
 * Constitutional role:
 * - Applies constitutional reasoning to a structured NomosQuery.
 * - Classifies each candidate action as LAWFUL, DEGRADED, or INVALID
 *   based on the declared state, constraints, uncertainties, and objective.
 * - Does NOT use the physical kernel (physics-based verification is for sensor data).
 * - This is semantic constitutional reasoning over declared state.
 */

import OpenAI from "openai";
import { NomosQuery } from "./query_types.js";
import {
  NomosQueryResponse,
  NomosCandidateEvaluation,
  NomosAdjustment,
} from "./query_response_types.js";

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

export class NomosQueryEvaluator {
  public async evaluate(query: NomosQuery): Promise<NomosQueryResponse> {
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
    };
  }
}
