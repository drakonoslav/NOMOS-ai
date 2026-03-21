/**
 * trace_diff_test.ts
 *
 * Regression tests for trace_diff.ts — deterministic diff engine for
 * NOMOS trace-aware audit comparison.
 *
 * All comparisons are deterministic (JSON-stable, no LLM).
 * Tests verify the three core functions and the top-level run diff.
 *
 * Scenarios:
 *   1. diffTraceState — identical values → unchanged
 *   2. diffTraceState — different scalar values → changed
 *   3. diffTraceState — structurally equal objects (different key order) → unchanged
 *   4. diffTraceState — structurally different objects → changed
 *   5. diffProofLines — empty vs empty → all empty
 *   6. diffProofLines — identical lines → all unchanged
 *   7. diffProofLines — added lines
 *   8. diffProofLines — removed lines
 *   9. diffProofLines — mixed added + removed + unchanged
 *  10. diffConstraintTrace — both null → no changes
 *  11. diffConstraintTrace — before null, after has trace → changed
 *  12. diffConstraintTrace — verdict changed satisfied → violated
 *  13. diffConstraintTrace — proof line added
 *  14. diffConstraintTrace — proof line removed
 *  15. diffConstraintTrace — baseline state changed
 *  16. diffConstraintTrace — decisive variable changed (calorie → protein)
 *  17. diffConstraintTrace — unchanged (same trace both sides)
 *  18. diffAuditRuns — identical records → changed: false
 *  19. diffAuditRuns — overallStatus changed → summaryLines mention it
 *  20. diffAuditRuns — decisiveVariable changed → summaryLines mention it
 *  21. diffAuditRuns — candidate trace changed → candidateDiff present
 *  22. changeSummary — proof added line
 *  23. changeSummary — proof removed line
 *  24. changeSummary — decisive variable changed
 *  25. changeSummary — no changes
 */

import { describe, it, expect } from "vitest";
import {
  diffTraceState,
  diffProofLines,
  diffConstraintTrace,
  diffAuditRuns,
} from "../audit/trace_diff";
import type { ConstraintTrace } from "../evaluation/evaluation_report_types";
import type { AuditRecord } from "../audit/audit_types";

/* =========================================================
   Fixture helpers
   ========================================================= */

function makeTrace(overrides?: Partial<ConstraintTrace>): ConstraintTrace {
  return {
    constraintId: "STRUCTURAL_LOCK:preserve_protein_placement",
    key: "preserve_protein_placement",
    variableName: "protein placement",
    violationLabel: "protein placement violation",
    operator: "MUST_EQUAL",
    baselineState: { "2": ["whey"], "3": ["yogurt"] },
    candidateState: { "2": ["whey"], "3": ["yogurt"] },
    diffSummary: "No difference detected.",
    proofLines: [
      "No violation detected.",
      "Protein placement matches baseline across all meals.",
      "Constraint MUST_EQUAL on protein placement is satisfied.",
    ],
    suggestedRepair: null,
    ...overrides,
  };
}

function makeViolatedTrace(overrides?: Partial<ConstraintTrace>): ConstraintTrace {
  return {
    constraintId: "STRUCTURAL_LOCK:preserve_protein_placement",
    key: "preserve_protein_placement",
    variableName: "protein placement",
    violationLabel: "protein placement violation",
    operator: "MUST_EQUAL",
    baselineState: { "2": ["whey"], "3": ["yogurt"] },
    candidateState: { "2": [], "3": ["yogurt"], "7": ["whey"] },
    diffSummary: "Whey moved from meal 2 to meal 7.",
    proofLines: [
      "Baseline meal 2 contains whey.",
      "Candidate meal 2 does not contain whey.",
      "Candidate meal 7 contains whey.",
      "Therefore whey moved from meal 2 to meal 7.",
      "Constraint MUST_EQUAL on protein placement is violated.",
    ],
    suggestedRepair: "Restore whey to meal 2.",
    ...overrides,
  };
}

