/**
 * index.ts
 *
 * Package barrel for NOMOS.
 * Only the lawful may act.
 *
 * A constitutional system governing lawful action under reality.
 * Implements Laws I–IV: Feasibility, Robustness, Observability, Adaptive Correction.
 *
 * Law.  Truth.  Constraint.
 */

export * from "./belief_state.js";
export * from "./observer.js";
export * from "./feasibility_engine.js";
export { RobustnessAnalyzer } from "./robustness_analyzer.js";
export type { RobustnessReport, RobustnessConfig, CandidatePlan as BaseCandidatePlan } from "./robustness_analyzer.js";
export * from "./verification_kernel.js";

export * from "./model_registry.js";
export * from "./decision_engine.js";
export * from "./constitution_guard.js";
export * from "./audit_log.js";

export * from "./llm_proposer.js";
export type {
  OpenAIProposal,
  OpenAIProposalBundle,
  GenerateProposalJSONInput,
} from "./llm/openai_client.js";
export { generateProposalJSON } from "./llm/openai_client.js";

export { runKernelOnce } from "./kernel_runner.js";
export type { KernelRunResult, KernelProposalResult, KernelVerificationResult, KernelBeliefResult, KernelModelResult, KernelDecisionResult, KernelAuditResult } from "./kernel_runner.js";
