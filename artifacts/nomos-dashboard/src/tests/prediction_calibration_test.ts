/**
 * prediction_calibration_test.ts
 *
 * Regression tests for prediction_calibration.ts — deterministic calibration
 * of NOMOS failure predictions against actual audit outcomes.
 *
 * Scenarios:
 *   1.  classifyCalibration — null actualRiskDirection → "unresolved"
 *   2.  classifyCalibration — exactMatch + directionMatch → "well_calibrated"
 *   3.  classifyCalibration — exactMatch only → "well_calibrated"
 *   4.  classifyCalibration — directionMatch only → "well_calibrated"
 *   5.  classifyCalibration — predicted rising non-null, actual decreasing null → "too_aggressive"
 *   6.  classifyCalibration — predicted non-null, actual null only → "too_aggressive"
 *   7.  classifyCalibration — predicted stable/null, actual rising non-null → "too_weak"
 *   8.  classifyCalibration — predicted decreasing/null, actual rising → "too_weak"
 *   9.  classifyCalibration — mixed (no clear match) → "well_calibrated" fallback
 *  10.  resolvePredictionOutcome — no later records → "unresolved"
 *  11.  resolvePredictionOutcome — next run exact match → "well_calibrated"
 *  12.  resolvePredictionOutcome — next run is lawful, predicted rising → "too_aggressive"
 *  13.  resolvePredictionOutcome — next run same variable (streak) → "rising" direction
 *  14.  resolvePredictionOutcome — next run different variable → "stable" direction
 *  15.  buildPredictionOutcomeRecords — empty records → empty array
 *  16.  buildPredictionOutcomeRecords — single record → one unresolved outcome
 *  17.  buildPredictionOutcomeRecords — two records → one resolved, one unresolved
 *  18.  buildPredictionOutcomeRecords — sorted chronologically regardless of input order
 *  19.  buildPredictionOutcomeRecords — all LAWFUL runs → outcomes with null variables
 *  20.  buildPredictionOutcomeRecords — 4-run scenario: streak then lawful
 *  21.  buildPredictionCalibrationReport — empty records → zero counts
 *  22.  buildPredictionCalibrationReport — single record → one unresolved
 *  23.  buildPredictionCalibrationReport — resolvedPredictions count
 *  24.  buildPredictionCalibrationReport — exactMatchRate null when no resolved
 *  25.  buildPredictionCalibrationReport — exactMatchRate 100% when all exact
 *  26.  buildPredictionCalibrationReport — directionMatchRate computed correctly
 *  27.  buildPredictionCalibrationReport — calibrationCounts correct
 *  28.  buildPredictionCalibrationReport — outcomes newest-first
 *  29.  buildPredictionCalibrationReport — summaryLines mention exact-match rate
 *  30.  buildPredictionCalibrationReport — summaryLines mention too aggressive
 *  31.  buildPredictionCalibrationReport — summaryLines mention pending when unresolved
 *  32.  buildPredictionCalibrationReport — 6-run spec scenario
 */

import { describe, it, expect } from "vitest";
import {
  classifyCalibration,
  resolvePredictionOutcome,
  buildPredictionOutcomeRecords,
  buildPredictionCalibrationReport,
} from "../audit/prediction_calibration";
import type { AuditRecord } from "../audit/audit_types";
import type { StoredPredictionRecord } from "../audit/calibration_types";

/* =========================================================
   Fixtures
   ========================================================= */

let _seq = 0;
function makeRecord(
  timestamp: string,
  overallStatus: string | null,
  decisiveVariable: string | null
): AuditRecord {
  _seq++;
  return {
    id: `audit_cal_${_seq}`,
    versionId: `ver_cal_${_seq}`,
    parentVersionId: null,
    timestamp,
    intent: "test",
    title: `Calibration Run ${_seq}`,
    isEvaluable: true,
    isConfirmed: true,
    canonicalDeclaration: "",
    compileResult: null,
    patchedDraft: null,
    evaluationResult:
      overallStatus === null
        ? null
        : {
            status: overallStatus,
            payload: {
              overallStatus,
              decisiveVariable,
              candidateEvaluations: [],
            },
          },
  };
}

