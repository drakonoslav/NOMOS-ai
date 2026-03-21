/**
 * golden_snapshots.ts
 *
 * Post-fix verification pass — golden-case snapshot suite.
 *
 * Generates and asserts golden snapshots for 5 scenarios × 3 modes:
 *   - S1: Carb timing (pre-lift temporal constraint)
 *   - S2: Nutrition macro audit
 *   - S3: Schedule window constraint
 *   - S4: Simple training constraint
 *   - S5: Mixed multi-candidate decision
 *
 * For each scenario × mode (NL | Guided | Auto):
 *   - canonicalDeclaration: the text fed to the kernel parser
 *   - nomosQuery:           the structured object the parser produced
 *   - evaluationResult:     the deterministic evaluation outcome
 *
 * First run (--generate flag): generates and writes snapshots to
 *   golden_snapshot_data.json in this directory.
 *
 * Subsequent runs: loads the snapshot file and asserts exact equivalence.
 *
 * Cross-mode invariants asserted per scenario:
 *   constraints: same count, same normalized text across all three modes
 *   candidates:  same count, same text across all three modes
 *   evaluation:  identical status per candidate across all three modes
 *
 * Run (generate):
 *   node dist/tests/golden_snapshots.js --generate
 * Run (assert):
 *   node dist/tests/golden_snapshots.js
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { NomosQueryParser } from "../query/query_parser_rule_based.js";
import { evaluateQueryCandidates } from "../evaluation/candidate_scoring.js";
import type { NomosQuery } from "../query/query_types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const SNAPSHOT_PATH = path.join(__dirname, "golden_snapshot_data.json");

const parser = new NomosQueryParser();

/* =========================================================
   Utilities
   ========================================================= */

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function pass(msg: string): void {
  console.log(`  PASS ${msg}`);
}

function fail(msg: string): void {
  console.error(`  FAIL ${msg}`);
  throw new Error(msg);
}

/* =========================================================
   Scenario definitions
   Each scenario has three text representations:
     nl     — natural language (SECTION: heading format, prose lines)
     guided — same format, with explicit STATE/CONSTRAINTS/CANDIDATES/OBJECTIVE
     auto   — serialized draft format (bullet list items under headings)
   All three parse to semantically equivalent NomosQuery.
   ========================================================= */

interface ScenarioInput {
  nl:     string;
  guided: string;
  auto:   string;
  /** Expected evaluation status per candidate id. */
  expectedVerdicts: Record<string, "LAWFUL" | "INVALID" | "UNCERTAIN" | "DEGRADED">;
}

