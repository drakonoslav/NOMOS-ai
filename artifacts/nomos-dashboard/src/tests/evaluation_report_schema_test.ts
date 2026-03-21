/**
 * evaluation_report_schema_test.ts
 *
 * Regression tests for the formal evaluation report schema.
 *
 * Covers:
 *   1. buildOverallEvaluationReport — correct field values from typed inputs
 *   2. assertEvaluationReportInvariants — all 6 invariants enforce correctly
 *   3. generateClassificationSummary / generateSatisfactionSummary / generateVerdictSummary
 *      — field-driven text, never prose inference, never "passed" with violations
 *   4. Nutrition case regression — protein placement violation scenario
 *   5. Full round-trip through mapEvaluationResultToViewModel — report fields
 *      drive the final view model, not raw reason strings
 *   6. variableName/violationLabel field separation — variable name must never
 *      contain "violation"; violation label only set when status === "violated"
 */

import { describe, it, expect } from "vitest";
import { buildOverallEvaluationReport } from "../evaluation/evaluation_report_builder";
import {
  assertEvaluationReportInvariants,
  assertEvaluationReportInvariantsStrict,
} from "../evaluation/evaluation_report_invariants";
import {
  generateClassificationSummary,
  generateSatisfactionSummary,
  generateVerdictSummary,
} from "../evaluation/evaluation_report_summaries";
import { compileConstraints } from "../compiler/constraint_compiler";
import { mapEvaluationResultToViewModel } from "../ui/mappers/evaluation_mapper";
import type { EvaluationResult } from "../ui/evaluation/eval_types";
import type { OverallEvaluationReport } from "../evaluation/evaluation_report_types";

/* =========================================================
   Shared fixtures
   ========================================================= */

const NUTRITION_CONSTRAINTS = [
  "Preserve meal order unless explicitly allowed otherwise.",
  "Preserve meal count unless explicitly allowed otherwise.",
  "Preserve protein placement by meal unless explicitly allowed otherwise.",
  "Use attached food labels as source truth where provided.",
  "Do not infer food behavior that is not supported by declared labels or source data.",
  "If correction is requested, prefer the smallest structure-preserving change.",
];

/** Nutrition case with candidate B violating protein placement. */
function buildNutritionViolationResult(): EvaluationResult {
  return {
    overallStatus: "DEGRADED",
    lawfulSet: ["A"],
    candidateEvaluations: [
      {
        id: "A",
        status: "LAWFUL",
        reason: "Protein placement unchanged. Structural lock satisfied.",
        decisiveVariable: "protein placement",
        adjustments: [],
        confidence: "high",
        marginScore: 0.88,
        marginLabel: "HIGH",
      },
      {
        id: "B",
        status: "DEGRADED",
        reason:
          "Protein placement moved between meals. Structural lock violated. Additionally: Constraint type could not be deterministically classified; evaluation requires manual review.",
        decisiveVariable: "protein placement",
        adjustments: [
          "Clarify constraint semantics before re-evaluation.",
          "Restore protein to its original meal placement.",
        ],
        confidence: "moderate",
        marginScore: 0.32,
        marginLabel: "LOW",
      },
      {
        id: "C",
        status: "DEGRADED",
        reason: "Meal order altered. Structural lock violated.",
        decisiveVariable: "meal order",
        adjustments: ["Restore the original meal sequence."],
        confidence: "high",
        marginScore: 0.25,
        marginLabel: "LOW",
      },
    ],
    decisiveVariable: "protein placement",
    notes: ["6 constraint(s) evaluated against 3 candidate(s).", "Strongest margin: 0.88."],
    bestCandidateId: "A",
    strongestMarginScore: 0.88,
    weakestAdmissibleMarginScore: 0.88,
  };
}

/* =========================================================
   1. buildOverallEvaluationReport
   ========================================================= */

