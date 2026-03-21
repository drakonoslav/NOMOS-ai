/**
 * audit_engine.ts
 *
 * Truth-audit layer for NOMOS nutrition evaluation.
 *
 * Constitutional role:
 * - Explains what the registered food labels actually license before any
 *   correction is attempted.
 * - Distinguishes between LABEL_TRUTH, ESTIMATED_VALUE, and SYSTEM_INFERENCE.
 * - Does NOT recommend gram changes — findings and verdicts only.
 *
 * All shared types live in audit_types.ts.
 * This file contains only the computation logic.
 *
 * Output sections (NOMOS schema):
 *   STATE          — what foods are registered and their provenance
 *   CONSTRAINTS    — declared macro targets per phase
 *   UNCERTAINTIES  — estimated values and confidence ratings
 *   FINDINGS       — food-level label truths and system inferences
 *   PHASE_AUDIT    — actual vs target with drift direction and faithfulness
 *   FINAL_VERDICT  — overall system pass/warn/fail
 */

import { FOOD_REGISTRY, listLabelFoods, listEstimatedFoods } from "./food_registry.js";
import { computePhaseMacros, PhaseMacroResult } from "./macro_engine.js";
import { PhasePlan } from "./meal_types.js";
import {
  AuditReport,
  ConstraintEntry,
  FinalVerdict,
  FinalVerdictStatus,
  Finding,
  PhaseAuditEntry,
  StateSection,
  UncertaintyEntry,
} from "./audit_types.js";

// Re-export all types so callers can import from a single location.
export type {
  AuditReport,
  ConstraintEntry,
  FinalVerdict,
  FinalVerdictStatus,
  Finding,
  FindingKind,
  FindingSeverity,
  PhaseAuditEntry,
  StateSection,
  UncertaintyEntry,
} from "./audit_types.js";

/* =========================================================
   Public API
   ========================================================= */

/**
 * runAudit — produces a full AuditReport for the given phase plans.
 *
 * Computes actual macros internally from the food registry.
 * Does not recommend corrections or modify any plan.
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
    finalVerdict:  buildFinalVerdict(phaseResults.map(buildPhaseAuditEntry)),
  };
}

/* =========================================================
   STATE
   ========================================================= */

function buildStateSection(): StateSection {
  const labeled   = listLabelFoods().map(f => f.id);
  const estimated = listEstimatedFoods().map(f => f.id);

  return {
    labelVerifiedFoods: labeled,
    estimatedFoods:     estimated,
    summary:
      `${labeled.length} label-verified foods registered ` +
      `(${labeled.join(", ")}). ` +
      `${estimated.length} estimated foods registered ` +
      `(${estimated.join(", ")}). ` +
      `All macro values sourced from registry — no image parsing at runtime.`,
  };
}

/* =========================================================
   UNCERTAINTIES
   ========================================================= */

function buildUncertainties(): UncertaintyEntry[] {
  return [
    {
      foodId:     "banana",
      reason:
        "No product label available. Values sourced from USDA reference " +
        "(medium banana ~118g, 105 kcal). Actual macro content varies by ripeness and size.",
      confidence: "moderate",
    },
    {
      foodId:     "egg",
      reason:
        "No product label available. Values sourced from USDA reference " +
        "(large egg ~50g, 70 kcal). Actual macro content varies by preparation method " +
        "(whole vs. white only, cooking method).",
      confidence: "moderate",
    },
    {
      foodId:     "flax",
      reason:
        "Label value is verified for the specific product registered. " +
        "Fat content (particularly omega-3 ratio) varies by brand, grind coarseness, " +
        "and storage conditions. Confidence is high for the registered product only.",
      confidence: "high",
    },
  ];
}

/* =========================================================
   FINDINGS
   ========================================================= */

