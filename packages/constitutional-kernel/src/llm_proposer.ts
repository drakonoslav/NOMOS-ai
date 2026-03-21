/**
 * NOMOS
 * Only the lawful may act.
 *
 * src/llm_proposer.ts
 *
 * Constitutional role: proposal generation only.
 *
 * This module allows an LLM to propose candidate plans and hypotheses.
 * It may never certify feasibility, robustness, observability, or authority.
 *
 * The LLM is subordinate to:
 *   - feasibility_engine   (Law I)
 *   - robustness_analyzer  (Law II)
 *   - verification_kernel  (Laws I–IV)
 *   - constitution_guard   (enforcement)
 *
 * Every proposal created here carries:
 *   lawful: false
 *
 * That is not cosmetic. It is the constitutional fact that
 * proposal is not authorization.
 */

import { BeliefState } from "./belief_state.js";
import { CandidatePlan } from "./decision_engine.js";
import { ModelSignature } from "./model_registry.js";
import { FeasibilityInput } from "./feasibility_engine.js";
import { RobustnessConfig } from "./robustness_analyzer.js";
import {
  generateProposalJSON,
  OpenAIProposal,
} from "./llm/openai_client.js";

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
   * Constitutional invariant.
   * Proposal is not authorization.
   * This field is always false at construction time.
   */
  lawful: false;
}

export interface LLMProposerInput {
  missionContext: MissionContext;
  belief: BeliefState;
  modelSignature: ModelSignature;

  /**
   * Structured operator hints passed to the model as context.
   * These do not override constitutional screening downstream.
   */
  operatorHints?: string[];

