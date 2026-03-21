/**
 * robustness_analyzer.ts
 *
 * Constitutional role:
 * Implements Law II in executable form.
 *
 * This module computes:
 *   - local robustness radius epsilon
 *   - horizon-wide boundedness proxy
 *   - sensitivity amplification
 *   - margin report
 *   - fragile dimensions
 *
 * Source alignment:
 *   - L2.1 / T2.1: local robust feasibility
 *   - T2.2: global horizon-wide boundedness
 *   - T2.3: explicit safety margins
 *   - T2.4: delay-consistent stability
 *   - T2.5: robustness dominates cost
 */

import { FeasibilityEngine, FeasibilityInput, FeasibilityReport } from "./feasibility_engine.js";

export interface CandidatePlan {
  id: string;
  expectedCost: number;
  nominalX: number[];
  nominalU: number[];
  nominalR: number[];
  feasibilityInput: FeasibilityInput;
}

export interface RobustnessReport {
  epsilon: number;
  epsilonMin: number;
  bounded: boolean;
  horizonBound: number;
  marginReport: Record<string, number>;
  sensitivitySingularValues: number[];
  fragileDimensions: string[];
  delayConsistent: boolean;
  reasons: string[];
}

export interface RobustnessConfig {
  epsilonMin: number;
  delayPresent: boolean;
  analyzedOnDelayedModel: boolean;
  sensitivityMatrix?: number[][];
  nominalFeasibility?: FeasibilityReport;
}

function maxAbsRowSums(matrix?: number[][]): number[] {
  if (!matrix) return [];
  return matrix.map((row) => row.reduce((sum, v) => sum + Math.abs(v), 0));
}

export class RobustnessAnalyzer {
  constructor(private readonly feasibilityEngine = new FeasibilityEngine()) {}

  public analyzePlan(
    plan: CandidatePlan,
    config: RobustnessConfig
  ): RobustnessReport {
    const reasons: string[] = [];

    const nominalFeasibility =
      config.nominalFeasibility ?? this.feasibilityEngine.evaluate(plan.feasibilityInput);

    const minimumMargin = this.feasibilityEngine.computeMinimumMargin(nominalFeasibility);

    if (!nominalFeasibility.feasible) {
      reasons.push("Nominal trajectory is infeasible; robustness collapses to zero.");
    }

    /**
     * First-pass constitutional epsilon estimate:
     * robustness radius cannot exceed smallest known slack to constraint boundary.
     */
    const epsilon = nominalFeasibility.feasible && Number.isFinite(minimumMargin)
      ? Math.max(0, minimumMargin)
      : 0;

    const sensitivitySingularValues = this.estimateSensitivitySpectrum(config.sensitivityMatrix);
    const maxSensitivity = sensitivitySingularValues.length > 0
      ? Math.max(...sensitivitySingularValues)
      : 1;

    /**
     * Global boundedness proxy:
     * finite epsilon with finite sensitivity -> bounded proxy.
     * In a fuller implementation, replace with Lyapunov / reachability / Monte Carlo.
     */
    const horizonBound = epsilon === 0
      ? Number.POSITIVE_INFINITY
      : maxSensitivity * Math.max(1, 1 / Math.max(epsilon, 1e-8));

    const bounded = Number.isFinite(horizonBound);

    const marginReport = this.buildMarginReport(nominalFeasibility);
    const fragileDimensions = this.flagFragileDimensions(
      marginReport,
      sensitivitySingularValues,
      epsilon,
      config.epsilonMin
    );

    const delayConsistent = !config.delayPresent || config.analyzedOnDelayedModel;
    if (!delayConsistent) {
      reasons.push("Robustness/stability assessed on non-delayed model despite nonzero delays.");
    }

    if (epsilon < config.epsilonMin) {
      reasons.push(
        `Robustness radius below minimum threshold: epsilon=${epsilon.toFixed(6)} < epsilonMin=${config.epsilonMin.toFixed(6)}`
      );
    }

    if (!bounded) {
      reasons.push("Global horizon bound is not finite.");
    }

    return {
      epsilon,
      epsilonMin: config.epsilonMin,
      bounded,
      horizonBound,
      marginReport,
      sensitivitySingularValues,
      fragileDimensions,
      delayConsistent,
      reasons,
    };
  }

  /**
   * Constitutional lexicographic order:
   * feasibility first, robustness second, cost third.
   *
   * Generic over the plan type so callers that use a subtype of CandidatePlan
   * (e.g. DecisionEngine's extended CandidatePlan) retain the full type.
   */
  public rankByRobustnessThenCost<P extends CandidatePlan>(
    plans: Array<{ plan: P; robustness: RobustnessReport; feasible: boolean; feasibility: FeasibilityReport }>
  ): Array<{ plan: P; robustness: RobustnessReport; feasible: boolean; feasibility: FeasibilityReport }> {
    return [...plans].sort((a, b) => {
      if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
      if (a.robustness.epsilon !== b.robustness.epsilon) {
        return b.robustness.epsilon - a.robustness.epsilon;
      }
      return a.plan.expectedCost - b.plan.expectedCost;
    });
  }

  private buildMarginReport(feasibility: FeasibilityReport): Record<string, number> {
    const report: Record<string, number> = {};
    for (const check of [
      ...feasibility.inequalityChecks,
      ...feasibility.resourceChecks,
      ...feasibility.terminalChecks,
      ...feasibility.conservationChecks,
      ...feasibility.equalityChecks,
    ]) {
      report[check.name] = check.margin ?? Number.NaN;
    }
    return report;
  }

  private estimateSensitivitySpectrum(matrix?: number[][]): number[] {
    /**
     * First-pass substitute for full SVD:
     * use absolute row sums as conservative magnitude indicators.
     * In later versions, replace with true singular values.
     */
    return maxAbsRowSums(matrix).sort((a, b) => b - a);
  }

  private flagFragileDimensions(
    marginReport: Record<string, number>,
    sensitivitySpectrum: number[],
    epsilon: number,
    epsilonMin: number
  ): string[] {
    const fragile: string[] = [];

    for (const [name, margin] of Object.entries(marginReport)) {
      if (!Number.isFinite(margin) || margin <= 0) {
        fragile.push(name);
      }
    }

    if (epsilon < epsilonMin) {
      fragile.push("global_robustness_radius");
    }

    sensitivitySpectrum.forEach((sigma, idx) => {
      if (sigma > 10) fragile.push(`sensitivity_mode_${idx}`);
    });

    return [...new Set(fragile)];
  }
}
