/**
 * failure_prediction.ts
 *
 * Lightweight failure forecast engine.
 * Reads the audit time series and predicts the next constraint to fail.
 */

import type { RunSummary } from "./audit_timeseries";

export interface FailurePrediction {
  nextFailure: string;
  confidence: "low" | "moderate" | "high";
  driver: string;
}

export function predictNextFailure(series: RunSummary[]): FailurePrediction | null {
  if (series.length < 3) return null;

  const last  = series[series.length - 1];
  const prev  = series[series.length - 2];
  const prev2 = series[series.length - 3];

  if (last.status === "INVALID") {
    return {
      nextFailure: "system already infeasible",
      confidence: "high",
      driver: "feasibility constraint violated",
    };
  }

  if (isDecreasing(prev2.robustness, prev.robustness, last.robustness)) {
    return {
      nextFailure: "feasibility constraint",
      confidence: "high",
      driver: "robustness margin decreasing",
    };
  }

  if (isDecreasing(prev2.modelConfidence, prev.modelConfidence, last.modelConfidence)) {
    return {
      nextFailure: "robustness margin",
      confidence: "moderate",
      driver: "model confidence degradation",
    };
  }

  const escalation = [prev2.decisiveVariable, prev.decisiveVariable, last.decisiveVariable];

  if (escalation.includes("feasibility constraint")) {
    return {
      nextFailure: "system infeasibility",
      confidence: "high",
      driver: "constraint escalation detected",
    };
  }

  if (escalation.includes("robustness margin")) {
    return {
      nextFailure: "feasibility constraint",
      confidence: "moderate",
      driver: "robustness becoming dominant failure mode",
    };
  }

  return {
    nextFailure: last.decisiveVariable,
    confidence: "low",
    driver: "no strong directional trend detected",
  };
}

function isDecreasing(a?: number, b?: number, c?: number): boolean {
  if (a === undefined || b === undefined || c === undefined) return false;
  return a > b && b > c;
}
