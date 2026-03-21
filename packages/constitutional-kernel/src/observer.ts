/**
 * observer.ts
 *
 * Constitutional role:
 * Implements Law III in executable form.
 *
 * The observer transforms measurements into lawful state belief updates.
 * It must never treat an estimate as authoritative when observability,
 * identifiability, delay handling, or information sufficiency fail.
 *
 * Source alignment:
 *   - L3.1 / T3.1: observability injectivity / verification
 *   - T3.2: tolerance chain epsilon_z -> epsilon_x -> epsilon_control
 *   - T3.3: delay correction through forward propagation
 *   - T3.4: information sufficiency
 *   - T3.5: false legibility detection
 */

import {
  BeliefState,
  BeliefStateManager,
  MeasurementSnapshot,
  IdentifiabilityStatus,
  ForwardModel,
} from "./belief_state.js";

export interface ObserverModel extends ForwardModel {
  predictMeasurement: (
    x: number[],
    u: number[],
    r: number[],
    w: number[],
    theta: Record<string, number>,
    t: number
  ) => number[];

  /**
   * Optional linearized measurement matrix C for rank/observability checks.
   */
  measurementJacobian?: (
    x: number[],
    u: number[],
    r: number[],
    w: number[],
    theta: Record<string, number>,
    t: number
  ) => number[][];

  /**
   * Optional Fisher information lower bound estimate.
   */
  fisherInformationMinEigenvalue?: (
    x: number[],
    u: number[],
    r: number[],
    w: number[],
    theta: Record<string, number>,
    t: number
  ) => number;
}

export interface ObserverResiduals {
  innovation: number[];
  innovationNorm: number;
  biasSuspected: boolean;
  driftSuspected: boolean;
  delayDetected: boolean;
}

export interface ObserverResult {
  belief: BeliefState;
  residuals: ObserverResiduals;
  observabilityRank: number;
  observable: boolean;
  informationSufficient: boolean;
  falseLegibilityRisk: boolean;
  reasons: string[];
}

export interface ObserveInput {
  priorBelief: BeliefState;
  measurement: MeasurementSnapshot;
  model: ObserverModel;
  control: number[];
  resources: number[];
  disturbances: number[];
  currentTime: number;
  requiredEpsilonX: number;
  requiredFisherMin?: number;
}

function euclideanNorm(v: number[]): number {
  return Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
}

function subtract(a: number[], b: number[]): number[] {
  const n = Math.max(a.length, b.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = (a[i] ?? 0) - (b[i] ?? 0);
  }
  return out;
}

function rankEstimate(matrix?: number[][], tol = 1e-9): number {
  if (!matrix || matrix.length === 0) return 0;

  const A = matrix.map((row) => [...row]);
  const m = A.length;
  const n = A[0]?.length ?? 0;
  let rank = 0;
  let row = 0;

  for (let col = 0; col < n && row < m; col += 1) {
    let pivot = row;
    for (let i = row + 1; i < m; i += 1) {
      if (Math.abs((A[i] as number[])[col] as number) > Math.abs((A[pivot] as number[])[col] as number)) {
        pivot = i;
      }
    }
    if (Math.abs((A[pivot] as number[])[col] as number) <= tol) continue;

    [A[row], A[pivot]] = [A[pivot] as number[], A[row] as number[]];
    const pivotVal = (A[row] as number[])[col] as number;

    for (let j = col; j < n; j += 1) {
      (A[row] as number[])[j] /= pivotVal;
    }

    for (let i = 0; i < m; i += 1) {
      if (i === row) continue;
      const factor = (A[i] as number[])[col] as number;
      for (let j = col; j < n; j += 1) {
        (A[i] as number[])[j] -= factor * ((A[row] as number[])[j] as number);
      }
    }

    rank += 1;
    row += 1;
  }

  return rank;
}

