/**
 * llm_proposer.ts
 *
 * Constitutional role:
 * Proposal generation only.
 *
 * This module allows an LLM (or any language-based generative system)
 * to propose candidate plans, interpretations, or control sketches,
 * but never to certify them as lawful.
 *
 * The LLM is explicitly subordinate to:
 *   - Ontology / grounding
 *   - Feasibility
 *   - Robustness
 *   - Observability
 *   - Verification
 *
 * Therefore:
 *   - output from this module is always provisional
 *   - all proposals must be screened downstream
 *   - no proposal may directly actuate
 *
 * Source alignment:
 *   - Law I: feasibility precedes optimization
 *   - Law III: estimate is not truth
 *   - synthesis: lower-layer supremacy
 */

import { BeliefState } from "./belief_state.js";
import { CandidatePlan } from "./decision_engine.js";
import { ModelSignature } from "./model_registry.js";
import { FeasibilityInput } from "./feasibility_engine.js";
import { RobustnessConfig } from "./robustness_analyzer.js";

export type ProposalKind =
  | "CONTROL_PLAN"
  | "STATE_HYPOTHESIS"
  | "PARAMETER_HYPOTHESIS"
  | "OBJECTIVE_REFRAME"
  | "RECOVERY_ACTION";

export type ProposalConfidenceBand = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface MissionContext {
  missionId: string;
  objectiveText: string;
  currentTime: number;
  horizonSteps: number;
  controlDim: number;
  stateDim: number;
  resourceDim: number;
}

export interface LLMProposalMetadata {
  proposerId: string;
  modelName: string;
  generatedAt: number;
  promptHash?: string;
  rawPrompt?: string;
  rawResponse?: string;
  notes?: string[];
}

export interface LLMPlanSketch {
  /**
   * A soft proposal for a control sequence.
   * This is not yet a lawful CandidatePlan.
   */
  controlSequence: number[][];
  expectedCost?: number;
  rationale: string;
  assumptions: string[];
}

export interface LLMStateHypothesis {
  xHatCandidate: number[];
  rationale: string;
  assumptions: string[];
}

export interface LLMParameterHypothesis {
  thetaCandidate: Record<string, number>;
  rationale: string;
  assumptions: string[];
}

export interface LLMProposal {
  id: string;
  kind: ProposalKind;
  confidence: ProposalConfidenceBand;

  missionContext: MissionContext;
  beliefSnapshot: BeliefState;
  modelSignature: ModelSignature;

  planSketch?: LLMPlanSketch;
  stateHypothesis?: LLMStateHypothesis;
  parameterHypothesis?: LLMParameterHypothesis;

  provenance: string[];
  assumptions: string[];
  metadata: LLMProposalMetadata;

  /**
   * Constitutional flag:
   * always false on creation.
   * An LLM proposal is never self-authorizing.
   */
  lawful: false;
}

export interface LLMProposerInput {
  missionContext: MissionContext;
  belief: BeliefState;
  modelSignature: ModelSignature;

  /**
   * Optional structured hints injected by the caller
   * from planner heuristics, human operator notes, etc.
   */
  operatorHints?: string[];

  /**
   * Optional raw LLM text response if using a real model upstream.
   * This module can either parse that, or generate mock proposals.
   */
  rawLLMResponse?: string;

  /**
   * If no live LLM is wired yet, enable deterministic fallback proposal generation.
   */
  deterministicFallback?: boolean;
}

export interface ProposalBundle {
  proposals: LLMProposal[];
  rejectedFragments: string[];
  reasons: string[];
}

export interface CandidatePlanFactoryInput {
  proposal: LLMProposal;
  nominalX: number[];
  nominalU: number[];
  nominalR: number[];
  feasibilityInput: FeasibilityInput;
  robustnessConfig: RobustnessConfig;
}

function safeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function deepCloneBelief(belief: BeliefState): BeliefState {
  return {
    ...belief,
    xHat: [...belief.xHat],
    thetaHat: {
      mean: { ...belief.thetaHat.mean },
      variance: belief.thetaHat.variance ? { ...belief.thetaHat.variance } : undefined,
      identifiable: { ...belief.thetaHat.identifiable },
    },
    uncertainty: {
      epsilonX: belief.uncertainty.epsilonX,
      covariance: belief.uncertainty.covariance
        ? belief.uncertainty.covariance.map((row) => [...row])
        : undefined,
      lower: belief.uncertainty.lower ? [...belief.uncertainty.lower] : undefined,
      upper: belief.uncertainty.upper ? [...belief.uncertainty.upper] : undefined,
    },
    provenance: [...belief.provenance],
  };
}

