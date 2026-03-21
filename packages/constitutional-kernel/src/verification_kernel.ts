/**
 * verification_kernel.ts
 *
 * Constitutional role:
 * Verification supremacy.
 *
 * This module is the final cross-layer legality authority.
 * Everything else may propose; verification alone may authorize.
 *
 * It checks:
 *   - Law I: feasibility and conservation
 *   - Law II: robustness and delay consistency
 *   - Law III: observability / information sufficiency / false legibility
 *   - Law IV: adaptation integrity and recovery status
 *
 * Source alignment:
 *   - synthesis section and failure mode table
 *   - lower-layer supremacy rule
 *   - final runtime classification:
 *       LAWFUL / DEGRADED / INVALID
 */

import { FeasibilityReport } from "./feasibility_engine.js";
import { RobustnessReport } from "./robustness_analyzer.js";
import { ObserverResult } from "./observer.js";
import { BeliefState } from "./belief_state.js";

export type SystemStatus = "LAWFUL" | "DEGRADED" | "INVALID";

export interface AdaptationStatus {
  inRecoveryTube: boolean;
  objectiveDrift: number;
  objectiveTolerance: number;
  invariantError: number;
  invariantTolerance: number;
}

export interface ModelAdequacyStatus {
  confidenceScore: number;
  degraded: boolean;
  residualNorm: number;
  residualTolerance: number;
}

export interface VerificationInput {
  belief: BeliefState;
  feasibility: FeasibilityReport;
  robustness: RobustnessReport;
  observer: ObserverResult;
  adaptation: AdaptationStatus;
  model: ModelAdequacyStatus;
}

export interface VerificationReport {
  status: SystemStatus;
  feasibilityOk: boolean;
  robustnessOk: boolean;
  observabilityOk: boolean;
  identifiabilityOk: boolean;
  modelOk: boolean;
  adaptationOk: boolean;
  reasons: string[];
}

export class VerificationKernel {
  public verify(input: VerificationInput): VerificationReport {
    const reasons: string[] = [];

    const feasibilityOk = this.verifyFeasibility(input.feasibility, reasons);
    const robustnessOk = this.verifyRobustness(input.robustness, reasons);
    const observabilityOk = this.verifyObservability(input.observer, input.belief, reasons);
    const identifiabilityOk = input.belief.identifiability !== "NONE";
    if (!identifiabilityOk) {
      reasons.push("Identifiability failure: belief marked NONE.");
    }

    const modelOk = this.verifyModelAdequacy(input.model, reasons);
    const adaptationOk = this.verifyAdaptationIntegrity(input.adaptation, reasons);

    const status = this.computeFinalStatus({
      feasibilityOk,
      robustnessOk,
      observabilityOk,
      identifiabilityOk,
      modelOk,
      adaptationOk,
      reasons,
    });

    return {
      status,
      feasibilityOk,
      robustnessOk,
      observabilityOk,
      identifiabilityOk,
      modelOk,
      adaptationOk,
      reasons,
    };
  }

  private verifyFeasibility(report: FeasibilityReport, reasons: string[]): boolean {
    if (report.stale) {
      reasons.push("Verification failure: solution is stale.");
      return false;
    }
    if (!report.feasible) {
      reasons.push("Verification failure: feasibility violated.");
      return false;
    }
    const conservationFailure = report.conservationChecks.some((c) => !c.passed);
    if (conservationFailure) {
      reasons.push("Verification failure: conservation law violated.");
      return false;
    }
    return true;
  }

  private verifyRobustness(report: RobustnessReport, reasons: string[]): boolean {
    let ok = true;
    if (report.epsilon < report.epsilonMin) {
      reasons.push("Verification degradation: robustness radius below threshold.");
      ok = false;
    }
    if (!report.bounded) {
      reasons.push("Verification failure: global horizon boundedness absent.");
      ok = false;
    }
    if (!report.delayConsistent) {
      reasons.push("Verification failure: delay-inconsistent robustness certificate.");
      ok = false;
    }
    return ok;
  }

  private verifyObservability(
    observer: ObserverResult,
    belief: BeliefState,
    reasons: string[]
  ): boolean {
    let ok = true;

    if (!observer.observable) {
      reasons.push("Verification failure: system not observable at required level.");
      ok = false;
    }
    if (!observer.informationSufficient) {
      reasons.push("Verification degradation: information insufficient for required estimation fidelity.");
      ok = false;
    }
    if (observer.falseLegibilityRisk) {
      reasons.push("Verification failure: false legibility risk detected.");
      ok = false;
    }
    if (belief.staleByMs > 0) {
      reasons.push(`Verification degradation: belief carries staleness ${belief.staleByMs} ms.`);
      ok = false;
    }

    return ok;
  }

  private verifyModelAdequacy(
    model: ModelAdequacyStatus,
    reasons: string[]
  ): boolean {
    let ok = true;

    if (model.degraded) {
      reasons.push("Verification degradation: active model marked degraded.");
      ok = false;
    }
    if (model.residualNorm > model.residualTolerance) {
      reasons.push(
        `Verification degradation: model residual ${model.residualNorm.toFixed(6)} exceeds tolerance ${model.residualTolerance.toFixed(6)}.`
      );
      ok = false;
    }
    if (model.confidenceScore < 0.5) {
      reasons.push(
        `Verification degradation: model confidence too low (${model.confidenceScore.toFixed(3)}).`
      );
      ok = false;
    }

    return ok;
  }

  private verifyAdaptationIntegrity(
    adaptation: AdaptationStatus,
    reasons: string[]
  ): boolean {
    let ok = true;

    if (!adaptation.inRecoveryTube) {
      reasons.push("Verification degradation: trajectory outside recovery tube.");
      ok = false;
    }
    if (adaptation.objectiveDrift > adaptation.objectiveTolerance) {
      reasons.push(
        `Verification degradation: objective drift ${adaptation.objectiveDrift.toFixed(
          6
        )} exceeds tolerance ${adaptation.objectiveTolerance.toFixed(6)}.`
      );
      ok = false;
    }
    if (adaptation.invariantError > adaptation.invariantTolerance) {
      reasons.push(
        `Verification failure: invariant error ${adaptation.invariantError.toFixed(
          6
        )} exceeds tolerance ${adaptation.invariantTolerance.toFixed(6)}.`
      );
      ok = false;
    }

    return ok;
  }

  private computeFinalStatus(flags: {
    feasibilityOk: boolean;
    robustnessOk: boolean;
    observabilityOk: boolean;
    identifiabilityOk: boolean;
    modelOk: boolean;
    adaptationOk: boolean;
    reasons: string[];
  }): SystemStatus {
    /**
     * Lower-layer supremacy:
     * - feasibility/conservation failure => INVALID
     * - identifiability collapse => INVALID
     * - false-legibility or adaptation invariant failure already pushed reasons accordingly
     * - otherwise degradations remain DEGRADED
     */

    const invalidTriggers =
      !flags.feasibilityOk || !flags.identifiabilityOk;

    if (invalidTriggers) return "INVALID";

    const degradedTriggers =
      !flags.robustnessOk ||
      !flags.observabilityOk ||
      !flags.modelOk ||
      !flags.adaptationOk;

    return degradedTriggers ? "DEGRADED" : "LAWFUL";
  }
}