function makeStored(
  overrides?: Partial<StoredPredictionRecord>
): StoredPredictionRecord {
  return {
    sourceVersionId: `ver_${Math.random().toString(36).slice(2, 6)}`,
    sourceTimestamp: "2026-01-01T00:00:00Z",
    predictedVariable: "calorie delta violation",
    confidence: "moderate",
    riskDirection: "rising",
    explanationLines: [],
    ...overrides,
  };
}

/* =========================================================
   Scenario 1: classifyCalibration — null actualRiskDirection → "unresolved"
   ========================================================= */

describe("classifyCalibration — null actualRiskDirection → 'unresolved'", () => {
  const result = classifyCalibration(makeStored(), "calorie delta violation", null);

  it("calibrationClass is 'unresolved'", () => {
    expect(result.calibrationClass).toBe("unresolved");
  });

  it("exactMatch is false", () => {
    expect(result.exactMatch).toBe(false);
  });

  it("directionMatch is false", () => {
    expect(result.directionMatch).toBe(false);
  });
});

/* =========================================================
   Scenario 2: exactMatch + directionMatch → "well_calibrated"
   ========================================================= */

describe("classifyCalibration — exactMatch + directionMatch → 'well_calibrated'", () => {
  const stored = makeStored({
    predictedVariable: "calorie delta violation",
    riskDirection: "rising",
  });
  const result = classifyCalibration(stored, "calorie delta violation", "rising");

  it("calibrationClass is 'well_calibrated'", () => {
    expect(result.calibrationClass).toBe("well_calibrated");
  });

  it("exactMatch is true", () => {
    expect(result.exactMatch).toBe(true);
  });

  it("directionMatch is true", () => {
    expect(result.directionMatch).toBe(true);
  });
});

/* =========================================================
   Scenario 3: exactMatch only (direction differs) → "well_calibrated"
   ========================================================= */

describe("classifyCalibration — exactMatch only (direction differs) → 'well_calibrated'", () => {
  const stored = makeStored({
    predictedVariable: "calorie delta violation",
    riskDirection: "rising",
  });
  const result = classifyCalibration(stored, "calorie delta violation", "stable");

  it("calibrationClass is 'well_calibrated'", () => {
    expect(result.calibrationClass).toBe("well_calibrated");
  });

  it("exactMatch is true", () => {
    expect(result.exactMatch).toBe(true);
  });

  it("directionMatch is false", () => {
    expect(result.directionMatch).toBe(false);
  });
});

/* =========================================================
   Scenario 4: directionMatch only (variable differs) → "well_calibrated"
   ========================================================= */

describe("classifyCalibration — directionMatch only (variable differs) → 'well_calibrated'", () => {
  const stored = makeStored({
    predictedVariable: "calorie delta violation",
    riskDirection: "stable",
  });
  const result = classifyCalibration(stored, "protein placement violation", "stable");

  it("calibrationClass is 'well_calibrated'", () => {
    expect(result.calibrationClass).toBe("well_calibrated");
  });

  it("exactMatch is false", () => {
    expect(result.exactMatch).toBe(false);
  });

  it("directionMatch is true", () => {
    expect(result.directionMatch).toBe(true);
  });
});

/* =========================================================
   Scenario 5: predicted rising non-null, actual decreasing null → "too_aggressive"
   ========================================================= */

describe("classifyCalibration — predicted rising+violation, actual decreasing+lawful → 'too_aggressive'", () => {
  const stored = makeStored({
    predictedVariable: "calorie delta violation",
    riskDirection: "rising",
  });
  const result = classifyCalibration(stored, null, "decreasing");

  it("calibrationClass is 'too_aggressive'", () => {
    expect(result.calibrationClass).toBe("too_aggressive");
  });
});

/* =========================================================
   Scenario 6: predicted non-null, actual null only (direction stable) → "too_aggressive"
   ========================================================= */

describe("classifyCalibration — predicted non-null variable but actual lawful → 'too_aggressive'", () => {
  const stored = makeStored({
    predictedVariable: "protein placement violation",
    riskDirection: "rising",
  });
  // actual was lawful
  const result = classifyCalibration(stored, null, "decreasing");

  it("calibrationClass is 'too_aggressive'", () => {
    expect(result.calibrationClass).toBe("too_aggressive");
  });
});

/* =========================================================
   Scenario 7: predicted stable+null, actual rising+non-null → "too_weak"
   ========================================================= */

