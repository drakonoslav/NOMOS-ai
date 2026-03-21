/**
 * mode_invariance_invariant.ts
 *
 * Mode Invariance Invariant
 * ─────────────────────────
 * Regardless of which mode (NL / Guided / Auto) a query enters NOMOS through,
 * all mode paths must converge to:
 *   1. The same BindingResult structure (entity count, anchor count, binding count)
 *   2. The same OperandGraph structure (node count, edge count, node type distribution)
 *   3. The same evaluation result (pass/fail, observed value) for each constraint
 *
 * In the current architecture all modes converge through a single parse path
 * before evaluation.  This checker verifies the parse and build functions are
 * stable by running them N times on the same input and comparing outputs.
 *
 * Rules enforced:
 *   MI-01  N runs of bindRelations(text) produce the same entity count.
 *   MI-02  N runs of bindRelations(text) produce the same anchor count.
 *   MI-03  N runs of bindRelations(text) produce the same binding count.
 *   MI-04  N runs of buildOperandGraph(binding) produce the same node count.
 *   MI-05  N runs of buildOperandGraph(binding) produce the same edge count.
 *   MI-06  N runs of buildOperandGraph(binding) produce the same node type distribution.
 *   MI-07  N runs of executeGraphConstraintSet produce the same pass/fail per constraint.
 *   MI-08  N runs of executeGraphConstraintSet produce the same observed value per constraint.
 */

import type { OperandGraph }          from "../graph/operand_graph_types.ts";
import type { GraphConstraintSpec }   from "../graph/graph_constraint_types.ts";
import type { InvariantResult, InvariantViolation } from "./invariant_types.ts";
import { bindRelations }              from "../compiler/relation_binder.ts";
import { buildOperandGraph }          from "../graph/operand_graph_builder.ts";
import { executeGraphConstraintSet }  from "../graph/graph_constraint_executor.ts";

const NAME = "ModeInvariance" as const;
const DESC = "All modes converge: identical text → identical binding → identical graph → identical evaluation result.";

const RUN_COUNT = 3; // Number of times to repeat each stage to check for drift

function allEqual<T>(values: T[]): boolean {
  return values.every((v) => v === values[0]);
}

function typeDist(graph: OperandGraph): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const n of graph.nodes) {
    dist[n.type] = (dist[n.type] ?? 0) + 1;
  }
  return dist;
}

function typeDístsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.join(",") !== keysB.join(",")) return false;
  return keysA.every((k) => a[k] === b[k]);
}

/**
 * Check mode invariance for a raw text input and optional constraint specs.
 *
 * Runs each pipeline stage N times and confirms outputs are structurally
 * identical across runs.
 *
 * @param rawText — The raw input text (e.g. serialized canonical declaration).
 * @param specs   — Optional constraint specs to check evaluation stability.
 */
