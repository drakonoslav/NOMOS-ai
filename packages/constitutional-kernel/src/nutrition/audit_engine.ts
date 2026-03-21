/**
 * audit_engine.ts
 *
 * Truth-audit layer for NOMOS nutrition evaluation.
 *
 * Constitutional role:
 * - Explains what the registered food labels actually license before any
 *   correction is attempted.
 * - Distinguishes between label truths (exact, verifiable), estimated values
 *   (reference-based), and system-level inferences (derived from profiles).
 * - Does NOT recommend gram changes — findings only.
 *
 * Output sections:
 *   STATE        — what foods are in the registry and their provenance
 *   CONSTRAINTS  — declared macro targets per phase
 *   UNCERTAINTIES — which values are estimated and why
 *   FINDINGS     — food-level and phase-level truths
 *   PHASE AUDIT  — actual vs target per phase
 *   FINAL VERDICT — overall pass/warn/fail
 */

import { FoodPrimitive, MacroProfile } from "./food_primitive.js";
import { FOOD_REGISTRY, listLabelFoods, listEstimatedFoods } from "./food_registry.js";
import { computePhaseMacros, computePhaseDelta, MacroDelta, PhaseMacroResult } from "./macro_engine.js";
import { PhasePlan } from "./meal_types.js";

/* =========================================================
   Finding types
   ========================================================= */

export type FindingKind =
  | "LABEL_TRUTH"       // directly verifiable from a product label
  | "ESTIMATED_VALUE"   // from reference database; not label-verified
  | "SYSTEM_INFERENCE"; // derived from profile shape, not from a single label fact

export type FindingSeverity = "INFO" | "NOTE" | "WARNING";

export interface Finding {
  id:        string;
  kind:      FindingKind;
  severity:  FindingSeverity;
  subject:   string;
  statement: string;
  /** Source label or reference, if applicable. */
  source?:   string;
}

/* =========================================================
   Audit report sections
   ========================================================= */

export interface StateSection {
  labelVerifiedFoods: string[];
  estimatedFoods:     string[];
  summary:            string;
}

export interface ConstraintEntry {
  phaseId:  string;
  target:   MacroProfile;
}

export interface UncertaintyEntry {
  foodId:     string;
  reason:     string;
  confidence: "high" | "moderate" | "low";
}

export interface PhaseAuditEntry {
  phaseId:     string;
  target:      MacroProfile;
  actual:      MacroProfile;
  delta:       MacroDelta;
  /** PASS = all macros within ±5%, WARN = calories ok but macro imbalance, FAIL = calories off */
  status:      "PASS" | "WARN" | "FAIL";
  notes:       string[];
}

export type FinalVerdictStatus = "PASS" | "WARN" | "FAIL";

export interface FinalVerdict {
  status:  FinalVerdictStatus;
  summary: string;
  notes:   string[];
}

export interface AuditReport {
  generatedAt:   string;
  state:         StateSection;
  constraints:   ConstraintEntry[];
  uncertainties: UncertaintyEntry[];
  findings:      Finding[];
  phaseAudit:    PhaseAuditEntry[];
  finalVerdict:  FinalVerdict;
}

/* =========================================================
   Public API
   ========================================================= */

/**
 * runAudit — produces a full AuditReport for the given phase plans.
 *
 * Computes actual macros internally from the registry.
 * Does not recommend corrections.
 */
export function runAudit(plans: PhasePlan[]): AuditReport {
  const phaseResults = plans.map(computePhaseMacros);

  return {
    generatedAt:   new Date().toISOString(),
    state:         buildStateSection(),
    constraints:   plans.map(p => ({ phaseId: p.phaseId, target: p.target })),
    uncertainties: buildUncertainties(),
    findings:      buildFindings(),
    phaseAudit:    phaseResults.map(buildPhaseAuditEntry),
    finalVerdict:  buildFinalVerdict(phaseResults.map(r => buildPhaseAuditEntry(r))),
  };
}

/* =========================================================
   Section builders
   ========================================================= */

function buildStateSection(): StateSection {
  const labeled   = listLabelFoods().map(f => f.id);
  const estimated = listEstimatedFoods().map(f => f.id);

  return {
    labelVerifiedFoods: labeled,
    estimatedFoods:     estimated,
    summary: `${labeled.length} label-verified foods registered. ` +
             `${estimated.length} estimated foods registered. ` +
             `All macro values sourced from registry — no image parsing at runtime.`,
  };
}