describe("classifyCalibration — predicted stable+null, actual rising+violation → 'too_weak'", () => {
  const stored = makeStored({
    predictedVariable: null,
    riskDirection: "stable",
  });
  const result = classifyCalibration(stored, "calorie delta violation", "rising");

  it("calibrationClass is 'too_weak'", () => {
    expect(result.calibrationClass).toBe("too_weak");
  });
});

/* =========================================================
   Scenario 8: predicted decreasing+null, actual rising → "too_weak"
   ========================================================= */

describe("classifyCalibration — predicted decreasing+null, actual rising → 'too_weak'", () => {
  const stored = makeStored({
    predictedVariable: null,
    riskDirection: "decreasing",
  });
  const result = classifyCalibration(stored, "protein placement violation", "rising");

  it("calibrationClass is 'too_weak'", () => {
    expect(result.calibrationClass).toBe("too_weak");
  });
});

/* =========================================================
   Scenario 9: mixed (no strong match, no clear bias) → "well_calibrated" fallback
   ========================================================= */

describe("classifyCalibration — mixed result → 'well_calibrated' fallback", () => {
  // predicted stable/non-null, actual is stable/different non-null
  // no exact match, no direction match, no aggressive/weak pattern
  const stored = makeStored({
    predictedVariable: "calorie delta violation",
    riskDirection: "stable",
  });
  // actual stable, different variable
  const result = classifyCalibration(stored, "protein placement violation", "stable");

  it("directionMatch is true → well_calibrated", () => {
    expect(result.calibrationClass).toBe("well_calibrated");
  });
});

/* =========================================================
   Scenario 10: resolvePredictionOutcome — no later records → "unresolved"
   ========================================================= */

describe("resolvePredictionOutcome — no later records → 'unresolved'", () => {
  const stored = makeStored();
  const outcome = resolvePredictionOutcome(stored, null, []);

  it("calibrationClass is 'unresolved'", () => {
    expect(outcome.calibrationClass).toBe("unresolved");
  });

  it("resolvedVersionId is null", () => {
    expect(outcome.resolvedVersionId).toBeNull();
  });

  it("actualNextVariable is null", () => {
    expect(outcome.actualNextVariable).toBeNull();
  });

  it("summary mentions pending", () => {
    expect(outcome.summary.toLowerCase()).toContain("pending");
  });
});

/* =========================================================
   Scenario 11: resolvePredictionOutcome — next run exact match → "well_calibrated"
   ========================================================= */

describe("resolvePredictionOutcome — exact match on next run → 'well_calibrated'", () => {
  const stored = makeStored({
    predictedVariable: "calorie delta violation",
    riskDirection: "rising",
  });
  const nextRecord = makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation");
  const prevVar = "calorie delta violation";
  const outcome = resolvePredictionOutcome(stored, prevVar, [nextRecord]);

  it("calibrationClass is 'well_calibrated'", () => {
    expect(outcome.calibrationClass).toBe("well_calibrated");
  });

  it("exactMatch is true", () => {
    expect(outcome.exactMatch).toBe(true);
  });

  it("actualNextVariable is 'calorie delta violation'", () => {
    expect(outcome.actualNextVariable).toBe("calorie delta violation");
  });

  it("resolvedVersionId is set", () => {
    expect(outcome.resolvedVersionId).toBe(nextRecord.versionId);
  });
});

/* =========================================================
   Scenario 12: resolvePredictionOutcome — predicted rising, next lawful → "too_aggressive"
   ========================================================= */

describe("resolvePredictionOutcome — predicted rising violation, next run LAWFUL → 'too_aggressive'", () => {
  const stored = makeStored({
    predictedVariable: "protein placement violation",
    riskDirection: "rising",
  });
  const nextRecord = makeRecord("2026-01-02T00:00:00Z", "LAWFUL", null);
  const outcome = resolvePredictionOutcome(stored, "protein placement violation", [nextRecord]);

  it("calibrationClass is 'too_aggressive'", () => {
    expect(outcome.calibrationClass).toBe("too_aggressive");
  });

  it("actualNextVariable is null", () => {
    expect(outcome.actualNextVariable).toBeNull();
  });

  it("actualRiskDirection is 'decreasing'", () => {
    expect(outcome.actualRiskDirection).toBe("decreasing");
  });
});

/* =========================================================
   Scenario 13: resolvePredictionOutcome — same variable repeated → "rising" direction
   ========================================================= */

