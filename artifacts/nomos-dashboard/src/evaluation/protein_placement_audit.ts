/**
 * protein_placement_audit.ts
 *
 * Deterministic protein placement audit for NOMOS constitutional evaluation.
 *
 * Background
 * ----------
 * The nomos-core evaluator uses TEXT-SIGNAL matching to detect protein placement
 * violations. It looks for keywords like "move protein", "relocate protein" etc.
 * in the candidate description. This is correct for keyword-explicit candidates,
 * but it cannot verify structural placement truth against the declared meal plan.
 *
 * This module adds a STRUCTURAL LAYER:
 *   1. Extract the baseline protein placement map from the declared PhasePlan.
 *   2. Parse each candidate description for explicit protein food movements.
 *   3. Diff baseline vs candidate: which meals gained/lost which protein foods?
 *   4. Enforce the invariant: if a candidate's protein placement matches the
 *      baseline, the engine's decisive variable must not name a protein placement
 *      violation, and no protein-placement adjustment text may appear.
 *
 * This audit operates independently of the engine verdict. It is a
 * SECONDARY DISPLAY ENRICHMENT LAYER — not a ground-truth arbiter.
 * The authoritative verdict is the kernel's API response. This module
 * adds structural placement detail to the display report. If its
 * heuristics drift from the kernel's nutrition rules, the displayed
 * enrichment may disagree with the kernel verdict.
 *
 * Definitions
 * -----------
 * - "protein-bearing food": a food whose protein content per serving is ≥ the
 *   PROTEIN_BEARING_THRESHOLD (5g). Only these foods participate in protein
 *   placement tracking.
 * - "baseline": the protein placement map derived from the PhasePlan as declared.
 * - "candidate map": the protein placement map inferred from the candidate
 *   description by applying detected movements to the baseline.
 * - "placement match": candidate map equals baseline map (set equality per meal).
 *
 * Inference limitation
 * --------------------
 * Candidate descriptions are natural language. This parser detects explicit
 * movement patterns ("move X from meal N to meal M"). Implicit placement changes
 * (e.g. "consolidate meals 2 and 3") are not parsed — they are noted as
 * AMBIGUOUS with `inferenceConfidence: "low"`. In those cases, the structural
 * audit defers to the engine verdict.
 */

import type { CandidateEvaluationReport } from "./evaluation_report_types";

/**
 * Structural subset of PhasePlan used by this audit module.
 * Only the fields needed for protein placement extraction are declared here.
 * This mirrors the shape of nomos-core's PhasePlan without importing it,
 * keeping the dashboard test-tree free of kernel dependencies.
 */
export interface AuditPhasePlan {
  meals: Array<{
    mealNumber: number;
    foods: Array<{ foodId: string }>;
  }>;
}

/* =========================================================
   Constants
   ========================================================= */

/**
 * Minimum protein grams per declared serving to qualify as "protein-bearing".
 * Foods below this threshold do not participate in placement tracking.
 */
export const PROTEIN_BEARING_THRESHOLD_G = 5;

/**
 * Ordered list of food IDs that are protein-bearing under the declared registry.
 * Each entry passes the PROTEIN_BEARING_THRESHOLD_G check at declaration time.
 * If the registry changes, this list must be updated.
 *
 * Registry values at declaration:
 *   whey   → 28g protein / 37g serving   ✓
 *   yogurt → 20g protein / 1 unit serving ✓
 *   egg    → 6g  protein / 1 unit serving ✓  (borderline — included)
 *   oats   → 4g  protein / 32g serving   ✗
 *   flax   → 4g  protein / 14g serving   ✗
 *   banana → 1.3g protein / 1 unit       ✗
 *   dextrin→ 0g  protein                 ✗
 */
export const PROTEIN_BEARING_FOOD_IDS: ReadonlyArray<string> = [
  "whey",
  "yogurt",
  "egg",
];

/**
 * Display names for protein-bearing foods (used in debug output and explanations).
 */
