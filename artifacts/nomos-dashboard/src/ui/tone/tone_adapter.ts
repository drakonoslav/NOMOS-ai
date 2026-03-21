/**
 * tone_adapter.ts
 *
 * Converts the NomosState API response into a ToneResolverInput.
 *
 * This is the only place that knows both the API response shape
 * and the tone resolver input shape.
 */

import type { NomosState } from "@workspace/api-client-react";
import type { ToneResolverInput, IdentifiabilityStatus, VerificationStatus, AuthorityState } from "./tone_types";

export function toToneResolverInput(state: NomosState): ToneResolverInput {
  return {
    verificationStatus: state.verificationStatus as VerificationStatus,
    authority: state.authority as AuthorityState,
    epsilonX: state.belief.epsilonX,
    identifiability: state.belief.identifiability as IdentifiabilityStatus,
    modelConfidence: state.modelConfidenceScore,
    robustnessEpsilon: state.decision.robustnessEpsilon,
    robustnessEpsilonMin: state.decision.robustnessEpsilonMin,
    feasibilityOk: state.verification.feasibilityOk,
    robustnessOk: state.verification.robustnessOk,
    observabilityOk: state.verification.observabilityOk,
    identifiabilityOk: state.verification.identifiabilityOk,
    modelOk: state.verification.modelOk,
    adaptationOk: state.verification.adaptationOk,
    reasons: state.verification.reasons ?? [],
    selectedCandidateIds:
      state.decision.selectedPlanId && state.decision.selectedPlanId !== "none"
        ? [state.decision.selectedPlanId]
        : undefined,
  };
}
