/**
 * main.ts
 *
 * End-to-end demo for the constitutional kernel.
 *
 * Wires together:
 *   - belief_state.ts
 *   - observer.ts
 *   - feasibility_engine.ts
 *   - robustness_analyzer.ts
 *   - verification_kernel.ts
 *   - model_registry.ts
 *   - decision_engine.ts
 *   - constitution_guard.ts
 *   - audit_log.ts
 *   - index.ts
 *
 * Demo mission:
 *   A tiny 2-state system:
 *     x[0] = position
 *     x[1] = energy
 *
 *   Control:
 *     u[0] = thrust command
 *
 *   Resource:
 *     r[0] = remaining fuel
 *
 *   Disturbance:
 *     w[0] = drag / loss term
 *
 * Mission objective:
 *   Move toward target position x=1 while preserving positive energy/fuel,
 *   respecting explicit feasibility, robustness, and verification checks.
 */

import {
  BeliefState,
  ParameterBelief,
  MeasurementSnapshot,
  BeliefStateManager,
} from "./belief_state.js";
import { Observer, ObserverModel } from "./observer.js";
import {
  ConstraintDefinition,
  DependencyStamp,
  FeasibilityEngine,
  FeasibilityInput,
} from "./feasibility_engine.js";
import { RobustnessAnalyzer } from "./robustness_analyzer.js";
import { VerificationKernel } from "./verification_kernel.js";
import {
  ModelRegistry,
  RegisteredModel,
  ModelConfidence,
} from "./model_registry.js";
import {
  DecisionEngine,
  CandidatePlan,
} from "./decision_engine.js";
import {
  decideAuthority,
  assertMayAct,
} from "./constitution_guard.js";
import {
  AuditLog,
  AuditActionOutcome,
} from "./audit_log.js";

function nowMs(): number {
  return Date.now();
}

function norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

/**
 * ------------------------------------------------------------------
 * 1) MODEL SETUP
 * ------------------------------------------------------------------
 *
 * Primary model:
 *   position' = position + dt * (thrust - drag)
 *   energy'   = energy   + dt * (-0.2*|thrust| - 0.05)
 *
 * Measurement:
 *   z = [position, energy]
 *
 * Fuel is tracked separately as resource r[0].
 */

const primaryModel: RegisteredModel = {
  signature: {
    id: "mock-primary",
    version: "1.0.0",
    delayAware: true,
    stateDim: 2,
    measurementDim: 2,
    parameterNames: ["dragCoeff", "idleDrain"],
    description: "Tiny mock mission model with explicit delay awareness.",
  },
  implementation: {
    predictNextState: (
      x: number[],
      u: number[],
      _r: number[],
      w: number[],
      theta: Record<string, number>,
      _t: number,
      dt: number
    ): number[] => {
      const position = x[0] ?? 0;
      const energy = x[1] ?? 0;
      const thrust = u[0] ?? 0;
      const externalDrag = w[0] ?? 0;
      const dragCoeff = theta["dragCoeff"] ?? 0.1;
      const idleDrain = theta["idleDrain"] ?? 0.05;

      const drag = dragCoeff * externalDrag;
      const newPosition = position + dt * (thrust - drag);
      const newEnergy = energy + dt * (-0.2 * Math.abs(thrust) - idleDrain);

      return [newPosition, newEnergy];
    },

    predictMeasurement: (
      x: number[],
      _u: number[],
      _r: number[],
      _w: number[],
      _theta: Record<string, number>,
      _t: number
    ): number[] => {
      return [x[0] ?? 0, x[1] ?? 0];
    },

    measurementJacobian: () => {
      // z = [x0, x1]
      return [
        [1, 0],
        [0, 1],
      ];
    },

    fisherInformationMinEigenvalue: () => {
      // Mock constant > 0 to represent sufficient information in this simple demo.
      return 1.0;
    },
  },
  fallbackModelId: "mock-fallback",
};

const fallbackModel: RegisteredModel = {
  signature: {
    id: "mock-fallback",
    version: "1.0.0",
    delayAware: true,
    stateDim: 2,
    measurementDim: 2,
    parameterNames: ["dragCoeff", "idleDrain"],
    description: "More conservative fallback model.",
  },
  implementation: {
    predictNextState: (
      x: number[],
      u: number[],
      _r: number[],
      w: number[],
      theta: Record<string, number>,
      _t: number,
      dt: number
    ): number[] => {
      const position = x[0] ?? 0;
      const energy = x[1] ?? 0;
      const thrust = 0.8 * (u[0] ?? 0); // more conservative actuation assumption
      const externalDrag = w[0] ?? 0;
      const dragCoeff = (theta["dragCoeff"] ?? 0.1) * 1.2;
      const idleDrain = (theta["idleDrain"] ?? 0.05) * 1.1;

      const drag = dragCoeff * externalDrag;
      const newPosition = position + dt * (thrust - drag);
      const newEnergy = energy + dt * (-0.25 * Math.abs(thrust) - idleDrain);

      return [newPosition, newEnergy];
    },

    predictMeasurement: (
      x: number[],
      _u: number[],
      _r: number[],
      _w: number[],
      _theta: Record<string, number>,
      _t: number
    ): number[] => {
      return [x[0] ?? 0, x[1] ?? 0];
    },

    measurementJacobian: () => {
      return [
        [1, 0],
        [0, 1],
      ];
    },

    fisherInformationMinEigenvalue: () => {
      return 0.9;
    },
  },
};

