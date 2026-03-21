/**
 * scenarios.ts
 *
 * Deterministic demo scenarios for NOMOS.
 *
 * Scenarios are not random simulations — they are fixed epistemic configurations
 * that produce known constitutional outcomes. All paths go through the full
 * constitutional chain: belief → observer → model → proposer → decision →
 * verification → constitution_guard → audit.
 *
 * Only the lawful may act.
 */

export type DemoScenario = "lawful_baseline" | "degraded_low_margin" | "refused_infeasible";

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

  if (scenario === "degraded_low_margin") {
    // DEGRADED — system may act but under constrained authority.
    //
    // Trigger chain:
    //   1. MODEL DEGRADED: innovation = z - xHat = [0.12, 0].
    //      innovationNorm = 0.12, epsilonZ = 0.04 → residualRatio = 3.0 > 1
    //      → model.degraded = true → modelOk = false → verification DEGRADED
    //
    //   2. OBSERVABILITY DEGRADED: requiredFisherMin = 2.0 > fisherMinEigenvalue (1.0)
    //      → observer sets informationSufficient = false → observabilityOk = false
    //      → additional DEGRADED trigger; identifiability = PARTIAL (not NONE → ok)
    //
    //   3. FEASIBILITY INTACT: energy x[1] = 0.50. After 4 rollout steps
    //      (drain ≈ 0.045/step) → x[1] ≈ 0.32 >> energyMarginThreshold = 0.26.
    //      Epsilon ≈ 0.06 > epsilonMin = 0.03 → feasibility ✓, robustness ✓
    //
    //   4. AUTHORITY = CONSTRAINED → DEGRADED_ACTION_APPLIED
    //
    // Epistemic profile: moderate position, reduced energy, elevated uncertainty,
    // partial identifiability, low-confidence model — real stress state.
    return {
      label: "degraded_low_margin",

      // z[0] = xHat[0] + 0.12 → innovationNorm = 0.12 → residualRatio = 3.0 → degraded
      measurementZ: [0.52, 0.50],
      measurementEpsilonZ: 0.04,
      measurementDelayMs: 0,

      // Moderate position, reduced energy, elevated uncertainty
      initialXHat: [0.40, 0.50],
      initialEpsilonX: 0.15,
      initialCovariance: [[0.04, 0], [0, 0.04]],

      // Moderate resources, moderate disturbance
      resources: [0.70],
      disturbances: [0.04],

      // Fisher threshold above what the model provides (1.0) → PARTIAL identifiability
      requiredEpsilonX: 0.10,
      requiredFisherMin: 2.0,

      // Wide enough terminal tolerance — trajectory is feasible
      terminalTolerance: 0.70,

      // Moderate sensitivity — robustness epsilon stays above epsilonMin
      sensitivityMatrixScale: 0.10,

      // Tighter energy threshold: after rollout x[1] ≈ 0.32 → margin = 0.06 > 0.03 ✓
      energyMarginThreshold: 0.26,

      // Standard objective tolerance
      objectiveTolerance: 0.90,
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
  if (input === "degraded_low_margin") return "degraded_low_margin";
  if (input === "lawful_baseline") return "lawful_baseline";
  // Default: use env var, fall back to lawful_baseline
  const envScenario = process.env.NOMOS_SCENARIO;
  if (envScenario === "refused_infeasible") return "refused_infeasible";
  if (envScenario === "degraded_low_margin") return "degraded_low_margin";
  return "lawful_baseline";
}
