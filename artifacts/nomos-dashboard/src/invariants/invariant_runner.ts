/**
 * invariant_runner.ts
 *
 * Runs all four NOMOS system invariants and aggregates results into a single
 * InvariantReport.
 *
 * Usage:
 *   const report = runAllInvariants({ binding, graph, specs, traces, rawText });
 *   if (!report.allPassed) {
 *     // surface violations to the developer / audit trail
 *   }
 *
 * Individual invariants can also be run in isolation using their checker
 * functions directly.
 */

import type { BindingResult }             from "../compiler/measured_entity_types.ts";
import type { OperandGraph }              from "../graph/operand_graph_types.ts";
import type { GraphConstraintSpec }       from "../graph/graph_constraint_types.ts";
import type { GraphConstraintProofTrace } from "../graph/graph_proof_types.ts";
import type { InvariantReport, InvariantResult } from "./invariant_types.ts";

import { checkGraphFidelity }          from "./graph_fidelity_invariant.ts";
import { checkExecutionDeterminism }   from "./execution_determinism_invariant.ts";
import { checkProofIntegrity }         from "./proof_integrity_invariant.ts";
import { checkModeInvariance }         from "./mode_invariance_invariant.ts";

/* =========================================================
   Params
   ========================================================= */

export interface InvariantRunnerParams {
  /**
   * The BindingResult that produced `graph`.
   * Required for GraphFidelity and ModeInvariance checks.
   * If omitted, those checks are skipped.
   */
  binding?: BindingResult;

  /** The OperandGraph to check against. */
  graph: OperandGraph;

  /** The constraint specs used for execution. */
  specs: GraphConstraintSpec[];

  /**
   * Proof traces produced by buildConstraintProofTrace for each spec.
   * Required for ProofIntegrity check.
   * If omitted, ProofIntegrity is skipped.
   */
  traces?: GraphConstraintProofTrace[];

  /**
   * The raw text that was fed into bindRelations to produce `binding`.
   * Required for ModeInvariance (text-level) check.
   * If omitted, the mode invariance text-stage runs on an empty string
   * (still checks execution stability).
   */
  rawText?: string;
}

/* =========================================================
   Runner
   ========================================================= */

/**
 * Run all four invariants and return a combined InvariantReport.
 *
 * Invariants are always checked independently — a failure in one does not
 * prevent the others from running.
 */
export function runAllInvariants(params: InvariantRunnerParams): InvariantReport {
  const { binding, graph, specs, traces = [], rawText = "" } = params;

  const results: InvariantResult[] = [];

  // ── 1. Graph Fidelity ─────────────────────────────────────────────────────
  if (binding) {
    results.push(checkGraphFidelity(binding, graph));
  }

  // ── 2. Execution Determinism ──────────────────────────────────────────────
  if (specs.length > 0) {
    results.push(checkExecutionDeterminism(graph, specs));
  }

  // ── 3. Proof Integrity ────────────────────────────────────────────────────
  if (traces.length > 0) {
    results.push(checkProofIntegrity(traces, graph));
  }

  // ── 4. Mode Invariance ────────────────────────────────────────────────────
  results.push(checkModeInvariance(rawText, specs));

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
  const allPassed       = results.every((r) => r.passed);

  return { allPassed, results, totalViolations };
}

/* =========================================================
   Convenience: assert (throws on any violation)
   ========================================================= */

/**
 * Run all invariants and throw a descriptive error if any violation is found.
 * Intended for use in test setup or CI checks.
 */
export function assertInvariants(params: InvariantRunnerParams): void {
  const report = runAllInvariants(params);
  if (!report.allPassed) {
    const lines = report.results
      .filter((r) => !r.passed)
      .flatMap((r) => r.violations.map((v) => `  [${v.rule}] ${v.message}`));
    throw new Error(`NOMOS invariant violation(s):\n${lines.join("\n")}`);
  }
}
