/**
 * failure_prediction_test.ts
 *
 * Regression tests for failure_prediction.ts — deterministic constrained
 * failure projection from NOMOS audit history.
 *
 * Scenarios:
 *   1.  buildFailureSignals — empty records → empty signals
 *   2.  buildFailureSignals — all LAWFUL runs → empty signals
 *   3.  buildFailureSignals — single DEGRADED run → one signal
 *   4.  buildFailureSignals — sorted by weightedRiskScore descending
 *   5.  buildFailureSignals — recentShare computed from last 5 runs
 *   6.  buildFailureSignals — currentStreak factored into score
 *   7.  buildFailureSignals — degraded/invalid weighting in score
 *   8.  scoreFailureSignals — stable sort: ties broken by variable name
 *   9.  scoreFailureSignals — does not mutate input
 *  10.  pickPredictedVariable — empty → null
 *  11.  pickPredictedVariable — single signal → that variable
 *  12.  pickPredictedVariable — clear leader → top variable
 *  13.  pickPredictedVariable — ambiguous (too close) → null
 *  14.  pickPredictedVariable — zero score → null
 *  15.  classifyPredictionConfidence — totalRuns < 3 → "low" (hard guard)
 *  16.  classifyPredictionConfidence — null predicted → "low"
 *  17.  classifyPredictionConfidence — high: dominant + streak + deep history
 *  18.  classifyPredictionConfidence — moderate: clear leader, shallow history
 *  19.  classifyRiskDirection — drifting → "rising"
 *  20.  classifyRiskDirection — stabilizing → "decreasing"
 *  21.  classifyRiskDirection — last 3 all LAWFUL → "decreasing"
 *  22.  classifyRiskDirection — last 3 non-null same variable → "rising"
 *  23.  classifyRiskDirection — mixed → "stable"
 *  24.  buildFailurePrediction — empty records
 *  25.  buildFailurePrediction — totalRuns < 3 → confidence "low"
 *  26.  buildFailurePrediction — all lawful → no predicted variable
 *  27.  buildFailurePrediction — 8-run spec scenario
 *  28.  buildFailurePrediction — explanationLines mention streak
 *  29.  buildFailurePrediction — explanationLines mention decreasing risk
 *  30.  buildFailurePrediction — explanationLines mention shallow history
 */

import { describe, it, expect } from "vitest";
import {
  buildFailureSignals,
  scoreFailureSignals,
  pickPredictedVariable,
  classifyPredictionConfidence,
  classifyRiskDirection,
  buildFailurePrediction,
} from "../audit/failure_prediction";
import type { AuditRecord } from "../audit/audit_types";
import type { FailurePredictionSignal } from "../audit/prediction_types";
import type { DecisiveVariableOccurrence, DriftSummary } from "../audit/trend_types";

/* =========================================================
   Fixture helpers
   ========================================================= */

