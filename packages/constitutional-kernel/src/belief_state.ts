/**
 * belief_state.ts
 *
 * Constitutional role:
 * Implements the Epistemic Layer.
 *
 * This module maintains an explicit belief state rather than a bare estimate.
 * It encodes:
 *   - xHat(t)
 *   - thetaHat
 *   - epsilonX
 *   - uncertainty envelope
 *   - identifiability status
 *   - staleness
 *   - provenance
 *
 * Source alignment:
 *   - A4: bounded measurement is required before bounded state knowledge
 *   - Law III / T3.2: epsilon_z -> epsilon_x -> epsilon_control chain must be explicit
 *   - T3.3: delayed measurements require forward propagation
 *   - T3.5: false legibility must be detectable
 */

export type IdentifiabilityStatus = "FULL" | "PARTIAL" | "NONE";
export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface UncertaintyEnvelope {
  /**
   * Explicit state estimation tolerance.
   * Constitutional invariant: must always be present for any belief
   * returned to decision/control.
   */
  epsilonX: number;

  covariance?: number[][];
  lower?: number[];
  upper?: number[];
}

export interface ParameterBelief {
  mean: Record<string, number>;
  variance?: Record<string, number>;
  identifiable: Record<string, boolean>;
}

export interface BeliefState {
  xHat: number[];
  thetaHat: ParameterBelief;
  uncertainty: UncertaintyEnvelope;
  confidence: ConfidenceBand;
  identifiability: IdentifiabilityStatus;
  staleByMs: number;
  provenance: string[];
  timestamp: number;
}

export interface MeasurementSnapshot {
  z: number[];
  epsilonZ: number;
  timestamp: number;
  delayMs?: number;
  source?: string;
}

export interface ForwardModel {
  predictNextState: (
    x: number[],
    u: number[],
    r: number[],
    w: number[],
    theta: Record<string, number>,
    t: number,
    dt: number
  ) => number[];
}

export interface BeliefUpdateInput {
  prior: BeliefState;
  measurement?: MeasurementSnapshot;
  innovationNorm?: number;
  nextXHat?: number[];
  nextThetaHat?: ParameterBelief;
  provenance?: string[];
}

export interface BeliefValidationResult {
  valid: boolean;
  reasons: string[];
}

/** Utility: deep clone covariance without external deps. */
function cloneMatrix(m?: number[][]): number[][] | undefined {
  return m ? m.map((row) => [...row]) : undefined;
}

function maxAbs(v: number[]): number {
  return v.reduce((acc, x) => Math.max(acc, Math.abs(x)), 0);
}

function inferConfidenceFromInnovation(
  innovationNorm: number | undefined,
  epsilonZ: number | undefined,
  staleByMs: number
): ConfidenceBand {
  if (innovationNorm === undefined || epsilonZ === undefined) {
    return staleByMs > 0 ? "LOW" : "UNKNOWN";
  }

  const ratio = epsilonZ > 0 ? innovationNorm / epsilonZ : Number.POSITIVE_INFINITY;

  if (staleByMs > 0 && ratio > 1.5) return "LOW";
  if (ratio <= 0.75 && staleByMs === 0) return "HIGH";
  if (ratio <= 1.25) return "MEDIUM";
  return "LOW";
}

export class BeliefStateManager {
  private belief: BeliefState;

  constructor(initialBelief: BeliefState) {
    this.assertConstitutionalBelief(initialBelief);
    this.belief = {
      ...initialBelief,
      xHat: [...initialBelief.xHat],
      thetaHat: {
        mean: { ...initialBelief.thetaHat.mean },
        variance: initialBelief.thetaHat.variance
          ? { ...initialBelief.thetaHat.variance }
          : undefined,
        identifiable: { ...initialBelief.thetaHat.identifiable },
      },
      uncertainty: {
        epsilonX: initialBelief.uncertainty.epsilonX,
        covariance: cloneMatrix(initialBelief.uncertainty.covariance),
        lower: initialBelief.uncertainty.lower
          ? [...initialBelief.uncertainty.lower]
          : undefined,
        upper: initialBelief.uncertainty.upper
          ? [...initialBelief.uncertainty.upper]
          : undefined,
      },
      provenance: [...initialBelief.provenance],
    };
  }