function buildFindings(): Finding[] {
  const findings: Finding[] = [];
  const reg = FOOD_REGISTRY;

  // ---- whey ----
  const whey = reg["whey"];
  if (whey) {
    findings.push({
      id:       "whey_macro_profile",
      kind:     "LABEL_TRUTH",
      severity: "INFO",
      subject:  "whey",
      statement:
        `Whey protein is protein-dominant but not pure protein. ` +
        `Per ${whey.referenceAmount}g serving: ${whey.macrosPerRef.protein}g protein, ` +
        `${whey.macrosPerRef.carbs}g carbs, ${whey.macrosPerRef.fat}g fat ` +
        `(${whey.macrosPerRef.calories} kcal). ` +
        `The non-protein macros are real and must be counted in total calorie math.`,
      source: "label",
    });
    findings.push({
      id:       "whey_not_protein_only",
      kind:     "SYSTEM_INFERENCE",
      severity: "NOTE",
      subject:  "whey",
      statement:
        `Treating whey as "pure protein" in manual calculations introduces compounding error. ` +
        `At ${whey.macrosPerRef.carbs}g carbs and ${whey.macrosPerRef.fat}g fat per ${whey.referenceAmount}g serving, ` +
        `a plan using two whey servings per day carries ` +
        `${whey.macrosPerRef.carbs * 2}g unlabelled carbs and ` +
        `${whey.macrosPerRef.fat * 2}g unlabelled fat.`,
    });
  }

  // ---- dextrin ----
  const dex = reg["dextrin"];
  if (dex) {
    findings.push({
      id:       "dextrin_clean_carb_lever",
      kind:     "LABEL_TRUTH",
      severity: "INFO",
      subject:  "dextrin",
      statement:
        `Cyclic dextrin is a clean carb lever with no protein or fat side-load. ` +
        `Per ${dex.referenceAmount}g serving: ${dex.macrosPerRef.carbs}g carbs, ` +
        `${dex.macrosPerRef.protein}g protein, ${dex.macrosPerRef.fat}g fat ` +
        `(${dex.macrosPerRef.calories} kcal). ` +
        `Adjusting dextrin grams shifts carbs and calories precisely — ` +
        `protein and fat are unaffected.`,
      source: "label",
    });
  }

  // ---- oats ----
  const oats = reg["oats"];
  if (oats) {
    const carbPct = ((oats.macrosPerRef.carbs / oats.referenceAmount) * 100).toFixed(1);
    findings.push({
      id:       "oats_mixed_carb_source",
      kind:     "LABEL_TRUTH",
      severity: "INFO",
      subject:  "oats",
      statement:
        `Oats are carb-dominant (${carbPct}% carbs by weight) but carry non-trivial protein and fat. ` +
        `Per ${oats.referenceAmount}g serving: ${oats.macrosPerRef.carbs}g carbs, ` +
        `${oats.macrosPerRef.protein}g protein, ${oats.macrosPerRef.fat}g fat ` +
        `(${oats.macrosPerRef.calories} kcal). ` +
        `Any correction that reduces oats to lower carbs will simultaneously ` +
        `reduce protein and fat. All three macros must be re-verified after an oats adjustment.`,
      source: "label",
    });
  }

  // ---- yogurt ----
  const yogurt = reg["yogurt"];
  if (yogurt) {
    findings.push({
      id:       "yogurt_protein_and_fat",
      kind:     "LABEL_TRUTH",
      severity: "INFO",
      subject:  "yogurt",
      statement:
        `Greek yogurt contributes protein and fat and must not be treated as a pure protein source. ` +
        `Per unit: ${yogurt.macrosPerRef.protein}g protein, ${yogurt.macrosPerRef.fat}g fat, ` +
        `${yogurt.macrosPerRef.carbs}g carbs (${yogurt.macrosPerRef.calories} kcal). ` +
        `Its fat contribution is real and accumulates across phases where multiple units are used.`,
      source: "label",
    });
  }

  // ---- flax ----
  const flax = reg["flax"];
  if (flax) {
    const fatDensityPct = ((flax.macrosPerRef.fat / flax.referenceAmount) * 100).toFixed(1);
    findings.push({
      id:       "flax_mixed_macro_lever",
      kind:     "LABEL_TRUTH",
      severity: "NOTE",
      subject:  "flax",
      statement:
        `Ground flaxseed provides mixed macros across all three categories. ` +
        `Per ${flax.referenceAmount}g serving: ${flax.macrosPerRef.fat}g fat, ` +
        `${flax.macrosPerRef.carbs}g carbs, ${flax.macrosPerRef.protein}g protein ` +
        `(${flax.macrosPerRef.calories} kcal). ` +
        `Fat density is ${fatDensityPct}% by weight — comparatively low. ` +
        `Closing a meaningful fat deficit with flax alone would require large gram increases ` +
        `that also raise carbs and protein significantly.`,
      source: "label",
    });
    findings.push({
      id:       "flax_not_primary_fat_lever",
      kind:     "SYSTEM_INFERENCE",
      severity: "WARNING",
      subject:  "flax",
      statement:
        `Flax should not automatically be selected as the primary fat-restoration lever. ` +
        `Eggs deliver ${reg["egg"] ? reg["egg"].macrosPerRef.fat : 5}g fat per unit ` +
        `versus ${flax.macrosPerRef.fat}g fat per ${flax.referenceAmount}g flax serving. ` +
        `When fat restoration is needed, eggs are the more efficient first lever; ` +
        `flax is appropriate as a secondary lever or for smaller top-up corrections.`,
    });
  }

  // ---- egg ----
  const egg = reg["egg"];
  if (egg) {
    findings.push({
      id:       "egg_efficient_fat_source",
      kind:     "ESTIMATED_VALUE",
      severity: "INFO",
      subject:  "egg",
      statement:
        `Egg is the most efficient fat lever available in this registry. ` +
        `Per unit: ${egg.macrosPerRef.fat}g fat, ${egg.macrosPerRef.protein}g protein, ` +
        `${egg.macrosPerRef.carbs}g carbs (${egg.macrosPerRef.calories} kcal). ` +
        `The protein co-load is a benefit for phases targeting elevated protein. ` +
        `Values are USDA-estimated — verify against the actual product for label-level precision.`,
      source: "estimated",
    });
  }

  return findings;
}

