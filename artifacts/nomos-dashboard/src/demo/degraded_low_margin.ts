/**
 * degraded_low_margin.ts
 *
 * Scenario B — Degraded Low Margin
 *
 * Feasibility intact. Model degraded. Observability insufficient.
 * System continues under constrained authority — DEGRADED_ACTION_APPLIED.
 *
 * This is the most important scenario. It demonstrates that NOMOS does not
 * shut down at the first sign of stress. It degrades gracefully, acts conservatively,
 * and records the limitation in the audit.
 */

import type { ScenarioDescriptor } from "./scenario_types";

export const degraded_low_margin: ScenarioDescriptor = {
  id: "degraded_low_margin",
  label: "Degraded — Low Margin",
  shortLabel: "DEGRADED",

  verificationStatus: "DEGRADED",
  authority: "CONSTRAINED",
  actionOutcome: "DEGRADED_ACTION_APPLIED",

  description:
    "Model degraded (residual ratio > 1). Observability insufficient (Fisher min < required). " +
    "Feasibility and robustness intact. Constrained authority — system acts under reduced margin.",

  teachingPoint:
    "NOMOS can continue under stress without pretending all is well. " +
    "Reality still permits action, but not full authority.",

  epistemicProfile: [
    "Belief uncertainty εx ≈ 0.15 — elevated above lawful threshold",
    "Innovation norm = 0.12, epsilonZ = 0.04 — model confidence ≈ 0.56",
    "Fisher information below required minimum — PARTIAL identifiability",
    "Feasibility and robustness satisfied — DEGRADED, not INVALID",
  ],
};
