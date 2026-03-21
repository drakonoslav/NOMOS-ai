/**
 * scenario_types.ts
 *
 * Dashboard-side type definitions for NOMOS demo scenarios.
 * These describe what each scenario *teaches*, not how it is computed.
 * The computation lives in the constitutional kernel (packages/constitutional-kernel/src/scenarios.ts).
 */

export type DemoScenario = "lawful_baseline" | "degraded_low_margin" | "refused_infeasible";

export type VerificationStatus = "LAWFUL" | "DEGRADED" | "INVALID";
export type AuthorityStatus    = "AUTHORIZED" | "CONSTRAINED" | "REFUSED";
export type ActionOutcome      = "APPLIED" | "DEGRADED_ACTION_APPLIED" | "REFUSED";

export interface ScenarioDescriptor {
  id: DemoScenario;

  label: string;
  shortLabel: string;

  verificationStatus: VerificationStatus;
  authority: AuthorityStatus;
  actionOutcome: ActionOutcome;

  description: string;
  teachingPoint: string;
  epistemicProfile: string[];
}
