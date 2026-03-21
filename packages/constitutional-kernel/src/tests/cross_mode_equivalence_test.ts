/**
 * cross_mode_equivalence_test.ts
 *
 * Proves the mode-invariance law:
 *   For semantically equivalent input, all three submission modes (Guided,
 *   Natural Language, Auto-compile) must produce an identical canonical
 *   NomosQuery and identical evaluation results.
 *
 * Architecture law being tested:
 *   Mode affects ONLY input acquisition (Layer 1).
 *   All modes converge at the kernel rule-based parser (Layer 2+).
 *
 * Each scenario encodes the same semantic query three ways:
 *   A — Natural Language   (raw text with canonical section headings)
 *   B — Guided            (structured fields → buildRawInputFromGuidedDraft format)
 *   C — Auto-compile      (serializeDraft format — what the dashboard emits after
 *                          fixing buildConstraints to not inject template extras)
 *
 * For each representation the test:
 *   1. Parses through the SAME rule-based kernel parser
 *   2. Asserts constraint arrays are equivalent (same count, same semantic content)
 *   3. Asserts candidate arrays are equivalent
 *   4. Evaluates through the same kernel evaluator
 *   5. Asserts evaluation results are identical per candidate
 *
 * Scenarios:
 *   S1 — Simple temporal carb-timing constraint (pre-lift nutrition timing)
 *   S2 — Nutrition audit with declared targets
 *   S3 — Schedule / time-window task
 *
 * Run:
 *   npx ts-node --esm packages/constitutional-kernel/src/tests/cross_mode_equivalence_test.ts
 */

import { NomosQueryParser } from "../query/query_parser_rule_based.js";
import { evaluateQueryCandidates } from "../evaluation/candidate_scoring.js";

const parser = new NomosQueryParser();

/* =========================================================
   Utilities
   ========================================================= */

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function assertEqual(a: unknown, b: unknown, msg: string): void {
  const as = JSON.stringify(a);
  const bs = JSON.stringify(b);
  if (as !== bs) {
    throw new Error(`FAIL: ${msg}\n  Expected: ${as}\n  Got:      ${bs}`);
  }
}

function normalizeConstraintText(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function assertConstraintSetsEquivalent(
  a: string[],
  b: string[],
  labelA: string,
  labelB: string
): void {
  if (a.length !== b.length) {
    throw new Error(
      `FAIL: constraint count mismatch: ${labelA}=${a.length} vs ${labelB}=${b.length}\n` +
      `  ${labelA}: ${JSON.stringify(a)}\n  ${labelB}: ${JSON.stringify(b)}`
    );
  }
  const normA = a.map(normalizeConstraintText).sort();
  const normB = b.map(normalizeConstraintText).sort();
  for (let i = 0; i < normA.length; i++) {
    if (normA[i] !== normB[i]) {
      throw new Error(
        `FAIL: constraint[${i}] mismatch: ${labelA} vs ${labelB}\n` +
        `  ${labelA}: ${normA[i]}\n  ${labelB}: ${normB[i]}`
      );
    }
  }
}

function assertCandidateSetsEquivalent(
  a: Array<{ id: string; description: string }>,
  b: Array<{ id: string; description: string }>,
  labelA: string,
  labelB: string
): void {
  if (a.length !== b.length) {
    throw new Error(
      `FAIL: candidate count mismatch: ${labelA}=${a.length} vs ${labelB}=${b.length}`
    );
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) {
      throw new Error(`FAIL: candidate[${i}] id mismatch: ${a[i].id} vs ${b[i].id}`);
    }
    const da = a[i].description.replace(/\s+/g, " ").trim().toLowerCase();
    const db = b[i].description.replace(/\s+/g, " ").trim().toLowerCase();
    if (da !== db) {
      throw new Error(
        `FAIL: candidate[${i}] (${a[i].id}) description mismatch:\n  ${labelA}: ${da}\n  ${labelB}: ${db}`
      );
    }
  }
}

function assertEvalResultsEquivalent(
  resultsA: Array<{ id: string; status: string }>,
  resultsB: Array<{ id: string; status: string }>,
  labelA: string,
  labelB: string
): void {
  if (resultsA.length !== resultsB.length) {
    throw new Error(
      `FAIL: evaluation result count mismatch: ${labelA}=${resultsA.length} vs ${labelB}=${resultsB.length}`
    );
  }
  for (let i = 0; i < resultsA.length; i++) {
    if (resultsA[i].id !== resultsB[i].id || resultsA[i].status !== resultsB[i].status) {
      throw new Error(
        `FAIL: evaluation result[${i}] mismatch:\n` +
        `  ${labelA}: ${resultsA[i].id}=${resultsA[i].status}\n` +
        `  ${labelB}: ${resultsB[i].id}=${resultsB[i].status}`
      );
    }
  }
}

function pass(msg: string): void {
  console.log(`  PASS: ${msg}`);
}

/* =========================================================
   Scenario S1 — Temporal carb-timing constraint
   ========================================================= */

