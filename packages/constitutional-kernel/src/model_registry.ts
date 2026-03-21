/**
 * model_registry.ts
 *
 * Constitutional role:
 * Implements the Model Layer.
 *
 * This module makes the operative model explicit rather than implicit.
 * It maintains:
 *   - active model class M(t)
 *   - model confidence c_M(t)
 *   - parameter belief updates
 *   - residual-based degradation detection
 *   - fallback model switching
 *
 * Source alignment:
 *   - stale assumptions are invalid, not approximately acceptable
 *   - delayed and non-delayed systems are distinct mathematical objects
 *   - false legibility must not be allowed to masquerade as truth
 *   - lawful control requires model consistency with reality
 */

import { ParameterBelief } from "./belief_state.js";

export interface ModelSignature {
  id: string;
  version: string;
  delayAware: boolean;
  stateDim: number;
  measurementDim: number;
  parameterNames: string[];
  description?: string;
}

export interface ModelConfidence {
  score: number; // [0,1]
  residualNorm: number;
  invariantResidualNorm: number;
  predictionErrorNorm: number;
  degraded: boolean;
  reasons: string[];
  timestamp: number;
}

export interface StateTransitionModel {
  predictNextState: (
    x: number[],
    u: number[],
    r: number[],
    w: number[],
    theta: Record<string, number>,
    t: number,
    dt: number
  ) => number[];

  predictMeasurement: (
    x: number[],
    u: number[],
    r: number[],
    w: number[],
    theta: Record<string, number>,
    t: number
  ) => number[];

  measurementJacobian?: (
    x: number[],
    u: number[],
    r: number[],
    w: number[],
    theta: Record<string, number>,
    t: number
  ) => number[][];

  fisherInformationMinEigenvalue?: (
    x: number[],
    u: number[],
    r: number[],
    w: number[],
    theta: Record<string, number>,
    t: number
  ) => number;
}

export interface RegisteredModel {
  signature: ModelSignature;
  implementation: StateTransitionModel;
  fallbackModelId?: string;
}

export interface ConfidenceInput {
  residualNorm: number;
  residualTolerance: number;
  invariantResidualNorm: number;
  invariantTolerance: number;
  predictionErrorNorm: number;
  predictionTolerance: number;
  timestamp: number;
}

export interface MismatchResult {
  mismatchDetected: boolean;
  degraded: boolean;
  reasons: string[];
}

export class ModelRegistry {
  private models = new Map<string, RegisteredModel>();
  private activeModelId: string | null = null;
  private confidence: ModelConfidence | null = null;
  private parameterBelief: ParameterBelief;

  constructor(initialParameterBelief: ParameterBelief) {
    this.parameterBelief = {
      mean: { ...initialParameterBelief.mean },
      variance: initialParameterBelief.variance
        ? { ...initialParameterBelief.variance }
        : undefined,
      identifiable: { ...initialParameterBelief.identifiable },
    };
  }

  public registerModel(model: RegisteredModel): void {
    if (this.models.has(model.signature.id)) {
      throw new Error(`ModelRegistry violation: duplicate model id '${model.signature.id}'.`);
    }
    this.models.set(model.signature.id, model);
    if (this.activeModelId === null) {
      this.activeModelId = model.signature.id;
    }
  }

  public setActiveModel(modelId: string): void {
    if (!this.models.has(modelId)) {
      throw new Error(`ModelRegistry violation: unknown model id '${modelId}'.`);
    }
    this.activeModelId = modelId;
  }

  public getActiveModel(): RegisteredModel {
    if (this.activeModelId === null) {
      throw new Error("ModelRegistry violation: no active model registered.");
    }
    const model = this.models.get(this.activeModelId);
    if (!model) {
      throw new Error("ModelRegistry violation: active model missing from registry.");
    }
    return model;
  }

  public getActiveSignature(): ModelSignature {
    return this.getActiveModel().signature;
  }

  public getConfidence(): ModelConfidence | null {
    return this.confidence ? { ...this.confidence, reasons: [...this.confidence.reasons] } : null;
  }

  public getParameterBelief(): ParameterBelief {
    return {
      mean: { ...this.parameterBelief.mean },
      variance: this.parameterBelief.variance ? { ...this.parameterBelief.variance } : undefined,
      identifiable: { ...this.parameterBelief.identifiable },
    };
  }

