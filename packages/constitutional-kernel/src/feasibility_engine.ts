/**
 * feasibility_engine.ts
 *
 * Constitutional role:
 * Implements Law I in executable form.
 *
 * This module checks:
 *   - equality constraints
 *   - inequality constraints
 *   - resource non-negativity
 *   - terminal conditions
 *   - conservation laws
 *   - stale manifold invalidation
 *
 * Source alignment:
 *   - A2: feasibility is necessary
 *   - A3: conservation laws are inviolable
 *   - L1.2 / T1.1: stale manifold invalidity / recomputation obligation
 *   - T1.3: lawful solution workflow must halt on infeasible or non-conservative outputs
 */

export interface ConstraintCheck {
  name: string;
  passed: boolean;
  value: number;
  threshold?: number;
  margin?: number;
  reason?: string;
}

export interface FeasibilityReport {
  feasible: boolean;
  stale: boolean;
  equalityChecks: ConstraintCheck[];
  inequalityChecks: ConstraintCheck[];
  resourceChecks: ConstraintCheck[];
  terminalChecks: ConstraintCheck[];
  conservationChecks: ConstraintCheck[];
  reasons: string[];
}

export interface ConstraintDefinition {
  name: string;
  evaluate: (x: number[], u: number[], r: number[], t: number) => number;
  tolerance?: number;
  margin?: number;
}

export interface ResourceDefinition {
  name: string;
  index: number;
  lowerBound?: number;
}

export interface DependencyStamp {
  version: string;
  keys: string[];
}

export interface FeasibilityInput {
  x: number[];
  u: number[];
  r: number[];
  t: number;
  xT?: number[];
  rT?: number[];
  theta?: Record<string, number>;

  equalityConstraints: ConstraintDefinition[];
  inequalityConstraints: ConstraintDefinition[];
  terminalConstraints?: ConstraintDefinition[];
  conservationConstraints: ConstraintDefinition[];
  resources: ResourceDefinition[];

  currentDependencyStamp: DependencyStamp;
  solutionDependencyStamp: DependencyStamp;
}

function approxZero(value: number, tol: number): boolean {
  return Math.abs(value) <= tol;
}

export class FeasibilityEngine {
  public evaluate(input: FeasibilityInput): FeasibilityReport {
    const reasons: string[] = [];
    const stale = this.isStale(input.solutionDependencyStamp, input.currentDependencyStamp);

    if (stale) {
      reasons.push("Solution is computed on a stale dependency manifold.");
    }

    const equalityChecks = input.equalityConstraints.map((c) => {
      const value = c.evaluate(input.x, input.u, input.r, input.t);
      const tolerance = c.tolerance ?? 1e-8;
      const passed = approxZero(value, tolerance);
      return {
        name: c.name,
        passed,
        value,
        threshold: tolerance,
        margin: tolerance - Math.abs(value),
        reason: passed ? undefined : `Equality violated: |${value}| > ${tolerance}`,
      };
    });

    const inequalityChecks = input.inequalityConstraints.map((c) => {
      const value = c.evaluate(input.x, input.u, input.r, input.t);
      const margin = c.margin ?? 0;
      const passed = value <= -margin;
      return {
        name: c.name,
        passed,
        value,
        threshold: -margin,
        margin: -margin - value,
        reason: passed ? undefined : `Inequality violated or insufficient margin: ${value} > ${-margin}`,
      };
    });

    const resourceChecks = input.resources.map((res) => {
      const value = input.r[res.index] ?? Number.NaN;
      const lowerBound = res.lowerBound ?? 0;
      const passed = Number.isFinite(value) && value >= lowerBound;
      return {
        name: res.name,
        passed,
        value,
        threshold: lowerBound,
        margin: value - lowerBound,
        reason: passed ? undefined : `Resource below lower bound: ${value} < ${lowerBound}`,
      };
    });

    const terminalChecks = (input.terminalConstraints ?? []).map((c) => {
      const xT = input.xT ?? input.x;
      const rT = input.rT ?? input.r;
      const value = c.evaluate(xT, input.u, rT, input.t);
      const margin = c.margin ?? 0;
      const passed = value <= -margin;
      return {
        name: c.name,
        passed,
        value,
        threshold: -margin,
        margin: -margin - value,
        reason: passed ? undefined : `Terminal condition violated: ${value} > ${-margin}`,
      };
    });

    const conservationChecks = input.conservationConstraints.map((c) => {
      const value = c.evaluate(input.x, input.u, input.r, input.t);
      const tolerance = c.tolerance ?? 1e-8;
      const passed = approxZero(value, tolerance);
      return {
        name: c.name,
        passed,
        value,
        threshold: tolerance,
        margin: tolerance - Math.abs(value),
        reason: passed ? undefined : `Conservation violated: |${value}| > ${tolerance}`,
      };
    });

    for (const check of [
      ...equalityChecks,
      ...inequalityChecks,
      ...resourceChecks,
      ...terminalChecks,
      ...conservationChecks,
    ]) {
      if (!check.passed && check.reason) reasons.push(check.reason);
    }

    const feasible =
      !stale &&
      equalityChecks.every((c) => c.passed) &&
      inequalityChecks.every((c) => c.passed) &&
      resourceChecks.every((c) => c.passed) &&
      terminalChecks.every((c) => c.passed) &&
      conservationChecks.every((c) => c.passed);

    return {
      feasible,
      stale,
      equalityChecks,
      inequalityChecks,
      resourceChecks,
      terminalChecks,
      conservationChecks,
      reasons,
    };
  }

  /**
   * Explicit stale-manifold invalidation.
   * If dependencies changed, the prior solution is constitutionally stale.
   */
  public isStale(
    solutionStamp: DependencyStamp,
    currentStamp: DependencyStamp
  ): boolean {
    if (solutionStamp.version !== currentStamp.version) return true;

    const solutionKeys = new Set(solutionStamp.keys);
    const currentKeys = new Set(currentStamp.keys);

    if (solutionKeys.size !== currentKeys.size) return true;
    for (const key of currentKeys) {
      if (!solutionKeys.has(key)) return true;
    }
    return false;
  }

  /**
   * Helper for downstream decision logic:
   * returns the minimum slack to the active boundary across inequality/resource/terminal checks.
   *
   * Equality and conservation constraints are binary pass/fail (their tolerance-based
   * "margin" is not a meaningful robustness slack), so they are excluded here.
   */
  public computeMinimumMargin(report: FeasibilityReport): number {
    const checks = [
      ...report.inequalityChecks,
      ...report.resourceChecks,
      ...report.terminalChecks,
    ];

    const finiteMargins = checks
      .map((c) => c.margin)
      .filter((m): m is number => m !== undefined && Number.isFinite(m));

    if (finiteMargins.length === 0) return Number.NaN;
    return Math.min(...finiteMargins);
  }
}