function buildUncertainties(): UncertaintyEntry[] {
  return [
    {
      foodId:     "banana",
      reason:     "No product label available. Values sourced from USDA reference (medium banana ~118g).",
      confidence: "moderate",
    },
    {
      foodId:     "egg",
      reason:     "No product label available. Values sourced from USDA reference (large egg ~50g).",
      confidence: "moderate",
    },
    {
      foodId:     "flax",
      reason:     "Label value is verified for the specific product entered. Fat content varies by brand and grind.",
      confidence: "high",
    },
  ];
}

function buildFindings(): Finding[] {
  const findings: Finding[] = [];
  const reg = FOOD_REGISTRY;

  // ---- whey ----
  const whey = reg["whey"];
  if (whey) {
    findings.push({
      id:        "whey_macro_profile",
      kind:      "LABEL_TRUTH",
      severity:  "INFO",
      subject:   "whey",
      statement: `Whey protein is protein-dominant but not pure protein. ` +
                 `Per ${whey.referenceAmount}g serving: ${whey.macrosPerRef.protein}g protein, ` +
                 `${whey.macrosPerRef.carbs}g carbs, ${whey.macrosPerRef.fat}g fat. ` +
                 `Caloric contribution from non-protein macros must be accounted for in total calorie math.`,
      source: "label",
    });
    findings.push({
      id:        "whey_not_protein_only",
      kind:      "SYSTEM_INFERENCE",
      severity:  "NOTE",
      subject:   "whey",
      statement: `Treating whey as "pure protein" in manual calculations introduces error. ` +
                 `At ${whey.macrosPerRef.carbs}g carbs and ${whey.macrosPerRef.fat}g fat per serving, ` +
                 `these contributions accumulate meaningfully across phases with multiple daily servings.`,
    });
  }

  // ---- dextrin ----
  const dex = reg["dextrin"];
  if (dex) {
    findings.push({
      id:        "dextrin_clean_carb_lever",
      kind:      "LABEL_TRUTH",
      severity:  "INFO",
      subject:   "dextrin",
      statement: `Cyclic dextrin is a clean carb lever. ` +
                 `Per ${dex.referenceAmount}g serving: ${dex.macrosPerRef.carbs}g carbs, ` +
                 `${dex.macrosPerRef.protein}g protein, ${dex.macrosPerRef.fat}g fat. ` +
                 `Adjusting dextrin grams affects carbs and calories only — no protein or fat side-effects.`,
      source: "label",
    });
  }

  // ---- oats ----
  const oats = reg["oats"];
  if (oats) {
    findings.push({
      id:        "oats_mixed_carb_source",
      kind:      "LABEL_TRUTH",
      severity:  "INFO",
      subject:   "oats",
      statement: `Oats are carb-dominant but carry non-trivial protein and fat. ` +
                 `Per ${oats.referenceAmount}g serving: ${oats.macrosPerRef.carbs}g carbs, ` +
                 `${oats.macrosPerRef.protein}g protein, ${oats.macrosPerRef.fat}g fat. ` +
                 `Reducing oats to fix carb excess will also reduce protein and fat — ` +
                 `corrections involving oats must be validated across all three macros.`,
      source: "label",
    });
  }

  // ---- yogurt ----
  const yogurt = reg["yogurt"];
  if (yogurt) {
    findings.push({
      id:        "yogurt_protein_and_fat",
      kind:      "LABEL_TRUTH",
      severity:  "INFO",
      subject:   "yogurt",
      statement: `Greek yogurt contributes protein and fat. ` +
                 `Per unit: ${yogurt.macrosPerRef.protein}g protein, ` +
                 `${yogurt.macrosPerRef.fat}g fat, ${yogurt.macrosPerRef.carbs}g carbs. ` +
                 `It is not a pure protein source and its fat contribution must not be ignored.`,
      source: "label",
    });
  }

  // ---- flax ----
  const flax = reg["flax"];
  if (flax) {
    findings.push({
      id:        "flax_mixed_macro_lever",
      kind:      "LABEL_TRUTH",
      severity:  "NOTE",
      subject:   "flax",
      statement: `Ground flaxseed is a mixed-macro source. ` +
                 `Per ${flax.referenceAmount}g serving: ${flax.macrosPerRef.fat}g fat, ` +
                 `${flax.macrosPerRef.carbs}g carbs, ${flax.macrosPerRef.protein}g protein. ` +
                 `Fat density is ${((flax.macrosPerRef.fat / flax.referenceAmount) * 100).toFixed(1)}% by weight — ` +
                 `low enough that flax should not be treated as a primary fat-restoration lever. ` +
                 `Large amounts of flax would be required to meaningfully shift fat macros, ` +
                 `bringing significant carb and protein side-load.`,
      source: "label",
    });
    findings.push({
      id:        "flax_not_primary_fat_lever",
      kind:      "SYSTEM_INFERENCE",
      severity:  "WARNING",
      subject:   "flax",
      statement: `Flax should not automatically be chosen as the primary fat-correction lever. ` +
                 `Eggs provide a higher fat-to-volume ratio (5g fat per egg vs ${flax.macrosPerRef.fat}g fat per ${flax.referenceAmount}g flax) ` +
                 `and introduce less macro side-load when fat restoration is needed.`,
    });
  }

  // ---- egg ----
  const egg = reg["egg"];
  if (egg) {
    findings.push({
      id:        "egg_efficient_fat_source",
      kind:      "ESTIMATED_VALUE",
      severity:  "INFO",
      subject:   "egg",
      statement: `Egg is an efficient fat lever with useful protein co-load. ` +
                 `Per unit: ${egg.macrosPerRef.fat}g fat, ${egg.macrosPerRef.protein}g protein, ` +
                 `${egg.macrosPerRef.carbs}g carbs. ` +
                 `Values are estimated from USDA reference; verify against actual product if precision is required.`,
      source: "estimated",
    });
  }

  return findings;
}