let _seq = 0;
function makeRecord(
  timestamp: string,
  overallStatus: string | null,
  decisiveVariable: string | null
): AuditRecord {
  _seq++;
  return {
    id: `audit_pred_${_seq}`,
    versionId: `ver_pred_${_seq}`,
    parentVersionId: null,
    timestamp,
    intent: "test",
    title: `Prediction Run ${_seq}`,
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

function makeSignal(
  variable: string,
  frequency: number,
  currentStreak: number,
  recentShare: number,
  weightedRiskScore: number,
  longestStreak = currentStreak
): FailurePredictionSignal {
  return {
    variable,
    frequency,
    currentStreak,
    longestStreak,
    recentShare,
    weightedRiskScore,
  };
}

function makeOccurrence(
  dv: string | null,
  status: string | null = dv === null ? "LAWFUL" : "DEGRADED",
  ts?: string
): DecisiveVariableOccurrence {
  return {
    versionId: `vocc_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: ts ?? new Date().toISOString(),
    candidateId: null,
    overallStatus: status,
    decisiveVariable: dv,
  };
}

function makeDriftSummary(overrides?: Partial<DriftSummary>): DriftSummary {
  return {
    mostFrequentVariable: null,
    mostRecentVariable: null,
    recurringViolations: [],
    stabilizing: false,
    drifting: false,
    summaryLines: [],
    ...overrides,
  };
}

function makeOccurrences(vars: (string | null)[]): DecisiveVariableOccurrence[] {
  return vars.map((v, i) =>
    makeOccurrence(
      v,
      v === null ? "LAWFUL" : "DEGRADED",
      `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`
    )
  );
}

/* =========================================================
   Scenario 1: buildFailureSignals — empty records
   ========================================================= */

describe("buildFailureSignals — empty records", () => {
  const signals = buildFailureSignals([]);

  it("returns empty array", () => {
    expect(signals).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 2: buildFailureSignals — all LAWFUL runs
   ========================================================= */

describe("buildFailureSignals — all LAWFUL runs → empty signals", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-02T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-03T00:00:00Z", "LAWFUL", null),
  ];
  const signals = buildFailureSignals(records);

  it("returns empty array (no decisive variables)", () => {
    expect(signals).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 3: buildFailureSignals — single DEGRADED run
   ========================================================= */

describe("buildFailureSignals — single DEGRADED run → one signal", () => {
  const records = [makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation")];
  const signals = buildFailureSignals(records);

  it("returns one signal", () => {
    expect(signals).toHaveLength(1);
  });

  it("signal variable is 'calorie delta violation'", () => {
    expect(signals[0]!.variable).toBe("calorie delta violation");
  });

  it("signal frequency is 1", () => {
    expect(signals[0]!.frequency).toBe(1);
  });

  it("weightedRiskScore > 0", () => {
    expect(signals[0]!.weightedRiskScore).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 4: buildFailureSignals — sorted by score descending
   ========================================================= */

describe("buildFailureSignals — sorted by weightedRiskScore descending", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "protein placement violation"),
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "protein placement violation"),
    makeRecord("2026-01-04T00:00:00Z", "DEGRADED", "protein placement violation"),
    makeRecord("2026-01-05T00:00:00Z", "DEGRADED", "calorie delta violation"),
  ];
  const signals = buildFailureSignals(records);

  it("protein placement violation is first (higher score)", () => {
    expect(signals[0]!.variable).toBe("protein placement violation");
  });

  it("calorie delta violation is second", () => {
    expect(signals[1]!.variable).toBe("calorie delta violation");
  });

  it("first score > second score", () => {
    expect(signals[0]!.weightedRiskScore).toBeGreaterThan(signals[1]!.weightedRiskScore);
  });
});

/* =========================================================
   Scenario 5: buildFailureSignals — recentShare computation
   ========================================================= */

describe("buildFailureSignals — recentShare from last 5 runs", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-03T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-04T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-05T00:00:00Z", "LAWFUL", null),
  ];
  const signals = buildFailureSignals(records);
  const sig = signals.find((s) => s.variable === "calorie delta violation");

  it("recentShare is 3/5 = 0.6", () => {
    expect(sig?.recentShare).toBeCloseTo(0.6, 5);
  });
});

/* =========================================================
   Scenario 6: buildFailureSignals — streak factored into score
   ========================================================= */

describe("buildFailureSignals — currentStreak lifts score", () => {
  const streakRecords = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "protein placement violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "protein placement violation"),
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "protein placement violation"),
  ];
  const noStreakRecords = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-03T00:00:00Z", "LAWFUL", null),
  ];
  const streakSignals = buildFailureSignals(streakRecords);
  const noStreakSignals = buildFailureSignals(noStreakRecords);

  it("streaking variable has higher score than same-frequency non-streaking variable", () => {
    expect(streakSignals[0]!.weightedRiskScore).toBeGreaterThan(noStreakSignals[0]!.weightedRiskScore);
  });

  it("streaking variable currentStreak is 3", () => {
    expect(streakSignals[0]!.currentStreak).toBe(3);
  });
});

/* =========================================================
   Scenario 7: buildFailureSignals — INVALID weighted more than DEGRADED
   ========================================================= */

describe("buildFailureSignals — INVALID verdict weighted more heavily", () => {
  const degradedRecords = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
  ];
  const invalidRecords = [
    makeRecord("2026-01-01T00:00:00Z", "INVALID", "calorie delta violation"),
  ];
  const degradedSignals = buildFailureSignals(degradedRecords);
  const invalidSignals = buildFailureSignals(invalidRecords);

  it("INVALID run produces higher score than DEGRADED run (same variable, one run)", () => {
    expect(invalidSignals[0]!.weightedRiskScore).toBeGreaterThan(
      degradedSignals[0]!.weightedRiskScore
    );
  });
});

/* =========================================================
   Scenario 8: scoreFailureSignals — tie-breaking by variable name
   ========================================================= */

describe("scoreFailureSignals — ties broken by variable name (lexicographic)", () => {
  const signals: FailurePredictionSignal[] = [
    makeSignal("zebra violation", 2, 0, 0.2, 5.0),
    makeSignal("apple violation", 2, 0, 0.2, 5.0),
    makeSignal("mango violation", 2, 0, 0.2, 5.0),
  ];
  const sorted = scoreFailureSignals(signals);

  it("apple violation is first (lexicographically smallest)", () => {
    expect(sorted[0]!.variable).toBe("apple violation");
  });

  it("mango violation is second", () => {
    expect(sorted[1]!.variable).toBe("mango violation");
  });

  it("zebra violation is last", () => {
    expect(sorted[2]!.variable).toBe("zebra violation");
  });
});

/* =========================================================
   Scenario 9: scoreFailureSignals — does not mutate input
   ========================================================= */

describe("scoreFailureSignals — does not mutate input array", () => {
  const signals: FailurePredictionSignal[] = [
    makeSignal("z", 1, 0, 0, 5.0),
    makeSignal("a", 1, 0, 0, 10.0),
  ];
  const originalFirst = signals[0]!.variable;
  scoreFailureSignals(signals);

  it("input[0] is still 'z'", () => {
    expect(signals[0]!.variable).toBe(originalFirst);
  });
});

/* =========================================================
   Scenario 10: pickPredictedVariable — empty
   ========================================================= */

describe("pickPredictedVariable — empty signals → null", () => {
  it("returns null", () => {
    expect(pickPredictedVariable([])).toBeNull();
  });
});

/* =========================================================
   Scenario 11: pickPredictedVariable — single signal
   ========================================================= */

describe("pickPredictedVariable — single signal → that variable", () => {
  const signals = [makeSignal("calorie delta violation", 3, 2, 0.6, 8.0)];

  it("returns 'calorie delta violation'", () => {
    expect(pickPredictedVariable(signals)).toBe("calorie delta violation");
  });
});

/* =========================================================
   Scenario 12: pickPredictedVariable — clear leader
   ========================================================= */

describe("pickPredictedVariable — clear leader (top >> second)", () => {
  const signals = [
    makeSignal("protein placement violation", 5, 3, 0.8, 15.0),
    makeSignal("calorie delta violation", 2, 0, 0.2, 4.0),
  ];

  it("returns 'protein placement violation'", () => {
    expect(pickPredictedVariable(signals)).toBe("protein placement violation");
  });
});

/* =========================================================
   Scenario 13: pickPredictedVariable — ambiguous (too close)
   ========================================================= */

describe("pickPredictedVariable — ambiguous (second >= 80% of first) → null", () => {
  const signals = [
    makeSignal("protein placement violation", 3, 0, 0.4, 10.0),
    makeSignal("calorie delta violation", 3, 0, 0.4, 9.5),
  ];

  it("returns null (no dominant signal)", () => {
    expect(pickPredictedVariable(signals)).toBeNull();
  });
});

/* =========================================================
   Scenario 14: pickPredictedVariable — zero score → null
   ========================================================= */

describe("pickPredictedVariable — zero score → null", () => {
  const signals = [makeSignal("calorie delta violation", 0, 0, 0, 0)];

  it("returns null", () => {
    expect(pickPredictedVariable(signals)).toBeNull();
  });
});

/* =========================================================
   Scenario 15: classifyPredictionConfidence — totalRuns < 3 → "low"
   ========================================================= */

describe("classifyPredictionConfidence — hard guard: totalRuns < 3 → 'low'", () => {
  const signals = [makeSignal("calorie delta violation", 2, 2, 1.0, 12.0)];

  it("returns 'low' for totalRuns = 1", () => {
    expect(classifyPredictionConfidence(signals, 1)).toBe("low");
  });

  it("returns 'low' for totalRuns = 2", () => {
    expect(classifyPredictionConfidence(signals, 2)).toBe("low");
  });
});

/* =========================================================
   Scenario 16: classifyPredictionConfidence — null predicted → "low"
   ========================================================= */

describe("classifyPredictionConfidence — ambiguous signals → 'low'", () => {
  const signals = [
    makeSignal("a", 3, 0, 0.4, 10.0),
    makeSignal("b", 3, 0, 0.4, 9.5),
  ];

  it("returns 'low' even with totalRuns = 10 (no dominant signal)", () => {
    expect(classifyPredictionConfidence(signals, 10)).toBe("low");
  });
});

/* =========================================================
   Scenario 17: classifyPredictionConfidence — high
   ========================================================= */

describe("classifyPredictionConfidence — high: dominant + streak + deep history", () => {
  // totalRuns = 10, top frequency = 7 (> 50%), currentStreak = 3, deep history (>=8)
  const signals = [
    makeSignal("protein placement violation", 7, 3, 0.8, 20.0),
    makeSignal("calorie delta violation", 2, 0, 0.2, 3.0),
  ];

  it("returns 'high'", () => {
    expect(classifyPredictionConfidence(signals, 10)).toBe("high");
  });
});

/* =========================================================
   Scenario 18: classifyPredictionConfidence — moderate
   ========================================================= */

describe("classifyPredictionConfidence — moderate: clear leader, shallow history", () => {
  // totalRuns = 5 (< DEEP_HISTORY_THRESHOLD=8), clear leader
  const signals = [
    makeSignal("protein placement violation", 3, 2, 0.6, 12.0),
    makeSignal("calorie delta violation", 1, 0, 0.2, 2.5),
  ];

  it("returns 'moderate' for totalRuns = 5", () => {
    expect(classifyPredictionConfidence(signals, 5)).toBe("moderate");
  });
});

/* =========================================================
   Scenario 19: classifyRiskDirection — drifting → "rising"
   ========================================================= */

describe("classifyRiskDirection — drifting → 'rising'", () => {
  const occs = makeOccurrences([null, "calorie delta violation", "calorie delta violation", "calorie delta violation"]);
  const drift = makeDriftSummary({ drifting: true });

  it("returns 'rising'", () => {
    expect(classifyRiskDirection(occs, drift)).toBe("rising");
  });
});

/* =========================================================
   Scenario 20: classifyRiskDirection — stabilizing → "decreasing"
   ========================================================= */

describe("classifyRiskDirection — stabilizing → 'decreasing'", () => {
  const occs = makeOccurrences(["calorie delta violation", null, null, null]);
  const drift = makeDriftSummary({ stabilizing: true });

  it("returns 'decreasing'", () => {
    expect(classifyRiskDirection(occs, drift)).toBe("decreasing");
  });
});

/* =========================================================
   Scenario 21: classifyRiskDirection — last 3 all LAWFUL → "decreasing"
   ========================================================= */

describe("classifyRiskDirection — last 3 all LAWFUL (not in drift summary) → 'decreasing'", () => {
  const occs = makeOccurrences(["calorie delta violation", null, null, null]);
  const drift = makeDriftSummary({ stabilizing: false, drifting: false });

  it("returns 'decreasing'", () => {
    expect(classifyRiskDirection(occs, drift)).toBe("decreasing");
  });
});

/* =========================================================
   Scenario 22: classifyRiskDirection — last 3 non-null same → "rising"
   ========================================================= */

describe("classifyRiskDirection — last 3 non-null same variable → 'rising'", () => {
  const occs = makeOccurrences([
    "calorie delta violation",
    "calorie delta violation",
    "calorie delta violation",
  ]);
  const drift = makeDriftSummary({ drifting: false, stabilizing: false });

  it("returns 'rising'", () => {
    expect(classifyRiskDirection(occs, drift)).toBe("rising");
  });
});

/* =========================================================
   Scenario 23: classifyRiskDirection — mixed → "stable"
   ========================================================= */

describe("classifyRiskDirection — mixed recent history → 'stable'", () => {
  const occs = makeOccurrences(["calorie delta violation", null, "protein placement violation"]);
  const drift = makeDriftSummary({ drifting: false, stabilizing: false });

  it("returns 'stable'", () => {
    expect(classifyRiskDirection(occs, drift)).toBe("stable");
  });
});

/* =========================================================
   Scenario 24: buildFailurePrediction — empty records
   ========================================================= */

describe("buildFailurePrediction — empty records", () => {
  const pred = buildFailurePrediction([]);

  it("predictedVariable is null", () => {
    expect(pred.predictedVariable).toBeNull();
  });

  it("confidence is 'low'", () => {
    expect(pred.confidence).toBe("low");
  });

  it("signals is empty", () => {
    expect(pred.signals).toHaveLength(0);
  });

  it("explanationLines is non-empty", () => {
    expect(pred.explanationLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 25: buildFailurePrediction — totalRuns < 3 → confidence "low"
   ========================================================= */

describe("buildFailurePrediction — totalRuns < 3 → confidence forced to 'low'", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
  ];
  const pred = buildFailurePrediction(records);

  it("confidence is 'low'", () => {
    expect(pred.confidence).toBe("low");
  });

  it("explanationLines mention 'too shallow'", () => {
    const combined = pred.explanationLines.join(" ").toLowerCase();
    expect(combined).toContain("too shallow");
  });
});

/* =========================================================
   Scenario 26: buildFailurePrediction — all lawful
   ========================================================= */

describe("buildFailurePrediction — all lawful runs", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-02T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-03T00:00:00Z", "LAWFUL", null),
  ];
  const pred = buildFailurePrediction(records);

  it("predictedVariable is null", () => {
    expect(pred.predictedVariable).toBeNull();
  });

  it("riskDirection is 'decreasing'", () => {
    expect(pred.riskDirection).toBe("decreasing");
  });

  it("explanationLines mention lawful", () => {
    const combined = pred.explanationLines.join(" ").toLowerCase();
    expect(combined).toContain("lawful");
  });
});

/* =========================================================
   Scenario 27: buildFailurePrediction — 8-run spec scenario
   ========================================================= */

describe("buildFailurePrediction — 8-run spec scenario", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "protein placement violation"),
    makeRecord("2026-01-04T00:00:00Z", "DEGRADED", "protein placement violation"),
    makeRecord("2026-01-05T00:00:00Z", "DEGRADED", "protein placement violation"),
    makeRecord("2026-01-06T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-07T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-08T00:00:00Z", "LAWFUL", null),
  ];
  const pred = buildFailurePrediction(records);

  it("predictedVariable is 'calorie delta violation' (most recent + highest score)", () => {
    expect(pred.predictedVariable).toBe("calorie delta violation");
  });

  it("confidence is not 'high' (last run was lawful, no current streak)", () => {
    expect(pred.confidence).not.toBe("high");
  });

  it("signals contains both variables", () => {
    const vars = pred.signals.map((s) => s.variable);
    expect(vars).toContain("calorie delta violation");
    expect(vars).toContain("protein placement violation");
  });

  it("calorie delta violation recentShare > 0 (appears in recent window)", () => {
    const sig = pred.signals.find((s) => s.variable === "calorie delta violation");
    expect(sig?.recentShare).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 28: explanationLines — mention streak
   ========================================================= */

describe("buildFailurePrediction — explanationLines mention streak when streak >= 2", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "protein placement violation"),
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "protein placement violation"),
    makeRecord("2026-01-04T00:00:00Z", "DEGRADED", "protein placement violation"),
  ];
  const pred = buildFailurePrediction(records);

  it("predictedVariable is 'protein placement violation'", () => {
    expect(pred.predictedVariable).toBe("protein placement violation");
  });

  it("explanationLines mention '3 consecutive runs'", () => {
    const combined = pred.explanationLines.join(" ");
    expect(combined).toContain("3");
    expect(combined.toLowerCase()).toContain("consecutive");
  });

  it("riskDirection is 'rising'", () => {
    expect(pred.riskDirection).toBe("rising");
  });
});

/* =========================================================
   Scenario 29: explanationLines — decreasing risk
   ========================================================= */

describe("buildFailurePrediction — explanationLines mention decreasing risk", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-03T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-04T00:00:00Z", "LAWFUL", null),
  ];
  const pred = buildFailurePrediction(records);

  it("riskDirection is 'decreasing'", () => {
    expect(pred.riskDirection).toBe("decreasing");
  });

  it("explanationLines mention decreasing risk", () => {
    const combined = pred.explanationLines.join(" ").toLowerCase();
    expect(combined).toContain("decreasing");
  });
});

/* =========================================================
   Scenario 30: explanationLines — shallow history warning
   ========================================================= */

describe("buildFailurePrediction — shallow history warning appears", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
  ];
  const pred = buildFailurePrediction(records);

  it("confidence is 'low'", () => {
    expect(pred.confidence).toBe("low");
  });

  it("explanationLine says 'too shallow'", () => {
    const combined = pred.explanationLines.join(" ").toLowerCase();
    expect(combined).toContain("too shallow");
  });
});
