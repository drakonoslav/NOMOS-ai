/**
 * constraint_compiler.ts  (dashboard compiler)
 *
 * Compiles raw constraint strings into typed, structured CompiledConstraint objects.
 *
 * Constitutional role:
 * - Deterministically classifies each raw constraint into one of five kinds:
 *     STRUCTURAL_LOCK       — structure must be exactly preserved
 *     ALLOWED_ACTION        — only a defined set of action types is permitted
 *     TARGET_TOLERANCE      — a value must be minimized (guidance, not prohibition)
 *     SOURCE_TRUTH          — a data source is declared authoritative
 *     INTERPRETATION_REQUIRED — constraint could not be deterministically classified
 * - Produces a decisiveVariable for UI display, replacing "constraint interpretation"
 *   wherever a typed rule can be applied.
 * - Only uses INTERPRETATION_REQUIRED when no typed rule matches.
 * - Pure and deterministic: same input always produces the same output.
 *
 * Usage:
 *   const compiled = compileConstraints(draft.constraints);
 *   const deduped  = dedupeConstraints(compiled);  // see constraint_dedupe.ts
 *
 * Design:
 * - Each compiled constraint carries key, operator, lhs, rhs for the evaluator
 *   to reference. These are symbolic names, not computed values — the actual
 *   runtime values come from the candidate description.
 * - UI DISPLAY CLASSIFIER ONLY. The authoritative constraint classification
 *   is performed by the kernel (packages/constitutional-kernel/src/evaluation/
 *   constraint_normalizer.ts) during API evaluation.
 * - Kind strings are imported from the generated API contract (lib/api-spec/openapi.yaml
 *   → lib/api-client-react). Adding a new kernel kind requires updating the spec first.
 *   This table is then updated to emit the new kind string — no parallel type to maintain.
 */

import { normalizeConstraintText } from "./text_normalizer";
import type { ConstraintKind } from "@workspace/api-client-react";

export type { ConstraintKind };

/* =========================================================
   Types
   ========================================================= */

export type CompiledConstraintOperator =
  | "MUST_EQUAL"
  | "MINIMIZE_ABS_DELTA"
  | "SUBSET_OF"
  | "SOURCE_PRIORITY"
  | "ALLOW_ESTIMATED"
  | "MINIMIZE_CHANGESET";

export interface CompiledConstraint {
  /** Original unmodified constraint text. */
  raw: string;
  /** Constraint type after deterministic classification. Canonical strings from the API spec. */
  kind: ConstraintKind;
  /** Stable key within its kind. */
  key: string;
  /** Evaluation operator — null for INTERPRETATION_REQUIRED. */
  operator: CompiledConstraintOperator | null;
  /** Left-hand side variable name — null for INTERPRETATION_REQUIRED. */
  lhs: string | null;
  /** Right-hand side reference name — null for INTERPRETATION_REQUIRED. */
  rhs: string | null;
  /** Variable name shown in the UI as the decisive factor. */
  decisiveVariable: string;
}

/* =========================================================
   Rule table
   ========================================================= */

interface CompilerRule {
  match: (normalized: string) => boolean;
  produce: (raw: string) => CompiledConstraint;
}

