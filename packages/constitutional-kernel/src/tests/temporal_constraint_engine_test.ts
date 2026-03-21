/**
 * temporal_constraint_engine_test.ts
 *
 * Deterministic test suite for the NOMOS temporal constraint engine.
 *
 * Test case (carb timing pre-lift):
 *
 *   Anchor: lifting at t=0
 *
 *   Constraints:
 *     C1: fast carbs within 90 min before lifting >= 60g
 *     C2: slow carbs within 60 min before lifting <= 20g
 *
 *   Candidates:
 *     A: 80g cyclic dextrin at -30 min  (fast, carb)
 *     B: 120g oats at -30 min           (slow, carb)
 *     C: 80g cyclic dextrin at -120 min (fast, carb — OUTSIDE 90-min window)
 *     D: 60g cyclic dextrin at -75 min  (fast)
 *        + 30g oats at -45 min          (slow — exceeds 20g slow-carb max)
 *
 *   Expected:
 *     A → PASS (80g fast in window ≥ 60 ✓; 0g slow in window ≤ 20 ✓)
 *     B → FAIL (0g fast in window < 60 ✗; 120g slow in window > 20 ✗)
 *     C → FAIL (0g fast in 90-min window < 60 ✗; dextrin at -120 is outside window)
 *     D → FAIL (60g fast ≥ 60 ✓; but 30g slow > 20 ✗)
 *
 * Run: ts-node -e "import('./temporal_constraint_engine_test.js').then(m => m.runAll())"
 */

import { TemporalAnchor, TemporalEvent, TemporalConstraint } from "../temporal/temporal_types.js";
import { evaluateTemporalConstraintSet } from "../temporal/temporal_constraint_engine.js";

/* =========================================================
   Fixtures
   ========================================================= */

const ANCHORS: TemporalAnchor[] = [
  { anchorId: "lifting", label: "Lifting session", timeMinutes: 0 },
];

const CONSTRAINTS: TemporalConstraint[] = [
  {
    constraintId: "fast_carb_min_90",
    label: "Fast carbs >= 60g within 90 min before lifting",
    window: { relation: "before", anchorId: "lifting", startOffsetMinutes: -90, endOffsetMinutes: 0 },
    aggregation: { quantityKey: "carbs", filterTags: ["fast"], aggregation: "sum" },
    operator: ">=",
    threshold: 60,
  },
  {
    constraintId: "slow_carb_max_60",
    label: "Slow carbs <= 20g within 60 min before lifting",
    window: { relation: "before", anchorId: "lifting", startOffsetMinutes: -60, endOffsetMinutes: 0 },
    aggregation: { quantityKey: "carbs", filterTags: ["slow"], aggregation: "sum" },
    operator: "<=",
    threshold: 20,
  },
];

function makeEvent(
  id: string,
  label: string,
  timeMinutes: number,
  tags: string[],
  carbs: number
): TemporalEvent {
  return {
    eventId: id,
    label,
    category: "nutrition",
    timeMinutes,
    quantities: { carbs },
    tags,
  };
}

const CANDIDATE_EVENTS: Record<string, TemporalEvent[]> = {
  A: [
    makeEvent("A_e1", "cyclic dextrin", -30, ["fast", "carb", "fast_digesting"], 80),
  ],
  B: [
    makeEvent("B_e1", "oats", -30, ["slow", "carb", "slow_digesting"], 120),
  ],
  C: [
    makeEvent("C_e1", "cyclic dextrin", -120, ["fast", "carb", "fast_digesting"], 80),
  ],
  D: [
    makeEvent("D_e1", "cyclic dextrin", -75, ["fast", "carb", "fast_digesting"], 60),
    makeEvent("D_e2", "oats",            -45, ["slow", "carb", "slow_digesting"], 30),
  ],
};

/* =========================================================
   Assertions
   ========================================================= */

interface CaseExpectation {
  candidateId: string;
  expectedAllPassed: boolean;
  expectedPassByConstraint: Record<string, boolean>;
}

const EXPECTATIONS: CaseExpectation[] = [
  {
    candidateId: "A",
    expectedAllPassed: true,
    expectedPassByConstraint: { fast_carb_min_90: true, slow_carb_max_60: true },
  },
  {
    candidateId: "B",
    expectedAllPassed: false,
    expectedPassByConstraint: { fast_carb_min_90: false, slow_carb_max_60: false },
  },
  {
    candidateId: "C",
    expectedAllPassed: false,
    expectedPassByConstraint: { fast_carb_min_90: false, slow_carb_max_60: true },
  },
  {
    candidateId: "D",
    expectedAllPassed: false,
    expectedPassByConstraint: { fast_carb_min_90: true, slow_carb_max_60: false },
  },
];

/* =========================================================
   Runner
   ========================================================= */

export function runAll(): void {
  console.log("=== NOMOS Temporal Constraint Engine Test ===\n");
  let passed = 0;
  let failed = 0;

  for (const expectation of EXPECTATIONS) {
    const { candidateId, expectedAllPassed, expectedPassByConstraint } = expectation;
    const events = CANDIDATE_EVENTS[candidateId];

    const summary = evaluateTemporalConstraintSet(candidateId, events, ANCHORS, CONSTRAINTS);

    console.log(`--- Candidate ${candidateId} ---`);
    console.log(`  Fast carbs (total): ${summary.debugFastCarbsGrams}g`);
    console.log(`  Slow carbs (total): ${summary.debugSlowCarbsGrams}g`);

    for (const result of summary.constraintResults) {
      for (const line of result.explanationLines) {
        console.log(`  ${line}`);
      }
    }

    const allPassedOk = summary.allPassed === expectedAllPassed;
    if (!allPassedOk) {
      console.log(`  FAIL: expected allPassed=${expectedAllPassed}, got ${summary.allPassed}`);
      failed++;
    }

    let perConstraintOk = true;
    for (const result of summary.constraintResults) {
      const expected = expectedPassByConstraint[result.constraintId];
      if (expected !== undefined && result.passed !== expected) {
        console.log(
          `  FAIL: constraint "${result.constraintId}" expected passed=${expected}, got ${result.passed}`
        );
        perConstraintOk = false;
        failed++;
      }
    }

    if (allPassedOk && perConstraintOk) {
      console.log(`  PASS ✓ (allPassed=${summary.allPassed})\n`);
      passed++;
    } else {
      console.log();
    }
  }

  console.log(`=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAll();
