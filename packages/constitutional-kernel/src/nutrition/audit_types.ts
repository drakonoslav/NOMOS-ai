/**
 * audit_types.ts
 *
 * All shared types for the NOMOS truth-audit layer.
 *
 * Separated from audit_engine.ts so other modules can import audit
 * types without importing the full engine and its dependencies.
 *
 * Sections of an AuditReport match the NOMOS output schema:
 *   STATE        — what foods are registered and their provenance
 *   CONSTRAINTS  — declared macro targets per phase
 *   UNCERTAINTIES — estimated values and confidence ratings
 *   FINDINGS     — food-level label truths and system inferences
 *   PHASE_AUDIT  — per-phase actual vs target with drift and faithfulness
 *   FINAL_VERDICT — overall system pass/warn/fail
 */

import { MacroProfile } from "./food_primitive.js";
import { MacroDelta } from "./macro_engine.js";

/* =========================================================
   Finding
   ========================================================= */

/**
 * Classifies the epistemic basis of one finding.
 *
 *   LABEL_TRUTH      — derived directly from a verified product nutrition label.
 *                      These conclusions are as reliable as the label itself.
 *
 *   ESTIMATED_VALUE  — derived from a reference database (e.g. USDA).
 *                      Accurate for planning purposes; not label-verified for
 *                      the specific product in use.
 *
 *   SYSTEM_INFERENCE — derived by reasoning across the profile shape.
 *                      These conclusions are correct given the label data,
 *                      but are not a direct reading of any single label line.
 */
export type FindingKind =
  | "LABEL_TRUTH"
  | "ESTIMATED_VALUE"
  | "SYSTEM_INFERENCE";

/** Display severity of a finding. Does not affect audit status. */
export type FindingSeverity = "INFO" | "NOTE" | "WARNING";

/**
 * One discrete truth-claim produced by the audit engine.
 */
export interface Finding {
  /** Unique identifier for this finding across the audit. */
  id: string;
  /** Epistemic basis — how this conclusion was reached. */
  kind: FindingKind;
  /** Display severity. */
  severity: FindingSeverity;
  /** The food or concept this finding is about. */
  subject: string;
  /** The finding statement in plain language. */
  statement: string;
  /** Original data source, if directly traceable ("label", "estimated", etc.). */
  source?: string;
}

/* =========================================================
   STATE section
   ========================================================= */

export interface StateSection {
  /** foodIds of all label-verified registry entries. */
  labelVerifiedFoods: string[];
  /** foodIds of all estimated registry entries. */
  estimatedFoods: string[];
  /** One-sentence summary of registry provenance. */
  summary: string;
}

/* =========================================================
   CONSTRAINTS section
   ========================================================= */

/** Declared daily macro target for one phase. */
export interface ConstraintEntry {
  phaseId: string;
  target:  MacroProfile;
}

/* =========================================================
   UNCERTAINTIES section
   ========================================================= */

/**
 * An explicit acknowledgement of a data gap or source limitation.
 * Surfaced in the UNCERTAINTIES section so the user knows where
 * the system is reasoning from reference data rather than labels.
 */
export interface UncertaintyEntry {
  foodId:     string;
  reason:     string;
  confidence: "high" | "moderate" | "low";
}

/* =========================================================
   PHASE_AUDIT section
   ========================================================= */

/**
 * Audit result for one phase — compares actual macros against the
 * declared target and characterises the gap.
 */
export interface PhaseAuditEntry {
  phaseId: string;
  target:  MacroProfile;
  actual:  MacroProfile;

  /**
   * Signed delta: actual − target.
   *   positive → over target
   *   negative → under target
   */
  delta: MacroDelta;

  /**
   * Human-readable drift summary.
   * Lists only the macros that are outside tolerance.
   * Example: "Carbs over by +51.0g. Fat under by -8.5g."
   */
  driftSummary: string;

  /**
   * Whether all foods in this phase have source="label".
   * false if any food in the phase relies on estimated values.
   * Phases that use banana or egg are not fully label-faithful.
   */
  labelFaithful: boolean;

  /**
   * Whether the audit engine considers a correction pass warranted.
   * true for WARN and FAIL. false for PASS.
   */
  correctionNeeded: boolean;

  /**
   * PASS  — all macros within tolerance.
   * WARN  — calories are within ±5% but one or more macros are out of range.
   * FAIL  — caloric deviation exceeds ±5% of target.
   */
  status: "PASS" | "WARN" | "FAIL";

  /** Plain-language notes explaining which tolerances were breached. */
  notes: string[];
}

/* =========================================================
   FINAL_VERDICT section
   ========================================================= */

export type FinalVerdictStatus = "PASS" | "WARN" | "FAIL";

export interface FinalVerdict {
  status:  FinalVerdictStatus;
  summary: string;
  notes:   string[];
}

/* =========================================================
   Full AuditReport
   ========================================================= */

/**
 * Complete output of one audit run.
 * Contains all six sections of the NOMOS audit schema.
 */
export interface AuditReport {
  /** ISO 8601 timestamp of when the audit was generated. */
  generatedAt:   string;
  state:         StateSection;
  constraints:   ConstraintEntry[];
  uncertainties: UncertaintyEntry[];
  findings:      Finding[];
  phaseAudit:    PhaseAuditEntry[];
  finalVerdict:  FinalVerdict;
}