/* =========================================================
   PHASE_AUDIT
   ========================================================= */

/** Tolerances used to classify each macro drift. */
const TOLERANCES = {
  calPct:  5,   // percentage of target calories
  protein: 5,   // grams
  carbs:   10,  // grams
  fat:     5,   // grams
} as const;

function buildPhaseAuditEntry(result: PhaseMacroResult): PhaseAuditEntry {
  const { phaseId, target, totals: actual, delta } = result;
  const notes: string[] = [];

  // ---- tolerance checks ----
  const calPct    = target.calories > 0
    ? (Math.abs(delta.calories) / target.calories) * 100
    : 0;
  const proteinOk = Math.abs(delta.protein)  <= TOLERANCES.protein;
  const carbsOk   = Math.abs(delta.carbs)    <= TOLERANCES.carbs;
  const fatOk     = Math.abs(delta.fat)      <= TOLERANCES.fat;
  const calOk     = calPct <= TOLERANCES.calPct;

  if (!proteinOk) {
    notes.push(
      `Protein delta ${delta.protein > 0 ? "+" : ""}${delta.protein.toFixed(1)}g ` +
      `— outside ±${TOLERANCES.protein}g tolerance.`
    );
  }
  if (!carbsOk) {
    notes.push(
      `Carbs delta ${delta.carbs > 0 ? "+" : ""}${delta.carbs.toFixed(1)}g ` +
      `— outside ±${TOLERANCES.carbs}g tolerance.`
    );
  }
  if (!fatOk) {
    notes.push(
      `Fat delta ${delta.fat > 0 ? "+" : ""}${delta.fat.toFixed(1)}g ` +
      `— outside ±${TOLERANCES.fat}g tolerance.`
    );
  }
  if (!calOk) {
    notes.push(
      `Calories ${calPct.toFixed(1)}% from target ` +
      `(${delta.calories > 0 ? "+" : ""}${delta.calories.toFixed(0)} kcal) ` +
      `— outside ±${TOLERANCES.calPct}% tolerance.`
    );
  }

  // ---- status ----
  let status: PhaseAuditEntry["status"];
  if (!calOk) {
    status = "FAIL";
  } else if (!proteinOk || !carbsOk || !fatOk) {
    status = "WARN";
  } else {
    status = "PASS";
  }
  if (status === "PASS") notes.push("All macros within tolerance.");

  // ---- drift summary ----
  const driftParts: string[] = [];
  if (!calOk) {
    driftParts.push(
      `Calories ${delta.calories > 0 ? "over" : "under"} by ` +
      `${Math.abs(delta.calories).toFixed(0)} kcal (${calPct.toFixed(1)}%).`
    );
  }
  if (!proteinOk) {
    driftParts.push(
      `Protein ${delta.protein > 0 ? "over" : "under"} by ${Math.abs(delta.protein).toFixed(1)}g.`
    );
  }
  if (!carbsOk) {
    driftParts.push(
      `Carbs ${delta.carbs > 0 ? "over" : "under"} by ${Math.abs(delta.carbs).toFixed(1)}g.`
    );
  }
  if (!fatOk) {
    driftParts.push(
      `Fat ${delta.fat > 0 ? "over" : "under"} by ${Math.abs(delta.fat).toFixed(1)}g.`
    );
  }
  const driftSummary = driftParts.length > 0
    ? driftParts.join(" ")
    : "No macro drift outside tolerance.";

  // ---- label faithfulness ----
  // A phase is label-faithful only if every food it uses is label-verified.
  // If any meal contains a food with source="estimated", it is not fully faithful.
  const labelFaithful = result.meals.every(meal =>
    meal.foods.every(food => food.source === "label")
  );

  if (!labelFaithful) {
    const estimatedFoods = result.meals
      .flatMap(m => m.foods)
      .filter(f => f.source === "estimated")
      .map(f => f.foodId);
    const unique = [...new Set(estimatedFoods)];
    notes.push(
      `Not fully label-faithful — estimated foods present: ${unique.join(", ")}. ` +
      `Macro accuracy for these items depends on reference values, not verified labels.`
    );
  }

  // ---- correction needed ----
  const correctionNeeded = status !== "PASS";

  return {
    phaseId,
    target,
    actual,
    delta,
    driftSummary,
    labelFaithful,
    correctionNeeded,
    status,
    notes,
  };
}

