/**
 * src/ui/demo/scenario_builder.ts
 *
 * Deterministic dashboard scenario states with pre-built ToneResolverInput.
 *
 * Purpose:
 *   - Provide immediate, stable demo states for UI components
 *   - Render LAWFUL / DEGRADED / INVALID without requiring live runtime execution
 *   - Feed directly into tone_resolver-driven components (StatusCard, VerificationSummary)
 *
 * Separation note:
 *   - src/demo/scenario_builder.ts  → descriptor layer (labels, teaching points)
 *   - src/ui/demo/scenario_builder.ts → tone-input layer (pre-built ToneResolverInput)
 */

import type { ToneResolverInput } from "../tone/tone_types";

export type DemoScenario =
  | "lawful_baseline"
  | "degraded_low_margin"
  | "refused_infeasible";

export interface DashboardMetricState {
  selectedPlanId?: string;
  proposalCount: number;
  actionOutcome: "APPLIED" | "DEGRADED_ACTION_APPLIED" | "REFUSED";
}

export interface DashboardScenarioState {
  scenario: DemoScenario;
  label: string;
  description: string;
  toneInput: ToneResolverInput;
  metrics: DashboardMetricState;
}

export function buildScenarioState(scenario: DemoScenario): DashboardScenarioState {
  switch (scenario) {
    case "lawful_baseline":     return lawfulBaselineScenario();
    case "degraded_low_margin": return degradedLowMarginScenario();
    case "refused_infeasible":  return refusedInfeasibleScenario();
  }
}

export function buildAllScenarioStates(): DashboardScenarioState[] {
  return [
    buildScenarioState("lawful_baseline"),
    buildScenarioState("degraded_low_margin"),
    buildScenarioState("refused_infeasible"),
  ];
}

function lawfulBaselineScenario(): DashboardScenarioState {
  return {
    scenario: "lawful_baseline",
    label: "Lawful Baseline",
    description: "All primary legality conditions hold with comfortable margin.",
    toneInput: {
      verificationStatus: "LAWFUL",
      authority: "AUTHORIZED",
      epsilonX: 0.03,
      identifiability: "FULL",
      modelConfidence: 0.92,
      robustnessEpsilon: 0.12,
      robustnessEpsilonMin: 0.03,
      feasibilityOk: true,
      robustnessOk: true,
      observabilityOk: true,
      identifiabilityOk: true,
      modelOk: true,
      adaptationOk: true,
      selectedCandidateIds: ["A"],
      rejectedCandidateIds: ["B"],
      activeConstraint: "none",
      decisiveVariable: "robustness margin",
      reasons: [
        "Feasibility satisfied.",
        "Robustness condition satisfied.",
        "Observability condition satisfied.",
        "Model adequacy satisfied.",
      ],
      adjustments: [],
    },
    metrics: {
      selectedPlanId: "candidate-A",
      proposalCount: 2,
      actionOutcome: "APPLIED",
    },
  };
}

function degradedLowMarginScenario(): DashboardScenarioState {
  return {
    scenario: "degraded_low_margin",
    label: "Degraded Low Margin",
    description:
      "Feasibility holds, but operating margin is reduced and only constrained action is appropriate.",
    toneInput: {
      verificationStatus: "DEGRADED",
      authority: "CONSTRAINED",
      epsilonX: 0.14,
      identifiability: "PARTIAL",
      modelConfidence: 0.61,
      robustnessEpsilon: 0.035,
      robustnessEpsilonMin: 0.03,
      feasibilityOk: true,
      robustnessOk: false,
      observabilityOk: true,
      identifiabilityOk: true,
      modelOk: false,
      adaptationOk: true,
      selectedCandidateIds: ["B"],
      rejectedCandidateIds: ["A", "C"],
      activeConstraint: "resource availability",
      decisiveVariable: "model confidence",
      reasons: [
        "Feasibility satisfied.",
        "Robustness condition below threshold.",
        "Model adequacy below threshold.",
        "Constraint margin reduced at resource availability.",
      ],
      adjustments: [
        "Increase resource margin",
        "Reduce control aggressiveness",
      ],
    },
    metrics: {
      selectedPlanId: "candidate-B",
      proposalCount: 3,
      actionOutcome: "DEGRADED_ACTION_APPLIED",
    },
  };
}

function refusedInfeasibleScenario(): DashboardScenarioState {
  return {
    scenario: "refused_infeasible",
    label: "Refused Infeasible",
    description:
      "No lawful candidate remains because feasibility is broken at the lowest layer.",
    toneInput: {
      verificationStatus: "INVALID",
      authority: "REFUSED",
      epsilonX: 0.09,
      identifiability: "FULL",
      modelConfidence: 0.73,
      robustnessEpsilon: 0,
      robustnessEpsilonMin: 0.03,
      feasibilityOk: false,
      robustnessOk: false,
      observabilityOk: true,
      identifiabilityOk: true,
      modelOk: true,
      adaptationOk: false,
      selectedCandidateIds: [],
      rejectedCandidateIds: ["A", "B"],
      activeConstraint: "resource < 0",
      decisiveVariable: "resource depletion",
      reasons: [
        "Feasibility violation detected.",
        "Constraint exceeded: resource < 0.",
        "No admissible candidates remain.",
      ],
      adjustments: [
        "Increase available resource",
        "Reduce candidate demand",
      ],
    },
    metrics: {
      selectedPlanId: undefined,
      proposalCount: 2,
      actionOutcome: "REFUSED",
    },
  };
}