function inferProposalConfidence(raw: string | undefined): ProposalConfidenceBand {
  if (!raw || raw.trim().length === 0) return "UNKNOWN";
  if (raw.includes("uncertain") || raw.includes("maybe") || raw.includes("guess")) return "LOW";
  if (raw.includes("likely") || raw.includes("probably")) return "MEDIUM";
  return "MEDIUM";
}

function parseNumericSequence(text: string): number[][] {
  /**
   * Very small first-pass parser.
   * Accepts patterns like:
   *   [[0.2],[0.3],[0.1]]
   * or flat comma list:
   *   0.2,0.3,0.1
   */
  const trimmed = text.trim();

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      if (parsed.every((x) => Array.isArray(x) && (x as unknown[]).every((y) => typeof y === "number"))) {
        return parsed as number[][];
      }
      if (parsed.every((x) => typeof x === "number")) {
        return (parsed as number[]).map((v) => [v]);
      }
    }
  } catch {
    // fall through to flat parse
  }

  const nums = trimmed
    .split(/[\s,]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));

  if (nums.length > 0) {
    return nums.map((n) => [n]);
  }

  return [];
}

export class LLMProposer {
  /**
   * Primary entrypoint.
   *
   * Returns only provisional proposals.
   * Nothing here is decision-authoritative.
   */
  public propose(input: LLMProposerInput): ProposalBundle {
    const reasons: string[] = [];
    const rejectedFragments: string[] = [];
    const proposals: LLMProposal[] = [];

    if (input.rawLLMResponse && input.rawLLMResponse.trim().length > 0) {
      const parsed = this.parseRawLLMResponse(input);
      proposals.push(...parsed.proposals);
      rejectedFragments.push(...parsed.rejectedFragments);
      reasons.push(...parsed.reasons);
    }

    if (proposals.length === 0 && input.deterministicFallback) {
      proposals.push(...this.buildDeterministicFallbackPlans(input));
      reasons.push("No parseable live LLM proposal found; deterministic fallback generated.");
    }

    if (proposals.length === 0) {
      reasons.push("No proposals generated.");
    }

    return { proposals, rejectedFragments, reasons };
  }

  /**
   * Convert a valid CONTROL_PLAN proposal into a CandidatePlan
   * for screening by the decision layer.
   *
   * Constitutional rule:
   * this function does not certify the proposal.
   * it only packages it for downstream screening.
   */
  public toCandidatePlan(input: CandidatePlanFactoryInput): CandidatePlan {
    const { proposal } = input;

    if (proposal.kind !== "CONTROL_PLAN" || !proposal.planSketch) {
      throw new Error(
        `LLMProposer violation: proposal '${proposal.id}' is not a CONTROL_PLAN and cannot become CandidatePlan.`
      );
    }

    const controlSequence = proposal.planSketch.controlSequence;
    if (!Array.isArray(controlSequence) || controlSequence.length === 0) {
      throw new Error(
        `LLMProposer violation: proposal '${proposal.id}' has empty control sequence.`
      );
    }

    return {
      id: `candidate-from-${proposal.id}`,
      controlSequence,
      expectedCost: proposal.planSketch.expectedCost ?? Number.POSITIVE_INFINITY,
      nominalX: [...input.nominalX],
      nominalU: [...input.nominalU],
      nominalR: [...input.nominalR],
      feasibilityInput: input.feasibilityInput,
      robustnessConfig: input.robustnessConfig,
    };
  }

  /**
   * Parse a raw LLM response into structured proposals.
   *
   * First-pass format accepted:
   *
   * CONTROL_PLAN:
   * [[0.2],[0.3],[0.1]]
   * RATIONALE: ...
   * ASSUMPTIONS: ...
   *
   * STATE_HYPOTHESIS:
   * [0.5, 0.9]
   * RATIONALE: ...
   */
  private parseRawLLMResponse(input: LLMProposerInput): ProposalBundle {
    const raw = input.rawLLMResponse ?? "";
    const reasons: string[] = [];
    const rejectedFragments: string[] = [];
    const proposals: LLMProposal[] = [];

    const blocks = raw
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);

