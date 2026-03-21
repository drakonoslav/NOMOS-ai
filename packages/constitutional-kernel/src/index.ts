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

export type {
  NomosQuery,
  NomosStateBlock,
  NomosCandidateBlock,
  NomosObjectiveBlock,
  ParserConfidence,
  SubmissionCompleteness,
} from "./query/query_types.js";

export type {
  NomosQueryResponse,
  NomosCandidateEvaluation,
  NomosAdjustment,
  NomosActionClassification,
} from "./query/query_response_types.js";

export { HybridNomosQueryParser } from "./query/query_parser.js";
export type { HybridQueryParserInput } from "./query/query_parser.js";
export { NomosQueryEvaluator, RuleBasedQueryEvaluator } from "./query/query_evaluator.js";
export { evaluateConstraint, evaluateCandidateAgainstConstraints } from "./query/constraint_evaluator.js";
export type { ConstraintEvalResult, CandidateConstraintSummary } from "./query/constraint_evaluator.js";

export { evaluateQueryCandidates } from "./evaluation/candidate_scoring.js";
export { normalizeConstraint } from "./evaluation/constraint_normalizer.js";
export { normalizeCandidate } from "./evaluation/candidate_normalizer.js";
export { evaluateDeterministically } from "./evaluation/deterministic_matcher.js";
export type {
  CandidateStatus,
  NormalizedConstraint,
  NormalizedCandidate,
  CandidateEvaluation,
  EvaluationResult,
} from "./evaluation/eval_types.js";
