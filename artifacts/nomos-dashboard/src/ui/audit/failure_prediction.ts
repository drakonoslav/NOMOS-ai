/**
 * failure_prediction.ts
 *
 * Lightweight failure forecast engine.
 * Reads the audit time series and predicts the next constraint to fail.
 * Applies a calibration step that adjusts confidence based on history depth,
 * data completeness, volatility, and monotonic signal strength.
 */

import type { RunSummary } from "./audit_timeseries";

export interface FailurePrediction {
  nextFailure: string;
  confidence: "low" | "moderate" | "high";
  driver: string;

  /** Calibration-adjusted confidence (may differ from raw `confidence`). */
  calibratedConfidence?: "low" | "moderate" | "high";

  /** Human-readable calibration note. Emitted when confidence is downgraded. */
  calibrationNote?: string;
}

/* =========================================================
   Core prediction
   ========================================================= */

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

/* =========================================================
   Confidence calibration
   ========================================================= */

export function calibratePredictionConfidence(
  series: RunSummary[],
  base: FailurePrediction
): FailurePrediction {
  let calibrated: FailurePrediction["confidence"] = base.confidence;
  let note: string | undefined;

  const depth = series.length;

  // 1. Insufficient depth (primary rule — terminates early)
  if (depth < 4) {
    calibrated = "low";
    note = "Prediction confidence degraded due to insufficient historical depth.";
    return { ...base, calibratedConfidence: calibrated, calibrationNote: note };
  }

  // 2. Missing data (robustness / modelConfidence gaps)
  const missingRate = computeMissingRate(series);
  if (missingRate > 0.4) {
    calibrated = downgrade(calibrated);
    note = "Prediction confidence reduced due to incomplete data.";
    return { ...base, calibratedConfidence: calibrated, calibrationNote: note };
  }

  // 3. High volatility (direction flips in modelConfidence)
  const volatility = computeVolatility(series);
  if (volatility > 0.5) {
    calibrated = downgrade(calibrated);
    note = "Prediction confidence reduced due to inconsistent trend.";
    return { ...base, calibratedConfidence: calibrated, calibrationNote: note };
  }

  // 4. Strong monotonic signal → upgrade (bounded)
  if (
    isMonotonicDecrease(series, "robustness") ||
    isMonotonicDecrease(series, "modelConfidence")
  ) {
    calibrated = upgrade(calibrated);
  }

  return { ...base, calibratedConfidence: calibrated, calibrationNote: note };
}

/* =========================================================
   Internal helpers
   ========================================================= */

function computeMissingRate(series: RunSummary[]): number {
  let total   = 0;
  let missing = 0;

  for (const s of series) {
    total += 2; // robustness + modelConfidence
    if (s.robustness      === undefined) missing++;
    if (s.modelConfidence === undefined) missing++;
  }

  return total === 0 ? 1 : missing / total;
}

function computeVolatility(series: RunSummary[]): number {
  if (series.length < 3) return 0;

  let flips   = 0;
  let prevDir: number | null = null;

  for (let i = 2; i < series.length; i++) {
    const a = series[i - 2].modelConfidence ?? 0;
    const b = series[i - 1].modelConfidence ?? 0;
    const c = series[i].modelConfidence     ?? 0;

    const d1 = Math.sign(b - a);
    const d2 = Math.sign(c - b);

    if (prevDir !== null && d1 !== 0 && d2 !== 0 && d1 !== d2) {
      flips++;
    }
    prevDir = d2;
  }

  return flips / Math.max(1, series.length - 2);
}

function isMonotonicDecrease(
  series: RunSummary[],
  key: "robustness" | "modelConfidence"
): boolean {
  if (series.length < 3) return false;

  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1][key];
    const curr = series[i][key];
    if (prev === undefined || curr === undefined) return false;
    if (!(prev >= curr)) return false;
  }
  return true;
}

function downgrade(c: FailurePrediction["confidence"]): FailurePrediction["confidence"] {
  if (c === "high") return "moderate";
  return "low";
}

function upgrade(c: FailurePrediction["confidence"]): FailurePrediction["confidence"] {
  if (c === "low") return "moderate";
  return "high";
}

function isDecreasing(a?: number, b?: number, c?: number): boolean {
  if (a === undefined || b === undefined || c === undefined) return false;
  return a > b && b > c;
}
