/**
 * tone_types.ts
 *
 * Types for the NOMOS tone resolver.
 *
 * Tone is a function of epistemic state, not personality.
 *
 * High certainty → compressed language (TERSE)
 * Low certainty  → expanded language (EXPANDED)
 */

export type VerificationStatus   = "LAWFUL" | "DEGRADED" | "INVALID";
export type AuthorityState       = "AUTHORIZED" | "CONSTRAINED" | "REFUSED";
export type IdentifiabilityStatus = "FULL" | "PARTIAL" | "NONE";

export type ToneLevel = "TERSE" | "CONCISE" | "EXPLAINED" | "EXPANDED";

export interface ToneResolverInput {
  verificationStatus: VerificationStatus;
  authority: AuthorityState;

  epsilonX: number;
  identifiability: IdentifiabilityStatus;
  modelConfidence: number;

  robustnessEpsilon?: number;
  robustnessEpsilonMin?: number;

  feasibilityOk?: boolean;
  robustnessOk?: boolean;
  observabilityOk?: boolean;
  identifiabilityOk?: boolean;
  modelOk?: boolean;
  adaptationOk?: boolean;

  selectedCandidateIds?: string[];
  rejectedCandidateIds?: string[];

  /**
   * Raw verification reasons from kernel.
   * Used as evidence inputs; presentation still passes through controlled formatting.
   */
  reasons?: string[];

  /**
   * Optional named constraint at or near boundary.
   */
  activeConstraint?: string;
  decisiveVariable?: string;

  /**
   * Optional recovery adjustments computed elsewhere.
   */
  adjustments?: string[];

  /**
   * Optional failure forecast from the prediction engine.
   * Injected into body only when confidence is moderate or high.
   */
  prediction?: {
    nextFailure: string;
    confidence: "low" | "moderate" | "high";
    driver: string;
  };
}

export interface ToneMessage {
  status: VerificationStatus;
  authority: AuthorityState;
  tone: ToneLevel;

  title: string;
  summary: string;

  /**
   * Controlled body lines — always emitted from approved templates.
   */
  body: string[];

  /**
   * Structured evidence list for UI panels.
   */
  findings: string[];

  /**
   * Optional next-step adjustments.
   */
  adjustments: string[];
}
