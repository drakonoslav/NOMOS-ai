/**
 * meal_audit_pipeline.ts
 *
 * Full NOMOS nutrition audit and correction pipeline.
 *
 * Pipeline order:
 *   1. Load food registry (always resident — no image parsing at runtime)
 *   2. Accept PhasePlan[] (encoded meal system)
 *   3. Compute actual macros per phase
 *   4. Compute deltas vs targets
 *   5. Generate truth audit (findings, uncertainties, phase verdict)
 *   6. Optionally generate corrected plans and global bias report
 *
 * Output modes:
 *   audit_only        — STATE, CONSTRAINTS, UNCERTAINTIES, FINDINGS, PHASE AUDIT, FINAL VERDICT
 *   audit_and_correct — above + CORRECTION RULE, CORRECTED SYSTEM
 *   derive_global_bias — above + bias summary across all phases
 *
 * Output format follows the NOMOS section schema.
 */

import { MacroDelta } from "./macro_engine.js";
import { PhasePlan } from "./meal_types.js";
import { AuditReport, runAudit, PhaseAuditEntry } from "./audit_engine.js";
import {
  CorrectionConstraints,
  DEFAULT_CORRECTION_CONSTRAINTS,
} from "./correction_constraints.js";
import { correctPhase, CorrectionResult } from "./correction_engine.js";
import { MacroProfile } from "./food_primitive.js";
import { RawPhase, parsePhasePlan } from "./meal_plan_parser.js";

/* =========================================================
   Pipeline input / output types
   ========================================================= */

export type PipelineMode =
  | "audit_only"
  | "audit_and_correct"
  | "derive_global_bias";

export interface PipelineInput {
  /**
   * Pre-validated phase plans (already passed through parsePhasePlan).
   * Provide either this or rawPlans — not both.
   */
  plans?: PhasePlan[];
  /**
   * Raw phase declarations to be parsed and validated against the food
   * registry before the pipeline runs. ParseError will throw if any
   * foodId is unknown or any unit is mismatched.
   * Provide either this or plans — not both.
   */
  rawPlans?: RawPhase[];
  mode:        PipelineMode;
  constraints?: CorrectionConstraints;
}

/** Global macro bias across all phases. */
export interface GlobalBias {
  averageDelta: MacroDelta;
  phases:       { phaseId: string; delta: MacroDelta }[];
  interpretation: string;
}

/** Structured pipeline output, matching the NOMOS section schema. */
export interface PipelineOutput {
  /** Pipeline execution mode. */
  mode:             PipelineMode;
  /** Timestamp of this run. */
  generatedAt:      string;

  /** STATE — what is loaded, what is verified. */
  state:            StateBlock;
  /** CONSTRAINTS — declared macro targets per phase. */
  constraints:      ConstraintsBlock;
  /** UNCERTAINTIES — what is estimated and confidence levels. */
  uncertainties:    UncertaintiesBlock;
  /** FINDINGS — food-level truths and system inferences. */
  findings:         FindingsBlock;
  /** PHASE AUDIT — actual vs target per phase. */
  phaseAudit:       PhaseAuditBlock;
  /** CORRECTION RULE — what levers are permitted (audit_and_correct only). */
  correctionRule?:  CorrectionRuleBlock;
  /** CORRECTED SYSTEM — corrected plans (audit_and_correct only). */
  correctedSystem?: CorrectedSystemBlock;
  /** Global bias across all phases (derive_global_bias only). */
  globalBias?:      GlobalBias;
  /** FINAL VERDICT — overall system status. */
  finalVerdict:     FinalVerdictBlock;
}

/* =========================================================
   Section block types
   ========================================================= */

export interface StateBlock {
  labelVerifiedFoods: string[];
  estimatedFoods:     string[];
  summary:            string;
}

export interface ConstraintsBlock {
  phases: { phaseId: string; target: MacroProfile }[];
}

export interface UncertaintiesBlock {
  items: { foodId: string; reason: string; confidence: string }[];
}

export interface FindingsBlock {
  items: {
    id:        string;
    kind:      string;
    severity:  string;
    subject:   string;
    statement: string;
    source?:   string;
  }[];
}