  public getBelief(): BeliefState {
    return {
      ...this.belief,
      xHat: [...this.belief.xHat],
      thetaHat: {
        mean: { ...this.belief.thetaHat.mean },
        variance: this.belief.thetaHat.variance
          ? { ...this.belief.thetaHat.variance }
          : undefined,
        identifiable: { ...this.belief.thetaHat.identifiable },
      },
      uncertainty: {
        epsilonX: this.belief.uncertainty.epsilonX,
        covariance: cloneMatrix(this.belief.uncertainty.covariance),
        lower: this.belief.uncertainty.lower ? [...this.belief.uncertainty.lower] : undefined,
        upper: this.belief.uncertainty.upper ? [...this.belief.uncertainty.upper] : undefined,
      },
      provenance: [...this.belief.provenance],
    };
  }

  /**
   * Constitutional invariant checker:
   * No belief may lawfully circulate without explicit epsilonX.
   */
  public validateBelief(belief: BeliefState = this.belief): BeliefValidationResult {
    const reasons: string[] = [];

    if (!Number.isFinite(belief.uncertainty.epsilonX) || belief.uncertainty.epsilonX < 0) {
      reasons.push("Invalid or missing epsilonX.");
    }

    if (!Number.isFinite(belief.timestamp)) {
      reasons.push("Invalid belief timestamp.");
    }

    if (!Array.isArray(belief.xHat) || belief.xHat.length === 0) {
      reasons.push("xHat must be a non-empty state vector.");
    }

    if (!["FULL", "PARTIAL", "NONE"].includes(belief.identifiability)) {
      reasons.push("Invalid identifiability status.");
    }

    if (!["HIGH", "MEDIUM", "LOW", "UNKNOWN"].includes(belief.confidence)) {
      reasons.push("Invalid confidence band.");
    }

    return {
      valid: reasons.length === 0,
      reasons,
    };
  }

  public update(input: BeliefUpdateInput): BeliefState {
    const nextBelief: BeliefState = {
      xHat: input.nextXHat ? [...input.nextXHat] : [...input.prior.xHat],
      thetaHat: input.nextThetaHat
        ? {
            mean: { ...input.nextThetaHat.mean },
            variance: input.nextThetaHat.variance
              ? { ...input.nextThetaHat.variance }
              : undefined,
            identifiable: { ...input.nextThetaHat.identifiable },
          }
        : {
            mean: { ...input.prior.thetaHat.mean },
            variance: input.prior.thetaHat.variance
              ? { ...input.prior.thetaHat.variance }
              : undefined,
            identifiable: { ...input.prior.thetaHat.identifiable },
          },
      uncertainty: {
        epsilonX: this.computeUpdatedEpsilonX(
          input.prior.uncertainty.epsilonX,
          input.measurement?.epsilonZ,
          input.innovationNorm
        ),
        covariance: cloneMatrix(input.prior.uncertainty.covariance),
        lower: input.prior.uncertainty.lower ? [...input.prior.uncertainty.lower] : undefined,
        upper: input.prior.uncertainty.upper ? [...input.prior.uncertainty.upper] : undefined,
      },
      confidence: inferConfidenceFromInnovation(
        input.innovationNorm,
        input.measurement?.epsilonZ,
        input.measurement?.delayMs ?? 0
      ),
      identifiability: input.prior.identifiability,
      staleByMs: input.measurement?.delayMs ?? 0,
      provenance: [
        ...input.prior.provenance,
        ...(input.provenance ?? []),
        ...(input.measurement?.source ? [`measurement:${input.measurement.source}`] : []),
      ],
      timestamp: input.measurement?.timestamp ?? input.prior.timestamp,
    };

    this.assertConstitutionalBelief(nextBelief);
    this.belief = nextBelief;
    return this.getBelief();
  }

