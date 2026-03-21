/**
 * decisive_variable_trends_test.ts
 *
 * Regression tests for decisive_variable_trends.ts — deterministic trend
 * analysis engine for NOMOS decisive variables across audit runs.
 *
 * Scenarios:
 *   1.  extractDecisiveVariableOccurrences — empty records
 *   2.  extractDecisiveVariableOccurrences — single LAWFUL run
 *   3.  extractDecisiveVariableOccurrences — single DEGRADED run with decisive variable
 *   4.  extractDecisiveVariableOccurrences — records sorted chronologically regardless of input order
 *   5.  extractDecisiveVariableOccurrences — "none" normalised to null
 *   6.  computeCurrentStreak — no occurrences of variable
 *   7.  computeCurrentStreak — variable at tail
 *   8.  computeCurrentStreak — variable not at tail (streak = 0)
 *   9.  computeLongestStreak — single run of 3
 *  10.  computeLongestStreak — two runs, pick the longer
 *  11.  buildDecisiveVariableTrends — empty occurrences
 *  12.  buildDecisiveVariableTrends — sorted by count descending
 *  13.  buildDecisiveVariableTrends — firstSeen / lastSeen / statuses
 *  14.  buildDecisiveVariableTrends — null occurrences excluded from variables
 *  15.  buildDriftSummary — empty → no summary lines, not drifting, not stabilizing
 *  16.  buildDriftSummary — drifting (same variable last 3 runs)
 *  17.  buildDriftSummary — stabilizing (lawful last 3 runs)
 *  18.  buildDriftSummary — neither (mixed recent history)
 *  19.  buildDriftSummary — mostRecentVariable ignores null occurrences
 *  20.  buildDriftSummary — recurringViolations includes variable with count >= 2
 *  21.  buildDriftSummary — summaryLine mentions streak for recurring violation
 *  22.  buildDriftSummary — summaryLine mentions most frequent variable
 *  23.  buildDriftSummary — summaryLine for stabilizing
 *  24.  buildDriftSummary — summaryLine for drifting
 *  25.  buildDriftSummary — all lawful → "All recorded runs have been lawful."
 *  26.  buildDecisiveVariableTrendReport — totalRuns matches records count
 *  27.  buildDecisiveVariableTrendReport — occurrenceTimeline chronological
 *  28.  buildDecisiveVariableTrendReport — variables sorted by count
 *  29.  buildDecisiveVariableTrendReport — driftSummary integrated
 *  30.  buildDecisiveVariableTrendReport — 8-run scenario from spec
 */

import { describe, it, expect } from "vitest";
import {
  extractDecisiveVariableOccurrences,
  computeCurrentStreak,
  computeLongestStreak,
  buildDecisiveVariableTrends,
  buildDriftSummary,
  buildDecisiveVariableTrendReport,
} from "../audit/decisive_variable_trends";
import type { AuditRecord } from "../audit/audit_types";
import type { DecisiveVariableOccurrence } from "../audit/trend_types";

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
    id: `audit_${_seq}`,
    versionId: `ver_${_seq}`,
    parentVersionId: null,
    timestamp,
    intent: "test",
    title: `Run ${_seq}`,
    isEvaluable: true,
    isConfirmed: true,
    canonicalDeclaration: "",
    compileResult: null,
    patchedDraft: null,
    evaluationResult: overallStatus === null
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