export interface PhaseAuditBlock {
  entries: {
    phaseId:          string;
    target:           MacroProfile;
    actual:           MacroProfile;
    delta:            MacroDelta;
    /**
     * Plain-language summary of which macros are outside tolerance and by how much.
     * "No macro drift outside tolerance." when status is PASS.
     */
    driftSummary:     string;
    /**
     * true only when every food in this phase has source="label".
     * false when banana, egg, or any other estimated food is present.
     */
    labelFaithful:    boolean;
    /**
     * true for WARN and FAIL — signals that a correction pass is warranted.
     * false for PASS.
     */
    correctionNeeded: boolean;
    status:           "PASS" | "WARN" | "FAIL";
    notes:            string[];
  }[];
}

export interface CorrectionRuleBlock {
  lockedRules:   string[];
  allowedLevers: string[];
  prohibited:    string[];
}

export interface CorrectedSystemBlock {
  phases: {
    phaseId:     string;
    macroBefore: MacroProfile;
    macroAfter:  MacroProfile;
    deltaBefore: MacroDelta;
    deltaAfter:  MacroDelta;
    adjustments: {
      foodId:       string;
      mealNumber:   number;
      beforeAmount: number;
      afterAmount:  number;
      unit:         string;
      reason:       string;
    }[];
    notes: string[];
  }[];
}

export interface FinalVerdictBlock {
  status:  "PASS" | "WARN" | "FAIL";
  summary: string;
  notes:   string[];
}

/* =========================================================
   Public API
   ========================================================= */

/**
 * runMealAuditPipeline — full NOMOS nutrition pipeline.
 *
 * Executes exactly the steps required by the selected mode.
 * Does not compute more than requested.
 *
 * Pipeline step order:
 *   1. Food registry is always resident — no I/O at runtime.
 *   2. If rawPlans provided: parse + validate all foodIds against registry.
 *      Unknown foodId or unit mismatch throws immediately before any computation.
 *   3. Compute actual macros per phase.
 *   4. Compute signed deltas vs. declared targets.
 *   5. Run truth audit (STATE, CONSTRAINTS, UNCERTAINTIES, FINDINGS, PHASE AUDIT, FINAL VERDICT).
 *   6. If mode=audit_and_correct: run correction engine per phase.
 *   7. If mode=derive_global_bias: compute average drift across all phases.
 */
export function runMealAuditPipeline(input: PipelineInput): PipelineOutput {
  const { mode, constraints = DEFAULT_CORRECTION_CONSTRAINTS } = input;
  const generatedAt = new Date().toISOString();

  // Step 1+2 — registry is always loaded; optionally parse raw declarations.
  let plans: PhasePlan[];
  if (input.rawPlans && input.rawPlans.length > 0) {
    // Parse validates all foodIds and units against the live registry.
    // Throws on the first phase with errors — no silent fallback.
    plans = input.rawPlans.map(parsePhasePlan);
  } else if (input.plans && input.plans.length > 0) {
    plans = input.plans;
  } else {
    throw new Error("runMealAuditPipeline: either plans or rawPlans must be provided and non-empty.");
  }

  // Step 3+4+5 — single macro computation pass; audit reuses the results.
  const auditReport: AuditReport = runAudit(plans);

  // Build standard sections
  const state: StateBlock = {
    labelVerifiedFoods: auditReport.state.labelVerifiedFoods,
    estimatedFoods:     auditReport.state.estimatedFoods,
    summary:            auditReport.state.summary,
  };

  const constraintsBlock: ConstraintsBlock = {
    phases: auditReport.constraints,
  };

  const uncertaintiesBlock: UncertaintiesBlock = {
    items: auditReport.uncertainties,
  };

  const findingsBlock: FindingsBlock = {
    items: auditReport.findings.map(f => ({
      id:        f.id,
      kind:      f.kind,
      severity:  f.severity,
      subject:   f.subject,
      statement: f.statement,
      source:    f.source,
    })),
  };

  const phaseAuditBlock: PhaseAuditBlock = {
    entries: auditReport.phaseAudit.map(e => ({
      phaseId:          e.phaseId,
      target:           e.target,
      actual:           e.actual,
      delta:            e.delta,
      driftSummary:     e.driftSummary,
      labelFaithful:    e.labelFaithful,
      correctionNeeded: e.correctionNeeded,
      status:           e.status,
      notes:            e.notes,
    })),
  };

  const finalVerdictBlock: FinalVerdictBlock = {
    status:  auditReport.finalVerdict.status,
    summary: auditReport.finalVerdict.summary,
    notes:   auditReport.finalVerdict.notes,
  };

  const output: PipelineOutput = {
    mode,
    generatedAt,
    state,
    constraints:  constraintsBlock,
    uncertainties: uncertaintiesBlock,
    findings:     findingsBlock,
    phaseAudit:   phaseAuditBlock,
    finalVerdict: finalVerdictBlock,
  };

  // ---- audit_and_correct ----
  if (mode === "audit_and_correct") {
    const correctionRuleBlock: CorrectionRuleBlock = {
      lockedRules:   constraints.locked.map(r => r.description),
      allowedLevers: constraints.allowedLevers.map(l => `${l.label} (${l.foodId}): min ${l.minAmount}${l.unit}`),
      prohibited:    constraints.prohibited.map(p => p.description),
    };

    const corrections: CorrectionResult[] = plans.map(p => correctPhase(p, constraints));

    const correctedSystemBlock: CorrectedSystemBlock = {
      phases: corrections.map(c => ({
        phaseId:     c.phaseId,
        macroBefore: c.macroBefore,
        macroAfter:  c.macroAfter,
        deltaBefore: c.deltaBefore,
        deltaAfter:  c.deltaAfter,
        adjustments: c.adjustments.map(a => ({
          foodId:       a.foodId,
          mealNumber:   a.mealNumber,
          beforeAmount: a.beforeAmount,
          afterAmount:  a.afterAmount,
          unit:         a.unit,
          reason:       a.reason,
        })),
        notes: c.notes,
      })),
    };

    output.correctionRule   = correctionRuleBlock;
    output.correctedSystem  = correctedSystemBlock;
  }

  // ---- derive_global_bias ----
  if (mode === "derive_global_bias") {
    output.globalBias = deriveGlobalBias(auditReport.phaseAudit);
  }

  return output;
}