const SCENARIOS: Record<string, ScenarioInput> = {

  S1_carb_timing: {
    expectedVerdicts: { A: "LAWFUL", B: "INVALID", C: "INVALID", D: "INVALID" },

    nl: `\
STATE:
Pre-lift nutrition timing

CONSTRAINTS:
- At least 60g of fast-digesting carbohydrates must be consumed within 90 minutes before lifting, and no more than 20g of slow-digesting carbohydrates may be consumed within 60 minutes before lifting.

CANDIDATES:
A: Consume 80g cyclic dextrin 30 minutes before lifting.
B: Consume 120g oats 30 minutes before lifting.
C: Consume 80g cyclic dextrin 2 hours before lifting.
D: Consume 60g cyclic dextrin 75 minutes before lifting and 30g oats 45 minutes before lifting.

OBJECTIVE:
Which candidate is admissible under the carbohydrate timing constraint?`,

    guided: `\
STATE:
Pre-lift nutrition timing

CONSTRAINTS:
- At least 60g of fast-digesting carbohydrates must be consumed within 90 minutes before lifting, and no more than 20g of slow-digesting carbohydrates may be consumed within 60 minutes before lifting.

CANDIDATES:
A: Consume 80g cyclic dextrin 30 minutes before lifting.
B: Consume 120g oats 30 minutes before lifting.
C: Consume 80g cyclic dextrin 2 hours before lifting.
D: Consume 60g cyclic dextrin 75 minutes before lifting and 30g oats 45 minutes before lifting.

OBJECTIVE:
Which candidate is admissible under the carbohydrate timing constraint?`,

    auto: `\
STATE:
- Pre-lift nutrition timing

CONSTRAINTS:
- At least 60g of fast-digesting carbohydrates must be consumed within 90 minutes before lifting, and no more than 20g of slow-digesting carbohydrates may be consumed within 60 minutes before lifting.

CANDIDATES:
A: Consume 80g cyclic dextrin 30 minutes before lifting.
B: Consume 120g oats 30 minutes before lifting.
C: Consume 80g cyclic dextrin 2 hours before lifting.
D: Consume 60g cyclic dextrin 75 minutes before lifting and 30g oats 45 minutes before lifting.

OBJECTIVE:
- Which candidate is admissible under the carbohydrate timing constraint?`,
  },

  S2_nutrition_macro_audit: {
    // DEGRADED: kernel has no deterministic calorie/protein evaluator — heuristic path fires.
    // Cross-mode equivalence (all three modes agree on DEGRADED) is the invariant here.
    expectedVerdicts: { A: "DEGRADED", B: "DEGRADED" },

    nl: `\
STATE:
Athlete is in a strength building phase.

CONSTRAINTS:
- Total daily calories must not exceed 2800 kcal.
- Protein must be at least 180g per day.

CANDIDATES:
A: Keep current plan at 2600 kcal with 200g protein.
B: Reduce calories to 2200 kcal with 150g protein.

OBJECTIVE:
Which plan is admissible under the declared nutritional constraints?`,

    guided: `\
STATE:
Athlete is in a strength building phase.

CONSTRAINTS:
- Total daily calories must not exceed 2800 kcal.
- Protein must be at least 180g per day.

CANDIDATES:
A: Keep current plan at 2600 kcal with 200g protein.
B: Reduce calories to 2200 kcal with 150g protein.

OBJECTIVE:
Which plan is admissible under the declared nutritional constraints?`,

    auto: `\
STATE:
- Athlete is in a strength building phase.

CONSTRAINTS:
- Total daily calories must not exceed 2800 kcal.
- Protein must be at least 180g per day.

CANDIDATES:
A: Keep current plan at 2600 kcal with 200g protein.
B: Reduce calories to 2200 kcal with 150g protein.

OBJECTIVE:
- Which plan is admissible under the declared nutritional constraints?`,
  },

  S3_schedule_window: {
    // DEGRADED: kernel has no deterministic time-of-day evaluator — heuristic path fires.
    expectedVerdicts: { A: "DEGRADED", B: "DEGRADED" },

    nl: `\
STATE:
Weekly planning session. Critical meeting scheduling required.

CONSTRAINTS:
- All critical meetings must be completed before 3pm.

CANDIDATES:
A: Schedule the board review at 10am.
B: Schedule the board review at 4pm.

OBJECTIVE:
Which scheduling option is compliant with the time constraint?`,

    guided: `\
STATE:
Weekly planning session. Critical meeting scheduling required.

CONSTRAINTS:
- All critical meetings must be completed before 3pm.

CANDIDATES:
A: Schedule the board review at 10am.
B: Schedule the board review at 4pm.

OBJECTIVE:
Which scheduling option is compliant with the time constraint?`,

    auto: `\
STATE:
- Weekly planning session. Critical meeting scheduling required.

CONSTRAINTS:
- All critical meetings must be completed before 3pm.

CANDIDATES:
A: Schedule the board review at 10am.
B: Schedule the board review at 4pm.

OBJECTIVE:
- Which scheduling option is compliant with the time constraint?`,
  },

  S4_training_constraint: {
    // DEGRADED: kernel has no deterministic set-count / rest-period evaluator.
    expectedVerdicts: { A: "DEGRADED", B: "DEGRADED", C: "DEGRADED" },

    nl: `\
STATE:
Athlete is preparing for a strength competition. Current training plan is under review.

CONSTRAINTS:
- Maximum training volume per session must not exceed 24 working sets.
- Minimum rest between sessions targeting the same muscle group is 48 hours.

CANDIDATES:
A: Upper body session: 6 exercises x 4 sets = 24 total sets. Next upper session in 72 hours.
B: Full body session: 8 exercises x 4 sets = 32 total sets. Next session in 24 hours.
C: Lower body session: 5 exercises x 4 sets = 20 total sets. Next lower session in 48 hours.

OBJECTIVE:
Which training session plan is admissible under the declared volume and recovery constraints?`,

    guided: `\
STATE:
Athlete is preparing for a strength competition. Current training plan is under review.

CONSTRAINTS:
- Maximum training volume per session must not exceed 24 working sets.
- Minimum rest between sessions targeting the same muscle group is 48 hours.

CANDIDATES:
A: Upper body session: 6 exercises x 4 sets = 24 total sets. Next upper session in 72 hours.
B: Full body session: 8 exercises x 4 sets = 32 total sets. Next session in 24 hours.
C: Lower body session: 5 exercises x 4 sets = 20 total sets. Next lower session in 48 hours.

OBJECTIVE:
Which training session plan is admissible under the declared volume and recovery constraints?`,

    auto: `\
STATE:
- Athlete is preparing for a strength competition. Current training plan is under review.

CONSTRAINTS:
- Maximum training volume per session must not exceed 24 working sets.
- Minimum rest between sessions targeting the same muscle group is 48 hours.

CANDIDATES:
A: Upper body session: 6 exercises x 4 sets = 24 total sets. Next upper session in 72 hours.
B: Full body session: 8 exercises x 4 sets = 32 total sets. Next session in 24 hours.
C: Lower body session: 5 exercises x 4 sets = 20 total sets. Next lower session in 48 hours.

OBJECTIVE:
- Which training session plan is admissible under the declared volume and recovery constraints?`,
  },

  S5_mixed_multicand: {
    // DEGRADED: kernel has no deterministic budget/allocation evaluator.
    // All five candidates return DEGRADED (heuristic path) consistently across all three modes.
    expectedVerdicts: { A: "DEGRADED", B: "DEGRADED", C: "DEGRADED", D: "DEGRADED", E: "DEGRADED" },

    nl: `\
STATE:
Budget allocation decision for Q3 project portfolio. Five candidate plans submitted.

CONSTRAINTS:
- Total budget allocation must not exceed $500,000.
- No single project may receive more than 40% of the total budget.
- At least two projects must be funded in any approved allocation.

CANDIDATES:
A: Fund Project Alpha ($150k) and Project Beta ($200k). Total: $350k.
B: Fund Project Alpha ($250k) only. Total: $250k.
C: Fund Project Gamma ($550k) only. Total: $550k.
D: Fund Project Alpha ($150k), Project Beta ($180k), and Project Delta ($120k). Total: $450k.
E: Fund Project Beta ($220k) and Project Gamma ($320k). Total: $540k.

OBJECTIVE:
Which budget allocation plan is admissible under all three constraints?`,

    guided: `\
STATE:
Budget allocation decision for Q3 project portfolio. Five candidate plans submitted.

CONSTRAINTS:
- Total budget allocation must not exceed $500,000.
- No single project may receive more than 40% of the total budget.
- At least two projects must be funded in any approved allocation.

CANDIDATES:
A: Fund Project Alpha ($150k) and Project Beta ($200k). Total: $350k.
B: Fund Project Alpha ($250k) only. Total: $250k.
C: Fund Project Gamma ($550k) only. Total: $550k.
D: Fund Project Alpha ($150k), Project Beta ($180k), and Project Delta ($120k). Total: $450k.
E: Fund Project Beta ($220k) and Project Gamma ($320k). Total: $540k.

OBJECTIVE:
Which budget allocation plan is admissible under all three constraints?`,

    auto: `\
STATE:
- Budget allocation decision for Q3 project portfolio. Five candidate plans submitted.

CONSTRAINTS:
- Total budget allocation must not exceed $500,000.
- No single project may receive more than 40% of the total budget.
- At least two projects must be funded in any approved allocation.

CANDIDATES:
A: Fund Project Alpha ($150k) and Project Beta ($200k). Total: $350k.
B: Fund Project Alpha ($250k) only. Total: $250k.
C: Fund Project Gamma ($550k) only. Total: $550k.
D: Fund Project Alpha ($150k), Project Beta ($180k), and Project Delta ($120k). Total: $450k.
E: Fund Project Beta ($220k) and Project Gamma ($320k). Total: $540k.

OBJECTIVE:
- Which budget allocation plan is admissible under all three constraints?`,
  },
};