/**
 * ------------------------------------------------------------------
 * 2) PARAMETER BELIEF AND MODEL REGISTRY
 * ------------------------------------------------------------------
 */

const initialParameterBelief: ParameterBelief = {
  mean: {
    dragCoeff: 0.1,
    idleDrain: 0.05,
  },
  variance: {
    dragCoeff: 0.01,
    idleDrain: 0.005,
  },
  identifiable: {
    dragCoeff: true,
    idleDrain: true,
  },
};

const modelRegistry = new ModelRegistry(initialParameterBelief);
modelRegistry.registerModel(primaryModel);
modelRegistry.registerModel(fallbackModel);
modelRegistry.setActiveModel("mock-primary");

/**
 * ------------------------------------------------------------------
 * 3) INITIAL BELIEF
 * ------------------------------------------------------------------
 */

const t0 = nowMs();

const initialBelief: BeliefState = {
  xHat: [0.0, 1.0], // position=0, energy=1
  thetaHat: initialParameterBelief,
  uncertainty: {
    epsilonX: 0.05,
    covariance: [
      [0.01, 0],
      [0, 0.01],
    ],
    lower: [-0.05, 0.95],
    upper: [0.05, 1.05],
  },
  confidence: "MEDIUM",
  identifiability: "FULL",
  staleByMs: 0,
  provenance: ["bootstrap"],
  timestamp: t0,
};

const beliefManager = new BeliefStateManager(initialBelief);

/**
 * ------------------------------------------------------------------
 * 4) MOCK MEASUREMENT
 * ------------------------------------------------------------------
 *
 * Suppose the true world after a short interval drifted to:
 *   x_true = [0.12, 0.96]
 * and we receive a delayed measurement with bounded corruption.
 */

const measurement: MeasurementSnapshot = {
  z: [0.12, 0.96],
  epsilonZ: 0.03,
  timestamp: t0 + 100,
  delayMs: 40,
  source: "mock_sensor",
};

const controlAtObserve = [0.2];
const resourcesAtObserve = [0.85]; // fuel
const disturbancesAtObserve = [0.1]; // drag proxy

/**
 * ------------------------------------------------------------------
 * 5) OBSERVER UPDATE
 * ------------------------------------------------------------------
 */

const observer = new Observer();

const observerResult = observer.observe({
  priorBelief: beliefManager.getBelief(),
  measurement,
  model: modelRegistry.getActiveModel().implementation as ObserverModel,
  control: controlAtObserve,
  resources: resourcesAtObserve,
  disturbances: disturbancesAtObserve,
  currentTime: measurement.timestamp,
  requiredEpsilonX: 0.08,
  requiredFisherMin: 0.2,
});

const updatedBelief = observerResult.belief;

console.log("[observer] result:");
console.log(`  innovation norm      : ${observerResult.residuals.innovationNorm.toFixed(6)}`);
console.log(`  observability rank   : ${observerResult.observabilityRank}`);
console.log(`  observable           : ${observerResult.observable}`);
console.log(`  info sufficient      : ${observerResult.informationSufficient}`);
console.log(`  identifiability      : ${updatedBelief.identifiability}`);
console.log(`  belief epsilonX      : ${updatedBelief.uncertainty.epsilonX.toFixed(6)}`);
console.log(`  confidence           : ${updatedBelief.confidence}`);
console.log(`  stale by             : ${updatedBelief.staleByMs} ms`);
console.log(`  provenance           : ${updatedBelief.provenance.join(" → ")}`);

/**
 * ------------------------------------------------------------------
 * 6) MODEL CONFIDENCE / MISMATCH
 * ------------------------------------------------------------------
 */

const modelConfidence: ModelConfidence = modelRegistry.scoreConfidence({
  residualNorm: observerResult.residuals.innovationNorm,
  residualTolerance: measurement.epsilonZ,
  invariantResidualNorm: 0.0,
  invariantTolerance: 0.02,
  predictionErrorNorm: Math.max(0, updatedBelief.uncertainty.epsilonX - 0.04),
  predictionTolerance: 0.10,
  timestamp: measurement.timestamp,
});