/* =========================================================
   FINAL_VERDICT
   ========================================================= */

function buildFinalVerdict(entries: PhaseAuditEntry[]): FinalVerdict {
  const failCount = entries.filter(e => e.status === "FAIL").length;
  const warnCount = entries.filter(e => e.status === "WARN").length;
  const unfaithful = entries.filter(e => !e.labelFaithful).length;

  let status: FinalVerdictStatus;
  let summary: string;
  const notes: string[] = [];

  if (failCount > 0) {
    status  = "FAIL";
    summary =
      `${failCount} of ${entries.length} phase(s) have caloric deviation exceeding ` +
      `±${TOLERANCES.calPct}% of target.`;
    entries
      .filter(e => e.status === "FAIL")
      .forEach(e =>
        notes.push(
          `${e.phaseId}: ${e.driftSummary}`
        )
      );
  } else if (warnCount > 0) {
    status  = "WARN";
    summary =
      `${warnCount} of ${entries.length} phase(s) have macro imbalances within calorie tolerance.`;
    entries
      .filter(e => e.status === "WARN")
      .forEach(e =>
        notes.push(`${e.phaseId}: ${e.driftSummary}`)
      );
  } else {
    status  = "PASS";
    summary = `All ${entries.length} phase(s) pass macro and calorie tolerance checks.`;
  }

  if (unfaithful > 0) {
    notes.push(
      `${unfaithful} phase(s) use estimated foods (banana, egg). ` +
      `Macro totals for those phases are accurate to reference values, not verified labels.`
    );
  }

  notes.push("Correction has not been applied. This is a truth audit only.");
  return { status, summary, notes };
}
