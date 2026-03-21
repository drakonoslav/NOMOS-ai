/**
 * tone_resolver.ts
 *
 * Maps epistemic state to a tone level.
 *
 * TERSE    — highest certainty or hard invalidity. Minimal language.
 * CONCISE  — good certainty, lawful, light qualification.
 * EXPLAINED — moderate uncertainty, degraded, needs context.
 * EXPANDED — high uncertainty, partial identifiability, model degradation.
 *
 * This is NOT a stylistic choice. Tone is a function of epistemic resolution.
 */

import { ToneLevel, ToneResolverInput } from "./tone_types";

export function resolveToneLevel(input: ToneResolverInput): ToneLevel {
  const {
    verificationStatus,
    epsilonX,
    identifiability,
    modelConfidence,
    robustnessEpsilon,
    robustnessEpsilonMin,
    feasibilityOk,
    robustnessOk,
    observabilityOk,
    modelOk,
    adaptationOk,
  } = input;

  // INVALID states are brief and final — no hedging, no elaboration.
  if (verificationStatus === "INVALID") {
    return "TERSE";
  }

  // Strong lawful state: highly compressed language.
  // All checks pass and epistemic conditions are excellent.
  const strongLawful =
    verificationStatus === "LAWFUL" &&
    epsilonX <= 0.05 &&
    identifiability === "FULL" &&
    modelConfidence >= 0.85 &&
    (robustnessEpsilon === undefined ||
      robustnessEpsilonMin === undefined ||
      robustnessEpsilon >= robustnessEpsilonMin * 1.5);

  if (strongLawful) {
    return "TERSE";
  }

  // Standard lawful state: concise with light qualification.
  const stableLawful =
    verificationStatus === "LAWFUL" &&
    epsilonX <= 0.10 &&
    identifiability === "FULL" &&
    modelConfidence >= 0.65;

  if (stableLawful) {
    return "CONCISE";
  }

  // High uncertainty: clearly state epistemic limits.
  const highUncertainty =
    identifiability === "NONE" ||
    epsilonX > 0.20 ||
    modelConfidence < 0.40 ||
    observabilityOk === false ||
    feasibilityOk === false;

  if (highUncertainty) {
    return "EXPANDED";
  }

  // Moderate uncertainty: explain briefly.
  const moderatelyUncertain =
    verificationStatus === "DEGRADED" ||
    identifiability === "PARTIAL" ||
    modelConfidence < 0.65 ||
    epsilonX > 0.10 ||
    robustnessOk === false ||
    modelOk === false ||
    adaptationOk === false;

  if (moderatelyUncertain) {
    return "EXPLAINED";
  }

  return "CONCISE";
}
