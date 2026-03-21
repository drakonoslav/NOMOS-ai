/**
 * refused_infeasible.ts
 *
 * Scenario C — Refused Infeasible
 *
 * Energy state at the feasibility boundary. Any control sequence exhausts it
 * below the declared margin. All candidate plans fail feasibility.
 * Verification returns INVALID. Authority is REFUSED. Action is blocked.
 *
 * NOMOS does not speculate about whether action might be possible.
 * The law says no. The system stops.
 */

import type { ScenarioDescriptor } from "./scenario_types";

export const refused_infeasible: ScenarioDescriptor = {
  id: "refused_infeasible",
  label: "Refused — Infeasible",
  shortLabel: "REFUSED",

  verificationStatus: "INVALID",
  authority: "REFUSED",
  actionOutcome: "REFUSED",

  description:
    "Energy state at feasibility boundary. No candidate plan survives constraint screening. " +
    "Feasibility Law I violated. Action blocked.",

  teachingPoint:
    "NOMOS can refuse decisively. " +
    "The law says no. The system does not speculate.",

  epistemicProfile: [
    "Energy state x[1] = 0.20 — at the feasibility threshold",
    "After any control sequence: x[1] depletes below margin",
    "All candidate plans fail energy_positive_margin constraint",
    "Feasibility violation → INVALID → REFUSED",
  ],
};