describe("buildOverallEvaluationReport — field correctness", () => {
  const compiled = compileConstraints(NUTRITION_CONSTRAINTS);

  it("evaluationMethod is 'deterministic' when all constraints are classified", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    expect(report.evaluationMethod).toBe("deterministic");
  });

  it("overallStatus matches the API overallStatus (mapped to lowercase)", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    expect(report.overallStatus).toBe("degraded");
  });

  it("lawfulCandidateIds contains only LAWFUL candidates", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    expect(report.lawfulCandidateIds).toEqual(["A"]);
  });

  it("totals.constraintsTotal equals compiled constraint count", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    expect(report.totals.constraintsTotal).toBe(compiled.length);
  });

  it("totals.constraintsDeterministicallyClassified equals compiled non-INTERPRETATION_REQUIRED count", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    expect(report.totals.constraintsDeterministicallyClassified).toBe(compiled.length);
    expect(report.totals.constraintsInterpretationRequired).toBe(0);
  });

  it("LAWFUL candidate A has zero violated constraints", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidateA = report.candidates.find((c) => c.candidateId === "A")!;
    expect(candidateA.constraintsViolated).toBe(0);
    expect(candidateA.constraintsSatisfied).toBe(compiled.length);
  });

  it("DEGRADED candidate B has at least one violated constraint", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidateB = report.candidates.find((c) => c.candidateId === "B")!;
    expect(candidateB.constraintsViolated).toBeGreaterThan(0);
  });

  it("DEGRADED candidate C has at least one violated constraint", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidateC = report.candidates.find((c) => c.candidateId === "C")!;
    expect(candidateC.constraintsViolated).toBeGreaterThan(0);
  });

  it("candidate B violates a STRUCTURAL_LOCK constraint", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidateB = report.candidates.find((c) => c.candidateId === "B")!;
    const violated = candidateB.constraintEvaluations.filter(
      (r) => r.satisfactionStatus === "violated"
    );
    expect(violated.length).toBeGreaterThan(0);
    expect(violated[0]!.constraintKind).toBe("STRUCTURAL_LOCK");
  });

  it("candidate A has no violated ConstraintEvaluationRecords", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidateA = report.candidates.find((c) => c.candidateId === "A")!;
    const violated = candidateA.constraintEvaluations.filter(
      (r) => r.satisfactionStatus === "violated"
    );
    expect(violated).toHaveLength(0);
  });

  it("candidate B adjustments come from violated constraints only (no 'Clarify constraint semantics')", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidateB = report.candidates.find((c) => c.candidateId === "B")!;
    for (const adj of candidateB.adjustments) {
      expect(adj.toLowerCase()).not.toContain("clarify constraint semantics");
    }
  });

  it("candidate B summaryReason does not contain stale fallback text", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidateB = report.candidates.find((c) => c.candidateId === "B")!;
    expect(candidateB.summaryReason).not.toMatch(/could not be deterministically classified/i);
    expect(candidateB.summaryReason).not.toMatch(/evaluation requires manual review/i);
  });

  it("report notes do not contain 'all constraints passed'", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    for (const note of report.notes) {
      expect(note.toLowerCase()).not.toContain("all constraints passed");
    }
  });

  it("report notes contain 'evaluated deterministically'", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const found = report.notes.some((n) => n.toLowerCase().includes("evaluated deterministically"));
    expect(found).toBe(true);
  });
});

/* =========================================================
   2. assertEvaluationReportInvariants
   ========================================================= */

describe("assertEvaluationReportInvariants — clean reports pass", () => {
  const compiled = compileConstraints(NUTRITION_CONSTRAINTS);

  it("returns empty violation list for a correctly built nutrition report", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const violations = assertEvaluationReportInvariants(report);
    expect(violations).toHaveLength(0);
  });
});

