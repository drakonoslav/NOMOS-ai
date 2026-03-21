/**
 * tone_adapter.ts
 *
 * Converts the NomosState API response into a ToneResolverInput.
 *
 * This is the only place that knows both the API response shape
 * and the tone resolver input shape. Components only need to call
 * toToneResolverInput(state) to get the normalized input.
 */

import type { NomosState } from "@workspace/api-client-react";
import type { ToneResolverInput, IdentifiabilityStatus, VerificationStatus } from "./tone_types";

export function toToneResolverInput(state: NomosState): ToneResolverInput {
  return {
    verificationStatus: state.verificationStatus as VerificationStatus,
    epsilonX: state.belief.epsilonX,
    identifiability: state.belief.identifiability as IdentifiabilityStatus,
    modelConfidence: state.modelConfidenceScore,
    robustnessEpsilon: state.decision.robustnessEpsilon,
    robustnessEpsilonMin: state.decision.robustnessEpsilonMin,
    feasibilityOk: state.verification.feasibilityOk,
    robustnessOk: state.verification.robustnessOk,
    observabilityOk: state.verification.observabilityOk,
    modelOk: state.verification.modelOk,
    adaptationOk: state.verification.adaptationOk,
  };
}
