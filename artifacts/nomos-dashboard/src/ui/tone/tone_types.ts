/**
 * tone_types.ts
 *
 * Normalized input shape for the NOMOS tone resolver.
 * Tone is a function of epistemic state, not personality.
 *
 * High certainty → compressed language (TERSE)
 * Low certainty  → expanded language (EXPANDED)
 */

export type VerificationStatus = "LAWFUL" | "DEGRADED" | "INVALID";
export type IdentifiabilityStatus = "FULL" | "PARTIAL" | "NONE";

export type ToneLevel = "TERSE" | "CONCISE" | "EXPLAINED" | "EXPANDED";

export interface ToneResolverInput {
  verificationStatus: VerificationStatus;
  epsilonX: number;
  identifiability: IdentifiabilityStatus;
  modelConfidence: number;
  robustnessEpsilon?: number;
  robustnessEpsilonMin?: number;
  feasibilityOk?: boolean;
  robustnessOk?: boolean;
  observabilityOk?: boolean;
  modelOk?: boolean;
  adaptationOk?: boolean;
}
