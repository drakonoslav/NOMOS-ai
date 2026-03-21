/**
 * llm_query_parser.ts
 *
 * LLM-assisted NOMOS query extractor.
 *
 * Constitutional role:
 * - Converts natural language into structured NomosQuery.
 * - Does NOT assign lawfulness, authority, or constitutional status.
 * - Does NOT replace verification_kernel, decision_engine, or constitution_guard.
 * - parserConfidence is extraction quality, not lawfulness.
 *
 * Implementation:
 * - OpenAI Responses API with Structured Outputs / JSON Schema.
 * - API key from process.env only.
 */

import OpenAI from "openai";
import {
  NomosQuery,
  ParserConfidence,
  SubmissionCompleteness,
} from "./query_types.js";

export interface LLMQueryParserInput {
  rawInput: string;
  operatorHints?: string[];
}

interface LLMExtractedNomosQuery {
  state: {
    description: string;
    facts: string[];
    constraints: string[];
    uncertainties: string[];
  };
  candidates: {
    id: string;
    description: string;
  }[];
  objective?: {
    description: string;
  };
  parserConfidence: ParserConfidence;
  completeness: SubmissionCompleteness;
  notes: string[];
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "Missing OPENAI_API_KEY. Add it to Replit Secrets."
    );
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return cachedClient;
}

const NOMOS_QUERY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    state: {
      type: "object",
      additionalProperties: false,
      properties: {
        description: { type: "string" },
        facts: { type: "array", items: { type: "string" } },
        constraints: { type: "array", items: { type: "string" } },
        uncertainties: { type: "array", items: { type: "string" } },
      },
      required: ["description", "facts", "constraints", "uncertainties"],
    },
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          description: { type: "string" },
        },
        required: ["id", "description"],
      },
    },
    objective: {
      type: "object",
      additionalProperties: false,
      properties: {
        description: { type: "string" },
      },
      required: ["description"],
    },
    parserConfidence: {
      type: "string",
      enum: ["HIGH", "MEDIUM", "LOW"],
    },
    completeness: {
      type: "string",
      enum: ["COMPLETE", "PARTIAL", "INSUFFICIENT"],
    },
    notes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["state", "candidates", "parserConfidence", "completeness", "notes"],
} as const;

const SYSTEM_PROMPT = [
  "You are the NOMOS query extractor.",
  "Convert natural language into a structured NomosQuery.",
  "You are NOT the decision engine, verifier, or constitution guard.",
  "Do NOT determine whether anything is lawful, degraded, or invalid.",
  "Only extract: current state, constraints, uncertainties, candidate actions, and objective.",
  "Prefer explicit extraction over speculation.",
  "If something is missing, leave it empty and note the absence in 'notes'.",
  "Assign parserConfidence based on how clearly structured the input is.",
  "Assign completeness: COMPLETE if state+constraints+candidates+objective all present,",
  "PARTIAL if state+candidates present but missing constraints or objective,",
  "INSUFFICIENT if the submission is too vague to evaluate.",
  "Return only schema-valid structured output.",
].join(" ");

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function normalizeCandidate(
  c: { id: string; description: string },
  idx: number
): { id: string; description: string } {
  return {
    id: c.id?.trim() || String.fromCharCode(65 + idx),
    description: c.description.trim(),
  };
}

export class LLMQueryParser {
  public async parse(input: LLMQueryParserInput): Promise<NomosQuery> {
    const client = getClient();

    const response = await client.responses.create({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            rawInput: input.rawInput,
            operatorHints: input.operatorHints ?? [],
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "nomos_query_extraction",
          schema: NOMOS_QUERY_SCHEMA,
          strict: true,
        },
      },
    });

    const raw = response.output_text;
    if (!raw || raw.trim().length === 0) {
      throw new Error("LLMQueryParser received empty structured output.");
    }

    const extracted = JSON.parse(raw) as LLMExtractedNomosQuery;

    const candidates = extracted.candidates
      .filter((c) => c.description?.trim())
      .map((c, i) => normalizeCandidate(c, i));

    const objective =
      extracted.objective && extracted.objective.description.trim()
        ? { description: extracted.objective.description.trim() }
        : undefined;

    return {
      rawInput: input.rawInput,
      state: {
        description: extracted.state.description.trim(),
        facts: dedupe(extracted.state.facts),
        constraints: dedupe(extracted.state.constraints),
        uncertainties: dedupe(extracted.state.uncertainties),
      },
      candidates,
      objective,
      parserConfidence: extracted.parserConfidence,
      completeness: extracted.completeness,
      notes: dedupe(extracted.notes),
    };
  }
}
