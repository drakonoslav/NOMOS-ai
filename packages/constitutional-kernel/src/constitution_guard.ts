/**
 * constitution_guard.ts
 *
 * Constitutional role:
 * Translates written constitutional law into machine-executable guards.
 *
 * This module does not compute feasibility, robustness, or observability.
 * It enforces authority:
 *   - mayAct
 *   - mustDegrade
 *   - mustRefuse
 *
 * Source alignment:
 *   - lower-layer supremacy
 *   - verification supremacy
 *   - unlawful action must not pass merely because it is executable
 */

import { VerificationReport } from "./verification_kernel.js";

export interface ConstitutionDecision {
  mayAct: boolean;
  mustDegrade: boolean;
  mustRefuse: boolean;
  reasons: string[];
}

export function mayAct(v: VerificationReport): boolean {
  return v.status === "LAWFUL";
}

export function mustDegrade(v: VerificationReport): boolean {
  return v.status === "DEGRADED";
}

export function mustRefuse(v: VerificationReport): boolean {
  return v.status === "INVALID";
}

export function decideAuthority(v: VerificationReport): ConstitutionDecision {
  return {
    mayAct: mayAct(v),
    mustDegrade: mustDegrade(v),
    mustRefuse: mustRefuse(v),
    reasons: [...v.reasons],
  };
}

/**
 * Optional hard stop helper:
 * throws if a caller attempts to execute action without constitutional authority.
 */
export function assertMayAct(v: VerificationReport): void {
  if (!mayAct(v)) {
    throw new Error(
      `ConstitutionGuard refusal: action not authorized under status '${v.status}'. Reasons: ${v.reasons.join("; ")}`
    );
  }
}