const mismatch = modelRegistry.detectMismatch(
  observerResult.residuals.innovationNorm,
  measurement.epsilonZ,
  0.0,
  0.02
);

if (mismatch.mismatchDetected && modelConfidence.degraded) {
  const switched = modelRegistry.switchFallbackModel();
  if (switched) {
    console.log(`[model] switched to fallback model: ${switched.signature.id}`);
  }
}

/**
 * ------------------------------------------------------------------
 * 7) FEASIBILITY / ROBUSTNESS CANDIDATE PLANS
 * ------------------------------------------------------------------
 *
 * Goal: move toward target position 1.0
 */

const currentDependencyStamp: DependencyStamp = {
  version: "mission-config-v1",
  keys: ["units:si", "constraints:v1", "params:v1", "sensor:calibrated"],
};

const solutionDependencyStamp: DependencyStamp = {
  version: "mission-config-v1",
  keys: ["units:si", "constraints:v1", "params:v1", "sensor:calibrated"],
};

const equalityConstraints: ConstraintDefinition[] = [
  {
    name: "state_dimension_guard",
    evaluate: (x) => (x.length === 2 ? 0 : 1),
    tolerance: 1e-9,
  },
];

const inequalityConstraints: ConstraintDefinition[] = [
  {
    name: "energy_positive_margin",
    evaluate: (x) => -((x[1] ?? 0) - 0.20), // requires x[1] >= 0.20
    margin: 0.02,
  },
  {
    name: "position_upper_bound",
    evaluate: (x) => (x[0] ?? 0) - 1.50, // requires x[0] <= 1.50
    margin: 0.05,
  },
];

const terminalConstraints: ConstraintDefinition[] = [
  {
    name: "terminal_target_nearness",
    evaluate: (x) => Math.abs((x[0] ?? 0) - 1.0) - 0.75,
    margin: 0.0,
  },
];

const conservationConstraints: ConstraintDefinition[] = [
  {
    name: "finite_state_check",
    evaluate: (x, _u, r) => {
      const bad =
        [...x, ...r].some((v) => !Number.isFinite(v)) ? 1 : 0;
      return bad;
    },
    tolerance: 1e-9,
  },
];

const resourcesDef = [
  { name: "fuel", index: 0, lowerBound: 0 },
];

function makeFeasibilityInput(
  nominalX: number[],
  nominalU: number[],
  nominalR: number[]
): FeasibilityInput {
  return {
    x: nominalX,
    u: nominalU,
    r: nominalR,
    t: measurement.timestamp / 1000,
    xT: nominalX,
    rT: nominalR,
    theta: modelRegistry.getParameterBelief().mean,
    equalityConstraints,
    inequalityConstraints,
    terminalConstraints,
    conservationConstraints,
    resources: resourcesDef,
    currentDependencyStamp,
    solutionDependencyStamp,
  };
}

/**
 * Candidate plan A: moderate thrust, better robustness
 */
const planA: CandidatePlan = {
  id: "plan-A",
  controlSequence: [[0.35]],
  expectedCost: 1.20,
  nominalX: [0.45, 0.88],
  nominalU: [0.35],
  nominalR: [0.75],
  feasibilityInput: makeFeasibilityInput([0.45, 0.88], [0.35], [0.75]),
  robustnessConfig: {
    epsilonMin: 0.03,
    delayPresent: true,
    analyzedOnDelayedModel: true,
    sensitivityMatrix: [
      [1.2, 0.1],
      [0.05, 1.1],
    ],
  },
};

/**
 * Candidate plan B: aggressive thrust, cheaper nominally but more fragile
 */
const planB: CandidatePlan = {
  id: "plan-B",
  controlSequence: [[0.80]],
  expectedCost: 0.95,
  nominalX: [1.40, 0.28],
  nominalU: [0.80],
  nominalR: [0.25],
  feasibilityInput: makeFeasibilityInput([1.40, 0.28], [0.80], [0.25]),
  robustnessConfig: {
    epsilonMin: 0.03,
    delayPresent: true,
    analyzedOnDelayedModel: true,
    sensitivityMatrix: [
      [8.0, 1.0],
      [0.5, 5.0],
    ],
  },
};

const decisionEngine = new DecisionEngine();
const decision = decisionEngine.decide([planA, planB]);

if (!decision.lawful || !decision.selectedPlan || !decision.feasibility || !decision.robustness) {
  console.log("[decision] no lawful plan selected");
  console.log(decision);
  process.exit(0);
}

console.log(`[decision] selected plan: ${decision.selectedPlan.id}`);
console.log(`[decision] ranking:`, decision.ranking);