export const PROTEIN_FOOD_DISPLAY: Readonly<Record<string, string>> = {
  whey:   "Whey Protein",
  yogurt: "Greek Yogurt",
  egg:    "Egg",
};

/* =========================================================
   Core types
   ========================================================= */

/**
 * Structural protein placement map.
 * Maps meal number (as string key) → sorted list of protein-bearing food IDs
 * present in that meal.
 *
 * Sorting is alphabetical so equality comparisons are order-independent.
 */
export type ProteinPlacementMap = Readonly<Record<string, ReadonlyArray<string>>>;

export interface ProteinPlacementDiff {
  /** Meals where the candidate is missing a protein food that was in the baseline. */
  missingProteinFoodsByMeal: Record<string, string[]>;

  /** Meals where the candidate has a protein food that was NOT in the baseline. */
  addedProteinFoodsByMeal: Record<string, string[]>;

  /**
   * Foods inferred to have moved between meals.
   * A move is inferred when a food appears in missingProteinFoodsByMeal for one
   * meal AND in addedProteinFoodsByMeal for a different meal.
   */
  movedProteinFoods: Array<{
    food: string;
    fromMeal: string;
    toMeal: string;
  }>;

  /** True if any protein food moved, was added, or was removed vs the baseline. */
  hasMovement: boolean;
}

export type InferenceConfidence = "high" | "low" | "none";

/** Per-candidate protein placement audit result. */
export interface ProteinPlacementAuditResult {
  candidateId: string;

  /** Baseline map (shared across all candidates — must not be mutated). */
  baselineMap: ProteinPlacementMap;

  /** Candidate map derived from the baseline + detected movements. */
  candidateMap: ProteinPlacementMap;

  diff: ProteinPlacementDiff;

  /**
   * True if candidateMap equals baselineMap (set equality per meal).
   * When true: the engine MUST NOT name a protein placement violation
   * for this candidate.
   */
  proteinPlacementMatchesBaseline: boolean;

  /**
   * Confidence in the candidate map inference.
   * - "high"  → explicit protein movement patterns detected and parsed
   * - "low"   → ambiguous description; movements may exist but were not parsed
   * - "none"  → no protein-food references detected; baseline assumed unchanged
   */
  inferenceConfidence: InferenceConfidence;

  /**
   * Deterministic explanation of the violation, if one exists.
   * null if proteinPlacementMatchesBaseline === true.
   */
  violationExplanation: string | null;

  /**
   * Raw signals detected in the candidate description.
   * Useful for debugging why a candidate was classified as it was.
   */
  detectedSignals: string[];
}

/** Invariant violation record. */
export interface PlacementInvariantViolation {
  invariant: "PI1" | "PI2";
  candidateId: string;
  detail: string;
}

/** Full protein placement audit report (all candidates). */
export interface ProteinPlacementAuditReport {
  phaseId: string;
  baselineMap: ProteinPlacementMap;
  candidates: ProteinPlacementAuditResult[];
  invariantViolations: PlacementInvariantViolation[];
}

/* =========================================================
   Baseline extraction
   ========================================================= */

/**
 * Extracts the protein placement map for the given PhasePlan.
 * Only protein-bearing foods (IDs in PROTEIN_BEARING_FOOD_IDS) are tracked.
 *
 * Returns a map keyed by meal number (string) → sorted array of food IDs.
 */
export function extractBaselineProteinPlacement(phase: AuditPhasePlan): ProteinPlacementMap {
  const map: Record<string, string[]> = {};

  for (const meal of phase.meals) {
    const key = String(meal.mealNumber);
    const proteinFoods = meal.foods
      .filter((f) => PROTEIN_BEARING_FOOD_IDS.includes(f.foodId))
      .map((f) => f.foodId)
      .sort();

    map[key] = proteinFoods;
  }

  return Object.freeze(map);
}

/* =========================================================
   Candidate map inference
   ========================================================= */