function makeAuditRecord(overrides?: {
  id?: string;
  versionId?: string;
  title?: string;
  payload?: unknown;
}): AuditRecord {
  return {
    id: overrides?.id ?? "audit_001",
    versionId: overrides?.versionId ?? "ver_001",
    timestamp: new Date().toISOString(),
    intent: "test",
    title: overrides?.title ?? "Test Audit",
    isEvaluable: true,
    isConfirmed: true,
    canonicalDeclaration: "",
    compileResult: null,
    patchedDraft: null,
    evaluationResult: overrides?.payload !== undefined
      ? { status: "LAWFUL", payload: overrides.payload }
      : null,
  };
}

/* =========================================================
   Scenario 1: diffTraceState — identical scalars
   ========================================================= */

describe("diffTraceState — identical scalar values", () => {
  const result = diffTraceState(2000, 2000);

  it("changed is false", () => {
    expect(result.changed).toBe(false);
  });

  it("summary says 'unchanged'", () => {
    expect(result.summary.toLowerCase()).toContain("unchanged");
  });

  it("before is preserved", () => {
    expect(result.before).toBe(2000);
  });

  it("after is preserved", () => {
    expect(result.after).toBe(2000);
  });
});

/* =========================================================
   Scenario 2: diffTraceState — different scalar values
   ========================================================= */

describe("diffTraceState — different scalar values", () => {
  const result = diffTraceState(2000, 2150);

  it("changed is true", () => {
    expect(result.changed).toBe(true);
  });

  it("summary says 'differs'", () => {
    expect(result.summary.toLowerCase()).toContain("differs");
  });
});

/* =========================================================
   Scenario 3: diffTraceState — structurally equal objects (different key order)
   ========================================================= */

describe("diffTraceState — structurally equal objects with different key order", () => {
  const a = { z: 1, a: 2 };
  const b = { a: 2, z: 1 };
  const result = diffTraceState(a, b);

  it("changed is false (key-order-independent comparison)", () => {
    expect(result.changed).toBe(false);
  });

  it("summary says 'unchanged'", () => {
    expect(result.summary.toLowerCase()).toContain("unchanged");
  });
});

/* =========================================================
   Scenario 4: diffTraceState — structurally different objects
   ========================================================= */

describe("diffTraceState — structurally different objects", () => {
  const a = { "2": ["whey"], "3": ["yogurt"] };
  const b = { "2": [], "7": ["whey"] };
  const result = diffTraceState(a, b);

  it("changed is true", () => {
    expect(result.changed).toBe(true);
  });
});

/* =========================================================
   Scenario 5: diffProofLines — empty vs empty
   ========================================================= */