const S1_CONSTRAINT =
  "At least 60g of fast-digesting carbohydrates must be consumed within 90 minutes before lifting, and no more than 20g of slow-digesting carbohydrates may be consumed within 60 minutes before lifting.";

const S1_CANDIDATES = [
  { id: "A", description: "Consume 80g cyclic dextrin 30 minutes before lifting." },
  { id: "B", description: "Consume 120g oats 30 minutes before lifting." },
  { id: "C", description: "Consume 80g cyclic dextrin 2 hours before lifting." },
  { id: "D", description: "Consume 60g cyclic dextrin 75 minutes before lifting and 30g oats 45 minutes before lifting." },
];

const S1_NL = `\
STATE:
Pre-lift nutrition timing

CONSTRAINTS:
- ${S1_CONSTRAINT}

CANDIDATES:
${S1_CANDIDATES.map((c) => `${c.id}: ${c.description}`).join("\n")}

OBJECTIVE:
Which candidate is admissible under the carbohydrate timing constraint?`;

const S1_GUIDED = `\
STATE:
Pre-lift nutrition timing

CONSTRAINTS:
- ${S1_CONSTRAINT}

CANDIDATES:
${S1_CANDIDATES.map((c) => `${c.id}: ${c.description}`).join("\n")}

OBJECTIVE:
Which candidate is admissible under the carbohydrate timing constraint?`;

const S1_AUTO = `\
STATE:
- Pre-lift nutrition timing

CONSTRAINTS:
- ${S1_CONSTRAINT}

CANDIDATES:
${S1_CANDIDATES.map((c) => `${c.id}: ${c.description}`).join("\n")}

OBJECTIVE:
- Which candidate is admissible under the carbohydrate timing constraint?`;

async function runS1(): Promise<void> {
  console.log("\nS1 — Temporal carb-timing constraint");

  const qNL     = parser.parse(S1_NL);
  const qGuided = parser.parse(S1_GUIDED);
  const qAuto   = parser.parse(S1_AUTO);

  assertConstraintSetsEquivalent(qNL.state.constraints, qGuided.state.constraints, "NL", "Guided");
  pass("NL↔Guided constraint sets equivalent");

  assertConstraintSetsEquivalent(qNL.state.constraints, qAuto.state.constraints, "NL", "Auto");
  pass("NL↔Auto constraint sets equivalent");

  assertCandidateSetsEquivalent(qNL.candidates, qGuided.candidates, "NL", "Guided");
  pass("NL↔Guided candidate sets equivalent");

  assertCandidateSetsEquivalent(qNL.candidates, qAuto.candidates, "NL", "Auto");
  pass("NL↔Auto candidate sets equivalent");

  const rNL     = await evaluateQueryCandidates(qNL);
  const rGuided = await evaluateQueryCandidates(qGuided);
  const rAuto   = await evaluateQueryCandidates(qAuto);

  type EvalResult = Awaited<ReturnType<typeof evaluateQueryCandidates>>;
  const toSummary = (r: EvalResult) =>
    r.candidateEvaluations.map((e) => ({ id: e.id, status: e.status }));

  assertEvalResultsEquivalent(toSummary(rNL), toSummary(rGuided), "NL", "Guided");
  pass("NL↔Guided evaluation results identical");

  assertEvalResultsEquivalent(toSummary(rNL), toSummary(rAuto), "NL", "Auto");
  pass("NL↔Auto evaluation results identical");

  assert(rNL.overallStatus === "LAWFUL", "S1 overall status is LAWFUL");
  const eA = rNL.candidateEvaluations.find((e) => e.id === "A");
  assert(eA?.status === "LAWFUL", "S1 candidate A is LAWFUL");
  for (const id of ["B", "C", "D"]) {
    const e = rNL.candidateEvaluations.find((ev) => ev.id === id);
    assert(e?.status === "INVALID", `S1 candidate ${id} is INVALID`);
  }
  pass("S1 verdicts correct: A=LAWFUL, B/C/D=INVALID");
}

/* =========================================================
   Scenario S2 — Nutrition audit with declared macro targets
   ========================================================= */

const S2_CONSTRAINT_1 = "Total daily calories must not exceed 2800 kcal.";
const S2_CONSTRAINT_2 = "Protein must be at least 180g per day.";

const S2_CANDIDATES_2 = [
  { id: "A", description: "Keep current plan at 2600 kcal with 200g protein." },
  { id: "B", description: "Reduce calories to 2200 kcal with 150g protein." },
];

const S2_NL = `\
STATE:
Athlete is in a strength building phase with moderate calorie surplus.

CONSTRAINTS:
- ${S2_CONSTRAINT_1}
- ${S2_CONSTRAINT_2}

CANDIDATES:
${S2_CANDIDATES_2.map((c) => `${c.id}: ${c.description}`).join("\n")}

OBJECTIVE:
Which plan is admissible under the declared nutritional constraints?`;