  /**
   * If true and the OpenAI call fails (missing key, network error,
   * schema mismatch), emit conservative deterministic fallback proposals.
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

function deepCloneBelief(belief: BeliefState): BeliefState {
  return {
    ...belief,
    xHat: [...belief.xHat],
    thetaHat: {
      mean: { ...belief.thetaHat.mean },
      variance: belief.thetaHat.variance
        ? { ...belief.thetaHat.variance }
        : undefined,
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

function isValidControlSequence(
  seq: unknown,
  expectedControlDim: number,
  maxHorizonSteps: number
): seq is number[][] {
  if (!Array.isArray(seq) || seq.length === 0) return false;
  if (seq.length > maxHorizonSteps) return false;
  return seq.every(
    (step) =>
      Array.isArray(step) &&
      step.length === expectedControlDim &&
      step.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

function inferExpectedCost(controlSequence?: number[][]): number | undefined {
  if (!controlSequence || controlSequence.length === 0) return undefined;
  return controlSequence.reduce((sum, step) => {
    return sum + step.reduce((s, v) => s + Math.abs(v), 0);
  }, 0);
}

export class LLMProposer {
  /**
   * Primary async entrypoint.
   *
   * Calls OpenAI first.
   * If the call fails (missing key, network error, schema mismatch)
   * and deterministicFallback is true, emits conservative deterministic proposals.
   *
   * Constitutional rule:
   * This method proposes. It does not certify, screen, or authorize.
   */
  public async propose(input: LLMProposerInput): Promise<ProposalBundle> {
    const reasons: string[] = [];
    const rejectedFragments: string[] = [];
    const proposals: LLMProposal[] = [];

    try {
      const bundle = await generateProposalJSON({
        missionContext: input.missionContext,
        belief: input.belief,
        modelSignature: input.modelSignature,
        operatorHints: input.operatorHints,
      });

      for (const raw of bundle.proposals) {
        const mapped = this.mapOpenAIProposal(raw, input);
        if (mapped) {
          proposals.push(mapped);
        } else {
          rejectedFragments.push(JSON.stringify(raw));
        }
      }

      if (rejectedFragments.length > 0) {
        reasons.push(
          `${rejectedFragments.length} OpenAI proposal fragment(s) rejected during constitutional mapping.`
        );
      }

      if (proposals.length > 0) {
        reasons.push(`OpenAI returned ${proposals.length} proposal(s) — accepted provisionally.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reasons.push(`OpenAI call failed: ${msg}`);
    }

    if (proposals.length === 0 && input.deterministicFallback) {
      proposals.push(...this.buildDeterministicFallbackPlans(input));
      reasons.push(
        "No usable OpenAI proposals; deterministic fallback generated."
      );
    }

    if (proposals.length === 0) {
      reasons.push("No proposals generated.");
    }

    return { proposals, rejectedFragments, reasons };
  }

  /**
   * Convert a constitutionally non-authoritative CONTROL_PLAN proposal
   * into a CandidatePlan for downstream screening by the decision engine.
   *
   * This method does not certify the plan.
   * Certification happens in decision_engine + verification_kernel.
   */
  public toCandidatePlan(input: CandidatePlanFactoryInput): CandidatePlan {
    const { proposal } = input;

    if (proposal.kind !== "CONTROL_PLAN" || !proposal.planSketch) {
      throw new Error(
        `LLMProposer violation: '${proposal.id}' is not a CONTROL_PLAN and cannot become a CandidatePlan.`
      );
    }

    const { controlSequence } = proposal.planSketch;
    if (!Array.isArray(controlSequence) || controlSequence.length === 0) {
      throw new Error(
        `LLMProposer violation: '${proposal.id}' has an empty controlSequence.`
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
   * Map a raw OpenAI proposal object into a typed LLMProposal.
   *
   * Returns null if the proposal fails constitutional shape validation
   * (e.g. controlSequence has wrong dimension, xHatCandidate wrong length).
   */
  private mapOpenAIProposal(
    proposal: OpenAIProposal,
    input: LLMProposerInput
  ): LLMProposal | null {
    const base = {
      id: safeId("llm"),
      confidence: proposal.confidence,
      missionContext: input.missionContext,
      beliefSnapshot: deepCloneBelief(input.belief),
      modelSignature: {
        ...input.modelSignature,
        parameterNames: [...input.modelSignature.parameterNames],
      },
      provenance: [
        "openai_structured_output",
        ...(input.operatorHints ?? []).map((h) => `hint:${h}`),
      ],
      assumptions: [...proposal.assumptions],
      metadata: {
        proposerId: "llm_proposer",
        modelName: process.env.OPENAI_MODEL ?? "gpt-4o",
        generatedAt: Date.now(),
        notes: ["openai_structured_output"],
      } as LLMProposalMetadata,
      lawful: false as const,
    };

    if (proposal.kind === "CONTROL_PLAN") {
      if (
        !isValidControlSequence(
          proposal.controlSequence,
          input.missionContext.controlDim,
          input.missionContext.horizonSteps
        )
      ) {
        return null;
      }
      return {
        ...base,
        kind: "CONTROL_PLAN",
        planSketch: {
          controlSequence: proposal.controlSequence!,
          expectedCost: inferExpectedCost(proposal.controlSequence),
          rationale: proposal.rationale,
          assumptions: [...proposal.assumptions],
        },
      };
    }

    if (proposal.kind === "STATE_HYPOTHESIS") {
      if (
        !proposal.xHatCandidate ||
        proposal.xHatCandidate.length !== input.missionContext.stateDim ||
        proposal.xHatCandidate.some((v) => !Number.isFinite(v))
      ) {
        return null;
      }
      return {
        ...base,
        kind: "STATE_HYPOTHESIS",
        stateHypothesis: {
          xHatCandidate: [...proposal.xHatCandidate],
          rationale: proposal.rationale,
          assumptions: [...proposal.assumptions],
        },
      };
    }

    if (proposal.kind === "PARAMETER_HYPOTHESIS") {
      if (!proposal.thetaCandidate || typeof proposal.thetaCandidate !== "object") {
        return null;
      }
      return {
        ...base,
        kind: "PARAMETER_HYPOTHESIS",
        parameterHypothesis: {
          thetaCandidate: { ...proposal.thetaCandidate },
          rationale: proposal.rationale,
          assumptions: [...proposal.assumptions],
        },
      };
    }

    if (proposal.kind === "RECOVERY_ACTION" || proposal.kind === "OBJECTIVE_REFRAME") {
      return { ...base, kind: proposal.kind };
    }

    return null;
  }

  /**
   * Deterministic fallback proposals.
   *
   * These are generated when:
   * - OPENAI_API_KEY is not set
   * - the OpenAI call fails at network or schema level
   * - the model returns no valid CONTROL_PLAN proposals
   *
   * They are conservative by design:
   * mild correction and moderate correction, both clamped.
   * Downstream robustness screening still applies.
   */
  private buildDeterministicFallbackPlans(input: LLMProposerInput): LLMProposal[] {
    const position = input.belief.xHat[0] ?? 0;
    const error = 1.0 - position;

    const mild = Math.max(-0.4, Math.min(0.4, 0.25 * error));
    const moderate = Math.max(-0.6, Math.min(0.6, 0.5 * error));

    const baseMeta: LLMProposalMetadata = {
      proposerId: "llm_proposer",
      modelName: "deterministic_fallback",
      generatedAt: Date.now(),
      notes: ["deterministic_fallback"],
    };

    const makeProposal = (
      gain: number,
      confidence: ProposalConfidenceBand,
      rationale: string,
      extraNotes: string[]
    ): LLMProposal => ({
      id: safeId("llm-plan"),
      kind: "CONTROL_PLAN",
      confidence,
      missionContext: input.missionContext,
      beliefSnapshot: deepCloneBelief(input.belief),
      modelSignature: {
        ...input.modelSignature,
        parameterNames: [...input.modelSignature.parameterNames],
      },
      planSketch: {
        controlSequence: Array.from(
          { length: input.missionContext.horizonSteps },
          () => [gain]
        ),
        expectedCost: Math.abs(gain) * input.missionContext.horizonSteps,
        rationale,
        assumptions: [
          "state estimate provisionally accepted",
          "target position assumed to be 1.0",
        ],
      },
      provenance: ["deterministic_fallback"],
      assumptions: ["belief state accepted provisionally"],
      metadata: {
        ...baseMeta,
        notes: ["deterministic_fallback", ...extraNotes],
      },
      lawful: false,
    });

    return [
      makeProposal(
        mild,
        "MEDIUM",
        "Mild corrective proposal toward target under conservative actuation.",
        ["mild_variant"]
      ),
      makeProposal(
        moderate,
        "LOW",
        "More aggressive corrective proposal — robustness screening required downstream.",
        ["moderate_variant"]
      ),
    ];
  }
}