/* =========================================================
   Global bias derivation
   ========================================================= */

function deriveGlobalBias(phaseAudits: PhaseAuditEntry[]): GlobalBias {
  const n = phaseAudits.length;
  if (n === 0) {
    return {
      averageDelta:   { calories: 0, protein: 0, carbs: 0, fat: 0 },
      phases:         [],
      interpretation: "No phases to analyse.",
    };
  }

  const sum = phaseAudits.reduce(
    (acc, e) => ({
      calories: acc.calories + e.delta.calories,
      protein:  acc.protein  + e.delta.protein,
      carbs:    acc.carbs    + e.delta.carbs,
      fat:      acc.fat      + e.delta.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const avg: MacroDelta = {
    calories: sum.calories / n,
    protein:  sum.protein  / n,
    carbs:    sum.carbs    / n,
    fat:      sum.fat      / n,
  };

  const lines: string[] = [];
  if (Math.abs(avg.calories) > 50) {
    lines.push(
      `Calories are systematically ${avg.calories > 0 ? "over" : "under"} target ` +
      `by an average of ${Math.abs(avg.calories).toFixed(0)} kcal/day across phases.`
    );
  }
  if (Math.abs(avg.protein) > 5) {
    lines.push(
      `Protein is systematically ${avg.protein > 0 ? "over" : "under"} target ` +
      `by ${Math.abs(avg.protein).toFixed(1)}g/day on average.`
    );
  }
  if (Math.abs(avg.carbs) > 10) {
    lines.push(
      `Carbohydrates are systematically ${avg.carbs > 0 ? "over" : "under"} target ` +
      `by ${Math.abs(avg.carbs).toFixed(1)}g/day on average.`
    );
  }
  if (Math.abs(avg.fat) > 5) {
    lines.push(
      `Fat is systematically ${avg.fat > 0 ? "over" : "under"} target ` +
      `by ${Math.abs(avg.fat).toFixed(1)}g/day on average.`
    );
  }
  if (lines.length === 0) {
    lines.push("No significant systematic macro bias detected across phases.");
  }

  return {
    averageDelta:   avg,
    phases:         phaseAudits.map(e => ({ phaseId: e.phaseId, delta: e.delta })),
    interpretation: lines.join(" "),
  };
}