describe("assertEvaluationReportInvariants — each invariant is enforced", () => {
  function makeCleanReport(): OverallEvaluationReport {
    const compiled = compileConstraints(NUTRITION_CONSTRAINTS);
    return buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
  }

  it("I1: violated constraints + 'all constraints passed' in summaryReason → violation", () => {
    const report = makeCleanReport();
    const candidateB = report.candidates.find((c) => c.candidateId === "B")!;
    candidateB.summaryReason = "All constraints passed deterministic evaluation.";
    const violations = assertEvaluationReportInvariants(report);
    expect(violations.some((v) => v.invariant === "I1")).toBe(true);
  });

  it("I2: interpretationRequired=0 + 'manual review' in summaryReason → violation", () => {
    const report = makeCleanReport();
    const candidateA = report.candidates.find((c) => c.candidateId === "A")!;
    candidateA.constraintsInterpretationRequired = 0;
    candidateA.summaryReason = "This requires manual review.";
    const violations = assertEvaluationReportInvariants(report);
    expect(violations.some((v) => v.invariant === "I2")).toBe(true);
  });

  it("I3: verdict=lawful + constraintsViolated > 0 → violation", () => {
    const report = makeCleanReport();
    const candidateA = report.candidates.find((c) => c.candidateId === "A")!;
    candidateA.constraintsViolated = 2;
    const violations = assertEvaluationReportInvariants(report);
    expect(violations.some((v) => v.invariant === "I3")).toBe(true);
  });

  it("I4: decisiveVariable contains 'violation' + constraintsViolated=0 → violation", () => {
    const report = makeCleanReport();
    const candidateA = report.candidates.find((c) => c.candidateId === "A")!;
    candidateA.decisiveVariable = "protein placement violation";
    candidateA.constraintsViolated = 0;
    const violations = assertEvaluationReportInvariants(report);
    expect(violations.some((v) => v.invariant === "I4")).toBe(true);
  });

  it("I5: global constraintsViolated > 0 + 'passed' in notes → violation", () => {
    const report = makeCleanReport();
    report.totals.constraintsViolated = 3;
    report.notes.push("All constraints passed.");
    const violations = assertEvaluationReportInvariants(report);
    expect(violations.some((v) => v.invariant === "I5")).toBe(true);
  });

  it("assertEvaluationReportInvariantsStrict throws on first violation", () => {
    const report = makeCleanReport();
    const candidateB = report.candidates.find((c) => c.candidateId === "B")!;
    candidateB.summaryReason = "All constraints passed deterministic evaluation.";
    expect(() => assertEvaluationReportInvariantsStrict(report)).toThrow(
      /invariant failure/i
    );
  });
});

/* =========================================================
   3. Summary helpers — field-driven, never "passed" with violations
   ========================================================= */

describe("generateClassificationSummary", () => {
  it("returns 'evaluated deterministically' when interpretationRequired=0", () => {
    const compiled = compileConstraints(NUTRITION_CONSTRAINTS);
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const summary = generateClassificationSummary(report);
    expect(summary).toContain("evaluated deterministically");
    expect(summary.toLowerCase()).not.toContain("passed");
    expect(summary.toLowerCase()).not.toContain("satisfied");
    expect(summary.toLowerCase()).not.toContain("violated");
  });

  it("counts interpretation_required constraints when present", () => {
    const compiled = compileConstraints(NUTRITION_CONSTRAINTS);
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    // Mutate to simulate 2 unresolved
    report.totals.constraintsDeterministicallyClassified = 4;
    report.totals.constraintsInterpretationRequired = 2;
    report.totals.constraintsTotal = 6;
    const summary = generateClassificationSummary(report);
    expect(summary).toContain("4 of 6");
    expect(summary).toContain("2 require");
  });

  it("handles zero constraints", () => {
    const compiled = compileConstraints(NUTRITION_CONSTRAINTS);
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    report.totals.constraintsTotal = 0;
    report.totals.constraintsDeterministicallyClassified = 0;
    report.totals.constraintsInterpretationRequired = 0;
    const summary = generateClassificationSummary(report);
    expect(summary).toContain("No constraints declared");
  });
});

describe("generateSatisfactionSummary", () => {
  it("does NOT say 'passed' when violations > 0", () => {
    const compiled = compileConstraints(NUTRITION_CONSTRAINTS);
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const summary = generateSatisfactionSummary(report);
    expect(summary.toLowerCase()).not.toContain("passed");
  });

  it("says 'violations' when any candidate is violated", () => {
    const compiled = compileConstraints(NUTRITION_CONSTRAINTS);
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const summary = generateSatisfactionSummary(report);
    expect(summary.toLowerCase()).toContain("violation");
  });

  it("says 'all candidates are constraint-admissible' when none violated", () => {
    const compiled = compileConstraints(NUTRITION_CONSTRAINTS);
    const allLawful: EvaluationResult = {
      overallStatus: "LAWFUL",
      lawfulSet: ["A", "B"],
      candidateEvaluations: [
        {
          id: "A", status: "LAWFUL",
          reason: "All satisfied.", decisiveVariable: "protein placement",
          adjustments: [], confidence: "high", marginScore: 0.9, marginLabel: "HIGH",
        },
        {
          id: "B", status: "LAWFUL",
          reason: "All satisfied.", decisiveVariable: "protein placement",
          adjustments: [], confidence: "high", marginScore: 0.85, marginLabel: "HIGH",
        },
      ],
      decisiveVariable: "protein placement",
      notes: [],
      bestCandidateId: "A", strongestMarginScore: 0.9, weakestAdmissibleMarginScore: 0.85,
    };
    const report = buildOverallEvaluationReport(allLawful, compiled);
    const summary = generateSatisfactionSummary(report);
    expect(summary.toLowerCase()).toContain("constraint-admissible");
    expect(summary.toLowerCase()).not.toContain("violation");
  });
});

