/**
 * src/llm/openai_client.ts
 *
 * NOMOS — server-side OpenAI transport layer.
 *
 * Constitutional role:
 * - Transport only.
 * - Obtains structured proposals from a model.
 * - Does NOT certify feasibility, robustness, observability, or authority.
 * - Returns a raw bundle that llm_proposer.ts maps into NOMOS proposal objects.
 *
 * Implementation notes:
 * - Official OpenAI TypeScript SDK.
 * - Responses API (recommended for new projects).
 * - Structured Outputs via JSON Schema with strict: true.
 * - API key read from process.env only — never from client code.
 */

import OpenAI from "openai";

export type ProposalKind =
  | "CONTROL_PLAN"
  | "STATE_HYPOTHESIS"
  | "PARAMETER_HYPOTHESIS"
  | "RECOVERY_ACTION"
  | "OBJECTIVE_REFRAME";

export type ProposalConfidenceBand = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface OpenAIProposal {
  kind: ProposalKind;
  confidence: ProposalConfidenceBand;
  rationale: string;
  assumptions: string[];
  controlSequence?: number[][];
  xHatCandidate?: number[];
  thetaCandidate?: Record<string, number>;
}

export interface OpenAIProposalBundle {
  proposals: OpenAIProposal[];
}

export interface GenerateProposalJSONInput {
  missionContext: unknown;
  belief: unknown;
  modelSignature: unknown;
  operatorHints?: string[];
}

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Add it to Replit Secrets or set it as an environment variable."
    );
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey });
  }
  return cachedClient;
}

/**
 * JSON Schema for structured output.
 *
 * - CONTROL_PLAN proposals include controlSequence
 * - STATE_HYPOTHESIS proposals include xHatCandidate
 * - PARAMETER_HYPOTHESIS proposals include thetaCandidate
 * - All proposals must include kind, confidence, rationale, assumptions
 *
 * strict: true enforces the schema exactly — no extra fields.
 */
const NOMOS_PROPOSAL_BUNDLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: {
            type: "string",
            enum: [
              "CONTROL_PLAN",
              "STATE_HYPOTHESIS",
              "PARAMETER_HYPOTHESIS",
              "RECOVERY_ACTION",
              "OBJECTIVE_REFRAME",
            ],
          },
          confidence: {
            type: "string",
            enum: ["HIGH", "MEDIUM", "LOW", "UNKNOWN"],
          },
          rationale: { type: "string" },
          assumptions: {
            type: "array",
            items: { type: "string" },
          },
          controlSequence: {
            type: "array",
            items: {
              type: "array",
              items: { type: "number" },
            },
          },
          xHatCandidate: {
            type: "array",
            items: { type: "number" },
          },
          thetaCandidate: {
            type: "object",
            additionalProperties: { type: "number" },
          },
        },
        required: ["kind", "confidence", "rationale", "assumptions"],
      },
    },
  },
  required: ["proposals"],
} as const;

const SYSTEM_PROMPT = [
  "You are the LLM proposer inside NOMOS.",
  "You may propose candidate plans and hypotheses only.",
  "You are NOT the verifier, decision engine, constitution guard, or authority.",
  "Never claim that a proposal is feasible, robust, lawful, verified, or authorized.",
  "Prefer conservative, bounded, interpretable proposals.",
  "For CONTROL_PLAN proposals: controlSequence must be an array of steps,",
  "each step an array of numbers matching controlDim from the mission context.",
  "Keep control values between -1.0 and 1.0.",
  "Return only schema-conforming structured output.",
].join(" ");

export async function generateProposalJSON(
  input: GenerateProposalJSONInput
): Promise<OpenAIProposalBundle> {
  const client = getClient();

  const userPayload = {
    missionContext: input.missionContext,
    belief: input.belief,
    modelSignature: input.modelSignature,
    operatorHints: input.operatorHints ?? [],
  };

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "nomos_proposal_bundle",
        schema: NOMOS_PROPOSAL_BUNDLE_SCHEMA,
        strict: true,
      },
    },
  });

  const raw = response.output_text;
  if (!raw || raw.trim().length === 0) {
    throw new Error("OpenAI Responses API returned empty output.");
  }

  const parsed = JSON.parse(raw) as OpenAIProposalBundle;

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.proposals)) {
    throw new Error("OpenAI structured output did not match expected bundle shape.");
  }

  return parsed;
}
