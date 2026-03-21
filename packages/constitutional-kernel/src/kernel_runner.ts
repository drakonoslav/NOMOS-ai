/**
 * kernel_runner.ts
 *
 * Runs the full NOMOS constitutional chain once and returns a structured result.
 *
 * Constitutional chain:
 *   belief → observer → model → llm_proposer → decision_engine
 *         → verification_kernel → constitution_guard → audit_log
 *
 * The LLM is proposer only. Authority stays in verification_kernel and constitution_guard.
 *
 * Two deterministic demo scenarios are supported:
 *   lawful_baseline     — produces LAWFUL / AUTHORIZED / APPLIED
 *   refused_infeasible  — produces INVALID / REFUSED / REFUSED via feasibility failure
 */

import { BeliefState, ParameterBelief, MeasurementSnapshot, BeliefStateManager } from "./belief_state.js";
import { Observer, ObserverModel } from "./observer.js";
import { ConstraintDefinition, DependencyStamp, FeasibilityInput, FeasibilityReport } from "./feasibility_engine.js";
import { VerificationKernel, AdaptationStatus } from "./verification_kernel.js";
import { ModelRegistry, RegisteredModel } from "./model_registry.js";
import { RobustnessReport } from "./robustness_analyzer.js";
import { DecisionEngine } from "./decision_engine.js";
import { decideAuthority } from "./constitution_guard.js";
import { AuditLog, AuditRecord } from "./audit_log.js";
import { LLMProposer, MissionContext, LLMProposal } from "./llm_proposer.js";
import { buildScenarioConfig, resolveScenario } from "./scenarios.js";

export interface KernelProposalResult {
  id: string;
  kind: string;
  confidence: string;
  rationale: string;
  assumptions: string[];
  lawful: false;
  planSketch: { controlSequence: number[][]; rationale: string; assumptions: string[] } | null;
  provenance: string[];
  notes: string[];
}

export interface KernelVerificationResult {
  feasibilityOk: boolean;
  robustnessOk: boolean;
  observabilityOk: boolean;
  identifiabilityOk: boolean;
  modelOk: boolean;
  adaptationOk: boolean;
  status: "LAWFUL" | "DEGRADED" | "INVALID";
  reasons: string[];
}

export interface KernelBeliefResult {
  xHat: number[];
  epsilonX: number;
  confidence: string;
  identifiability: string;
  staleByMs: number;
  thetaMean: Record<string, number>;
  thetaVariance: Record<string, number> | null;
  provenance: string[];
  lower: number[] | null;
  upper: number[] | null;
}

export interface KernelModelResult {
  activeModelId: string;
  version: string;
  delayAware: boolean;
  confidenceScore: number;
  degraded: boolean;
  fallbackActive: boolean;
}

export interface KernelDecisionResult {
  selectedPlanId: string;
  rankedCandidateCount: number;
  rejectedCandidateCount: number;
  robustnessEpsilon: number;
  robustnessEpsilonMin: number;
  topRejectionReason: string | null;
}

export interface KernelAuditResult {
  recordId: string;
  timestamp: number;
  outcome: "APPLIED" | "DEGRADED_ACTION_APPLIED" | "REFUSED";
  verificationStatus: "LAWFUL" | "DEGRADED" | "INVALID";
  appliedControl: number[];
  notes: string[];
}

export interface KernelRunResult {
  runId: string;
  timestamp: number;
  missionId: string;
  scenario: string;
  verificationStatus: "LAWFUL" | "DEGRADED" | "INVALID";
  authority: "AUTHORIZED" | "CONSTRAINED" | "REFUSED";
  actionOutcome: "APPLIED" | "DEGRADED_ACTION_APPLIED" | "REFUSED";
  modelConfidenceScore: number;
  proposalCount: number;
  rejectedFragmentCount: number;
  proposalReasons: string[];
  proposals: KernelProposalResult[];
  verification: KernelVerificationResult;
  belief: KernelBeliefResult;
  model: KernelModelResult;
  decision: KernelDecisionResult;
  audit: KernelAuditResult;
}