export class Observer {
  public observe(input: ObserveInput): ObserverResult {
    const reasons: string[] = [];
    const manager = new BeliefStateManager(input.priorBelief);

    // Step 1: mark stale if delayed
    if ((input.measurement.delayMs ?? 0) > 0) {
      manager.markStale(input.measurement.delayMs ?? 0, "measurement_delay_detected");
      reasons.push(`Measurement delay detected: ${input.measurement.delayMs} ms`);
    }

    // Step 2: if delayed, forward propagate from prior timestamp to current time
    if ((input.measurement.delayMs ?? 0) > 0 && input.currentTime > input.priorBelief.timestamp) {
      manager.propagateForward(
        input.model,
        input.control,
        input.resources,
        input.disturbances,
        input.currentTime
      );
      reasons.push("Belief forward propagated to compensate delayed measurement.");
    }

    const workingBelief = manager.getBelief();

    // Step 3: predicted measurement
    const zPred = input.model.predictMeasurement(
      workingBelief.xHat,
      input.control,
      input.resources,
      input.disturbances,
      workingBelief.thetaHat.mean,
      input.currentTime / 1000
    );

    const innovation = subtract(input.measurement.z, zPred);
    const innovationNorm = euclideanNorm(innovation);

    // Step 4: crude correction step
    // First-pass architecture: innovation injected directly into state channels where dimensions overlap.
    const correctedXHat = [...workingBelief.xHat];
    const gain = this.selectConservativeInnovationGain(
      innovationNorm,
      input.measurement.epsilonZ,
      workingBelief.identifiability
    );

    for (let i = 0; i < Math.min(correctedXHat.length, innovation.length); i += 1) {
      (correctedXHat as number[])[i] += gain * ((innovation as number[])[i] ?? 0);
    }

    // Step 5: observability check
    const C = input.model.measurementJacobian?.(
      correctedXHat,
      input.control,
      input.resources,
      input.disturbances,
      workingBelief.thetaHat.mean,
      input.currentTime / 1000
    );

    const observabilityRank = rankEstimate(C);
    const observable =
      C !== undefined ? observabilityRank >= correctedXHat.length : innovation.length >= correctedXHat.length;

    if (!observable) {
      reasons.push("Observability insufficient for full state recovery.");
      manager.setIdentifiability("PARTIAL", "observability_rank_deficient");
    }

    // Step 6: information sufficiency
    let informationSufficient = true;
    if (input.model.fisherInformationMinEigenvalue && input.requiredFisherMin !== undefined) {
      const fisherMin = input.model.fisherInformationMinEigenvalue(
        correctedXHat,
        input.control,
        input.resources,
        input.disturbances,
        workingBelief.thetaHat.mean,
        input.currentTime / 1000
      );
      informationSufficient = fisherMin >= input.requiredFisherMin;
      if (!informationSufficient) {
        reasons.push(
          `Information insufficiency: lambda_min(I_F)=${fisherMin.toFixed(6)} < required ${input.requiredFisherMin.toFixed(6)}`
        );
        manager.setIdentifiability("PARTIAL", "fisher_information_insufficient");
        manager.widenUncertainty(1.25, "information_insufficient");
      }
    }

    // Step 7: update belief
    manager.update({
      prior: manager.getBelief(),
      measurement: input.measurement,
      innovationNorm,
      nextXHat: correctedXHat,
      provenance: ["observer_update"],
    });

    // Step 8: enforce epsilonX floor from requirement
    const nextBelief = manager.getBelief();
    if (nextBelief.uncertainty.epsilonX > input.requiredEpsilonX) {
      reasons.push(
        `Estimated state tolerance exceeds required bound: epsilonX=${nextBelief.uncertainty.epsilonX.toFixed(
          6
        )} > required ${input.requiredEpsilonX.toFixed(6)}`
      );
    }

    const biasSuspected = innovationNorm > input.measurement.epsilonZ * 1.5;
    const driftSuspected = (input.measurement.delayMs ?? 0) > 0 && innovationNorm > input.measurement.epsilonZ;
    const falseLegibilityRisk = manager.detectFalseLegibility(
      innovationNorm,
      input.measurement.epsilonZ
    );

    if (falseLegibilityRisk) {
      reasons.push("False legibility risk detected: confidence too high relative to residual evidence.");
    }

    return {
      belief: manager.getBelief(),
      residuals: {
        innovation,
        innovationNorm,
        biasSuspected,
        driftSuspected,
        delayDetected: (input.measurement.delayMs ?? 0) > 0,
      },
      observabilityRank,
      observable,
      informationSufficient,
      falseLegibilityRisk,
      reasons,
    };
  }

  private selectConservativeInnovationGain(
    innovationNorm: number,
    epsilonZ: number,
    identifiability: IdentifiabilityStatus
  ): number {
    if (identifiability === "NONE") return 0;
    if (identifiability === "PARTIAL") return 0.1;
    if (innovationNorm <= epsilonZ) return 0.25;
    if (innovationNorm <= 2 * epsilonZ) return 0.15;
    return 0.05;
  }
}