describe("generateVerdictSummary", () => {
  it("says 'admissible' when overall status is lawful", () => {
    const compiled = compileConstraints(NUTRITION_CONSTRAINTS);
    const lawfulResult: EvaluationResult = {
      overallStatus: "LAWFUL",
      lawfulSet: ["A"],
      candidateEvaluations: [{
        id: "A", status: "LAWFUL",
        reason: "OK.", decisiveVariable: "protein placement",
        adjustments: [], confidence: "high", marginScore: 0.9, marginLabel: "HIGH",
      }],
      decisiveVariable: "protein placement",
      notes: [], bestCandidateId: "A", strongestMarginScore: 0.9,
    };
    const report = buildOverallEvaluationReport(lawfulResult, compiled);
    const summary = generateVerdictSummary(report);
    expect(summary.toLowerCase()).toContain("admissible");
  });

  it("says 'degraded' when overall status is degraded", () => {
    const compiled = compileConstraints(NUTRITION_CONSTRAINTS);
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const summary = generateVerdictSummary(report);
    expect(summary.toLowerCase()).toContain("degraded");
  });
});

/* =========================================================
   4. Nutrition case regression
   ========================================================= */

describe("nutrition case regression — protein placement violation", () => {
  const compiled = compileConstraints(NUTRITION_CONSTRAINTS);

  it("deterministic classification true (interpretationRequired=0)", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    expect(report.totals.constraintsInterpretationRequired).toBe(0);
    expect(report.evaluationMethod).toBe("deterministic");
  });

  it("constraintsViolated > 0 across all candidates", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    expect(report.totals.constraintsViolated).toBeGreaterThan(0);
  });

  it("report notes include 'evaluated deterministically'", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    expect(report.notes.some((n) => n.toLowerCase().includes("evaluated deterministically"))).toBe(true);
  });

  it("report notes do NOT include 'all constraints passed'", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    expect(report.notes.every((n) => !n.toLowerCase().includes("all constraints passed"))).toBe(true);
  });

  it("decisive variable is set (not null)", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    expect(report.decisiveVariable).not.toBeNull();
    expect(report.decisiveVariable!.length).toBeGreaterThan(0);
  });

  it("decisiveVariable named 'protein placement' only because that constraint is actually violated", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    // If the decisive variable mentions protein placement, at least one candidate
    // must have a violated STRUCTURAL_LOCK with a matching decisive variable.
    const hasMismatch = report.candidates.some((c) => {
      const mentionsViolation =
        (c.decisiveVariable?.toLowerCase().includes("protein") ?? false) ||
        (c.decisiveVariable?.toLowerCase().includes("meal order") ?? false);
      if (!mentionsViolation) return false;
      return c.constraintsViolated === 0 && c.verdict !== "lawful";
    });
    expect(hasMismatch).toBe(false);
  });

  it("invariants all pass on the nutrition report", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const violations = assertEvaluationReportInvariants(report);
    expect(violations).toHaveLength(0);
  });
});

/* =========================================================
   5. Round-trip: mapEvaluationResultToViewModel uses report fields
   ========================================================= */