const RULES: CompilerRule[] = [

  /* ---------- STRUCTURAL_LOCK: protein placement ---------- */
  {
    match: (t) =>
      t.includes("protein placement") ||
      t.includes("do not move protein") ||
      t.includes("preserve protein placement") ||
      (t.includes("protein") && t.includes("between meals")),
    produce: (raw) => ({
      raw,
      kind: "NUTRITION_STRUCTURAL_LOCK",
      key: "preserve_protein_placement",
      operator: "MUST_EQUAL",
      lhs: "protein_placement_map",
      rhs: "baseline_protein_placement_map",
      decisiveVariable: "protein placement",
    }),
  },

  /* ---------- STRUCTURAL_LOCK: meal order ---------- */
  {
    match: (t) =>
      t.includes("meal order") ||
      t.includes("do not change meal order") ||
      t.includes("preserve meal order") ||
      t.includes("do not reorder meal"),
    produce: (raw) => ({
      raw,
      kind: "NUTRITION_STRUCTURAL_LOCK",
      key: "preserve_meal_order",
      operator: "MUST_EQUAL",
      lhs: "meal_order",
      rhs: "baseline_meal_order",
      decisiveVariable: "meal order",
    }),
  },

  /* ---------- STRUCTURAL_LOCK: meal count ---------- */
  {
    match: (t) =>
      t.includes("do not remove meals") ||
      t.includes("do not remove meal") ||
      t.includes("preserve meal count") ||
      t.includes("no meal removal") ||
      (t.includes("remove") && t.includes("meal")),
    produce: (raw) => ({
      raw,
      kind: "NUTRITION_STRUCTURAL_LOCK",
      key: "preserve_meal_count",
      operator: "MUST_EQUAL",
      lhs: "meal_count",
      rhs: "baseline_meal_count",
      decisiveVariable: "meal count",
    }),
  },

  /* ---------- STRUCTURAL_LOCK: meal dispersal ---------- */
  {
    match: (t) =>
      t.includes("dispersal") ||
      t.includes("meal plan dispersal") ||
      t.includes("botch") ||
      t.includes("timeblock") ||
      t.includes("time block") ||
      t.includes("time-block"),
    produce: (raw) => ({
      raw,
      kind: "NUTRITION_STRUCTURAL_LOCK",
      key: "preserve_meal_dispersal",
      operator: "MUST_EQUAL",
      lhs: "meal_timeblock_pattern",
      rhs: "baseline_timeblock_pattern",
      decisiveVariable: "meal dispersal",
    }),
  },

  /* ---------- ALLOWED_ACTION: adjustment scope ---------- */
  {
    match: (t) =>
      t.includes("only adjust gram") ||
      t.includes("already-present foods") ||
      t.includes("already present foods") ||
      t.includes("gram amounts of already") ||
      t.includes("unit counts of already") ||
      (t.includes("adjust") && t.includes("gram") && t.includes("present")) ||
      (t.includes("only adjust") && t.includes("food")),
    produce: (raw) => ({
      raw,
      kind: "NUTRITION_ALLOWED_ACTION",
      key: "adjustment_scope",
      operator: "SUBSET_OF",
      lhs: "adjusted_food_ids",
      rhs: "baseline_food_ids",
      decisiveVariable: "disallowed food adjustment",
    }),
  },

  /* ---------- TARGET_TOLERANCE: calorie delta ---------- */
  {
    match: (t) =>
      t.includes("calorie") &&
      (t.includes("lockdown") ||
        t.includes("lock down") ||
        t.includes("tightly as possible") ||
        t.includes("as tight") ||
        t.includes("as close as possible")),
    produce: (raw) => ({
      raw,
      kind: "NUTRITION_TARGET_TOLERANCE",
      key: "calorie_delta_minimize",
      operator: "MINIMIZE_ABS_DELTA",
      lhs: "actual_calories",
      rhs: "target_calories",
      decisiveVariable: "calorie delta",
    }),
  },

  /* ---------- TARGET_TOLERANCE: change magnitude ---------- */
  {
    match: (t) =>
      (t.includes("prefer") || t.includes("minimize")) &&
      (t.includes("structure-preserving") ||
        t.includes("minimal change") ||
        t.includes("minimal structure") ||
        t.includes("smallest change") ||
        t.includes("fewest changes")),
    produce: (raw) => ({
      raw,
      kind: "NUTRITION_TARGET_TOLERANCE",
      key: "minimize_change_magnitude",
      operator: "MINIMIZE_CHANGESET",
      lhs: "proposed_changes",
      rhs: "minimal_changeset",
      decisiveVariable: "change magnitude",
    }),
  },

  /* ---------- SOURCE_TRUTH: declared macros ---------- */
  {
    match: (t) =>
      (t.includes("declared") && t.includes("macro") && t.includes("truth")) ||
      (t.includes("use declared") && t.includes("macro")) ||
      (t.includes("macro values") && t.includes("truth")) ||
      t.includes("declared macro values as truth"),
    produce: (raw) => ({
      raw,
      kind: "NUTRITION_SOURCE_TRUTH",
      key: "declared_macros_override",
      operator: "SOURCE_PRIORITY",
      lhs: "macro_source",
      rhs: "declared_food_registry",
      decisiveVariable: "macro source",
    }),
  },

  /* ---------- SOURCE_TRUTH: estimated defaults ---------- */
  {
    match: (t) =>
      t.includes("estimated default") ||
      (t.includes("treat") && t.includes("estimated")) ||
      (t.includes("as estimated") && t.includes("default")),
    produce: (raw) => ({
      raw,
      kind: "NUTRITION_SOURCE_TRUTH",
      key: "estimated_defaults_allowed",
      operator: "ALLOW_ESTIMATED",
      lhs: "food_ids",
      rhs: "estimated_defaults_registry",
      decisiveVariable: "estimated defaults",
    }),
  },

  /* ---------- SOURCE_TRUTH: label priority ---------- */
  {
    match: (t) =>
      t.includes("label truth") ||
      t.includes("label priority") ||
      (t.includes("label") && t.includes("override") && t.includes("food")) ||
      (t.includes("labels") && t.includes("provided") && t.includes("override")) ||
      // "Use attached food labels as source truth where provided."
      (t.includes("label") && t.includes("as source truth")) ||
      (t.includes("labels") && t.includes("source truth")) ||
      (t.includes("food label") && t.includes("source truth")) ||
      (t.includes("attached") && t.includes("label") && t.includes("source truth")),
    produce: (raw) => ({
      raw,
      kind: "NUTRITION_SOURCE_TRUTH",
      key: "label_priority",
      operator: "SOURCE_PRIORITY",
      lhs: "macro_source",
      rhs: "attached_labels",
      decisiveVariable: "macro source conflict",
    }),
  },

  /* ---------- ALLOWED_ACTION: inference scope ---------- */
  {
    match: (t) =>
      // "Do not infer food behavior that is not supported by declared labels or source data."
      (t.includes("do not infer") && t.includes("food")) ||
      (t.includes("not infer") && t.includes("declared")) ||
      t.includes("not supported by declared labels") ||
      t.includes("not supported by declared") ||
      (t.includes("infer") && t.includes("declared labels")),
    produce: (raw) => ({
      raw,
      kind: "NUTRITION_ALLOWED_ACTION",
      key: "inference_scope",
      operator: "SUBSET_OF",
      lhs: "inference_basis",
      rhs: "declared_labels_and_source_data",
      decisiveVariable: "disallowed food inference",
    }),
  },
];

