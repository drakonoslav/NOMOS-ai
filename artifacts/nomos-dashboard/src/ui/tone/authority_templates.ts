/**
 * authority_templates.ts
 *
 * Authority wording templates.
 *
 * Verification status and action authority are related but not identical.
 * Authority describes what the constitution permits the system to do;
 * verification status describes what the constitutional check found.
 *
 * Design rule: calm authority. Not alarmist, not apologetic.
 */

import { ToneLevel } from "./tone_types";

export type AuthorityState = "AUTHORIZED" | "CONSTRAINED" | "REFUSED";

export interface AuthorityMessage {
  label: AuthorityState;
  summary: string;
}

export function buildAuthorityMessage(
  authority: AuthorityState,
  level: ToneLevel
): AuthorityMessage {
  if (authority === "AUTHORIZED") {
    return {
      label: "AUTHORIZED",
      summary:
        level === "TERSE"
          ? "Execution permitted."
          : "Execution permitted under current verified conditions.",
    };
  }

  if (authority === "CONSTRAINED") {
    return {
      label: "CONSTRAINED",
      summary:
        level === "EXPANDED"
          ? "Only constrained action is permitted under current uncertainty."
          : "Constrained action permitted.",
    };
  }

  // REFUSED
  return {
    label: "REFUSED",
    summary:
      level === "TERSE"
        ? "Execution denied."
        : "Execution denied. Legal action conditions are not met.",
  };
}