describe("mapEvaluationResultToViewModel — routes through report schema", () => {
  const compiled = compileConstraints(NUTRITION_CONSTRAINTS);

  it("notes do not contain 'all constraints passed' for violation scenario", () => {
    const vm = mapEvaluationResultToViewModel(buildNutritionViolationResult(), compiled);
    for (const note of vm.notes) {
      expect(note.toLowerCase()).not.toContain("all constraints passed");
    }
  });

  it("notes contain 'evaluated deterministically'", () => {
    const vm = mapEvaluationResultToViewModel(buildNutritionViolationResult(), compiled);
    const found = vm.notes.some((n) => n.toLowerCase().includes("evaluated deterministically"));
    expect(found).toBe(true);
  });

  it("notes contain a satisfaction verdict mentioning violations", () => {
    const vm = mapEvaluationResultToViewModel(buildNutritionViolationResult(), compiled);
    const found = vm.notes.some(
      (n) => n.toLowerCase().includes("violation") || n.toLowerCase().includes("admissible")
    );
    expect(found).toBe(true);
  });

  it("candidate B card reason does not contain stale fallback text", () => {
    const vm = mapEvaluationResultToViewModel(buildNutritionViolationResult(), compiled);
    const cardB = vm.candidateCards.find((c) => c.id === "B")!;
    expect(cardB.reason).not.toMatch(/could not be deterministically classified/i);
    expect(cardB.reason).not.toMatch(/evaluation requires manual review/i);
  });

  it("candidate B card adjustments do not contain 'Clarify constraint semantics'", () => {
    const vm = mapEvaluationResultToViewModel(buildNutritionViolationResult(), compiled);
    const cardB = vm.candidateCards.find((c) => c.id === "B")!;
    for (const adj of cardB.adjustments) {
      expect(adj.toLowerCase()).not.toContain("clarify constraint semantics");
    }
  });

  it("candidate A card status is LAWFUL", () => {
    const vm = mapEvaluationResultToViewModel(buildNutritionViolationResult(), compiled);
    const cardA = vm.candidateCards.find((c) => c.id === "A")!;
    expect(cardA.status).toBe("LAWFUL");
  });

  it("overall decisiveVariable is set", () => {
    const vm = mapEvaluationResultToViewModel(buildNutritionViolationResult(), compiled);
    expect(vm.decisiveVariable).toBeDefined();
    expect(vm.decisiveVariable!.length).toBeGreaterThan(0);
  });
});

/* =========================================================
   6. variableName / violationLabel field separation
   The three-field law:
     variableName   = the measured variable   (e.g. "protein placement")
     violationLabel = the event label          (e.g. "protein placement violation")
     decisiveVariable on ConstraintEvaluationRecord:
       = violationLabel when violated
       = variableName  when satisfied / not_evaluated
   Invariant I6: variableName must NEVER contain the word "violation".
   ========================================================= */