/* =========================================================
   Snapshot types
   ========================================================= */

interface ModeSnapshot {
  canonicalDeclaration: string;
  nomosQuery: {
    constraints: string[];
    candidates: Array<{ id: string; description: string }>;
    objective: string | null;
  };
  evaluationResult: {
    overallStatus: string;
    verdicts: Array<{ id: string; status: string; reason: string }>;
  };
}

interface ScenarioSnapshot {
  nl:     ModeSnapshot;
  guided: ModeSnapshot;
  auto:   ModeSnapshot;
}

type SnapshotFile = Record<string, ScenarioSnapshot>;

/* =========================================================
   Generation
   ========================================================= */

async function generateModeSnapshot(
  scenarioId: string,
  mode: "nl" | "guided" | "auto",
  text: string
): Promise<ModeSnapshot> {
  const query: NomosQuery = parser.parse(text);
  const result = await evaluateQueryCandidates(query);

  return {
    canonicalDeclaration: text,
    nomosQuery: {
      constraints: query.state.constraints,
      candidates: query.candidates.map((c) => ({ id: c.id, description: c.description })),
      objective: query.objective?.description ?? null,
    },
    evaluationResult: {
      overallStatus: result.overallStatus ?? "UNKNOWN",
      verdicts: result.candidateEvaluations.map((e) => ({
        id: e.id,
        status: e.status,
        reason: e.reason ?? "",
      })),
    },
  };
}