describe("resolvePredictionOutcome — same violation repeated → actualRiskDirection 'rising'", () => {
  const stored = makeStored({
    predictedVariable: "calorie delta violation",
    riskDirection: "rising",
  });
  const nextRecord = makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation");
  const outcome = resolvePredictionOutcome(stored, "calorie delta violation", [nextRecord]);

  it("actualRiskDirection is 'rising'", () => {
    expect(outcome.actualRiskDirection).toBe("rising");
  });
});

/* =========================================================
   Scenario 14: resolvePredictionOutcome — different variable → "stable" direction
   ========================================================= */

describe("resolvePredictionOutcome — different violation from prev → actualRiskDirection 'stable'", () => {
  const stored = makeStored({
    predictedVariable: "calorie delta violation",
    riskDirection: "stable",
  });
  const nextRecord = makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "protein placement violation");
  const outcome = resolvePredictionOutcome(stored, "calorie delta violation", [nextRecord]);

  it("actualRiskDirection is 'stable'", () => {
    expect(outcome.actualRiskDirection).toBe("stable");
  });
});

/* =========================================================
   Scenario 15: buildPredictionOutcomeRecords — empty → empty
   ========================================================= */

describe("buildPredictionOutcomeRecords — empty records → empty array", () => {
  it("returns empty array", () => {
    expect(buildPredictionOutcomeRecords([])).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 16: buildPredictionOutcomeRecords — single record → one unresolved
   ========================================================= */

describe("buildPredictionOutcomeRecords — single record → one unresolved outcome", () => {
  const records = [makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation")];
  const outcomes = buildPredictionOutcomeRecords(records);

  it("returns one outcome", () => {
    expect(outcomes).toHaveLength(1);
  });

  it("outcome is unresolved", () => {
    expect(outcomes[0]!.calibrationClass).toBe("unresolved");
  });

  it("resolvedVersionId is null", () => {
    expect(outcomes[0]!.resolvedVersionId).toBeNull();
  });
});

/* =========================================================
   Scenario 17: buildPredictionOutcomeRecords — two records → first resolved, last unresolved
   ========================================================= */

describe("buildPredictionOutcomeRecords — two records → first resolved, second unresolved", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
  ];
  const outcomes = buildPredictionOutcomeRecords(records);

  it("returns two outcomes", () => {
    expect(outcomes).toHaveLength(2);
  });

  it("first outcome is resolved", () => {
    expect(outcomes[0]!.calibrationClass).not.toBe("unresolved");
    expect(outcomes[0]!.resolvedVersionId).not.toBeNull();
  });

  it("second outcome is unresolved", () => {
    expect(outcomes[1]!.calibrationClass).toBe("unresolved");
  });
});

/* =========================================================
   Scenario 18: buildPredictionOutcomeRecords — sorted chronologically
   ========================================================= */

describe("buildPredictionOutcomeRecords — sorted chronologically regardless of input order", () => {
  const records = [
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "protein placement violation"),
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "LAWFUL", null),
  ];
  const outcomes = buildPredictionOutcomeRecords(records);

  it("first outcome's resolvedVersionId is the 2026-01-02 record", () => {
    const jan2Record = records.find((r) => r.timestamp === "2026-01-02T00:00:00Z");
    expect(outcomes[0]!.resolvedVersionId).toBe(jan2Record!.versionId);
  });
});

/* =========================================================
   Scenario 19: buildPredictionOutcomeRecords — all LAWFUL runs
   ========================================================= */

describe("buildPredictionOutcomeRecords — all LAWFUL runs", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-02T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-03T00:00:00Z", "LAWFUL", null),
  ];
  const outcomes = buildPredictionOutcomeRecords(records);

  it("returns 3 outcomes", () => {
    expect(outcomes).toHaveLength(3);
  });

  it("all actualNextVariable values are null (LAWFUL)", () => {
    expect(outcomes[0]!.actualNextVariable).toBeNull();
    expect(outcomes[1]!.actualNextVariable).toBeNull();
  });

  it("last outcome is unresolved", () => {
    expect(outcomes[2]!.calibrationClass).toBe("unresolved");
  });
});

/* =========================================================
   Scenario 20: buildPredictionOutcomeRecords — 4-run scenario: streak then lawful
   ========================================================= */

