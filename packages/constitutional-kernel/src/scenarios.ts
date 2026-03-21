/**
 * scenarios.ts
 *
 * Deterministic demo scenarios for NOMOS.
 *
 * Scenarios are not random simulations — they are fixed epistemic configurations
 * that produce known constitutional outcomes. Both paths go through the full
 * constitutional chain: belief → observer → model → proposer → decision →
 * verification → constitution_guard → audit.
 *
 * Only the lawful may act.
 */

export type DemoScenario = "lawful_baseline" | "refused_infeasible";

export interface ScenarioConfig {
  label: string;
  measurementZ: number[];
  measurementEpsilonZ: number;
  measurementDelayMs: number;
  initialXHat: number[];
  initialEpsilonX: number;
  initialCovariance: number[][];
  resources: number[];
  disturbances: number[];
  requiredEpsilonX: number;
  requiredFisherMin: number;
  terminalTolerance: number;
  sensitivityMatrixScale: number;
  energyMarginThreshold: number;
  objectiveTolerance: number;
}

export function buildScenarioConfig(scenario: DemoScenario): ScenarioConfig {
  if (scenario === "lawful_baseline") {
    // The observer calls predictMeasurement(xHat) which is the identity measurement.
    // So innovation = z - xHat. Setting z = initialXHat gives innovation = 0 → modelConfidence = 1.0.
    return {
      label: "lawful_baseline",

      // z = initialXHat → innovation = 0 → residualNorm = 0 → model not degraded
      measurementZ: [0.08, 0.98],
      measurementEpsilonZ: 0.01,
      // delayMs = 0 → no staleness → observabilityOk passes
      measurementDelayMs: 0,

      // Clean initial belief: low uncertainty, high energy
      initialXHat: [0.08, 0.98],
      initialEpsilonX: 0.03,
      initialCovariance: [[0.001, 0], [0, 0.001]],

      // Abundant resources, minimal disturbance
      resources: [1.0],
      disturbances: [0.01],

      // Observer requirements — achievable under clean conditions
      requiredEpsilonX: 0.05,
      requiredFisherMin: 0.1,

      // Wide terminal tolerance → constraint passes easily
      terminalTolerance: 0.95,

      // Very small sensitivity → large robustness radius
      sensitivityMatrixScale: 0.03,

      // Energy state must stay above this threshold
      energyMarginThreshold: 0.20,

      // Wide objective tolerance — initial position is not at target,
      // but the trajectory is constitutional. Tolerance = full range.
      objectiveTolerance: 1.0,
    };
  }

  // refused_infeasible:
  // Energy state begins at the feasibility boundary.
  // Any control sequence will deplete it below the margin.
  // All candidates fail feasibility → decision produces no survivor →
  // verification sees feasibilityOk = false → INVALID → REFUSED.
  return {
    label: "refused_infeasible",

    // Measurement places energy exactly at the threshold
    measurementZ: [0.0, 0.20],
    measurementEpsilonZ: 0.03,
    measurementDelayMs: 40,

    // Initial state: energy at the feasibility boundary
    initialXHat: [0.0, 0.20],
    initialEpsilonX: 0.04,
    initialCovariance: [[0.01, 0], [0, 0.01]],

    // Standard resources (failure comes from state x[1], not r)
    resources: [0.85],
    disturbances: [0.1],

    // Observer requirements — standard
    requiredEpsilonX: 0.08,
    requiredFisherMin: 0.2,

    // Tight terminal tolerance
    terminalTolerance: 0.50,

    // Standard sensitivity
    sensitivityMatrixScale: 0.20,

    // Energy state must stay above this threshold
    energyMarginThreshold: 0.20,

    // Standard objective tolerance (moot — feasibility fails before adaptation is checked)
    objectiveTolerance: 0.90,
  };
}

export function resolveScenario(input?: string | null): DemoScenario {
  if (input === "refused_infeasible") return "refused_infeasible";
  if (input === "lawful_baseline") return "lawful_baseline";
  // Default: use env var, fall back to lawful_baseline
  const envScenario = process.env.NOMOS_SCENARIO;
  if (envScenario === "refused_infeasible") return "refused_infeasible";
  return "lawful_baseline";
}