/**
 * Protein food alias lookup — maps natural language terms to food IDs.
 * Case-insensitive match at call sites.
 */
const FOOD_ALIAS_MAP: ReadonlyArray<{ aliases: string[]; foodId: string }> = [
  { aliases: ["whey", "whey protein", "protein powder", "protein shake"], foodId: "whey"   },
  { aliases: ["yogurt", "greek yogurt", "plain yogurt", "yogurt protein"], foodId: "yogurt" },
  { aliases: ["egg", "eggs", "whole egg", "large egg"],                    foodId: "egg"    },
];

function resolveFoodId(text: string): string | null {
  const lower = text.toLowerCase().trim();
  for (const entry of FOOD_ALIAS_MAP) {
    for (const alias of entry.aliases) {
      if (lower.includes(alias)) return entry.foodId;
    }
  }
  return null;
}

/**
 * Parses a meal reference like "meal 1", "meal one", "meal 2" into a string key.
 * Returns null if no meal number is found in the text.
 */
const MEAL_NUMBER_WORDS: Record<string, string> = {
  one:   "1", two:   "2", three: "3", four:  "4",
  five:  "5", six:   "6", seven: "7", eight: "8",
};

function parseMealNumber(text: string): string | null {
  // Digit form: "meal 2", "meal-3", "meal3"
  const digitMatch = text.match(/meal\s*[-#]?\s*(\d)/i);
  if (digitMatch) return digitMatch[1]!;

  // Word form: "meal one", "meal two"
  const wordMatch = text.match(/meal\s+(one|two|three|four|five|six|seven|eight)/i);
  if (wordMatch) return MEAL_NUMBER_WORDS[wordMatch[1]!.toLowerCase()] ?? null;

  return null;
}

/**
 * Movement pattern shapes and their parsers.
 * Each shape is tried in order; first match wins.
 */
interface ParsedMovement {
  food: string;         // foodId
  fromMeal: string | null;   // null if "add" only
  toMeal: string | null;     // null if "remove" only
  kind: "move" | "add" | "remove";
  rawSignal: string;
}

function parseMovements(description: string): ParsedMovement[] {
  const lower = description.toLowerCase();
  const movements: ParsedMovement[] = [];

  // Pattern 1: "move/relocate/transfer/shift/redistribute X from meal N to meal M"
  const movePattern =
    /(?:move|relocate|transfer|shift|redistribute|rearrange)\s+([a-z\s]+?)\s+from\s+meal\s*\d+\s+to\s+meal\s*\d+/gi;

  let m: RegExpExecArray | null;
  while ((m = movePattern.exec(description)) !== null) {
    const segment = m[0]!;
    const foodId = resolveFoodId(m[1]!);
    if (!foodId) continue;

    // Extract the two meal numbers from the matched segment
    const mealNumbers = segment.match(/meal\s*(\d)/gi);
    if (!mealNumbers || mealNumbers.length < 2) continue;

    const fromMeal = parseMealNumber(mealNumbers[0]!);
    const toMeal   = parseMealNumber(mealNumbers[1]!);
    if (!fromMeal || !toMeal) continue;

    movements.push({ food: foodId, fromMeal, toMeal, kind: "move", rawSignal: segment });
  }

  // Pattern 2: "add X to meal N"
  const addPattern = /(?:add|include|place)\s+([a-z\s]+?)\s+(?:to|in)\s+meal\s*\d+/gi;
  while ((m = addPattern.exec(description)) !== null) {
    const segment = m[0]!;
    const foodId = resolveFoodId(m[1]!);
    if (!foodId) continue;
    const toMeal = parseMealNumber(segment);
    if (!toMeal) continue;

    movements.push({ food: foodId, fromMeal: null, toMeal, kind: "add", rawSignal: segment });
  }

  // Pattern 3: "remove/eliminate X from meal N"
  const removePattern = /(?:remove|eliminate|drop|omit)\s+([a-z\s]+?)\s+from\s+meal\s*\d+/gi;
  while ((m = removePattern.exec(description)) !== null) {
    const segment = m[0]!;
    const foodId = resolveFoodId(m[1]!);
    if (!foodId) continue;
    const fromMeal = parseMealNumber(segment);
    if (!fromMeal) continue;

    movements.push({ food: foodId, fromMeal, toMeal: null, kind: "remove", rawSignal: segment });
  }

  return movements;
}

/**
 * Determines inference confidence based on the candidate description and
 * detected movements.
 */
function resolveInferenceConfidence(
  description: string,
  movements: ParsedMovement[]
): InferenceConfidence {
  const hasProteinFood = PROTEIN_BEARING_FOOD_IDS.some((f) =>
    description.toLowerCase().includes(f)
  );

  if (!hasProteinFood) return "none";

  const hasMovementKeyword =
    /\b(?:move|relocate|transfer|shift|redistribute|rearrange|add|remove|eliminate)\b/i.test(description);

  if (movements.length > 0) return "high";
  if (hasMovementKeyword && hasProteinFood) return "low";
  return "none";
}

/**
 * Infers the protein placement map for a candidate by starting from the
 * baseline and applying parsed movements.
 *
 * If no movements are detected: candidate map = baseline (no change assumed).
 */
export function extractCandidateProteinPlacement(
  description: string,
  baseline: ProteinPlacementMap
): { map: ProteinPlacementMap; movements: ParsedMovement[]; confidence: InferenceConfidence } {
  const movements = parseMovements(description);
  const confidence = resolveInferenceConfidence(description, movements);

  // Start from a mutable copy of the baseline
  const mutable: Record<string, string[]> = {};
  for (const [meal, foods] of Object.entries(baseline)) {
    mutable[meal] = [...foods];
  }

  for (const mv of movements) {
    if (mv.kind === "move" && mv.fromMeal && mv.toMeal) {
      // Remove from source meal
      if (mutable[mv.fromMeal]) {
        mutable[mv.fromMeal] = mutable[mv.fromMeal]!.filter((f) => f !== mv.food);
      }
      // Add to destination meal (if not already present)
      if (!mutable[mv.toMeal]) mutable[mv.toMeal] = [];
      if (!mutable[mv.toMeal]!.includes(mv.food)) {
        mutable[mv.toMeal]!.push(mv.food);
        mutable[mv.toMeal] = mutable[mv.toMeal]!.sort();
      }
    } else if (mv.kind === "add" && mv.toMeal) {
      if (!mutable[mv.toMeal]) mutable[mv.toMeal] = [];
      if (!mutable[mv.toMeal]!.includes(mv.food)) {
        mutable[mv.toMeal]!.push(mv.food);
        mutable[mv.toMeal] = mutable[mv.toMeal]!.sort();
      }
    } else if (mv.kind === "remove" && mv.fromMeal) {
      if (mutable[mv.fromMeal]) {
        mutable[mv.fromMeal] = mutable[mv.fromMeal]!.filter((f) => f !== mv.food);
      }
    }
  }

  // Sort each meal's food list for stable comparison
  for (const key of Object.keys(mutable)) {
    mutable[key] = mutable[key]!.sort();
  }

  return {
    map: Object.freeze(mutable) as ProteinPlacementMap,
    movements,
    confidence,
  };
}

/* =========================================================
   Structural diff
   ========================================================= */

/**
 * Computes the structural diff between baseline and candidate protein placement maps.
 * Uses set equality per meal — food presence only, not amounts.
 */
export function diffProteinPlacements(
  baseline: ProteinPlacementMap,
  candidate: ProteinPlacementMap
): ProteinPlacementDiff {
  const allMeals = new Set([
    ...Object.keys(baseline),
    ...Object.keys(candidate),
  ]);

  const missingProteinFoodsByMeal: Record<string, string[]> = {};
  const addedProteinFoodsByMeal:   Record<string, string[]> = {};

  for (const meal of allMeals) {
    const baselineSet = new Set(baseline[meal] ?? []);
    const candidateSet = new Set(candidate[meal] ?? []);

    const missing = [...baselineSet].filter((f) => !candidateSet.has(f));
    const added   = [...candidateSet].filter((f) => !baselineSet.has(f));

    if (missing.length > 0) missingProteinFoodsByMeal[meal] = missing;
    if (added.length > 0)   addedProteinFoodsByMeal[meal]   = added;
  }

  // Infer moves: a food that disappeared from one meal and appeared in another
  const movedProteinFoods: ProteinPlacementDiff["movedProteinFoods"] = [];
  for (const [fromMeal, missingFoods] of Object.entries(missingProteinFoodsByMeal)) {
    for (const food of missingFoods) {
      const toMealEntry = Object.entries(addedProteinFoodsByMeal).find(
        ([, added]) => added.includes(food)
      );
      if (toMealEntry) {
        movedProteinFoods.push({ food, fromMeal, toMeal: toMealEntry[0] });
      }
    }
  }

  const hasMovement =
    Object.keys(missingProteinFoodsByMeal).length > 0 ||
    Object.keys(addedProteinFoodsByMeal).length > 0;

  return {
    missingProteinFoodsByMeal,
    addedProteinFoodsByMeal,
    movedProteinFoods,
    hasMovement,
  };
}

/* =========================================================
   Per-candidate audit builder
   ========================================================= */

export function buildCandidateAuditResult(
  candidateId: string,
  description: string,
  baseline: ProteinPlacementMap
): ProteinPlacementAuditResult {
  const { map: candidateMap, movements, confidence } = extractCandidateProteinPlacement(
    description,
    baseline
  );

  const diff = diffProteinPlacements(baseline, candidateMap);
  const proteinPlacementMatchesBaseline = !diff.hasMovement;

  let violationExplanation: string | null = null;
  if (!proteinPlacementMatchesBaseline) {
    const parts: string[] = [];

    for (const mv of diff.movedProteinFoods) {
      const displayName = PROTEIN_FOOD_DISPLAY[mv.food] ?? mv.food;
      parts.push(
        `${displayName} moved from meal ${mv.fromMeal} to meal ${mv.toMeal}.`
      );
    }

    for (const [meal, foods] of Object.entries(diff.missingProteinFoodsByMeal)) {
      const movedFoodIds = diff.movedProteinFoods.map((m) => m.food);
      const notMoved = foods.filter((f) => !movedFoodIds.includes(f));
      if (notMoved.length > 0) {
        const names = notMoved.map((f) => PROTEIN_FOOD_DISPLAY[f] ?? f).join(", ");
        parts.push(`${names} removed from meal ${meal}.`);
      }
    }

    for (const [meal, foods] of Object.entries(diff.addedProteinFoodsByMeal)) {
      const movedFoodIds = diff.movedProteinFoods.map((m) => m.food);
      const notMoved = foods.filter((f) => !movedFoodIds.includes(f));
      if (notMoved.length > 0) {
        const names = notMoved.map((f) => PROTEIN_FOOD_DISPLAY[f] ?? f).join(", ");
        parts.push(`${names} added to meal ${meal} (not in baseline).`);
      }
    }

    violationExplanation = parts.join(" ") || "Protein placement differs from baseline.";
  }

  return {
    candidateId,
    baselineMap: baseline,
    candidateMap,
    diff,
    proteinPlacementMatchesBaseline,
    inferenceConfidence: confidence,
    violationExplanation,
    detectedSignals: movements.map((m) => m.rawSignal),
  };
}

/* =========================================================
   Full report builder
   ========================================================= */

/**
 * Builds a full ProteinPlacementAuditReport.
 *
 * @param phaseId        - Which phase is being audited (e.g. "BASE")
 * @param phase          - The PhasePlan for that phase (from PHASE_REGISTRY)
 * @param candidates     - Array of {id, description} for each candidate
 * @param engineReports  - CandidateEvaluationReport[] from the evaluation schema
 *                         (used for invariant checking)
 */
export function buildProteinPlacementAuditReport(
  phaseId: string,
  phase: AuditPhasePlan,
  candidates: Array<{ id: string; description: string }>,
  engineReports: CandidateEvaluationReport[]
): ProteinPlacementAuditReport {
  const baselineMap = extractBaselineProteinPlacement(phase);

  const auditResults: ProteinPlacementAuditResult[] = candidates.map((c) =>
    buildCandidateAuditResult(c.id, c.description, baselineMap)
  );

  const invariantViolations = assertProteinPlacementInvariants(
    auditResults,
    engineReports
  );

  return {
    phaseId,
    baselineMap,
    candidates: auditResults,
    invariantViolations,
  };
}

/* =========================================================
   Invariant checker
   ========================================================= */

/**
 * Checks protein placement invariants between the structural audit and
 * the engine's evaluation report.
 *
 * PI1: If proteinPlacementMatchesBaseline === true for a candidate,
 *      the engine's decisiveVariable for that candidate must NOT include
 *      "protein placement violation".
 *
 * PI2: If proteinPlacementMatchesBaseline === true for a candidate,
 *      no adjustment text containing "protein placement" may appear
 *      in the engine report for that candidate.
 *
 * Returns an array of all violations found. Empty means consistent.
 * Also logs each violation via console.error.
 */
export function assertProteinPlacementInvariants(
  auditResults: ProteinPlacementAuditResult[],
  engineReports: CandidateEvaluationReport[]
): PlacementInvariantViolation[] {
  const violations: PlacementInvariantViolation[] = [];

  for (const audit of auditResults) {
    if (!audit.proteinPlacementMatchesBaseline) continue;

    // Only invariant-check when inference confidence is high or none
    // (when confidence is "low", we defer to the engine)
    if (audit.inferenceConfidence === "low") continue;

    const engine = engineReports.find((r) => r.candidateId === audit.candidateId);
    if (!engine) continue;

    // PI1: decisive variable must not name a protein placement violation
    const dv = (engine.decisiveVariable ?? "").toLowerCase();
    if (dv.includes("protein placement violation")) {
      const v: PlacementInvariantViolation = {
        invariant: "PI1",
        candidateId: audit.candidateId,
        detail:
          `Candidate ${audit.candidateId}: structural audit shows protein placement matches baseline ` +
          `but engine decisiveVariable is "${engine.decisiveVariable}". ` +
          `This is a false positive in the engine.`,
      };
      violations.push(v);
      console.error("[NOMOS:PLACEMENT] Invariant PI1 violated:", v.detail);
    }

    // PI2: no protein-placement adjustment text
    const proteinAdjustment = engine.adjustments.find((a) =>
      a.toLowerCase().includes("protein placement")
    );
    if (proteinAdjustment) {
      const v: PlacementInvariantViolation = {
        invariant: "PI2",
        candidateId: audit.candidateId,
        detail:
          `Candidate ${audit.candidateId}: structural audit shows protein placement matches baseline ` +
          `but engine adjustment says "${proteinAdjustment}". ` +
          `Adjustment references a protein placement issue that does not exist structurally.`,
      };
      violations.push(v);
      console.error("[NOMOS:PLACEMENT] Invariant PI2 violated:", v.detail);
    }
  }

  return violations;
}

/* =========================================================
   Debug output
   ========================================================= */

/**
 * Emits deterministic debug output for the protein placement audit.
 * Called once per evaluation in development mode.
 *
 * Output format:
 *   BASELINE_PROTEIN_PLACEMENT_MAP
 *   CANDIDATE_A_PROTEIN_PLACEMENT_MAP
 *   CANDIDATE_B_PROTEIN_PLACEMENT_MAP
 *   CANDIDATE_C_PROTEIN_PLACEMENT_MAP
 *   PROTEIN_PLACEMENT_DIFFS
 */
export function printProteinPlacementAuditDebug(report: ProteinPlacementAuditReport): void {
  const mealLine = (map: ProteinPlacementMap, meal: string): string => {
    const foods = map[meal] ?? [];
    const label = foods.length > 0 ? `[${foods.join(", ")}]` : "[]";
    return `  Meal ${meal}: ${label}`;
  };

  const allMeals = Object.keys(report.baselineMap).sort();

  console.group(`[NOMOS:PLACEMENT] Protein Placement Audit — phase ${report.phaseId}`);

  console.group("BASELINE_PROTEIN_PLACEMENT_MAP");
  for (const meal of allMeals) {
    console.log(mealLine(report.baselineMap, meal));
  }
  console.groupEnd();

  for (const audit of report.candidates) {
    console.group(`CANDIDATE_${audit.candidateId}_PROTEIN_PLACEMENT_MAP`);
    for (const meal of allMeals) {
      const baselineFoods = report.baselineMap[meal] ?? [];
      const candidateFoods = [...(audit.candidateMap[meal] ?? [])];
      const changed = JSON.stringify(baselineFoods.sort()) !== JSON.stringify(candidateFoods.sort());
      const tag = changed ? " ← CHANGED" : "";
      console.log(`${mealLine(audit.candidateMap, meal)}${tag}`);
    }
    console.log(
      `  → proteinPlacementMatchesBaseline: ${audit.proteinPlacementMatchesBaseline}`
    );
    if (audit.detectedSignals.length > 0) {
      console.log(`  → detectedSignals: ${audit.detectedSignals.map((s) => `"${s}"`).join(", ")}`);
    }
    if (audit.inferenceConfidence === "low") {
      console.warn("  ⚠ inference confidence is LOW — audit result is approximate");
    }
    console.groupEnd();
  }

  console.group("PROTEIN_PLACEMENT_DIFFS");
  for (const audit of report.candidates) {
    if (!audit.diff.hasMovement) {
      console.log(`  ${audit.candidateId}: no protein movement detected`);
      continue;
    }

    console.group(`  ${audit.candidateId}: PLACEMENT CHANGED`);

    for (const mv of audit.diff.movedProteinFoods) {
      console.log(
        `    MOVED: ${PROTEIN_FOOD_DISPLAY[mv.food] ?? mv.food} ` +
        `from meal ${mv.fromMeal} → meal ${mv.toMeal}`
      );
    }

    for (const [meal, foods] of Object.entries(audit.diff.missingProteinFoodsByMeal)) {
      const movedIds = audit.diff.movedProteinFoods.map((m) => m.food);
      const notMoved = foods.filter((f) => !movedIds.includes(f));
      if (notMoved.length > 0) {
        console.log(
          `    REMOVED from meal ${meal}: ${notMoved.map((f) => PROTEIN_FOOD_DISPLAY[f] ?? f).join(", ")}`
        );
      }
    }

    for (const [meal, foods] of Object.entries(audit.diff.addedProteinFoodsByMeal)) {
      const movedIds = audit.diff.movedProteinFoods.map((m) => m.food);
      const notMoved = foods.filter((f) => !movedIds.includes(f));
      if (notMoved.length > 0) {
        console.log(
          `    ADDED to meal ${meal}: ${notMoved.map((f) => PROTEIN_FOOD_DISPLAY[f] ?? f).join(", ")}`
        );
      }
    }

    if (audit.violationExplanation) {
      console.log(`    EXPLANATION: ${audit.violationExplanation}`);
    }

    console.groupEnd();
  }
  console.groupEnd();

  if (report.invariantViolations.length > 0) {
    console.group("INVARIANT VIOLATIONS");
    for (const v of report.invariantViolations) {
      console.error(`  [${v.invariant}] candidate ${v.candidateId}: ${v.detail}`);
    }
    console.groupEnd();
  } else {
    console.log("INVARIANT VIOLATIONS: none — engine report is consistent with structural audit");
  }

  console.groupEnd();
}