/* =========================================================
   Compiler entry point
   ========================================================= */

/**
 * Compiles a single raw constraint string into a CompiledConstraint.
 *
 * Tries each rule in order; returns the first match.
 * Falls through to INTERPRETATION_REQUIRED if no rule matches.
 */
export function compileConstraint(raw: string): CompiledConstraint {
  const normalized = normalizeConstraintText(raw);

  for (const rule of RULES) {
    if (rule.match(normalized)) {
      return rule.produce(raw);
    }
  }

  return {
    raw,
    kind: "INTERPRETATION_REQUIRED",
    key: "unresolved",
    operator: null,
    lhs: null,
    rhs: null,
    decisiveVariable: "constraint interpretation",
  };
}

/**
 * Compiles a list of raw constraint strings.
 * Preserves order; does not deduplicate (see constraint_dedupe.ts).
 */
export function compileConstraints(raws: string[]): CompiledConstraint[] {
  return raws.map(compileConstraint);
}

/**
 * Returns the count of constraints that require manual interpretation.
 * Zero means all constraints were typed deterministically.
 */
export function unresolvedConstraintCount(compiled: CompiledConstraint[]): number {
  return compiled.filter((c) => c.kind === "INTERPRETATION_REQUIRED").length;
}

/**
 * Returns the decisive variable to display for a candidate evaluation result,
 * replacing "constraint interpretation" with an actual typed variable when
 * at least one deterministic typed constraint is present.
 *
 * Priority: STRUCTURAL_LOCK > ALLOWED_ACTION > TARGET_TOLERANCE > SOURCE_TRUTH.
 * Falls back to "constraint interpretation" only if all are INTERPRETATION_REQUIRED.
 */
export function resolveDisplayDecisiveVariable(
  compiled: CompiledConstraint[],
  apiDecisiveVariable: string
): string {
  if (apiDecisiveVariable !== "constraint interpretation") {
    return apiDecisiveVariable;
  }

  const priority: ConstraintKind[] = [
    "NUTRITION_STRUCTURAL_LOCK",
    "NUTRITION_ALLOWED_ACTION",
    "NUTRITION_TARGET_TOLERANCE",
    "NUTRITION_SOURCE_TRUTH",
  ];

  for (const kind of priority) {
    const match = compiled.find((c) => c.kind === kind);
    if (match) return match.decisiveVariable;
  }

  return "constraint interpretation";
}
