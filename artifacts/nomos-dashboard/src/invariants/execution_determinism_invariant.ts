/**
 * execution_determinism_invariant.ts
 *
 * Execution Determinism Invariant
 * ────────────────────────────────
 * Given identical (graph, constraints) inputs, the execution engine and proof
 * trace builder must produce bit-for-bit identical outputs across all runs.
 *
 * Rules enforced (by running the pipeline a second time and comparing):
 *   ED-01  Constraint pass/fail result is stable across runs.
 *   ED-02  Observed value is stable across runs.
 *   ED-03  Proof trace step count is stable across runs.
 *   ED-04  Proof trace step selectedNodeIds are stable across runs.
 *   ED-05  Proof trace step excludedNodeIds are stable across runs.
 *   ED-06  Proof trace step anchorNodeIds are stable across runs.
 *   ED-07  Proof trace step windowNodeIds are stable across runs.
 *   ED-08  Proof trace step aggregateSourceNodeIds are stable across runs.
 */

import type { OperandGraph }          from "../graph/operand_graph_types.ts";
import type { GraphConstraintSpec }   from "../graph/graph_constraint_types.ts";
import type { GraphConstraintProofTrace } from "../graph/graph_proof_types.ts";
import type { InvariantResult, InvariantViolation } from "./invariant_types.ts";
import { executeGraphConstraintSet }  from "../graph/graph_constraint_executor.ts";
import { buildConstraintProofTrace }  from "../graph/graph_proof_trace.ts";

const NAME = "ExecutionDeterminism" as const;
const DESC = "Identical inputs produce identical execution results and proof traces across all runs.";

function arraysEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const aa = (a ?? []).slice().sort();
  const bb = (b ?? []).slice().sort();
  if (aa.length !== bb.length) return false;
  return aa.every((v, i) => v === bb[i]);
}

/**
 * Checks execution determinism for a single constraint by running it twice
 * and comparing the results and proof traces.
 *
 * @param graph  — The OperandGraph to execute against.
 * @param spec   — The single constraint spec to check.
 */
function checkSingleSpec(
  graph:     OperandGraph,
  spec:      GraphConstraintSpec,
  violations: InvariantViolation[]
): void {
  // Run 1
  const results1 = executeGraphConstraintSet(graph, [spec]);
  const trace1   = buildConstraintProofTrace(graph, spec);

  // Run 2
  const results2 = executeGraphConstraintSet(graph, [spec]);
  const trace2   = buildConstraintProofTrace(graph, spec);

  const r1 = results1[0];
  const r2 = results2[0];

  // ED-01: pass/fail
  if (r1.passed !== r2.passed) {
    violations.push({
      invariant: NAME,
      rule:      "RESULT_UNSTABLE_PASS_FAIL",
      message:   `Constraint "${spec.constraintId}": pass/fail differs between runs (run1=${r1.passed}, run2=${r2.passed}).`,
      detail:    { constraintId: spec.constraintId },
    });
  }

  // ED-02: observed value
  if (r1.observedValue !== r2.observedValue) {
    violations.push({
      invariant: NAME,
      rule:      "RESULT_UNSTABLE_OBSERVED_VALUE",
      message:   `Constraint "${spec.constraintId}": observed value differs (run1=${r1.observedValue}, run2=${r2.observedValue}).`,
      detail:    { constraintId: spec.constraintId, run1: r1.observedValue, run2: r2.observedValue },
    });
  }

  // ED-03: step count
  if (trace1.steps.length !== trace2.steps.length) {
    violations.push({
      invariant: NAME,
      rule:      "TRACE_UNSTABLE_STEP_COUNT",
      message:   `Constraint "${spec.constraintId}": proof step count differs (run1=${trace1.steps.length}, run2=${trace2.steps.length}).`,
      detail:    { constraintId: spec.constraintId },
    });
    return; // Cannot compare step-by-step if counts differ
  }

  // ED-04..08: per-step node ID arrays
  const STEP_ARRAYS: Array<{
    rule: string;
    key:  keyof GraphConstraintProofTrace["steps"][number];
  }> = [
    { rule: "TRACE_UNSTABLE_SELECTED",         key: "selectedNodeIds"        },
    { rule: "TRACE_UNSTABLE_EXCLUDED",         key: "excludedNodeIds"        },
    { rule: "TRACE_UNSTABLE_ANCHORS",          key: "anchorNodeIds"          },
    { rule: "TRACE_UNSTABLE_WINDOWS",          key: "windowNodeIds"          },
    { rule: "TRACE_UNSTABLE_AGGREGATE_SOURCE", key: "aggregateSourceNodeIds" },
  ];

  for (let i = 0; i < trace1.steps.length; i++) {
    const s1 = trace1.steps[i];
    const s2 = trace2.steps[i];
    for (const { rule, key } of STEP_ARRAYS) {
      const a1 = s1[key] as string[] | undefined;
      const a2 = s2[key] as string[] | undefined;
      if (!arraysEqual(a1, a2)) {
        violations.push({
          invariant: NAME,
          rule,
          message:   `Constraint "${spec.constraintId}" step ${s1.stepNumber} ("${s1.label}"): ${key} differs between runs.`,
          detail:    {
            constraintId: spec.constraintId,
            stepNumber:   s1.stepNumber,
            run1: a1 ?? [],
            run2: a2 ?? [],
          },
        });
      }
    }
  }
}

/**
 * Check execution determinism for a set of constraint specs.
 *
 * Runs the full execution pipeline twice for each spec and compares outputs.
 */
export function checkExecutionDeterminism(
  graph: OperandGraph,
  specs: GraphConstraintSpec[]
): InvariantResult {
  const violations: InvariantViolation[] = [];

  for (const spec of specs) {
    checkSingleSpec(graph, spec, violations);
  }

  return {
    invariant:   NAME,
    description: DESC,
    passed:      violations.length === 0,
    violations,
  };
}