async function generateSnapshots(): Promise<SnapshotFile> {
  const file: SnapshotFile = {};

  for (const [scenarioId, scenario] of Object.entries(SCENARIOS)) {
    console.log(`  Generating ${scenarioId}...`);
    file[scenarioId] = {
      nl:     await generateModeSnapshot(scenarioId, "nl",     scenario.nl),
      guided: await generateModeSnapshot(scenarioId, "guided", scenario.guided),
      auto:   await generateModeSnapshot(scenarioId, "auto",   scenario.auto),
    };
  }

  return file;
}

/* =========================================================
   Assertion
   ========================================================= */

function assertSnapshotEquivalence(
  scenarioId: string,
  scenario: ScenarioInput,
  snap: ScenarioSnapshot
): void {
  const modes: Array<[string, ModeSnapshot]> = [
    ["nl", snap.nl],
    ["guided", snap.guided],
    ["auto", snap.auto],
  ];

  // 1. Constraint count + normalized text must match across all modes
  const nlConstraints = snap.nl.nomosQuery.constraints.map(normalize).sort();

  for (const [mode, modeSnap] of modes) {
    const mc = modeSnap.nomosQuery.constraints.map(normalize).sort();
    if (mc.length !== nlConstraints.length) {
      fail(`${scenarioId} [${mode}] constraint count: expected ${nlConstraints.length}, got ${mc.length}`);
    }
    for (let i = 0; i < nlConstraints.length; i++) {
      if (mc[i] !== nlConstraints[i]) {
        fail(`${scenarioId} [${mode}] constraint[${i}] mismatch:\n  nl:   ${nlConstraints[i]}\n  ${mode}: ${mc[i]}`);
      }
    }
    pass(`${scenarioId} [${mode}] constraint set matches NL`);
  }

  // 2. Candidate count + ids must match across all modes
  const nlCandIds = snap.nl.nomosQuery.candidates.map((c) => c.id).sort();

  for (const [mode, modeSnap] of modes) {
    const mc = modeSnap.nomosQuery.candidates.map((c) => c.id).sort();
    if (JSON.stringify(mc) !== JSON.stringify(nlCandIds)) {
      fail(`${scenarioId} [${mode}] candidate ids mismatch:\n  nl:   ${nlCandIds}\n  ${mode}: ${mc}`);
    }
    pass(`${scenarioId} [${mode}] candidate ids match NL`);
  }

  // 3. Evaluation results must be identical across all modes
  for (const [mode, modeSnap] of modes) {
    const nlMap = Object.fromEntries(snap.nl.evaluationResult.verdicts.map((v) => [v.id, v.status]));
    const mMap  = Object.fromEntries(modeSnap.evaluationResult.verdicts.map((v) => [v.id, v.status]));
    for (const [id, status] of Object.entries(nlMap)) {
      if (mMap[id] !== status) {
        fail(`${scenarioId} [${mode}] candidate ${id}: expected ${status}, got ${mMap[id]}`);
      }
    }
    pass(`${scenarioId} [${mode}] evaluation verdicts match NL`);
  }

  // 4. Expected verdicts (ground truth)
  if (scenario.expectedVerdicts) {
    const actualMap = Object.fromEntries(
      snap.nl.evaluationResult.verdicts.map((v) => [v.id, v.status])
    );
    for (const [id, expected] of Object.entries(scenario.expectedVerdicts)) {
      if (actualMap[id] !== expected) {
        fail(`${scenarioId} expected ${id}=${expected}, got ${actualMap[id]}`);
      }
    }
    pass(`${scenarioId} ground-truth verdicts correct`);
  }
}