    for (const block of blocks) {
      if (block.startsWith("CONTROL_PLAN:")) {
        const proposal = this.parseControlPlanBlock(block, input);
        if (proposal) proposals.push(proposal);
        else rejectedFragments.push(block);
        continue;
      }

      if (block.startsWith("STATE_HYPOTHESIS:")) {
        const proposal = this.parseStateHypothesisBlock(block, input);
        if (proposal) proposals.push(proposal);
        else rejectedFragments.push(block);
        continue;
      }

      if (block.startsWith("PARAMETER_HYPOTHESIS:")) {
        const proposal = this.parseParameterHypothesisBlock(block, input);
        if (proposal) proposals.push(proposal);
        else rejectedFragments.push(block);
        continue;
      }

      rejectedFragments.push(block);
    }

    if (rejectedFragments.length > 0) {
      reasons.push(
        `${rejectedFragments.length} raw LLM block(s) could not be constitutionally parsed.`
      );
    }

    return { proposals, rejectedFragments, reasons };
  }

  private parseControlPlanBlock(
    block: string,
    input: LLMProposerInput
  ): LLMProposal | null {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return null;

    const sequenceText = lines[1] ?? "";
    const controlSequence = parseNumericSequence(sequenceText);
    if (controlSequence.length === 0) return null;

    const rationaleLine = lines.find((l) => l.startsWith("RATIONALE:"));
    const assumptionsLine = lines.find((l) => l.startsWith("ASSUMPTIONS:"));

    const rationale =
      rationaleLine?.replace("RATIONALE:", "").trim() ?? "LLM-generated control proposal.";
    const assumptions = assumptionsLine
      ? assumptionsLine
          .replace("ASSUMPTIONS:", "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    return {
      id: safeId("llm-plan"),
      kind: "CONTROL_PLAN",
      confidence: inferProposalConfidence(input.rawLLMResponse),
      missionContext: input.missionContext,
      beliefSnapshot: deepCloneBelief(input.belief),
      modelSignature: {
        ...input.modelSignature,
        parameterNames: [...input.modelSignature.parameterNames],
      },
      planSketch: { controlSequence, rationale, assumptions },
      provenance: [
        "llm_raw_parse",
        ...(input.operatorHints ?? []).map((h) => `hint:${h}`),
      ],
      assumptions,
      metadata: {
        proposerId: "llm_proposer",
        modelName: input.modelSignature.id,
        generatedAt: Date.now(),
        rawResponse: input.rawLLMResponse,
      },
      lawful: false,
    };
  }

  private parseStateHypothesisBlock(
    block: string,
    input: LLMProposerInput
  ): LLMProposal | null {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return null;

    const maybeState = parseNumericSequence(lines[1] ?? "").flat();
    if (maybeState.length !== input.missionContext.stateDim) return null;

    const rationaleLine = lines.find((l) => l.startsWith("RATIONALE:"));
    const assumptionsLine = lines.find((l) => l.startsWith("ASSUMPTIONS:"));

    const rationale =
      rationaleLine?.replace("RATIONALE:", "").trim() ?? "LLM-generated state hypothesis.";
    const assumptions = assumptionsLine
      ? assumptionsLine
          .replace("ASSUMPTIONS:", "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    return {
      id: safeId("llm-state"),
      kind: "STATE_HYPOTHESIS",
      confidence: inferProposalConfidence(input.rawLLMResponse),
      missionContext: input.missionContext,
      beliefSnapshot: deepCloneBelief(input.belief),
      modelSignature: {
        ...input.modelSignature,
        parameterNames: [...input.modelSignature.parameterNames],
      },
      stateHypothesis: { xHatCandidate: maybeState, rationale, assumptions },
      provenance: ["llm_raw_parse"],
      assumptions,
      metadata: {
        proposerId: "llm_proposer",
        modelName: input.modelSignature.id,
        generatedAt: Date.now(),
        rawResponse: input.rawLLMResponse,
      },
      lawful: false,
    };
  }

  private parseParameterHypothesisBlock(
    block: string,
    input: LLMProposerInput
  ): LLMProposal | null {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return null;

    try {
      const jsonText = lines[1] ?? "{}";
      const thetaCandidate = JSON.parse(jsonText) as Record<string, number>;
      if (!thetaCandidate || typeof thetaCandidate !== "object") return null;

      const rationaleLine = lines.find((l) => l.startsWith("RATIONALE:"));
      const assumptionsLine = lines.find((l) => l.startsWith("ASSUMPTIONS:"));

      const rationale =
        rationaleLine?.replace("RATIONALE:", "").trim() ?? "LLM-generated parameter hypothesis.";
      const assumptions = assumptionsLine
        ? assumptionsLine
            .replace("ASSUMPTIONS:", "")
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      return {
        id: safeId("llm-param"),
        kind: "PARAMETER_HYPOTHESIS",
        confidence: inferProposalConfidence(input.rawLLMResponse),
        missionContext: input.missionContext,
        beliefSnapshot: deepCloneBelief(input.belief),
        modelSignature: {
          ...input.modelSignature,
          parameterNames: [...input.modelSignature.parameterNames],
        },
        parameterHypothesis: { thetaCandidate, rationale, assumptions },
        provenance: ["llm_raw_parse"],
        assumptions,
        metadata: {
          proposerId: "llm_proposer",
          modelName: input.modelSignature.id,
          generatedAt: Date.now(),
          rawResponse: input.rawLLMResponse,
        },
        lawful: false,
      };
    } catch {
      return null;
    }
  }

  /**
   * Deterministic fallback generation:
   * useful before wiring a live LLM.
   *
   * Generates two proposals — mild and moderate corrective actuation —
   * derived from the current belief state and target position.
   * Robustness screening is handled downstream; not here.
   */
  private buildDeterministicFallbackPlans(input: LLMProposerInput): LLMProposal[] {
    const proposals: LLMProposal[] = [];
    const state = input.belief.xHat;
    const position = state[0] ?? 0;

    const target = 1.0;
    const error = target - position;

    const mild = clamp(0.25 * error, -0.4, 0.4);
    const moderate = clamp(0.5 * error, -0.6, 0.6);

    const baseMeta: LLMProposalMetadata = {
      proposerId: "llm_proposer",
      modelName: input.modelSignature.id,
      generatedAt: Date.now(),
      notes: ["deterministic_fallback"],
    };

    proposals.push({
      id: safeId("llm-plan"),
      kind: "CONTROL_PLAN",
      confidence: "MEDIUM",
      missionContext: input.missionContext,
      beliefSnapshot: deepCloneBelief(input.belief),
      modelSignature: {
        ...input.modelSignature,
        parameterNames: [...input.modelSignature.parameterNames],
      },
      planSketch: {
        controlSequence: Array.from(
          { length: input.missionContext.horizonSteps },
          () => [mild]
        ),
        expectedCost: Math.abs(mild) * input.missionContext.horizonSteps,
        rationale:
          "Mild corrective proposal toward target under conservative actuation.",
        assumptions: [
          "state estimate approximately usable",
          "small corrective authority preferred over aggressive actuation",
        ],
      },
      provenance: ["deterministic_fallback"],
      assumptions: [
        "belief state accepted provisionally",
        "target position assumed to be 1.0",
      ],
      metadata: baseMeta,
      lawful: false,
    });

    proposals.push({
      id: safeId("llm-plan"),
      kind: "CONTROL_PLAN",
      confidence: "LOW",
      missionContext: input.missionContext,
      beliefSnapshot: deepCloneBelief(input.belief),
      modelSignature: {
        ...input.modelSignature,
        parameterNames: [...input.modelSignature.parameterNames],
      },
      planSketch: {
        controlSequence: Array.from(
          { length: input.missionContext.horizonSteps },
          () => [moderate]
        ),
        expectedCost: Math.abs(moderate) * input.missionContext.horizonSteps,
        rationale:
          "More aggressive corrective proposal with potentially lower nominal objective cost.",
        assumptions: [
          "larger actuation might recover faster",
          "robustness must be screened downstream",
        ],
      },
      provenance: ["deterministic_fallback"],
      assumptions: ["higher gain may still be acceptable"],
      metadata: {
        ...baseMeta,
        notes: ["deterministic_fallback", "aggressive_variant"],
      },
      lawful: false,
    });

    return proposals;
  }
}