  /**
   * Forward propagate a stale estimate using the system model.
   * This is the runtime counterpart of T3.3.
   */
  public propagateForward(
    model: ForwardModel,
    control: number[],
    resources: number[],
    disturbances: number[],
    currentTime: number
  ): BeliefState {
    const dtMs = Math.max(0, currentTime - this.belief.timestamp);
    const dt = dtMs / 1000;

    if (dt <= 0) {
      return this.getBelief();
    }

    const propagated = model.predictNextState(
      this.belief.xHat,
      control,
      resources,
      disturbances,
      this.belief.thetaHat.mean,
      this.belief.timestamp / 1000,
      dt
    );

    // Conservative widening under propagation through time.
    const wideningFactor = 1 + Math.min(5, dt * 0.25);
    const next: BeliefState = {
      ...this.getBelief(),
      xHat: propagated,
      uncertainty: this.widenEnvelope(this.belief.uncertainty, wideningFactor),
      staleByMs: 0,
      timestamp: currentTime,
      provenance: [...this.belief.provenance, `forward_propagated:${dt.toFixed(3)}s`],
      confidence:
        this.belief.confidence === "HIGH" ? "MEDIUM" : this.belief.confidence === "MEDIUM" ? "LOW" : this.belief.confidence,
    };

    this.assertConstitutionalBelief(next);
    this.belief = next;
    return this.getBelief();
  }

  public markStale(delayMs: number, reason = "stale_measurement"): BeliefState {
    const next: BeliefState = {
      ...this.getBelief(),
      staleByMs: Math.max(0, delayMs),
      provenance: [...this.belief.provenance, reason],
      confidence:
        this.belief.confidence === "HIGH"
          ? "MEDIUM"
          : this.belief.confidence === "MEDIUM"
          ? "LOW"
          : this.belief.confidence,
    };

    this.assertConstitutionalBelief(next);
    this.belief = next;
    return this.getBelief();
  }

  public setIdentifiability(status: IdentifiabilityStatus, reason?: string): BeliefState {
    const next: BeliefState = {
      ...this.getBelief(),
      identifiability: status,
      provenance: reason ? [...this.belief.provenance, `identifiability:${reason}`] : [...this.belief.provenance],
    };

    this.assertConstitutionalBelief(next);
    this.belief = next;
    return this.getBelief();
  }

  public widenUncertainty(factor: number, reason = "uncertainty_widened"): BeliefState {
    const next: BeliefState = {
      ...this.getBelief(),
      uncertainty: this.widenEnvelope(this.belief.uncertainty, factor),
      provenance: [...this.belief.provenance, `${reason}:${factor}`],
      confidence:
        this.belief.confidence === "HIGH"
          ? "MEDIUM"
          : this.belief.confidence === "MEDIUM"
          ? "LOW"
          : this.belief.confidence,
    };

    this.assertConstitutionalBelief(next);
    this.belief = next;
    return this.getBelief();
  }

  public detectFalseLegibility(innovationNorm: number, epsilonZ: number): boolean {
    /**
     * False legibility:
     * confidence appears high while residual evidence is poor.
     */
    const highConfidence = this.belief.confidence === "HIGH";
    const excessiveResidual = innovationNorm > epsilonZ;
    const lowStaleness = this.belief.staleByMs === 0;
    return highConfidence && excessiveResidual && lowStaleness;
  }

  private computeUpdatedEpsilonX(
    priorEpsilonX: number,
    epsilonZ?: number,
    innovationNorm?: number
  ): number {
    if (epsilonZ === undefined || innovationNorm === undefined) {
      return Math.max(priorEpsilonX, priorEpsilonX * 1.05);
    }

    /**
     * Conservative constitutional rule:
     * state tolerance cannot collapse below measurement scale without explicit proof.
     */
    return Math.max(priorEpsilonX * 0.9, epsilonZ, innovationNorm);
  }

  private widenEnvelope(env: UncertaintyEnvelope, factor: number): UncertaintyEnvelope {
    const safeFactor = Number.isFinite(factor) && factor > 1 ? factor : 1;
    return {
      epsilonX: env.epsilonX * safeFactor,
      covariance: env.covariance
        ? env.covariance.map((row) => row.map((v) => v * safeFactor))
        : undefined,
      lower: env.lower ? env.lower.map((v) => v - env.epsilonX * (safeFactor - 1)) : undefined,
      upper: env.upper ? env.upper.map((v) => v + env.epsilonX * (safeFactor - 1)) : undefined,
    };
  }

  private assertConstitutionalBelief(belief: BeliefState): void {
    const result = this.validateBelief(belief);
    if (!result.valid) {
      throw new Error(`BeliefState constitutional violation: ${result.reasons.join("; ")}`);
    }
    if (maxAbs(belief.xHat) === Number.POSITIVE_INFINITY) {
      throw new Error("BeliefState constitutional violation: non-finite state values.");
    }
  }
}