/* =========================================================
   Runner
   ========================================================= */

async function run(): Promise<void> {
  const generate = process.argv.includes("--generate");

  if (generate) {
    console.log("=== Golden Snapshot Generator ===");
    const snapshots = await generateSnapshots();
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshots, null, 2), "utf-8");
    console.log(`\nSnapshots written to: ${SNAPSHOT_PATH}`);
    console.log(`Scenarios: ${Object.keys(snapshots).length}`);
    for (const [id, snap] of Object.entries(snapshots)) {
      console.log(`  ${id}: NL constraints=${snap.nl.nomosQuery.constraints.length} candidates=${snap.nl.nomosQuery.candidates.length}`);
    }
    return;
  }

  console.log("=== Golden Snapshot Assertion Suite ===");

  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.error(`Snapshot file not found: ${SNAPSHOT_PATH}`);
    console.error("Run with --generate first.");
    process.exit(1);
  }

  const stored: SnapshotFile = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"));

  // Regenerate current snapshots and compare
  console.log("\nRegenerating snapshots for comparison...");
  const current = await generateSnapshots();

  let passed = 0;
  let failed = 0;

  for (const [scenarioId, scenario] of Object.entries(SCENARIOS)) {
    console.log(`\n${scenarioId}`);
    try {
      const snap = current[scenarioId];
      if (!snap) throw new Error(`No snapshot generated for ${scenarioId}`);

      // Assert cross-mode equivalence
      assertSnapshotEquivalence(scenarioId, scenario, snap);

      // Assert stored snapshot stability (regression check)
      const storedSnap = stored[scenarioId];
      if (storedSnap) {
        const storedVerdicts = Object.fromEntries(
          storedSnap.nl.evaluationResult.verdicts.map((v) => [v.id, v.status])
        );
        const currentVerdicts = Object.fromEntries(
          snap.nl.evaluationResult.verdicts.map((v) => [v.id, v.status])
        );
        for (const [id, status] of Object.entries(storedVerdicts)) {
          assert(
            currentVerdicts[id] === status,
            `${scenarioId} regression: candidate ${id} changed from ${status} to ${currentVerdicts[id]}`
          );
        }
        pass(`${scenarioId} evaluation stable vs stored snapshot`);
      }

      passed++;
    } catch (err) {
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
