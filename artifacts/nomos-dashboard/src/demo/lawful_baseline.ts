/**
 * lawful_baseline.ts
 *
 * Scenario A — Lawful Baseline
 *
 * All four constitutional laws satisfied.
 * Clean epistemic state: low uncertainty, full identifiability, high model confidence.
 * The system is authorized to act at full authority.
 */

import type { ScenarioDescriptor } from "./scenario_types";

export const lawful_baseline: ScenarioDescriptor = {
  id: "lawful_baseline",
  label: "Lawful Baseline",
  shortLabel: "LAWFUL",

  verificationStatus: "LAWFUL",
  authority: "AUTHORIZED",
  actionOutcome: "APPLIED",

  description:
    "Clean epistemic state. Low uncertainty, full identifiability, model confidence = 1.0. " +
    "All four constitutional laws satisfied.",

  teachingPoint:
    "NOMOS can permit cleanly when declared reality is sufficient.",

  epistemicProfile: [
    "Belief uncertainty εx ≈ 0.03 — within observer requirement",
    "Innovation norm = 0 — model confidence = 1.0000",
    "Full identifiability — all parameters observable",
    "Feasibility, robustness, observability, and adaptation all satisfied",
  ],
};