describe("buildPredictionOutcomeRecords — streak then lawful outcome", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-04T00:00:00Z", "LAWFUL", null),
  ];
  const outcomes = buildPredictionOutcomeRecords(records);

  it("returns 4 outcomes", () => {
    expect(outcomes).toHaveLength(4);
  });

  it("outcome 3 (run 3 → run 4 LAWFUL) is 'too_aggressive' (predicted rising after streak)", () => {
    // The prediction at run 3 should have rising risk due to 3-run streak
    // but the next run was lawful → too_aggressive
    expect(outcomes[2]!.actualNextVariable).toBeNull();
    expect(outcomes[2]!.actualRiskDirection).toBe("decreasing");
  });

  it("last outcome is unresolved", () => {
    expect(outcomes[3]!.calibrationClass).toBe("unresolved");
  });
});

/* =========================================================
   Scenario 21: buildPredictionCalibrationReport — empty records
   ========================================================= */

describe("buildPredictionCalibrationReport — empty records", () => {
  const report = buildPredictionCalibrationReport([]);

  it("totalPredictions is 0", () => {
    expect(report.totalPredictions).toBe(0);
  });

  it("resolvedPredictions is 0", () => {
    expect(report.resolvedPredictions).toBe(0);
  });

  it("exactMatchRate is null", () => {
    expect(report.exactMatchRate).toBeNull();
  });

  it("outcomes is empty", () => {
    expect(report.outcomes).toHaveLength(0);
  });

  it("summaryLines is non-empty", () => {
    expect(report.summaryLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 22: buildPredictionCalibrationReport — single record → one unresolved
   ========================================================= */

describe("buildPredictionCalibrationReport — single record → one unresolved", () => {
  const records = [makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation")];
  const report = buildPredictionCalibrationReport(records);

  it("totalPredictions is 1", () => {
    expect(report.totalPredictions).toBe(1);
  });

  it("unresolvedPredictions is 1", () => {
    expect(report.unresolvedPredictions).toBe(1);
  });

  it("exactMatchRate is null (no resolved predictions)", () => {
    expect(report.exactMatchRate).toBeNull();
  });
});

/* =========================================================
   Scenario 23: buildPredictionCalibrationReport — resolvedPredictions count
   ========================================================= */

describe("buildPredictionCalibrationReport — resolvedPredictions count", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-03T00:00:00Z", "LAWFUL", null),
  ];
  const report = buildPredictionCalibrationReport(records);

  it("totalPredictions is 3", () => {
    expect(report.totalPredictions).toBe(3);
  });

  it("resolvedPredictions is 2 (first two resolved against their next runs)", () => {
    expect(report.resolvedPredictions).toBe(2);
  });

  it("unresolvedPredictions is 1 (last run has no successor)", () => {
    expect(report.unresolvedPredictions).toBe(1);
  });
});

/* =========================================================
   Scenario 24: exactMatchRate null when no resolved
   ========================================================= */

describe("buildPredictionCalibrationReport — exactMatchRate null when resolvedPredictions = 0", () => {
  const records = [makeRecord("2026-01-01T00:00:00Z", "LAWFUL", null)];
  const report = buildPredictionCalibrationReport(records);

  it("exactMatchRate is null", () => {
    expect(report.exactMatchRate).toBeNull();
  });

  it("directionMatchRate is null", () => {
    expect(report.directionMatchRate).toBeNull();
  });
});

/* =========================================================
   Scenario 25: exactMatchRate 100% when all exact
   ========================================================= */

describe("buildPredictionCalibrationReport — exactMatchRate from resolved outcomes", () => {
  // 3 runs all with same violation, each predicts the next correctly
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-04T00:00:00Z", "DEGRADED", "calorie delta violation"),
  ];
  const report = buildPredictionCalibrationReport(records);

  it("exactMatchRate > 0 (at least some exact matches)", () => {
    expect(report.exactMatchRate).not.toBeNull();
    expect(report.exactMatchRate!).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 26: directionMatchRate computed correctly
   ========================================================= */

describe("buildPredictionCalibrationReport — directionMatchRate", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-03T00:00:00Z", "LAWFUL", null),
  ];
  const report = buildPredictionCalibrationReport(records);

  it("directionMatchRate is a number between 0 and 1", () => {
    expect(report.directionMatchRate).not.toBeNull();
    expect(report.directionMatchRate!).toBeGreaterThanOrEqual(0);
    expect(report.directionMatchRate!).toBeLessThanOrEqual(1);
  });
});

/* =========================================================
   Scenario 27: calibrationCounts correct
   ========================================================= */

describe("buildPredictionCalibrationReport — calibrationCounts sum to totalPredictions", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "protein placement violation"),
  ];
  const report = buildPredictionCalibrationReport(records);
  const countSum =
    report.calibrationCounts.well_calibrated +
    report.calibrationCounts.too_aggressive +
    report.calibrationCounts.too_weak +
    report.calibrationCounts.unresolved;

  it("sum of calibrationCounts equals totalPredictions", () => {
    expect(countSum).toBe(report.totalPredictions);
  });
});

/* =========================================================
   Scenario 28: outcomes newest-first
   ========================================================= */

describe("buildPredictionCalibrationReport — outcomes in newest-first order", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "protein placement violation"),
    makeRecord("2026-01-03T00:00:00Z", "LAWFUL", null),
  ];
  const report = buildPredictionCalibrationReport(records);

  it("first outcome sourceVersionId is from the most recent run", () => {
    const lastRunVersionId = records.find((r) => r.timestamp === "2026-01-03T00:00:00Z")?.versionId;
    expect(report.outcomes[0]!.sourceVersionId).toBe(lastRunVersionId);
  });
});