function nowMs(): number { return Date.now(); }
function meanControlValue(seq: number[][]): number {
  if (seq.length === 0) return 0;
  return seq.reduce((s, step) => s + (step[0] ?? 0), 0) / seq.length;
}
function safeRunId(): string { return `run-${Math.random().toString(36).slice(2, 10)}`; }

export async function runKernelOnce(scenarioInput?: string | null): Promise<KernelRunResult> {
  const scenario = resolveScenario(scenarioInput);
  const cfg = buildScenarioConfig(scenario);

  // ── 1. MODEL SETUP ──────────────────────────────────────────────────────────

  const primaryModel: RegisteredModel = {
    signature: {
      id: "mock-primary",
      version: "1.0.0",
      delayAware: true,
      stateDim: 2,
      measurementDim: 2,
      parameterNames: ["dragCoeff", "idleDrain"],
      description: "Mock mission model.",
    },
    implementation: {
      predictNextState: (x, u, _r, w, theta, _t, dt) => {
        const drag = (theta.dragCoeff ?? 0.1) * (w[0] ?? 0);
        return [
          (x[0] ?? 0) + dt * ((u[0] ?? 0) - drag),
          (x[1] ?? 0) + dt * (-0.2 * Math.abs(u[0] ?? 0) - (theta.idleDrain ?? 0.05)),
        ];
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
      description: "Conservative fallback model.",
    },
    implementation: {
      predictNextState: (x, u, _r, w, theta, _t, dt) => {
        const drag = ((theta.dragCoeff ?? 0.1) * 1.2) * (w[0] ?? 0);
        return [
          (x[0] ?? 0) + dt * (0.8 * (u[0] ?? 0) - drag),
          (x[1] ?? 0) + dt * (-0.25 * Math.abs(u[0] ?? 0) - (theta.idleDrain ?? 0.05) * 1.1),
        ];
      },
      predictMeasurement: (x) => [x[0] ?? 0, x[1] ?? 0],
      measurementJacobian: () => [[1, 0], [0, 1]],
      fisherInformationMinEigenvalue: () => 0.9,
    },
  };

  // ── 2. REGISTRY + INITIAL BELIEF ─────────────────────────────────────────

  const initialThetaBelief: ParameterBelief = {
    mean: { dragCoeff: 0.1, idleDrain: 0.05 },
    variance: { dragCoeff: 0.01, idleDrain: 0.005 },
    identifiable: { dragCoeff: true, idleDrain: true },
  };

  const modelRegistry = new ModelRegistry(initialThetaBelief);
  modelRegistry.registerModel(primaryModel);
  modelRegistry.registerModel(fallbackModel);
  modelRegistry.setActiveModel("mock-primary");

  const t0 = nowMs();
  const initialBelief: BeliefState = {
    xHat: cfg.initialXHat,
    thetaHat: initialThetaBelief,
    uncertainty: {
      epsilonX: cfg.initialEpsilonX,
      covariance: cfg.initialCovariance,
      lower: [cfg.initialXHat[0]! - cfg.initialEpsilonX, cfg.initialXHat[1]! - cfg.initialEpsilonX],
      upper: [cfg.initialXHat[0]! + cfg.initialEpsilonX, cfg.initialXHat[1]! + cfg.initialEpsilonX],
    },
    confidence: cfg.initialEpsilonX <= 0.04 ? "HIGH" : "MEDIUM",
    identifiability: "FULL",
    staleByMs: 0,
    provenance: ["bootstrap", `scenario:${scenario}`],
    timestamp: t0,
  };

  const beliefManager = new BeliefStateManager(initialBelief);

  // ── 3. OBSERVER ──────────────────────────────────────────────────────────

  const measurement: MeasurementSnapshot = {
    z: cfg.measurementZ,
    epsilonZ: cfg.measurementEpsilonZ,
    timestamp: t0 + 100,
    delayMs: cfg.measurementDelayMs,
    source: "mock_sensor",
  };

  const observer = new Observer();
  const observerResult = observer.observe({
    priorBelief: beliefManager.getBelief(),
    measurement,
    model: modelRegistry.getActiveModel().implementation as ObserverModel,
    control: [0.2],
    resources: cfg.resources,
    disturbances: cfg.disturbances,
    currentTime: measurement.timestamp,
    requiredEpsilonX: cfg.requiredEpsilonX,
    requiredFisherMin: cfg.requiredFisherMin,
  });

  const updatedBelief = observerResult.belief;

  // ── 4. MODEL CONFIDENCE ───────────────────────────────────────────────────

  const modelConfidence = modelRegistry.scoreConfidence({
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
    0.02,
  );

  let fallbackActive = false;
  if (mismatch.mismatchDetected && modelConfidence.degraded) {
    const switched = modelRegistry.switchFallbackModel();
    if (switched) fallbackActive = true;
  }

  // ── 5. LLM PROPOSER ──────────────────────────────────────────────────────

  const missionContext: MissionContext = {
    missionId: "nomos-kernel-run",
    objectiveText: "Move position toward 1.0 while preserving energy, fuel, and bounded lawful operation.",
    currentTime: measurement.timestamp,
    horizonSteps: 4,
    controlDim: 1,
    stateDim: 2,
    resourceDim: 1,
  };

  const proposer = new LLMProposer();
  const proposalBundle = await proposer.propose({
    missionContext,
    belief: updatedBelief,
    modelSignature: modelRegistry.getActiveSignature(),
    operatorHints: [
      "prefer conservative actuation",
      "maintain positive energy margin",
      "do not exhaust fuel",
    ],
    deterministicFallback: true,
  });

  // ── 6. CONSTRAINTS + DECISION ─────────────────────────────────────────────

  const stamp: DependencyStamp = {
    version: "mission-config-v1",
    keys: ["units:si", "constraints:v1", "params:v1", "sensor:calibrated"],
  };

  const equalityConstraints: ConstraintDefinition[] = [
    { name: "state_dimension_guard", evaluate: (x) => (x.length === 2 ? 0 : 1), tolerance: 1e-9 },
  ];

  // energy_positive_margin: x[1] must stay above threshold + margin
  // This is the key constraint that drives feasibility failure in refused_infeasible
  const energyThreshold = cfg.energyMarginThreshold;
  const inequalityConstraints: ConstraintDefinition[] = [
    { name: "energy_positive_margin", evaluate: (x) => -((x[1] ?? 0) - energyThreshold), margin: 0.02 },
    { name: "position_upper_bound", evaluate: (x) => (x[0] ?? 0) - 1.50, margin: 0.05 },
  ];
  const terminalConstraints: ConstraintDefinition[] = [
    { name: "terminal_target_nearness", evaluate: (x) => Math.abs((x[0] ?? 0) - 1.0) - cfg.terminalTolerance, margin: 0.0 },
  ];
  const conservationConstraints: ConstraintDefinition[] = [];

  const theta = updatedBelief.thetaHat.mean;
  const epsilonMin = 0.03;

  const decisionEngine = new DecisionEngine();
  const candidatePlans = proposalBundle.proposals
    .filter((p) => p.kind === "CONTROL_PLAN" && !!p.planSketch)
    .map((proposal) => {
      const seq = proposal.planSketch!.controlSequence;
      let x = [...updatedBelief.xHat];
      const r = cfg.resources.slice();
      let t = measurement.timestamp / 1000;
      const dt = 0.5;
      for (const step of seq) {
        x = modelRegistry.predictNextState(x, step, r, cfg.disturbances, t, dt);
        t += dt;
      }
      const nominalX = x;
      const nominalU = [meanControlValue(seq)];
      const nominalR = r;

      // Sensitivity matrix scale controls robustness radius:
      //   lawful_baseline: small scale → large epsilon → passes robustness check
      //   refused_infeasible: larger scale, but moot (fails feasibility first)
      const maxU = Math.max(...seq.map((s) => Math.abs(s[0] ?? 0)), 0.01);
      const sc = cfg.sensitivityMatrixScale;
      const sensitivityMatrix = [[maxU * sc, 0], [0, maxU * sc * 0.75]];

      const feasibilityInput: FeasibilityInput = {
        x: nominalX, u: nominalU, r: nominalR,
        t: measurement.timestamp / 1000,
        xT: nominalX, rT: nominalR, theta,
        equalityConstraints, inequalityConstraints,
        terminalConstraints, conservationConstraints,
        resources: [{ name: "fuel", index: 0, lowerBound: 0 }],
        currentDependencyStamp: stamp,
        solutionDependencyStamp: stamp,
      };

      return proposer.toCandidatePlan({
        proposal,
        nominalX,
        nominalU,
        nominalR,
        feasibilityInput,
        robustnessConfig: {
          epsilonMin,
          sensitivityMatrix,
          delayPresent: (measurement.delayMs ?? 0) > 0,
          analyzedOnDelayedModel: primaryModel.signature.delayAware,
        },
      });
    });

  const decision = decisionEngine.decide(candidatePlans);

  // ── 7. VERIFICATION ───────────────────────────────────────────────────────

  const fallbackFeasibility: FeasibilityReport = {
    feasible: false, stale: false,
    equalityChecks: [], inequalityChecks: [], resourceChecks: [],
    terminalChecks: [], conservationChecks: [],
    reasons: ["No candidate plans evaluated."],
  };
  const fallbackRobustness: RobustnessReport = {
    epsilon: 0, epsilonMin, bounded: false, horizonBound: 0,
    marginReport: {}, sensitivitySingularValues: [], fragileDimensions: [],
    delayConsistent: true, reasons: ["No candidate plans evaluated."],
  };

  const actualState = updatedBelief.xHat;
  const nominalState = decision.selectedPlan?.nominalX ?? updatedBelief.xHat;
  const distanceToNominal = Math.sqrt(
    actualState.reduce((sum, v, i) => sum + ((v - (nominalState[i] ?? v)) ** 2), 0)
  );
  const adaptation: AdaptationStatus = {
    inRecoveryTube: distanceToNominal <= 0.75,
    objectiveDrift: Math.abs((actualState[0] ?? 0) - 1.0),
    objectiveTolerance: cfg.objectiveTolerance,
    invariantError: 0.0,
    invariantTolerance: 0.02,
  };

  const verificationKernel = new VerificationKernel();
  const verification = verificationKernel.verify({
    belief: updatedBelief,
    feasibility: decision.feasibility ?? fallbackFeasibility,
    robustness: decision.robustness ?? fallbackRobustness,
    observer: observerResult,
    adaptation,
    model: {
      confidenceScore: modelConfidence.score,
      degraded: modelConfidence.degraded,
      residualNorm: modelConfidence.residualNorm,
      residualTolerance: measurement.epsilonZ,
    },
  });

  // ── 8. CONSTITUTION GUARD ─────────────────────────────────────────────────

  const authority = decideAuthority(verification);
  let appliedControl: number[];
  let actionOutcome: "APPLIED" | "DEGRADED_ACTION_APPLIED" | "REFUSED";

  if (authority.mayAct) {
    appliedControl = decision.selectedPlan?.controlSequence[0] ?? [0];
    actionOutcome = "APPLIED";
  } else if (authority.mustDegrade) {
    appliedControl = [0.1];
    actionOutcome = "DEGRADED_ACTION_APPLIED";
  } else {
    appliedControl = [0];
    actionOutcome = "REFUSED";
  }

  // ── 9. AUDIT ─────────────────────────────────────────────────────────────

  const auditLog = new AuditLog();
  const runTimestamp = nowMs();
  const auditRecord: AuditRecord = {
    id: safeRunId(),
    timestamp: runTimestamp,
    measurement,
    belief: updatedBelief,
    modelSignature: modelRegistry.getActiveSignature(),
    modelConfidence,
    ...(decision.feasibility !== undefined ? { feasibility: decision.feasibility } : {}),
    ...(decision.robustness !== undefined ? { robustness: decision.robustness } : {}),
    verification,
    selectedPlanId: decision.selectedPlan?.id,
    controlAction: appliedControl,
    outcome: actionOutcome,
    notes: proposalBundle.reasons,
  };
  auditLog.write(auditRecord);

  // ── 10. SHAPE OUTPUT ──────────────────────────────────────────────────────

  const activeModel = modelRegistry.getActiveModel();

  const mappedProposals: KernelProposalResult[] = proposalBundle.proposals.map((p: LLMProposal) => ({
    id: p.id,
    kind: p.kind,
    confidence: p.confidence,
    rationale: p.planSketch?.rationale ?? p.stateHypothesis?.rationale ?? p.parameterHypothesis?.rationale ?? "",
    assumptions: p.planSketch?.assumptions ?? p.stateHypothesis?.assumptions ?? p.parameterHypothesis?.assumptions ?? [],
    lawful: false as const,
    planSketch: p.planSketch
      ? { controlSequence: p.planSketch.controlSequence, rationale: p.planSketch.rationale, assumptions: p.planSketch.assumptions }
      : null,
    provenance: p.provenance,
    notes: p.metadata.notes ?? [],
  }));

  const authorityStr: "AUTHORIZED" | "CONSTRAINED" | "REFUSED" = authority.mayAct
    ? "AUTHORIZED"
    : authority.mustDegrade
    ? "CONSTRAINED"
    : "REFUSED";

  return {
    runId: safeRunId(),
    timestamp: runTimestamp,
    missionId: missionContext.missionId,
    scenario,
    verificationStatus: verification.status as "LAWFUL" | "DEGRADED" | "INVALID",
    authority: authorityStr,
    actionOutcome,
    modelConfidenceScore: modelConfidence.score,
    proposalCount: proposalBundle.proposals.length,
    rejectedFragmentCount: proposalBundle.rejectedFragments.length,
    proposalReasons: proposalBundle.reasons,
    proposals: mappedProposals,
    verification: {
      feasibilityOk: verification.feasibilityOk,
      robustnessOk: verification.robustnessOk,
      observabilityOk: verification.observabilityOk,
      identifiabilityOk: verification.identifiabilityOk,
      modelOk: verification.modelOk,
      adaptationOk: verification.adaptationOk,
      status: verification.status as "LAWFUL" | "DEGRADED" | "INVALID",
      reasons: verification.reasons,
    },
    belief: {
      xHat: updatedBelief.xHat,
      epsilonX: updatedBelief.uncertainty.epsilonX,
      confidence: updatedBelief.confidence,
      identifiability: updatedBelief.identifiability,
      staleByMs: updatedBelief.staleByMs,
      thetaMean: updatedBelief.thetaHat.mean,
      thetaVariance: updatedBelief.thetaHat.variance ?? null,
      provenance: updatedBelief.provenance,
      lower: updatedBelief.uncertainty.lower ?? null,
      upper: updatedBelief.uncertainty.upper ?? null,
    },
    model: {
      activeModelId: activeModel.signature.id,
      version: activeModel.signature.version,
      delayAware: activeModel.signature.delayAware,
      confidenceScore: modelConfidence.score,
      degraded: modelConfidence.degraded,
      fallbackActive,
    },
    decision: {
      selectedPlanId: decision.selectedPlan?.id ?? "none",
      rankedCandidateCount: decision.ranking?.length ?? 0,
      rejectedCandidateCount: decision.rejectedPlans.length,
      robustnessEpsilon: decision.robustness?.epsilon ?? 0,
      robustnessEpsilonMin: epsilonMin,
      topRejectionReason: decision.rejectedPlans[0]?.reasons[0] ?? decision.reason ?? null,
    },
    audit: {
      recordId: auditRecord.id,
      timestamp: auditRecord.timestamp,
      outcome: actionOutcome,
      verificationStatus: verification.status as "LAWFUL" | "DEGRADED" | "INVALID",
      appliedControl,
      notes: auditRecord.notes ?? [],
    },
  };
}