  public scoreConfidence(input: ConfidenceInput): ModelConfidence {
    const reasons: string[] = [];

    const residualRatio =
      input.residualTolerance > 0 ? input.residualNorm / input.residualTolerance : Number.POSITIVE_INFINITY;
    const invariantRatio =
      input.invariantTolerance > 0
        ? input.invariantResidualNorm / input.invariantTolerance
        : Number.POSITIVE_INFINITY;
    const predictionRatio =
      input.predictionTolerance > 0
        ? input.predictionErrorNorm / input.predictionTolerance
        : Number.POSITIVE_INFINITY;

    let score = 1.0;

    score -= Math.min(0.5, 0.2 * Math.max(0, residualRatio - 1));
    score -= Math.min(0.3, 0.15 * Math.max(0, invariantRatio - 1));
    score -= Math.min(0.3, 0.15 * Math.max(0, predictionRatio - 1));
    score = Math.max(0, Math.min(1, score));

    if (residualRatio > 1) {
      reasons.push(
        `Observation residual exceeds tolerance: ${input.residualNorm.toFixed(6)} > ${input.residualTolerance.toFixed(6)}`
      );
    }
    if (invariantRatio > 1) {
      reasons.push(
        `Invariant residual exceeds tolerance: ${input.invariantResidualNorm.toFixed(6)} > ${input.invariantTolerance.toFixed(6)}`
      );
    }
    if (predictionRatio > 1) {
      reasons.push(
        `Prediction error exceeds tolerance: ${input.predictionErrorNorm.toFixed(6)} > ${input.predictionTolerance.toFixed(6)}`
      );
    }

    const degraded = residualRatio > 1 || invariantRatio > 1 || predictionRatio > 1 || score < 0.5;

    if (score < 0.5) {
      reasons.push(`Model confidence low: score=${score.toFixed(3)}`);
    }

    this.confidence = {
      score,
      residualNorm: input.residualNorm,
      invariantResidualNorm: input.invariantResidualNorm,
      predictionErrorNorm: input.predictionErrorNorm,
      degraded,
      reasons,
      timestamp: input.timestamp,
    };

    return this.getConfidence() as ModelConfidence;
  }

  public detectMismatch(
    residualNorm: number,
    residualTolerance: number,
    invariantResidualNorm: number,
    invariantTolerance: number
  ): MismatchResult {
    const reasons: string[] = [];

    const residualMismatch = residualNorm > residualTolerance;
    const invariantMismatch = invariantResidualNorm > invariantTolerance;

    if (residualMismatch) {
      reasons.push(
        `Residual mismatch: ${residualNorm.toFixed(6)} > ${residualTolerance.toFixed(6)}`
      );
    }
    if (invariantMismatch) {
      reasons.push(
        `Invariant mismatch: ${invariantResidualNorm.toFixed(6)} > ${invariantTolerance.toFixed(6)}`
      );
    }

    const mismatchDetected = residualMismatch || invariantMismatch;
    const degraded = mismatchDetected || (this.confidence?.degraded ?? false);

    return { mismatchDetected, degraded, reasons };
  }

  /**
   * Constitutional rule:
   * parameters are epistemic objects, not sacred constants.
   */
  public updateParameterBelief(
    updater: (current: ParameterBelief) => ParameterBelief
  ): ParameterBelief {
    const next = updater(this.getParameterBelief());

    if (!next || !next.mean || typeof next.mean !== "object") {
      throw new Error("ModelRegistry violation: invalid parameter belief update.");
    }

    this.parameterBelief = {
      mean: { ...next.mean },
      variance: next.variance ? { ...next.variance } : undefined,
      identifiable: { ...next.identifiable },
    };

    return this.getParameterBelief();
  }

  /**
   * Fallback switching:
   * if the active model is degraded and has a declared fallback, the registry
   * may switch authority to that fallback model.
   */
  public switchFallbackModel(): RegisteredModel | null {
    const active = this.getActiveModel();
    if (!active.fallbackModelId) return null;
    if (!this.models.has(active.fallbackModelId)) {
      throw new Error(
        `ModelRegistry violation: fallback model '${active.fallbackModelId}' not registered.`
      );
    }
    this.activeModelId = active.fallbackModelId;
    return this.getActiveModel();
  }

  public predictNextState(
    x: number[],
    u: number[],
    r: number[],
    w: number[],
    t: number,
    dt: number
  ): number[] {
    const active = this.getActiveModel();
    return active.implementation.predictNextState(
      x,
      u,
      r,
      w,
      this.parameterBelief.mean,
      t,
      dt
    );
  }

  public predictMeasurement(
    x: number[],
    u: number[],
    r: number[],
    w: number[],
    t: number
  ): number[] {
    const active = this.getActiveModel();
    return active.implementation.predictMeasurement(
      x,
      u,
      r,
      w,
      this.parameterBelief.mean,
      t
    );
  }
}