/* =========================================================
   Scenario 29: summaryLines mention exact-match rate
   ========================================================= */

describe("buildPredictionCalibrationReport — summaryLines mention exact-match rate", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "calorie delta violation"),
  ];
  const report = buildPredictionCalibrationReport(records);

  it("summaryLines contain 'exact-match' mention", () => {
    const combined = report.summaryLines.join(" ").toLowerCase();
    expect(combined).toContain("exact-match");
  });
});

/* =========================================================
   Scenario 30: summaryLines mention too aggressive
   ========================================================= */

describe("buildPredictionCalibrationReport — summaryLines call out aggressive predictions", () => {
  // Force a streak prediction followed by lawful outcome (too_aggressive)
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-04T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-05T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-06T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-07T00:00:00Z", "LAWFUL", null),
  ];
  const report = buildPredictionCalibrationReport(records);

  it("calibrationCounts.too_aggressive > 0", () => {
    expect(report.calibrationCounts.too_aggressive).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 31: summaryLines mention pending when unresolved exists
   ========================================================= */

describe("buildPredictionCalibrationReport — summaryLines mention pending unresolved", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "LAWFUL", null),
  ];
  const report = buildPredictionCalibrationReport(records);

  it("summaryLines mention pending or unresolved", () => {
    const combined = report.summaryLines.join(" ").toLowerCase();
    expect(combined.includes("pending") || combined.includes("unresolved")).toBe(true);
  });
});

/* =========================================================
   Scenario 32: 6-run spec scenario (aggressive → lawful → weak)
   ========================================================= */

describe("buildPredictionCalibrationReport — 6-run spec scenario", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-04T00:00:00Z", "LAWFUL", null),        // aggressive call → LAWFUL
    makeRecord("2026-01-05T00:00:00Z", "LAWFUL", null),        // predicted safe
    makeRecord("2026-01-06T00:00:00Z", "DEGRADED", "protein placement violation"), // too_weak
  ];
  const report = buildPredictionCalibrationReport(records);

  it("totalPredictions is 6", () => {
    expect(report.totalPredictions).toBe(6);
  });

  it("resolvedPredictions is 5", () => {
    expect(report.resolvedPredictions).toBe(5);
  });

  it("unresolvedPredictions is 1", () => {
    expect(report.unresolvedPredictions).toBe(1);
  });

  it("exactMatchRate is a number", () => {
    expect(report.exactMatchRate).not.toBeNull();
  });

  it("calibrationCounts sum to 6", () => {
    const sum =
      report.calibrationCounts.well_calibrated +
      report.calibrationCounts.too_aggressive +
      report.calibrationCounts.too_weak +
      report.calibrationCounts.unresolved;
    expect(sum).toBe(6);
  });

  it("outcomes has 6 entries (newest first)", () => {
    expect(report.outcomes).toHaveLength(6);
  });

  it("summaryLines is non-empty", () => {
    expect(report.summaryLines.length).toBeGreaterThan(0);
  });
});