/**
 * ------------------------------------------------------------------
 * 8) MOCK ADAPTATION STATUS
 * ------------------------------------------------------------------
 *
 * We use a tiny synthetic adaptation status here.
 */

const actualState = updatedBelief.xHat;
const nominalState = decision.selectedPlan.nominalX;
const distanceToNominal = norm([
  (actualState[0] ?? 0) - (nominalState[0] ?? 0),
  (actualState[1] ?? 0) - (nominalState[1] ?? 0),
]);

const adaptation = {
  inRecoveryTube: distanceToNominal <= 0.75,
  objectiveDrift: Math.abs((actualState[0] ?? 0) - 1.0),
  objectiveTolerance: 0.90,
  invariantError: 0.0,
  invariantTolerance: 0.02,
};

/**
 * ------------------------------------------------------------------
 * 9) VERIFICATION SUPREMACY
 * ------------------------------------------------------------------
 */

const verificationKernel = new VerificationKernel();

const verification = verificationKernel.verify({
  belief: updatedBelief,
  feasibility: decision.feasibility,
  robustness: decision.robustness,
  observer: observerResult,
  adaptation,
  model: {
    confidenceScore: modelConfidence.score,
    degraded: modelConfidence.degraded,
    residualNorm: modelConfidence.residualNorm,
    residualTolerance: measurement.epsilonZ,
  },
});

console.log(`[verification] status: ${verification.status}`);
if (verification.reasons.length > 0) {
  console.log("[verification] reasons:");
  for (const reason of verification.reasons) {
    console.log(`  - ${reason}`);
  }
}

/**
 * ------------------------------------------------------------------
 * 10) CONSTITUTION GUARD
 * ------------------------------------------------------------------
 */

const authority = decideAuthority(verification);

let actionOutcome: AuditActionOutcome;
let controlAction: number[] | undefined;

if (authority.mayAct) {
  controlAction = decision.selectedPlan.controlSequence[0];
  assertMayAct(verification);
  actionOutcome = "APPLIED";
  console.log(`[actuation] APPLY control: ${JSON.stringify(controlAction)}`);
} else if (authority.mustDegrade) {
  controlAction = [0.1]; // tiny safe degraded action
  actionOutcome = "DEGRADED_ACTION_APPLIED";
  console.log(`[actuation] APPLY DEGRADED control: ${JSON.stringify(controlAction)}`);
} else {
  actionOutcome = "REFUSED";
  console.log("[actuation] REFUSE action");
}

/**
 * ------------------------------------------------------------------
 * 11) AUDIT LOG
 * ------------------------------------------------------------------
 */

const auditLog = new AuditLog();

auditLog.write({
  id: "audit-0001",
  timestamp: nowMs(),
  measurement,
  belief: updatedBelief,
  modelSignature: modelRegistry.getActiveSignature(),
  modelConfidence,
  feasibility: decision.feasibility,
  robustness: decision.robustness,
  verification,
  selectedPlanId: decision.selectedPlan.id,
  controlAction,
  outcome: actionOutcome,
  notes: [
    "Tiny constitutional kernel demo.",
    `Mismatch detected: ${mismatch.mismatchDetected}`,
    `Observer innovation norm: ${observerResult.residuals.innovationNorm.toFixed(6)}`,
  ],
});

console.log("[audit] latest record:");
console.dir(auditLog.latest(), { depth: null });

console.log("[audit] summary:");
console.log(auditLog.summarize());

/**
 * ------------------------------------------------------------------
 * 12) OPTIONAL: show one-step world propagation under chosen control
 * ------------------------------------------------------------------
 */

if (controlAction) {
  const oneStep = modelRegistry.predictNextState(
    updatedBelief.xHat,
    controlAction,
    resourcesAtObserve,
    disturbancesAtObserve,
    measurement.timestamp / 1000,
    1.0
  );

  console.log("[simulation] one-step predicted next state:", oneStep);
}

/**
 * ------------------------------------------------------------------
 * 13) HUMAN-READABLE SYNTHESIS
 * ------------------------------------------------------------------
 */

console.log("\n--- Constitutional Demo Summary ---");
console.log(`Belief state xHat         : ${JSON.stringify(updatedBelief.xHat)}`);
console.log(`Belief epsilonX           : ${updatedBelief.uncertainty.epsilonX.toFixed(6)}`);
console.log(`Identifiability           : ${updatedBelief.identifiability}`);
console.log(`Model confidence          : ${modelConfidence.score.toFixed(3)}`);
console.log(`Selected plan             : ${decision.selectedPlan.id}`);
console.log(`Robustness epsilon        : ${decision.robustness.epsilon.toFixed(6)}`);
console.log(`Verification status       : ${verification.status}`);
console.log(`Audit outcome             : ${actionOutcome}`);