export function checkModeInvariance(
  rawText: string,
  specs:   GraphConstraintSpec[] = []
): InvariantResult {
  const violations: InvariantViolation[] = [];

  // ── Stage 1: bindRelations (N runs) ───────────────────────────────────────
  const bindings = Array.from({ length: RUN_COUNT }, () => bindRelations(rawText));

  // MI-01: entity count stable
  const entityCounts = bindings.map((b) => b.entities.length);
  if (!allEqual(entityCounts)) {
    violations.push({
      invariant: NAME,
      rule:      "BINDING_ENTITY_COUNT_UNSTABLE",
      message:   `bindRelations produced different entity counts across ${RUN_COUNT} runs: [${entityCounts.join(", ")}].`,
      detail:    { counts: entityCounts },
    });
  }

  // MI-02: anchor count stable
  const anchorCounts = bindings.map((b) => b.anchors.length);
  if (!allEqual(anchorCounts)) {
    violations.push({
      invariant: NAME,
      rule:      "BINDING_ANCHOR_COUNT_UNSTABLE",
      message:   `bindRelations produced different anchor counts across ${RUN_COUNT} runs: [${anchorCounts.join(", ")}].`,
      detail:    { counts: anchorCounts },
    });
  }

  // MI-03: binding count stable
  const bindingCounts = bindings.map((b) => b.bindings.length);
  if (!allEqual(bindingCounts)) {
    violations.push({
      invariant: NAME,
      rule:      "BINDING_RELATION_COUNT_UNSTABLE",
      message:   `bindRelations produced different binding counts across ${RUN_COUNT} runs: [${bindingCounts.join(", ")}].`,
      detail:    { counts: bindingCounts },
    });
  }

  // ── Stage 2: buildOperandGraph (N runs, same binding as input) ────────────
  const baseBinding = bindings[0];
  const graphs = Array.from({ length: RUN_COUNT }, () => buildOperandGraph(baseBinding));

  // MI-04: node count stable
  const nodeCounts = graphs.map((g) => g.nodes.length);
  if (!allEqual(nodeCounts)) {
    violations.push({
      invariant: NAME,
      rule:      "GRAPH_NODE_COUNT_UNSTABLE",
      message:   `buildOperandGraph produced different node counts across ${RUN_COUNT} runs: [${nodeCounts.join(", ")}].`,
      detail:    { counts: nodeCounts },
    });
  }

  // MI-05: edge count stable
  const edgeCounts = graphs.map((g) => g.edges.length);
  if (!allEqual(edgeCounts)) {
    violations.push({
      invariant: NAME,
      rule:      "GRAPH_EDGE_COUNT_UNSTABLE",
      message:   `buildOperandGraph produced different edge counts across ${RUN_COUNT} runs: [${edgeCounts.join(", ")}].`,
      detail:    { counts: edgeCounts },
    });
  }

  // MI-06: node type distribution stable
  const dists = graphs.map((g) => typeDist(g));
  for (let i = 1; i < dists.length; i++) {
    if (!typeDístsEqual(dists[0], dists[i])) {
      violations.push({
        invariant: NAME,
        rule:      "GRAPH_TYPE_DIST_UNSTABLE",
        message:   `buildOperandGraph produced different node type distributions on run ${i + 1} vs run 1.`,
        detail:    { run1: dists[0], [`run${i + 1}`]: dists[i] },
      });
      break;
    }
  }

  // ── Stage 3: executeGraphConstraintSet (N runs) ───────────────────────────
  if (specs.length > 0) {
    const baseGraph = graphs[0];
    const resultSets = Array.from({ length: RUN_COUNT }, () =>
      executeGraphConstraintSet(baseGraph, specs)
    );

    for (let specIdx = 0; specIdx < specs.length; specIdx++) {
      const spec = specs[specIdx];

      // MI-07: pass/fail stable
      const passedValues = resultSets.map((rs) => rs[specIdx]?.passed);
      if (!allEqual(passedValues)) {
        violations.push({
          invariant: NAME,
          rule:      "EVAL_PASS_FAIL_UNSTABLE",
          message:   `Constraint "${spec.constraintId}": pass/fail differed across ${RUN_COUNT} runs: [${passedValues.join(", ")}].`,
          detail:    { constraintId: spec.constraintId, values: passedValues },
        });
      }

      // MI-08: observed value stable
      const observedValues = resultSets.map((rs) => rs[specIdx]?.observedValue);
      if (!allEqual(observedValues)) {
        violations.push({
          invariant: NAME,
          rule:      "EVAL_OBSERVED_UNSTABLE",
          message:   `Constraint "${spec.constraintId}": observed value differed across ${RUN_COUNT} runs: [${observedValues.join(", ")}].`,
          detail:    { constraintId: spec.constraintId, values: observedValues },
        });
      }
    }
  }

  return {
    invariant:   NAME,
    description: DESC,
    passed:      violations.length === 0,
    violations,
  };
}
