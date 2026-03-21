import { BeliefState, ParameterBelief, MeasurementSnapshot, BeliefStateManager } from "./belief_state";
import { Observer, ObserverModel } from "./observer";
import { ConstraintDefinition, DependencyStamp, FeasibilityInput } from "./feasibility_engine";
import { VerificationKernel } from "./verification_kernel";
import { ModelRegistry, RegisteredModel, ModelConfidence } from "./model_registry";
import { DecisionEngine, CandidatePlan } from "./decision_engine";
import { decideAuthority, assertMayAct } from "./constitution_guard";
import { AuditLog, AuditActionOutcome } from "./audit_log";

function nowMs(): number { return Date.now(); }
function norm(v: number[]): number { return Math.sqrt(v.reduce((s, x) => s + x * x, 0)); }

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
    predictNextState: (x, u, _r, w, theta, _t, dt) => {
      const position = x[0] ?? 0;
      const energy = x[1] ?? 0;
      const thrust = u[0] ?? 0;
      const externalDrag = w[0] ?? 0;
      const dragCoeff = theta.dragCoeff ?? 0.1;
      const idleDrain = theta.idleDrain ?? 0.05;
      const drag = dragCoeff * externalDrag;
      return [position + dt * (thrust - drag), energy + dt * (-0.2 * Math.abs(thrust) - idleDrain)];
    },
    predictMeasurement: (x) => [x[0] ?? 0, x[1] ?? 0],
    measurementJacobian: () => [[1, 0], [0, 1]],
    fisherInformationMinEigenvalue: () => 1.0,
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
    predictNextState: (x, u, _r, w, theta, _t, dt) => {
      const position = x[0] ?? 0;
      const energy = x[1] ?? 0;
      const thrust = 0.8 * (u[0] ?? 0);
      const externalDrag = w[0] ?? 0;
      const dragCoeff = (theta.dragCoeff ?? 0.1) * 1.2;
      const idleDrain = (theta.idleDrain ?? 0.05) * 1.1;
      const drag = dragCoeff * externalDrag;
      return [position + dt * (thrust - drag), energy + dt * (-0.25 * Math.abs(thrust) - idleDrain)];
    },
    predictMeasurement: (x) => [x[0] ?? 0, x[1] ?? 0],
    measurementJacobian: () => [[1, 0], [0, 1]],
    fisherInformationMinEigenvalue: () => 0.9,
  },
};

const initialParameterBelief: ParameterBelief = {
  mean: { dragCoeff: 0.1, idleDrain: 0.05 },
  variance: { dragCoeff: 0.01, idleDrain: 0.005 },
  identifiable: { dragCoeff: true, idleDrain: true },
};

const modelRegistry = new ModelRegistry(initialParameterBelief);
modelRegistry.registerModel(primaryModel);
modelRegistry.registerModel(fallbackModel);
modelRegistry.setActiveModel("mock-primary");

const t0 = nowMs();
const initialBelief: BeliefState = {
  xHat: [0.0, 1.0],
  thetaHat: initialParameterBelief,
  uncertainty: { epsilonX: 0.05, covariance: [[0.01, 0], [0, 0.01]], lower: [-0.05, 0.95], upper: [0.05, 1.05] },
  confidence: "MEDIUM",
  identifiability: "FULL",
  staleByMs: 0,
  provenance: ["bootstrap"],
  timestamp: t0,
};

const beliefManager = new BeliefStateManager(initialBelief);
const measurement: MeasurementSnapshot = { z: [0.12, 0.96], epsilonZ: 0.03, timestamp: t0 + 100, delayMs: 40, source: "mock_sensor" };
const controlAtObserve = [0.2];
const resourcesAtObserve = [0.85];
const disturbancesAtObserve = [0.1];

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

const modelConfidence: ModelConfidence = modelRegistry.scoreConfidence({
  residualNorm: observerResult.residuals.innovationNorm,
  residualTolerance: measurement.epsilonZ,
  invariantResidualNorm: 0.0,
  invariantTolerance: 0.02,
  predictionErrorNorm: Math.max(0, updatedBelief.uncertainty.epsilonX - 0.04),
  predictionTolerance: 0.10,
  timestamp: measurement.timestamp,
});

const mismatch = modelRegistry.detectMismatch(observerResult.residuals.innovationNorm, measurement.epsilonZ, 0.0, 0.02);
if (mismatch.mismatchDetected && modelConfidence.degraded) {
  const switched = modelRegistry.switchFallbackModel();
  if (switched) console.log(`[model] switched to fallback model: ${switched.signature.id}`);
}

const currentDependencyStamp: DependencyStamp = { version: "mission-config-v1", keys: ["units:si", "constraints:v1", "params:v1", "sensor:calibrated"] };
const solutionDependencyStamp: DependencyStamp = { version: "mission-config-v1", keys: ["units:si", "constraints:v1", "params:v1", "sensor:calibrated"] };