function buildPhaseAuditEntry(result: PhaseMacroResult): PhaseAuditEntry {
  const { phaseId, target, totals: actual, delta } = result;
  const notes: string[] = [];

  const calPct    = target.calories > 0 ? (Math.abs(delta.calories) / target.calories) * 100 : 0;
  const proteinOk = Math.abs(delta.protein)  <= 5;
  const carbsOk   = Math.abs(delta.carbs)    <= 10;
  const fatOk     = Math.abs(delta.fat)      <= 5;
  const calOk     = calPct <= 5;

  if (!proteinOk) notes.push(`Protein delta ${delta.protein > 0 ? "+" : ""}${delta.protein.toFixed(1)}g — outside ±5g tolerance.`);
  if (!carbsOk)   notes.push(`Carbs delta ${delta.carbs > 0 ? "+" : ""}${delta.carbs.toFixed(1)}g — outside ±10g tolerance.`);
  if (!fatOk)     notes.push(`Fat delta ${delta.fat > 0 ? "+" : ""}${delta.fat.toFixed(1)}g — outside ±5g tolerance.`);
  if (!calOk)     notes.push(`Calories ${calPct.toFixed(1)}% from target — outside ±5% tolerance.`);

  let status: PhaseAuditEntry["status"];
  if (!calOk) {
    status = "FAIL";
  } else if (!proteinOk || !carbsOk || !fatOk) {
    status = "WARN";
  } else {
    status = "PASS";
  }

  if (status === "PASS") notes.push("All macros within tolerance.");

  return { phaseId, target, actual, delta, status, notes };
}

function buildFinalVerdict(entries: PhaseAuditEntry[]): FinalVerdict {
  const failCount = entries.filter(e => e.status === "FAIL").length;
  const warnCount = entries.filter(e => e.status === "WARN").length;

  let status: FinalVerdictStatus;
  let summary: string;
  const notes: string[] = [];

  if (failCount > 0) {
    status  = "FAIL";
    summary = `${failCount} phase(s) have caloric deviation exceeding ±5% of target.`;
    entries.filter(e => e.status === "FAIL").forEach(e =>
      notes.push(`${e.phaseId}: calories ${e.delta.calories > 0 ? "+" : ""}${e.delta.calories.toFixed(0)} kcal vs target.`)
    );
  } else if (warnCount > 0) {
    status  = "WARN";
    summary = `${warnCount} phase(s) have macro imbalances within calorie tolerance.`;
    entries.filter(e => e.status === "WARN").forEach(e =>
      notes.push(`${e.phaseId}: ${e.notes.join(" ")}`)
    );
  } else {
    status  = "PASS";
    summary = `All ${entries.length} phase(s) pass macro and calorie tolerance checks.`;
  }

  notes.push("Correction has not been applied. This is a truth audit only.");
  return { status, summary, notes };
}