describe("variableName/violationLabel separation — field law", () => {
  const compiled = compileConstraints(NUTRITION_CONSTRAINTS);

  function getViolatedRecords(candidateId: string) {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidate = report.candidates.find((c) => c.candidateId === candidateId)!;
    return candidate.constraintEvaluations.filter((r) => r.satisfactionStatus === "violated");
  }

  function getSatisfiedRecords(candidateId: string) {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidate = report.candidates.find((c) => c.candidateId === candidateId)!;
    return candidate.constraintEvaluations.filter((r) => r.satisfactionStatus === "satisfied");
  }

  it("every ConstraintEvaluationRecord has a non-null variableName", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    for (const candidate of report.candidates) {
      for (const record of candidate.constraintEvaluations) {
        expect(record.variableName).not.toBeNull();
      }
    }
  });

  it("variableName never contains the word 'violation' — I6 invariant", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    for (const candidate of report.candidates) {
      for (const record of candidate.constraintEvaluations) {
        expect(record.variableName?.toLowerCase() ?? "").not.toContain("violation");
      }
    }
  });

  it("violated record: violationLabel equals variableName + ' violation'", () => {
    const violated = getViolatedRecords("B");
    expect(violated.length).toBeGreaterThan(0);
    for (const r of violated) {
      expect(r.violationLabel).toBe(`${r.variableName} violation`);
    }
  });

  it("violated record: violationLabel is not null", () => {
    const violated = getViolatedRecords("B");
    for (const r of violated) {
      expect(r.violationLabel).not.toBeNull();
    }
  });

  it("satisfied record: violationLabel is null", () => {
    const satisfied = getSatisfiedRecords("A");
    for (const r of satisfied) {
      expect(r.violationLabel).toBeNull();
    }
  });

  it("violated record: decisiveVariable equals violationLabel", () => {
    const violated = getViolatedRecords("B");
    for (const r of violated) {
      expect(r.decisiveVariable).toBe(r.violationLabel);
    }
  });

  it("satisfied record: decisiveVariable equals variableName", () => {
    const satisfied = getSatisfiedRecords("A");
    for (const r of satisfied) {
      expect(r.decisiveVariable).toBe(r.variableName);
    }
  });

  it("protein placement violated record: variableName is 'protein placement'", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidateB = report.candidates.find((c) => c.candidateId === "B")!;
    const violated = candidateB.constraintEvaluations.find(
      (r) => r.satisfactionStatus === "violated"
    )!;
    expect(violated.variableName).toBe("protein placement");
  });

  it("protein placement violated record: violationLabel is 'protein placement violation'", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidateB = report.candidates.find((c) => c.candidateId === "B")!;
    const violated = candidateB.constraintEvaluations.find(
      (r) => r.satisfactionStatus === "violated"
    )!;
    expect(violated.violationLabel).toBe("protein placement violation");
  });

  it("violation reason does NOT say 'was altered'", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidateB = report.candidates.find((c) => c.candidateId === "B")!;
    const violated = candidateB.constraintEvaluations.find(
      (r) => r.satisfactionStatus === "violated"
    )!;
    expect(violated.reason).not.toContain("was altered");
  });

  it("violation reason says 'differs from declared baseline'", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidateB = report.candidates.find((c) => c.candidateId === "B")!;
    const violated = candidateB.constraintEvaluations.find(
      (r) => r.satisfactionStatus === "violated"
    )!;
    expect(violated.reason).toContain("differs from declared baseline");
  });

  it("violation adjustment does NOT contain 'violation'", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidateB = report.candidates.find((c) => c.candidateId === "B")!;
    const violated = candidateB.constraintEvaluations.find(
      (r) => r.satisfactionStatus === "violated"
    )!;
    expect(violated.adjustment?.toLowerCase()).not.toContain("violation");
  });

  it("violation adjustment says 'Restore protein placement to its declared state'", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidateB = report.candidates.find((c) => c.candidateId === "B")!;
    const violated = candidateB.constraintEvaluations.find(
      (r) => r.satisfactionStatus === "violated"
    )!;
    expect(violated.adjustment).toContain("Restore protein placement to its declared state");
  });

  it("I6 invariant fires when variableName contains 'violation'", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const candidateB = report.candidates.find((c) => c.candidateId === "B")!;
    const violated = candidateB.constraintEvaluations.find(
      (r) => r.satisfactionStatus === "violated"
    )!;
    violated.variableName = "protein placement violation";
    const invariantViolations = assertEvaluationReportInvariants(report);
    expect(invariantViolations.some((v) => v.invariant === "I6")).toBe(true);
  });

  it("I6 invariant does NOT fire when variableName is clean", () => {
    const report = buildOverallEvaluationReport(buildNutritionViolationResult(), compiled);
    const invariantViolations = assertEvaluationReportInvariants(report);
    expect(invariantViolations.some((v) => v.invariant === "I6")).toBe(false);
  });

  it("constraint compiler decisiveVariable for preserve_protein_placement has no 'violation' suffix", () => {
    const all = compileConstraints([
      "Preserve protein placement by meal unless explicitly allowed otherwise.",
    ]);
    expect(all.length).toBeGreaterThan(0);
    const ppConstraint = all.find((c) => c.key === "preserve_protein_placement");
    expect(ppConstraint).toBeDefined();
    expect(ppConstraint!.decisiveVariable).toBe("protein placement");
    expect(ppConstraint!.decisiveVariable).not.toContain("violation");
  });

  it("constraint compiler decisiveVariable for preserve_meal_order has no 'violation' suffix", () => {
    const all = compileConstraints([
      "Preserve meal order unless explicitly allowed otherwise.",
    ]);
    const moConstraint = all.find((c) => c.key === "preserve_meal_order");
    expect(moConstraint).toBeDefined();
    expect(moConstraint!.decisiveVariable).toBe("meal order");
    expect(moConstraint!.decisiveVariable).not.toContain("violation");
  });

  it("all compiled STRUCTURAL_LOCK constraints have clean decisiveVariable (no 'violation' suffix)", () => {
    const all = compileConstraints(NUTRITION_CONSTRAINTS);
    const structural = all.filter((c) => c.kind === "STRUCTURAL_LOCK");
    for (const c of structural) {
      expect(c.decisiveVariable ?? "").not.toMatch(/violation/i);
    }
  });
});