const equalityConstraints: ConstraintDefinition[] = [{ name: "state_dimension_guard", evaluate: (x) => (x.length === 2 ? 0 : 1), tolerance: 1e-9 }];
const inequalityConstraints: ConstraintDefinition[] = [
  { name: "energy_positive_margin", evaluate: (x) => -((x[1] ?? 0) - 0.2), margin: 0.02 },
  { name: "position_upper_bound", evaluate: (x) => (x[0] ?? 0) - 1.5, margin: 0.05 },
];
const terminalConstraints: ConstraintDefinition[] = [{ name: "terminal_target_nearness", evaluate: (x) => Math.abs((x[0] ?? 0) - 1.0) - 0.75, margin: 0.0 }];
const conservationConstraints: ConstraintDefinition[] = [{ name: "finite_state_check", evaluate: (x, _u, r) => ([...x, ...r].some((v) => !Number.isFinite(v)) ? 1 : 0), tolerance: 1e-9 }];
const resourcesDef = [{ name: "fuel", index: 0, lowerBound: 0 }];

function makeFeasibilityInput(nominalX: number[], nominalU: number[], nominalR: number[]): FeasibilityInput {
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

const planA: CandidatePlan = {
  id: "plan-A",
  controlSequence: [[0.35]],
  expectedCost: 1.2,
  nominalX: [0.45, 0.88],
  nominalU: [0.35],
  nominalR: [0.75],
  feasibilityInput: makeFeasibilityInput([0.45, 0.88], [0.35], [0.75]),
  robustnessConfig: { epsilonMin: 0.03, delayPresent: true, analyzedOnDelayedModel: true, sensitivityMatrix: [[1.2, 0.1], [0.05, 1.1]] },
};

const planB: CandidatePlan = {
  id: "plan-B",
  controlSequence: [[0.8]],
  expectedCost: 0.95,
  nominalX: [1.4, 0.28],
  nominalU: [0.8],
  nominalR: [0.25],
  feasibilityInput: makeFeasibilityInput([1.4, 0.28], [0.8], [0.25]),
  robustnessConfig: { epsilonMin: 0.03, delayPresent: true, analyzedOnDelayedModel: true, sensitivityMatrix: [[8.0, 1.0], [0.5, 5.0]] },
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

const actualState = updatedBelief.xHat;
const nominalState = decision.selectedPlan.nominalX;
const distanceToNominal = norm([(actualState[0] ?? 0) - (nominalState[0] ?? 0), (actualState[1] ?? 0) - (nominalState[1] ?? 0)]);
const adaptation = {
  inRecoveryTube: distanceToNominal <= 0.75,
  objectiveDrift: Math.abs((actualState[0] ?? 0) - 1.0),
  objectiveTolerance: 0.9,
  invariantError: 0.0,
  invariantTolerance: 0.02,
};

const verificationKernel = new VerificationKernel();
const verification = verificationKernel.verify({
  belief: updatedBelief,
  feasibility: decision.feasibility,
  robustness: decision.robustness,
  observer: observerResult,
  adaptation,
  model: { confidenceScore: modelConfidence.score, degraded: modelConfidence.degraded, residualNorm: modelConfidence.residualNorm, residualTolerance: measurement.epsilonZ },
});

console.log(`[verification] status: ${verification.status}`);
if (verification.reasons.length > 0) {
  console.log("[verification] reasons:");
  for (const reason of verification.reasons) console.log(`  - ${reason}`);
}

const authority = decideAuthority(verification);
let actionOutcome: AuditActionOutcome;
let controlAction: number[] | undefined;
if (authority.mayAct) {
  controlAction = decision.selectedPlan.controlSequence[0];
  assertMayAct(verification);
  actionOutcome = "APPLIED";
  console.log(`[actuation] APPLY control: ${JSON.stringify(controlAction)}`);
} else if (authority.mustDegrade) {
  controlAction = [0.1];
  actionOutcome = "DEGRADED_ACTION_APPLIED";
  console.log(`[actuation] APPLY DEGRADED control: ${JSON.stringify(controlAction)}`);
} else {
  actionOutcome = "REFUSED";
  console.log("[actuation] REFUSE action");
}

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
  notes: ["Tiny constitutional kernel demo.", `Mismatch detected: ${mismatch.mismatchDetected}`, `Observer innovation norm: ${observerResult.residuals.innovationNorm.toFixed(6)}`],
});

console.log("[audit] latest record:");
console.dir(auditLog.latest(), { depth: null });
console.log("[audit] summary:");
console.log(auditLog.summarize());

if (controlAction) {
  const oneStep = modelRegistry.predictNextState(updatedBelief.xHat, controlAction, resourcesAtObserve, disturbancesAtObserve, measurement.timestamp / 1000, 1.0);
  console.log("[simulation] one-step predicted next state:", oneStep);
}

console.log("\n--- Constitutional Demo Summary ---");
console.log(`Belief state xHat         : ${JSON.stringify(updatedBelief.xHat)}`);
console.log(`Belief epsilonX           : ${updatedBelief.uncertainty.epsilonX.toFixed(6)}`);
console.log(`Identifiability           : ${updatedBelief.identifiability}`);
console.log(`Model confidence          : ${modelConfidence.score.toFixed(3)}`);
console.log(`Selected plan             : ${decision.selectedPlan.id}`);
console.log(`Robustness epsilon        : ${decision.robustness.epsilon.toFixed(6)}`);
console.log(`Verification status       : ${verification.status}`);
console.log(`Audit outcome             : ${actionOutcome}`);