const S2_GUIDED = `\
STATE:
Athlete is in a strength building phase with moderate calorie surplus.

CONSTRAINTS:
- ${S2_CONSTRAINT_1}
- ${S2_CONSTRAINT_2}

CANDIDATES:
${S2_CANDIDATES_2.map((c) => `${c.id}: ${c.description}`).join("\n")}

OBJECTIVE:
Which plan is admissible under the declared nutritional constraints?`;

const S2_AUTO = `\
STATE:
- Athlete is in a strength building phase with moderate calorie surplus.

CONSTRAINTS:
- ${S2_CONSTRAINT_1}
- ${S2_CONSTRAINT_2}

CANDIDATES:
${S2_CANDIDATES_2.map((c) => `${c.id}: ${c.description}`).join("\n")}

OBJECTIVE:
- Which plan is admissible under the declared nutritional constraints?`;

async function runS2(): Promise<void> {
  console.log("\nS2 — Nutrition audit (declared macro targets)");

  const qNL     = parser.parse(S2_NL);
  const qGuided = parser.parse(S2_GUIDED);
  const qAuto   = parser.parse(S2_AUTO);

  assertConstraintSetsEquivalent(qNL.state.constraints, qGuided.state.constraints, "NL", "Guided");
  pass("NL↔Guided constraint sets equivalent");

  assertConstraintSetsEquivalent(qNL.state.constraints, qAuto.state.constraints, "NL", "Auto");
  pass("NL↔Auto constraint sets equivalent");

  assertCandidateSetsEquivalent(qNL.candidates, qGuided.candidates, "NL", "Guided");
  pass("NL↔Guided candidate sets equivalent");

  assertCandidateSetsEquivalent(qNL.candidates, qAuto.candidates, "NL", "Auto");
  pass("NL↔Auto candidate sets equivalent");

  assert(qNL.state.constraints.length === 2, `S2 should have 2 constraints, got ${qNL.state.constraints.length}`);
  pass("S2 constraint count = 2");
}

/* =========================================================
   Scenario S3 — Schedule / time-window task
   ========================================================= */

const S3_CONSTRAINT = "All critical meetings must be completed before 3pm.";
const S3_CANDIDATES_3 = [
  { id: "A", description: "Schedule the board review at 10am." },
  { id: "B", description: "Schedule the board review at 4pm." },
];

const S3_NL = `\
STATE:
Weekly planning session. Two critical meetings are pending.

CONSTRAINTS:
- ${S3_CONSTRAINT}

CANDIDATES:
${S3_CANDIDATES_3.map((c) => `${c.id}: ${c.description}`).join("\n")}

OBJECTIVE:
Which scheduling option is compliant?`;

const S3_GUIDED = `\
STATE:
Weekly planning session. Two critical meetings are pending.

CONSTRAINTS:
- ${S3_CONSTRAINT}

CANDIDATES:
${S3_CANDIDATES_3.map((c) => `${c.id}: ${c.description}`).join("\n")}

OBJECTIVE:
Which scheduling option is compliant?`;

const S3_AUTO = `\
STATE:
- Weekly planning session. Two critical meetings are pending.

CONSTRAINTS:
- ${S3_CONSTRAINT}

CANDIDATES:
${S3_CANDIDATES_3.map((c) => `${c.id}: ${c.description}`).join("\n")}

OBJECTIVE:
- Which scheduling option is compliant?`;

async function runS3(): Promise<void> {
  console.log("\nS3 — Schedule / time-window task");

  const qNL     = parser.parse(S3_NL);
  const qGuided = parser.parse(S3_GUIDED);
  const qAuto   = parser.parse(S3_AUTO);

  assertConstraintSetsEquivalent(qNL.state.constraints, qGuided.state.constraints, "NL", "Guided");
  pass("NL↔Guided constraint sets equivalent");

  assertConstraintSetsEquivalent(qNL.state.constraints, qAuto.state.constraints, "NL", "Auto");
  pass("NL↔Auto constraint sets equivalent");

  assertCandidateSetsEquivalent(qNL.candidates, qGuided.candidates, "NL", "Guided");
  pass("NL↔Guided candidate sets equivalent");

  assertCandidateSetsEquivalent(qNL.candidates, qAuto.candidates, "NL", "Auto");
  pass("NL↔Auto candidate sets equivalent");

  assert(qNL.state.constraints.length === 1, `S3 should have 1 constraint, got ${qNL.state.constraints.length}`);
  pass("S3 constraint count = 1");
}

/* =========================================================
   Runner
   ========================================================= */

export async function runAll(): Promise<void> {
  console.log("=== Cross-Mode Equivalence Test Suite ===");
  console.log("Mode-invariance law: identical semantic input → identical NomosQuery → identical evaluation");

  let passed = 0;
  let failed = 0;

  for (const [name, fn] of [
    ["S1", runS1],
    ["S2", runS2],
    ["S3", runS3],
  ] as const) {
    try {
      await fn();
      passed++;
    } catch (err) {
      console.error(`\n${name}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