describe("diffProofLines — empty vs empty", () => {
  const result = diffProofLines([], []);

  it("added is empty", () => {
    expect(result.added).toHaveLength(0);
  });

  it("removed is empty", () => {
    expect(result.removed).toHaveLength(0);
  });

  it("unchanged is empty", () => {
    expect(result.unchanged).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 6: diffProofLines — identical lines
   ========================================================= */

describe("diffProofLines — identical lines", () => {
  const lines = ["No violation detected.", "Satisfied."];
  const result = diffProofLines(lines, lines);

  it("added is empty", () => {
    expect(result.added).toHaveLength(0);
  });

  it("removed is empty", () => {
    expect(result.removed).toHaveLength(0);
  });

  it("unchanged contains all lines", () => {
    expect(result.unchanged).toEqual(lines);
  });
});

/* =========================================================
   Scenario 7: diffProofLines — added lines
   ========================================================= */

describe("diffProofLines — added lines", () => {
  const before = ["Line A.", "Line B."];
  const after = ["Line A.", "Line B.", "Therefore whey moved from meal 2 to meal 7."];
  const result = diffProofLines(before, after);

  it("added contains the new line", () => {
    expect(result.added).toEqual(["Therefore whey moved from meal 2 to meal 7."]);
  });

  it("removed is empty", () => {
    expect(result.removed).toHaveLength(0);
  });

  it("unchanged contains the shared lines", () => {
    expect(result.unchanged).toEqual(["Line A.", "Line B."]);
  });
});

/* =========================================================
   Scenario 8: diffProofLines — removed lines
   ========================================================= */

describe("diffProofLines — removed lines", () => {
  const before = ["Line A.", "Line B.", "Old conclusion."];
  const after = ["Line A.", "Line B."];
  const result = diffProofLines(before, after);

  it("removed contains the old line", () => {
    expect(result.removed).toEqual(["Old conclusion."]);
  });

  it("added is empty", () => {
    expect(result.added).toHaveLength(0);
  });

  it("unchanged contains shared lines", () => {
    expect(result.unchanged).toEqual(["Line A.", "Line B."]);
  });
});

/* =========================================================
   Scenario 9: diffProofLines — mixed
   ========================================================= */

describe("diffProofLines — mixed added + removed + unchanged", () => {
  const before = [
    "No violation detected.",
    "Old diff line.",
    "Constraint is satisfied.",
  ];
  const after = [
    "No violation detected.",
    "New diff line.",
    "Constraint is violated.",
  ];
  const result = diffProofLines(before, after);

  it("added contains both new lines", () => {
    expect(result.added).toContain("New diff line.");
    expect(result.added).toContain("Constraint is violated.");
  });

  it("removed contains both old lines", () => {
    expect(result.removed).toContain("Old diff line.");
    expect(result.removed).toContain("Constraint is satisfied.");
  });

  it("unchanged contains shared line", () => {
    expect(result.unchanged).toContain("No violation detected.");
  });
});

/* =========================================================
   Scenario 10: diffConstraintTrace — both null
   ========================================================= */

describe("diffConstraintTrace — both null", () => {
  const result = diffConstraintTrace(null, null);

  it("changed is false", () => {
    expect(result.changed).toBe(false);
  });

  it("changeSummary says 'No changes detected'", () => {
    expect(result.changeSummary).toBe("No changes detected.");
  });

  it("proofLineDiff is all empty", () => {
    expect(result.proofLineDiff.added).toHaveLength(0);
    expect(result.proofLineDiff.removed).toHaveLength(0);
    expect(result.proofLineDiff.unchanged).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 11: diffConstraintTrace — before null, after has trace
   ========================================================= */

describe("diffConstraintTrace — before null, after has trace (new constraint)", () => {
  const after = makeViolatedTrace();
  const result = diffConstraintTrace(null, after, "A");

  it("changed is true", () => {
    expect(result.changed).toBe(true);
  });

  it("verdictBefore is null", () => {
    expect(result.verdictBefore).toBeNull();
  });

  it("verdictAfter is 'violated'", () => {
    expect(result.verdictAfter).toBe("violated");
  });

  it("decisiveVariableAfter is violationLabel", () => {
    expect(result.decisiveVariableAfter).toBe("protein placement violation");
  });

  it("proofLineDiff.added contains all after proof lines", () => {
    for (const line of after.proofLines) {
      expect(result.proofLineDiff.added).toContain(line);
    }
  });
});

/* =========================================================
   Scenario 12: diffConstraintTrace — verdict changed satisfied → violated
   ========================================================= */

describe("diffConstraintTrace — verdict changed satisfied to violated", () => {
  const before = makeTrace();
  const after = makeViolatedTrace();
  const result = diffConstraintTrace(before, after, "B");

  it("changed is true", () => {
    expect(result.changed).toBe(true);
  });

  it("verdictBefore is 'satisfied'", () => {
    expect(result.verdictBefore).toBe("satisfied");
  });

  it("verdictAfter is 'violated'", () => {
    expect(result.verdictAfter).toBe("violated");
  });

  it("decisiveVariableBefore is null (satisfied)", () => {
    expect(result.decisiveVariableBefore).toBeNull();
  });

  it("decisiveVariableAfter is violationLabel", () => {
    expect(result.decisiveVariableAfter).toBe("protein placement violation");
  });

  it("changeSummary mentions decisive variable change", () => {
    expect(result.changeSummary.toLowerCase()).toContain("decisive variable");
  });
});

/* =========================================================
   Scenario 13: diffConstraintTrace — proof line added
   ========================================================= */

describe("diffConstraintTrace — proof line added", () => {
  const before = makeViolatedTrace();
  const newLine = "Therefore whey moved from meal 2 to meal 9.";
  // Insert before the conclusion line so the verdict (last line) is preserved
  const after = makeViolatedTrace({
    proofLines: [
      ...before.proofLines.slice(0, -1),
      newLine,
      before.proofLines.at(-1)!,
    ],
  });
  const result = diffConstraintTrace(before, after);

  it("changed is true", () => {
    expect(result.changed).toBe(true);
  });

  it("proofLineDiff.added contains the new line", () => {
    expect(result.proofLineDiff.added).toContain(newLine);
  });

  it("changeSummary mentions 'Proof added'", () => {
    expect(result.changeSummary).toContain("Proof added");
  });
});

/* =========================================================
   Scenario 14: diffConstraintTrace — proof line removed
   ========================================================= */

describe("diffConstraintTrace — proof line removed", () => {
  const before = makeViolatedTrace();
  const removed = "Baseline meal 2 contains whey.";
  const after = makeViolatedTrace({
    proofLines: before.proofLines.filter((l) => l !== removed),
  });
  const result = diffConstraintTrace(before, after);

  it("proofLineDiff.removed contains the dropped line", () => {
    expect(result.proofLineDiff.removed).toContain(removed);
  });

  it("changeSummary mentions the removed line or 'Proof removed'", () => {
    expect(result.changeSummary).toContain("Proof");
  });
});

/* =========================================================
   Scenario 15: diffConstraintTrace — baseline state changed
   ========================================================= */

describe("diffConstraintTrace — baseline state changed", () => {
  const before = makeTrace({ baselineState: { "2": ["whey"] } });
  const after = makeTrace({ baselineState: { "2": ["whey"], "5": ["casein"] } });
  const result = diffConstraintTrace(before, after);

  it("baselineStateDiff.changed is true", () => {
    expect(result.baselineStateDiff.changed).toBe(true);
  });

  it("changed is true", () => {
    expect(result.changed).toBe(true);
  });

  it("changeSummary mentions baseline state change", () => {
    expect(result.changeSummary.toLowerCase()).toContain("baseline");
  });
});

/* =========================================================
   Scenario 16: diffConstraintTrace — decisive variable changed
   ========================================================= */

describe("diffConstraintTrace — decisive variable changed (different variable names)", () => {
  const before = makeViolatedTrace({
    variableName: "calorie delta",
    violationLabel: "calorie delta violation",
    proofLines: [
      "Calorie target: 2000 kcal.",
      "Candidate calories: 2150 kcal.",
      "Constraint MINIMIZE_ABS_DELTA on calorie delta is violated.",
    ],
  });
  const after = makeViolatedTrace({
    variableName: "protein placement",
    violationLabel: "protein placement violation",
    proofLines: [
      "Baseline meal 2 contains whey.",
      "Candidate meal 2 does not contain whey.",
      "Constraint MUST_EQUAL on protein placement is violated.",
    ],
  });
  const result = diffConstraintTrace(before, after, "A");

  it("decisiveVariableBefore is 'calorie delta violation'", () => {
    expect(result.decisiveVariableBefore).toBe("calorie delta violation");
  });

  it("decisiveVariableAfter is 'protein placement violation'", () => {
    expect(result.decisiveVariableAfter).toBe("protein placement violation");
  });

  it("changeSummary mentions 'decisive variable changed'", () => {
    expect(result.changeSummary.toLowerCase()).toContain("decisive variable changed");
  });

  it("changeSummary mentions both old and new labels", () => {
    expect(result.changeSummary).toContain("calorie delta violation");
    expect(result.changeSummary).toContain("protein placement violation");
  });
});

/* =========================================================
   Scenario 17: diffConstraintTrace — unchanged (same trace both sides)
   ========================================================= */

describe("diffConstraintTrace — unchanged (same trace both sides)", () => {
  const trace = makeTrace();
  const result = diffConstraintTrace(trace, trace);

  it("changed is false", () => {
    expect(result.changed).toBe(false);
  });

  it("changeSummary is 'No changes detected'", () => {
    expect(result.changeSummary).toBe("No changes detected.");
  });

  it("proofLineDiff.added is empty", () => {
    expect(result.proofLineDiff.added).toHaveLength(0);
  });

  it("proofLineDiff.removed is empty", () => {
    expect(result.proofLineDiff.removed).toHaveLength(0);
  });

  it("all proof lines are in unchanged", () => {
    expect(result.proofLineDiff.unchanged).toEqual(trace.proofLines);
  });
});

/* =========================================================
   Scenario 18: diffAuditRuns — identical records → no changes
   ========================================================= */

describe("diffAuditRuns — identical records (no payload)", () => {
  const record = makeAuditRecord({ id: "a1", versionId: "v1" });
  const result = diffAuditRuns(record, record);

  it("changed is false", () => {
    expect(result.changed).toBe(false);
  });

  it("summaryLines is empty", () => {
    expect(result.summaryLines).toHaveLength(0);
  });

  it("beforeVersionId is v1", () => {
    expect(result.beforeVersionId).toBe("v1");
  });

  it("afterVersionId is v1", () => {
    expect(result.afterVersionId).toBe("v1");
  });
});

/* =========================================================
   Scenario 19: diffAuditRuns — overallStatus changed
   ========================================================= */

describe("diffAuditRuns — overallStatus changed LAWFUL → DEGRADED", () => {
  const before = makeAuditRecord({
    id: "a1",
    versionId: "v1",
    payload: {
      overallStatus: "LAWFUL",
      decisiveVariable: "calorie delta",
      candidateEvaluations: [],
    },
  });
  const after = makeAuditRecord({
    id: "a2",
    versionId: "v2",
    payload: {
      overallStatus: "DEGRADED",
      decisiveVariable: "calorie delta",
      candidateEvaluations: [],
    },
  });
  const result = diffAuditRuns(before, after);

  it("changed is true", () => {
    expect(result.changed).toBe(true);
  });

  it("overallStatusBefore is LAWFUL", () => {
    expect(result.overallStatusBefore).toBe("LAWFUL");
  });

  it("overallStatusAfter is DEGRADED", () => {
    expect(result.overallStatusAfter).toBe("DEGRADED");
  });

  it("summaryLines mentions status change", () => {
    const combined = result.summaryLines.join(" ");
    expect(combined).toContain("LAWFUL");
    expect(combined).toContain("DEGRADED");
  });
});

/* =========================================================
   Scenario 20: diffAuditRuns — decisiveVariable changed
   ========================================================= */

describe("diffAuditRuns — decisiveVariable changed", () => {
  const makePayload = (dec: string) => ({
    overallStatus: "INVALID",
    decisiveVariable: dec,
    candidateEvaluations: [],
  });

  const before = makeAuditRecord({ versionId: "v1", payload: makePayload("calorie delta") });
  const after = makeAuditRecord({ versionId: "v2", payload: makePayload("protein placement violation") });
  const result = diffAuditRuns(before, after);

  it("decisiveVariableBefore is 'calorie delta'", () => {
    expect(result.decisiveVariableBefore).toBe("calorie delta");
  });

  it("decisiveVariableAfter is 'protein placement violation'", () => {
    expect(result.decisiveVariableAfter).toBe("protein placement violation");
  });

  it("summaryLines mentions the change", () => {
    const combined = result.summaryLines.join(" ");
    expect(combined).toContain("calorie delta");
    expect(combined).toContain("protein placement violation");
  });
});

/* =========================================================
   Scenario 21: diffAuditRuns — candidate trace changed
   ========================================================= */

describe("diffAuditRuns — candidate trace proof changed", () => {
  const beforeTrace = makeTrace();
  const afterTrace = makeViolatedTrace();

  const makePayload = (trace: ConstraintTrace) => ({
    overallStatus: "LAWFUL",
    decisiveVariable: null,
    candidateEvaluations: [
      {
        id: "A",
        status: "LAWFUL",
        decisiveVariable: null,
        decisiveConstraintTrace: trace,
      },
    ],
  });

  const before = makeAuditRecord({ versionId: "v1", payload: makePayload(beforeTrace) });
  const after = makeAuditRecord({ versionId: "v2", payload: makePayload(afterTrace) });
  const result = diffAuditRuns(before, after);

  it("changed is true", () => {
    expect(result.changed).toBe(true);
  });

  it("candidateDiffs has one entry for candidate A", () => {
    expect(result.candidateDiffs).toHaveLength(1);
  });

  it("candidateDiff for A is changed", () => {
    expect(result.candidateDiffs[0]!.changed).toBe(true);
  });

  it("summaryLines are non-empty", () => {
    expect(result.summaryLines.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   Scenario 22–25: changeSummary via diffConstraintTrace
   ========================================================= */

describe("Scenario 22 — changeSummary: proof added", () => {
  const before = makeTrace();
  const newLine = "Therefore protein placement changed.";
  // Insert before the conclusion line so the verdict (last line) is preserved
  const after = makeTrace({
    proofLines: [
      ...before.proofLines.slice(0, -1),
      newLine,
      before.proofLines.at(-1)!,
    ],
  });
  const result = diffConstraintTrace(before, after);

  it("changeSummary contains 'Proof added'", () => {
    expect(result.changeSummary).toContain("Proof added");
  });

  it("changeSummary contains the added line", () => {
    expect(result.changeSummary).toContain(newLine);
  });
});

describe("Scenario 23 — changeSummary: proof removed", () => {
  const before = makeViolatedTrace();
  const after = makeViolatedTrace({
    proofLines: before.proofLines.slice(0, 1),
  });
  const result = diffConstraintTrace(before, after);

  it("changeSummary contains 'Proof removed' or 'decisive variable'", () => {
    const s = result.changeSummary;
    const ok = s.includes("Proof") || s.toLowerCase().includes("decisive") || s.toLowerCase().includes("verdict");
    expect(ok).toBe(true);
  });
});

describe("Scenario 24 — changeSummary: decisive variable changed", () => {
  const before = makeViolatedTrace({
    violationLabel: "calorie delta violation",
    proofLines: ["Constraint MINIMIZE_ABS_DELTA on calorie delta is violated."],
  });
  const after = makeViolatedTrace({
    violationLabel: "protein placement violation",
    proofLines: ["Constraint MUST_EQUAL on protein placement is violated."],
  });
  const result = diffConstraintTrace(before, after, "C");

  it("changeSummary starts with 'Candidate C:'", () => {
    expect(result.changeSummary).toContain("Candidate C:");
  });

  it("changeSummary says 'decisive variable changed from'", () => {
    expect(result.changeSummary.toLowerCase()).toContain("decisive variable changed from");
  });
});

describe("Scenario 25 — changeSummary: no changes", () => {
  const trace = makeTrace();
  const result = diffConstraintTrace(trace, trace);

  it("changeSummary is exactly 'No changes detected.'", () => {
    expect(result.changeSummary).toBe("No changes detected.");
  });
});