function makeOccurrence(
  decisiveVariable: string | null,
  overallStatus: string | null = "LAWFUL",
  ts?: string
): DecisiveVariableOccurrence {
  return {
    versionId: `ver_occ_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: ts ?? new Date().toISOString(),
    candidateId: null,
    overallStatus,
    decisiveVariable,
  };
}

function makeOccurrences(vars: (string | null)[]): DecisiveVariableOccurrence[] {
  return vars.map((v, i) =>
    makeOccurrence(v, v === null ? "LAWFUL" : "DEGRADED", `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`)
  );
}

/* =========================================================
   Scenario 1: extractDecisiveVariableOccurrences — empty
   ========================================================= */

describe("extractDecisiveVariableOccurrences — empty records", () => {
  const result = extractDecisiveVariableOccurrences([]);

  it("returns empty array", () => {
    expect(result).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 2: extractDecisiveVariableOccurrences — single LAWFUL run
   ========================================================= */

describe("extractDecisiveVariableOccurrences — single LAWFUL run", () => {
  const records = [makeRecord("2026-01-01T00:00:00Z", "LAWFUL", null)];
  const result = extractDecisiveVariableOccurrences(records);

  it("returns one occurrence", () => {
    expect(result).toHaveLength(1);
  });

  it("overallStatus is LAWFUL", () => {
    expect(result[0]!.overallStatus).toBe("LAWFUL");
  });

  it("decisiveVariable is null", () => {
    expect(result[0]!.decisiveVariable).toBeNull();
  });
});

/* =========================================================
   Scenario 3: extractDecisiveVariableOccurrences — DEGRADED run
   ========================================================= */

describe("extractDecisiveVariableOccurrences — single DEGRADED run", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
  ];
  const result = extractDecisiveVariableOccurrences(records);

  it("decisiveVariable is 'calorie delta violation'", () => {
    expect(result[0]!.decisiveVariable).toBe("calorie delta violation");
  });

  it("overallStatus is DEGRADED", () => {
    expect(result[0]!.overallStatus).toBe("DEGRADED");
  });
});

/* =========================================================
   Scenario 4: chronological sort regardless of input order
   ========================================================= */

describe("extractDecisiveVariableOccurrences — chronological sort", () => {
  const records = [
    makeRecord("2026-01-03T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "protein placement violation"),
  ];
  const result = extractDecisiveVariableOccurrences(records);

  it("oldest record is first", () => {
    expect(result[0]!.decisiveVariable).toBe("calorie delta violation");
  });

  it("middle record is second", () => {
    expect(result[1]!.decisiveVariable).toBe("protein placement violation");
  });

  it("most recent record is last", () => {
    expect(result[2]!.decisiveVariable).toBeNull();
  });
});

/* =========================================================
   Scenario 5: "none" normalised to null
   ========================================================= */

describe("extractDecisiveVariableOccurrences — 'none' normalised to null", () => {
  const records = [makeRecord("2026-01-01T00:00:00Z", "LAWFUL", "none")];
  const result = extractDecisiveVariableOccurrences(records);

  it("decisiveVariable is null (not 'none')", () => {
    expect(result[0]!.decisiveVariable).toBeNull();
  });
});

/* =========================================================
   Scenario 6: computeCurrentStreak — no occurrences of variable
   ========================================================= */

describe("computeCurrentStreak — variable never appears", () => {
  const occs = makeOccurrences([null, null, "calorie delta violation"]);

  it("returns 0 for protein placement violation", () => {
    expect(computeCurrentStreak("protein placement violation", occs)).toBe(0);
  });
});

/* =========================================================
   Scenario 7: computeCurrentStreak — variable at tail
   ========================================================= */

describe("computeCurrentStreak — variable at tail (streak = 3)", () => {
  const occs = makeOccurrences([
    null,
    "calorie delta violation",
    "calorie delta violation",
    "calorie delta violation",
  ]);

  it("returns 3", () => {
    expect(computeCurrentStreak("calorie delta violation", occs)).toBe(3);
  });
});

/* =========================================================
   Scenario 8: computeCurrentStreak — variable not at tail
   ========================================================= */

describe("computeCurrentStreak — variable not at tail (streak = 0)", () => {
  const occs = makeOccurrences([
    "calorie delta violation",
    "calorie delta violation",
    null,
  ]);

  it("returns 0 (broken by lawful run at tail)", () => {
    expect(computeCurrentStreak("calorie delta violation", occs)).toBe(0);
  });
});

/* =========================================================
   Scenario 9: computeLongestStreak — single run of 3
   ========================================================= */

describe("computeLongestStreak — single consecutive run of 3", () => {
  const occs = makeOccurrences([
    "protein placement violation",
    "protein placement violation",
    "protein placement violation",
    null,
  ]);

  it("returns 3", () => {
    expect(computeLongestStreak("protein placement violation", occs)).toBe(3);
  });
});

/* =========================================================
   Scenario 10: computeLongestStreak — two runs, pick longer
   ========================================================= */

describe("computeLongestStreak — two separate runs, pick longer (3 vs 2)", () => {
  const occs = makeOccurrences([
    "calorie delta violation",
    "calorie delta violation",
    "calorie delta violation",
    null,
    "calorie delta violation",
    "calorie delta violation",
  ]);

  it("returns 3 (not 2)", () => {
    expect(computeLongestStreak("calorie delta violation", occs)).toBe(3);
  });
});

/* =========================================================
   Scenario 11: buildDecisiveVariableTrends — empty occurrences
   ========================================================= */

describe("buildDecisiveVariableTrends — empty occurrences", () => {
  const result = buildDecisiveVariableTrends([]);

  it("returns empty array", () => {
    expect(result).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 12: buildDecisiveVariableTrends — sorted by count descending
   ========================================================= */

describe("buildDecisiveVariableTrends — sorted by count descending", () => {
  const occs = makeOccurrences([
    "calorie delta violation",
    "protein placement violation",
    "protein placement violation",
    "protein placement violation",
    "calorie delta violation",
  ]);
  const trends = buildDecisiveVariableTrends(occs);

  it("protein placement violation is first (count 3)", () => {
    expect(trends[0]!.variable).toBe("protein placement violation");
    expect(trends[0]!.count).toBe(3);
  });

  it("calorie delta violation is second (count 2)", () => {
    expect(trends[1]!.variable).toBe("calorie delta violation");
    expect(trends[1]!.count).toBe(2);
  });
});

/* =========================================================
   Scenario 13: buildDecisiveVariableTrends — firstSeen / lastSeen / statuses
   ========================================================= */

describe("buildDecisiveVariableTrends — firstSeen, lastSeen, statuses", () => {
  const occs: DecisiveVariableOccurrence[] = [
    {
      versionId: "v1",
      timestamp: "2026-01-01T00:00:00Z",
      candidateId: null,
      overallStatus: "DEGRADED",
      decisiveVariable: "calorie delta violation",
    },
    {
      versionId: "v2",
      timestamp: "2026-01-05T00:00:00Z",
      candidateId: null,
      overallStatus: "INVALID",
      decisiveVariable: "calorie delta violation",
    },
  ];
  const trends = buildDecisiveVariableTrends(occs);
  const t = trends[0]!;

  it("count is 2", () => {
    expect(t.count).toBe(2);
  });

  it("firstSeen is 2026-01-01", () => {
    expect(t.firstSeen).toBe("2026-01-01T00:00:00Z");
  });

  it("lastSeen is 2026-01-05", () => {
    expect(t.lastSeen).toBe("2026-01-05T00:00:00Z");
  });

  it("statuses contains DEGRADED: 1 and INVALID: 1", () => {
    expect(t.statuses["DEGRADED"]).toBe(1);
    expect(t.statuses["INVALID"]).toBe(1);
  });
});

/* =========================================================
   Scenario 14: null occurrences excluded from variables
   ========================================================= */

describe("buildDecisiveVariableTrends — null occurrences not counted", () => {
  const occs = makeOccurrences([null, null, null]);
  const trends = buildDecisiveVariableTrends(occs);

  it("returns empty array (all LAWFUL)", () => {
    expect(trends).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 15: buildDriftSummary — empty
   ========================================================= */

describe("buildDriftSummary — empty", () => {
  const result = buildDriftSummary([], []);

  it("mostFrequentVariable is null", () => {
    expect(result.mostFrequentVariable).toBeNull();
  });

  it("mostRecentVariable is null", () => {
    expect(result.mostRecentVariable).toBeNull();
  });

  it("not drifting", () => {
    expect(result.drifting).toBe(false);
  });

  it("not stabilizing", () => {
    expect(result.stabilizing).toBe(false);
  });

  it("summaryLines is empty", () => {
    expect(result.summaryLines).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 16: buildDriftSummary — drifting (same variable last 3)
   ========================================================= */

describe("buildDriftSummary — drifting (same variable last 3 runs)", () => {
  const occs = makeOccurrences([
    null,
    "calorie delta violation",
    "calorie delta violation",
    "calorie delta violation",
  ]);
  const trends = buildDecisiveVariableTrends(occs);
  const result = buildDriftSummary(trends, occs);

  it("drifting is true", () => {
    expect(result.drifting).toBe(true);
  });

  it("stabilizing is false", () => {
    expect(result.stabilizing).toBe(false);
  });

  it("summaryLine mentions drift", () => {
    const combined = result.summaryLines.join(" ");
    expect(combined.toLowerCase()).toContain("drift");
  });
});

/* =========================================================
   Scenario 17: buildDriftSummary — stabilizing (null last 3)
   ========================================================= */

describe("buildDriftSummary — stabilizing (lawful last 3 runs)", () => {
  const occs = makeOccurrences([
    "calorie delta violation",
    null,
    null,
    null,
  ]);
  const trends = buildDecisiveVariableTrends(occs);
  const result = buildDriftSummary(trends, occs);

  it("stabilizing is true", () => {
    expect(result.stabilizing).toBe(true);
  });

  it("drifting is false", () => {
    expect(result.drifting).toBe(false);
  });

  it("summaryLine mentions stabilization", () => {
    const combined = result.summaryLines.join(" ");
    expect(combined.toLowerCase()).toContain("stabiliz");
  });
});

/* =========================================================
   Scenario 18: buildDriftSummary — neither (mixed)
   ========================================================= */

describe("buildDriftSummary — neither (mixed recent history)", () => {
  const occs = makeOccurrences([
    "calorie delta violation",
    null,
    "protein placement violation",
  ]);
  const trends = buildDecisiveVariableTrends(occs);
  const result = buildDriftSummary(trends, occs);

  it("drifting is false", () => {
    expect(result.drifting).toBe(false);
  });

  it("stabilizing is false", () => {
    expect(result.stabilizing).toBe(false);
  });
});

/* =========================================================
   Scenario 19: buildDriftSummary — mostRecentVariable skips nulls
   ========================================================= */

describe("buildDriftSummary — mostRecentVariable ignores trailing nulls", () => {
  const occs = makeOccurrences([
    "calorie delta violation",
    null,
    null,
  ]);
  const trends = buildDecisiveVariableTrends(occs);
  const result = buildDriftSummary(trends, occs);

  it("mostRecentVariable is 'calorie delta violation'", () => {
    expect(result.mostRecentVariable).toBe("calorie delta violation");
  });
});

/* =========================================================
   Scenario 20: recurringViolations with count >= 2
   ========================================================= */

describe("buildDriftSummary — recurringViolations includes count >= 2", () => {
  const occs = makeOccurrences([
    "calorie delta violation",
    "protein placement violation",
    "calorie delta violation",
  ]);
  const trends = buildDecisiveVariableTrends(occs);
  const result = buildDriftSummary(trends, occs);

  it("recurringViolations includes 'calorie delta violation'", () => {
    expect(result.recurringViolations).toContain("calorie delta violation");
  });

  it("recurringViolations does not include 'protein placement violation' (count=1)", () => {
    expect(result.recurringViolations).not.toContain("protein placement violation");
  });
});

/* =========================================================
   Scenario 21: summaryLine for recurring streak
   ========================================================= */

describe("buildDriftSummary — summaryLine mentions consecutive streak", () => {
  const occs = makeOccurrences([
    null,
    "protein placement violation",
    "protein placement violation",
    "protein placement violation",
  ]);
  const trends = buildDecisiveVariableTrends(occs);
  const result = buildDriftSummary(trends, occs);

  it("summaryLine mentions 3 consecutive runs", () => {
    const combined = result.summaryLines.join(" ");
    expect(combined).toContain("3");
    expect(combined.toLowerCase()).toContain("consecutive");
  });

  it("summaryLine mentions protein placement violation", () => {
    const combined = result.summaryLines.join(" ");
    expect(combined.toLowerCase()).toContain("protein placement violation");
  });
});

/* =========================================================
   Scenario 22: summaryLine for most frequent variable
   ========================================================= */

describe("buildDriftSummary — summaryLine for most frequent variable", () => {
  const occs = makeOccurrences([
    "calorie delta violation",
    "calorie delta violation",
    "calorie delta violation",
    "protein placement violation",
  ]);
  const trends = buildDecisiveVariableTrends(occs);
  const result = buildDriftSummary(trends, occs);

  it("summaryLine mentions calorie delta as most frequent", () => {
    const combined = result.summaryLines.join(" ");
    expect(combined.toLowerCase()).toContain("calorie delta violation");
    expect(combined.toLowerCase()).toContain("most frequent");
  });
});

/* =========================================================
   Scenario 23: summaryLine for stabilizing
   ========================================================= */

describe("buildDriftSummary — summaryLine for stabilizing trajectory", () => {
  const occs = makeOccurrences([
    "calorie delta violation",
    null,
    null,
    null,
  ]);
  const trends = buildDecisiveVariableTrends(occs);
  const result = buildDriftSummary(trends, occs);

  it("at least one summaryLine mentions stabilization", () => {
    const combined = result.summaryLines.join(" ").toLowerCase();
    expect(combined).toContain("stabiliz");
  });
});

/* =========================================================
   Scenario 24: summaryLine for drifting
   ========================================================= */

describe("buildDriftSummary — summaryLine for drifting trajectory", () => {
  const occs = makeOccurrences([
    null,
    "protein placement violation",
    "protein placement violation",
    "protein placement violation",
  ]);
  const trends = buildDecisiveVariableTrends(occs);
  const result = buildDriftSummary(trends, occs);

  it("summaryLine mentions 'drift'", () => {
    const combined = result.summaryLines.join(" ").toLowerCase();
    expect(combined).toContain("drift");
  });

  it("summaryLine mentions the drifting variable", () => {
    const combined = result.summaryLines.join(" ").toLowerCase();
    expect(combined).toContain("protein placement violation");
  });
});

/* =========================================================
   Scenario 25: all lawful → special message
   ========================================================= */

describe("buildDriftSummary — all lawful summary line", () => {
  const occs = makeOccurrences([null, null, null]);
  const trends = buildDecisiveVariableTrends(occs);
  const result = buildDriftSummary(trends, occs);

  it("summaryLine says all runs have been lawful", () => {
    const combined = result.summaryLines.join(" ").toLowerCase();
    expect(combined).toContain("lawful");
  });
});

/* =========================================================
   Scenario 26: buildDecisiveVariableTrendReport — totalRuns
   ========================================================= */

describe("buildDecisiveVariableTrendReport — totalRuns", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-03T00:00:00Z", "LAWFUL", null),
  ];
  const report = buildDecisiveVariableTrendReport(records);

  it("totalRuns is 3", () => {
    expect(report.totalRuns).toBe(3);
  });
});

/* =========================================================
   Scenario 27: occurrenceTimeline is chronological
   ========================================================= */

describe("buildDecisiveVariableTrendReport — occurrenceTimeline is chronological", () => {
  const records = [
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-01T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "protein placement violation"),
  ];
  const report = buildDecisiveVariableTrendReport(records);
  const tl = report.occurrenceTimeline;

  it("first entry is from 2026-01-01", () => {
    expect(tl[0]!.timestamp).toBe("2026-01-01T00:00:00Z");
  });

  it("last entry is from 2026-01-03", () => {
    expect(tl[2]!.timestamp).toBe("2026-01-03T00:00:00Z");
  });
});

/* =========================================================
   Scenario 28: variables sorted by count
   ========================================================= */

describe("buildDecisiveVariableTrendReport — variables sorted by count", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "DEGRADED", "meal order violation"),
    makeRecord("2026-01-02T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-03T00:00:00Z", "DEGRADED", "calorie delta violation"),
    makeRecord("2026-01-04T00:00:00Z", "DEGRADED", "calorie delta violation"),
  ];
  const report = buildDecisiveVariableTrendReport(records);

  it("calorie delta violation is first (count 3)", () => {
    expect(report.variables[0]!.variable).toBe("calorie delta violation");
  });

  it("meal order violation is second (count 1)", () => {
    expect(report.variables[1]!.variable).toBe("meal order violation");
  });
});

/* =========================================================
   Scenario 29: driftSummary integrated into report
   ========================================================= */

describe("buildDecisiveVariableTrendReport — driftSummary integrated", () => {
  const records = [
    makeRecord("2026-01-01T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-02T00:00:00Z", "LAWFUL", null),
    makeRecord("2026-01-03T00:00:00Z", "LAWFUL", null),
  ];
  const report = buildDecisiveVariableTrendReport(records);

  it("driftSummary.stabilizing is true (all lawful)", () => {
    expect(report.driftSummary.stabilizing).toBe(true);
  });

  it("driftSummary.summaryLines includes lawful message", () => {
    const combined = report.driftSummary.summaryLines.join(" ").toLowerCase();
    expect(combined).toContain("lawful");
  });
});

/* =========================================================
   Scenario 30: 8-run scenario from spec
   ========================================================= */

describe("8-run spec scenario: calorie/protein/calorie/lawful pattern", () => {
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
  const report = buildDecisiveVariableTrendReport(records);

  it("totalRuns is 8", () => {
    expect(report.totalRuns).toBe(8);
  });

  it("calorie delta violation has count 4", () => {
    const cdv = report.variables.find((v) => v.variable === "calorie delta violation");
    expect(cdv?.count).toBe(4);
  });

  it("protein placement violation has count 3", () => {
    const ppv = report.variables.find((v) => v.variable === "protein placement violation");
    expect(ppv?.count).toBe(3);
  });

  it("protein placement violation longestStreak is 3", () => {
    const ppv = report.variables.find((v) => v.variable === "protein placement violation");
    expect(ppv?.longestStreak).toBe(3);
  });

  it("calorie delta violation currentStreak is 0 (last run is lawful)", () => {
    const cdv = report.variables.find((v) => v.variable === "calorie delta violation");
    expect(cdv?.currentStreak).toBe(0);
  });

  it("protein placement violation currentStreak is 0 (last run is lawful)", () => {
    const ppv = report.variables.find((v) => v.variable === "protein placement violation");
    expect(ppv?.currentStreak).toBe(0);
  });

  it("mostRecentVariable is 'calorie delta violation' (most recent non-null, from run 7)", () => {
    expect(report.driftSummary.mostRecentVariable).toBe("calorie delta violation");
  });

  it("recurringViolations contains both variables", () => {
    expect(report.driftSummary.recurringViolations).toContain("calorie delta violation");
    expect(report.driftSummary.recurringViolations).toContain("protein placement violation");
  });

  it("last 3 runs include 2 lawful runs and 1 calorie → not pure stabilizing", () => {
    expect(report.driftSummary.stabilizing).toBe(false);
  });

  it("occurrenceTimeline has 8 entries in chronological order", () => {
    expect(report.occurrenceTimeline).toHaveLength(8);
    expect(report.occurrenceTimeline[0]!.decisiveVariable).toBe("calorie delta violation");
    expect(report.occurrenceTimeline[7]!.decisiveVariable).toBeNull();
  });
});
