/**
 * deterministic_matcher.ts
 *
 * Evaluates a normalized candidate against a normalized constraint using
 * deterministic, rule-based logic.
 *
 * Constitutional role:
 * - Primary evaluator. If the constraint kind is known, this produces a
 *   definitive result without LLM involvement.
 * - Returns null for UNKNOWN constraint kinds — those are forwarded to the
 *   LLM semantic evaluator.
 * - Reasons follow the compressed two-clause pattern:
 *   [decisive event]. [constraint result].
 *
 * Nutrition domain additions:
 * - NUTRITION_STRUCTURAL_LOCK  — detect meal structure violations in candidate text
 * - NUTRITION_ALLOWED_ACTION   — detect out-of-scope food substitutions
 * - NUTRITION_TARGET_TOLERANCE — always LAWFUL (guidance); moderate margin
 * - NUTRITION_SOURCE_TRUTH     — always LAWFUL (data override); high confidence
 */

import {
  CandidateEvaluationDraft,
  NormalizedCandidate,
  NormalizedConstraint,
} from "./eval_types.js";
import { evaluateSleepCandidate } from "./domains/sleep_constraint_evaluator.js";

export function evaluateDeterministically(
  constraint: NormalizedConstraint,
  candidate: NormalizedCandidate
): CandidateEvaluationDraft | null {
  switch (constraint.kind) {
    case "NO_DROP":
      return evalNoDrop(candidate);

    case "NO_RELEASE":
      return evalNoRelease(candidate);

    case "NO_TURNOVER":
      return evalNoTurnover(candidate);

    case "PRESERVE_STRUCTURE":
      return evalPreserveStructure(candidate);

    case "BOUNDED_TIME":
      return evalBoundedTime(candidate, constraint);

    case "BOUNDED_RESOURCE":
      return evalBoundedResource(candidate, constraint);

    case "SLEEP_MIN_DURATION_AND_CONTINUITY":
      return evaluateSleepCandidate(candidate, constraint);

    case "NUTRITION_STRUCTURAL_LOCK":
      return evalNutritionStructuralLock(candidate, constraint);

    case "NUTRITION_ALLOWED_ACTION":
      return evalNutritionAllowedAction(candidate, constraint);

    case "NUTRITION_TARGET_TOLERANCE":
      return evalNutritionTargetTolerance(candidate, constraint);

    case "NUTRITION_SOURCE_TRUTH":
      return evalNutritionSourceTruth(candidate, constraint);

    case "UNKNOWN":
    default:
      return null;
  }
}

/* =========================================================
   NO_DROP — object must not be dropped at any point
   ========================================================= */

function evalNoDrop(candidate: NormalizedCandidate): CandidateEvaluationDraft {
  if (candidate.riskFlags.includes("release_control")) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: "Control released. Constraint violated.",
      decisiveVariable: "drop risk",
      confidence: "high",
      adjustments: ["Use continuous controlled transport."],
    };
  }

  if (candidate.riskFlags.includes("reduced_control")) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: "Constraint preserved. Control margin reduced.",
      decisiveVariable: "control margin",
      confidence: "high",
      adjustments: ["Increase transport stability."],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "Controlled transport. Constraint satisfied.",
    decisiveVariable: "control continuity",
    confidence: "high",
  };
}

/* =========================================================
   NO_RELEASE — must maintain control at all times
   ========================================================= */

function evalNoRelease(candidate: NormalizedCandidate): CandidateEvaluationDraft {
  if (candidate.riskFlags.includes("release_control")) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: "Control released. Constraint violated.",
      decisiveVariable: "control continuity",
      confidence: "high",
      adjustments: ["Maintain grip or containment throughout."],
    };
  }

  if (candidate.riskFlags.includes("reduced_control")) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: "Constraint preserved. Control margin reduced.",
      decisiveVariable: "control continuity",
      confidence: "high",
      adjustments: ["Maintain full control throughout."],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "Control maintained. Constraint satisfied.",
    decisiveVariable: "control continuity",
    confidence: "high",
  };
}

/* =========================================================
   NO_TURNOVER — soil must not be turned over or disturbed
   ========================================================= */

function evalNoTurnover(candidate: NormalizedCandidate): CandidateEvaluationDraft {
  if (candidate.riskFlags.includes("soil_disturbance")) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: "Soil turnover detected. Constraint violated.",
      decisiveVariable: "soil disturbance",
      confidence: "high",
      adjustments: ["Remove tilling and turnover."],
    };
  }

  const lower = candidate.raw.toLowerCase();
  if (lower.includes("fertiliz") || lower.includes("amend") || lower.includes("treat soil")) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: "Constraint preserved. Soil profile altered by intervention.",
      decisiveVariable: "nutrient intervention",
      confidence: "moderate",
      adjustments: ["Reduce intervention intensity."],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "Low disturbance. Constraint satisfied.",
    decisiveVariable: "soil disturbance",
    confidence: "high",
  };
}

/* =========================================================
   PRESERVE_STRUCTURE — structural integrity must be maintained
   ========================================================= */

function evalPreserveStructure(candidate: NormalizedCandidate): CandidateEvaluationDraft {
  if (candidate.riskFlags.includes("structural_alteration")) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: "Structural alteration detected. Constraint violated.",
      decisiveVariable: "structural integrity",
      confidence: "high",
      adjustments: ["Remove actions that alter the structure."],
    };
  }

  if (candidate.riskFlags.includes("release_control") || candidate.riskFlags.includes("reduced_control")) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: "Constraint preserved. Structural risk introduced.",
      decisiveVariable: "structural integrity",
      confidence: "moderate",
      adjustments: ["Use secured transport to protect structure."],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "No structural risk. Constraint satisfied.",
    decisiveVariable: "structural integrity",
    confidence: "high",
  };
}

/* =========================================================
   BOUNDED_TIME — action must complete within time bound
   ========================================================= */

function evalBoundedTime(
  candidate: NormalizedCandidate,
  constraint: NormalizedConstraint
): CandidateEvaluationDraft {
  const lower = candidate.raw.toLowerCase();

  if (lower.includes("delay") || lower.includes("postpone") || lower.includes("later")) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: `Delay introduced. Constraint violated${constraint.threshold ? ` (bound: ${constraint.threshold})` : ""}.`,
      decisiveVariable: "time bound",
      confidence: "high",
      adjustments: ["Remove delay-inducing steps."],
    };
  }

  if (lower.includes("gradual") || lower.includes("phased") || lower.includes("staged")) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: "Phased approach. Time bound at risk.",
      decisiveVariable: "time bound",
      confidence: "moderate",
      adjustments: ["Confirm duration is within bound."],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "No delay detected. Constraint satisfied.",
    decisiveVariable: "time bound",
    confidence: "moderate",
  };
}

/* =========================================================
   BOUNDED_RESOURCE — must not exceed resource bound
   ========================================================= */

function evalBoundedResource(
  candidate: NormalizedCandidate,
  constraint: NormalizedConstraint
): CandidateEvaluationDraft {
  if (candidate.riskFlags.includes("resource_intensity")) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: `Resource bound exceeded. Constraint violated${constraint.threshold ? ` (bound: ${constraint.threshold})` : ""}.`,
      decisiveVariable: "resource bound",
      confidence: "high",
      adjustments: ["Reduce resource consumption."],
    };
  }

  const lower = candidate.raw.toLowerCase();
  if (lower.includes("additional") || lower.includes("more") || lower.includes("extra")) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: "Resource increase possible. Bound unconfirmed.",
      decisiveVariable: "resource bound",
      confidence: "moderate",
      adjustments: ["Quantify resource delta."],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "No excess detected. Constraint satisfied.",
    decisiveVariable: "resource bound",
    confidence: "moderate",
  };
}

/* =========================================================
   NUTRITION_STRUCTURAL_LOCK
   Violations: moving protein, reordering meals, removing meals, changing dispersal.
   Evaluation is text-signal based on the candidate description.
   ========================================================= */

function evalNutritionStructuralLock(
  candidate: NormalizedCandidate,
  constraint: NormalizedConstraint
): CandidateEvaluationDraft {
  const lower = candidate.raw.toLowerCase();
  const key = constraint.key ?? "preserve_protein_placement";

  switch (key) {
    case "preserve_protein_placement": {
      const violates =
        lower.includes("move protein") ||
        lower.includes("relocate protein") ||
        lower.includes("rearrange protein") ||
        lower.includes("redistribute protein") ||
        lower.includes("shift protein") ||
        lower.includes("transfer protein");

      if (violates) {
        return {
          id: candidate.id,
          status: "INVALID",
          reason: "Protein placement moved between meals. Structural lock violated.",
          decisiveVariable: "protein placement violation",
          confidence: "high",
          adjustments: ["Preserve existing protein placement across all meals."],
        };
      }

      return {
        id: candidate.id,
        status: "LAWFUL",
        reason: "Protein placement unchanged. Structural lock satisfied.",
        decisiveVariable: "protein placement",
        confidence: "high",
      };
    }

    case "preserve_meal_order": {
      const violates =
        lower.includes("reorder meal") ||
        lower.includes("change meal order") ||
        lower.includes("rearrange meal") ||
        lower.includes("swap meal") ||
        lower.includes("reverse meal");

      if (violates) {
        return {
          id: candidate.id,
          status: "INVALID",
          reason: "Meal order altered. Structural lock violated.",
          decisiveVariable: "meal order violation",
          confidence: "high",
          adjustments: ["Preserve the declared meal sequence."],
        };
      }

      return {
        id: candidate.id,
        status: "LAWFUL",
        reason: "Meal order unchanged. Structural lock satisfied.",
        decisiveVariable: "meal order",
        confidence: "high",
      };
    }

    case "preserve_meal_count": {
      const violates =
        lower.includes("remove meal") ||
        lower.includes("skip meal") ||
        lower.includes("drop meal") ||
        lower.includes("eliminate meal") ||
        lower.includes("delete meal");

      if (violates) {
        return {
          id: candidate.id,
          status: "INVALID",
          reason: "Meal removed from plan. Structural lock violated.",
          decisiveVariable: "meal count violation",
          confidence: "high",
          adjustments: ["Retain all meals in the declared plan."],
        };
      }

      return {
        id: candidate.id,
        status: "LAWFUL",
        reason: "Meal count preserved. Structural lock satisfied.",
        decisiveVariable: "meal count",
        confidence: "high",
      };
    }

    case "preserve_meal_dispersal": {
      const violates =
        lower.includes("consolidate meal") ||
        lower.includes("merge meal") ||
        lower.includes("combine meal") ||
        lower.includes("change timing") ||
        lower.includes("shift timing");

      const degraded =
        lower.includes("adjust timing") ||
        lower.includes("slightly earlier") ||
        lower.includes("slightly later");

      if (violates) {
        return {
          id: candidate.id,
          status: "INVALID",
          reason: "Meal timeblock pattern altered. Dispersal lock violated.",
          decisiveVariable: "meal dispersal violation",
          confidence: "high",
          adjustments: ["Preserve the declared meal timing structure."],
        };
      }

      if (degraded) {
        return {
          id: candidate.id,
          status: "DEGRADED",
          reason: "Timing adjustment detected. Dispersal margin reduced.",
          decisiveVariable: "meal dispersal",
          confidence: "moderate",
          adjustments: ["Confirm timing changes do not alter dispersal pattern."],
        };
      }

      return {
        id: candidate.id,
        status: "LAWFUL",
        reason: "Dispersal pattern unchanged. Structural lock satisfied.",
        decisiveVariable: "meal dispersal",
        confidence: "high",
      };
    }

    default: {
      return {
        id: candidate.id,
        status: "LAWFUL",
        reason: "Structural lock checked. No violation detected.",
        decisiveVariable: constraint.decisiveVariable ?? "structural lock",
        confidence: "moderate",
      };
    }
  }
}

/* =========================================================
   NUTRITION_ALLOWED_ACTION
   Dispatches to sub-evaluator by key.
   ========================================================= */

function evalNutritionAllowedAction(
  candidate: NormalizedCandidate,
  constraint: NormalizedConstraint
): CandidateEvaluationDraft {
  const key = constraint.key ?? "adjustment_scope";
  if (key === "inference_scope") {
    return evalInferenceScope(candidate);
  }
  return evalAdjustmentScope(candidate);
}

/* ---------- adjustment_scope ----------
   Scope: only gram amounts or unit counts of already-present foods may be adjusted.
   Violations: adding new foods, substituting, replacing, or removing food items.
*/
function evalAdjustmentScope(candidate: NormalizedCandidate): CandidateEvaluationDraft {
  const lower = candidate.raw.toLowerCase();

  const outOfScope =
    lower.includes("add new food") ||
    lower.includes("add a food") ||
    lower.includes("add food") ||
    lower.includes("introduce food") ||
    lower.includes("introduce new") ||
    lower.includes("substitute food") ||
    lower.includes("replace food") ||
    lower.includes("swap food") ||
    lower.includes("different food") ||
    lower.includes("new food item") ||
    lower.includes("swap ingredient") ||
    lower.includes("replace ingredient");

  const borderline =
    lower.includes("alternative food") ||
    lower.includes("food option") ||
    lower.includes("optionally add");

  if (outOfScope) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: "Candidate proposes modifying food set. Only gram-amount adjustments are allowed.",
      decisiveVariable: "disallowed food adjustment",
      confidence: "high",
      adjustments: [
        "Restrict changes to gram amounts or unit counts of already-present foods.",
        "Do not introduce, substitute, or remove any food items.",
      ],
    };
  }

  if (borderline) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: "Food alteration risk detected. Scope constraint under reduced margin.",
      decisiveVariable: "disallowed food adjustment",
      confidence: "moderate",
      adjustments: ["Confirm no new foods are introduced."],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "Adjustments within declared food set. Constraint satisfied.",
    decisiveVariable: "disallowed food adjustment",
    confidence: "high",
  };
}

/* ---------- inference_scope ----------
   "Do not infer food behavior that is not supported by declared labels or source data."
   Violations: using estimated or assumed data not backed by declared labels.
*/
function evalInferenceScope(candidate: NormalizedCandidate): CandidateEvaluationDraft {
  const lower = candidate.raw.toLowerCase();

  const inferenceViolation =
    lower.includes("assume ") ||
    lower.includes("assumed ") ||
    lower.includes("inferred ") ||
    lower.includes("estimate the") ||
    lower.includes("estimated value") ||
    lower.includes("generic assumption") ||
    lower.includes("using typical") ||
    lower.includes("using standard") ||
    (lower.includes("estimate") && !lower.includes("declared") && !lower.includes("label"));

  const borderline =
    lower.includes("likely") ||
    lower.includes("probably") ||
    lower.includes("approximate");

  if (inferenceViolation) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: "Candidate applies inferences not backed by declared labels. Inference scope violated.",
      decisiveVariable: "disallowed food inference",
      confidence: "high",
      adjustments: [
        "Use only declared food label data or explicitly declared source-truth values.",
        "Do not apply generic or assumed macro values.",
      ],
    };
  }

  if (borderline) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: "Candidate uses approximate language. Inference scope at reduced margin.",
      decisiveVariable: "disallowed food inference",
      confidence: "moderate",
      adjustments: ["Confirm all macro values are backed by declared labels."],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "Candidate stays within declared data. Inference scope satisfied.",
    decisiveVariable: "disallowed food inference",
    confidence: "high",
  };
}

/* =========================================================
   NUTRITION_TARGET_TOLERANCE
   Guidance constraint — minimize calorie delta or total changeset.
   Cannot produce INVALID from text alone; reduces margin when ignored.
   ========================================================= */

function evalNutritionTargetTolerance(
  candidate: NormalizedCandidate,
  constraint: NormalizedConstraint
): CandidateEvaluationDraft {
  const lower = candidate.raw.toLowerCase();
  const key = constraint.key ?? "calorie_delta_minimize";
  const decisiveVariable = constraint.decisiveVariable ?? "calorie delta";

  const antiMinimal =
    lower.includes("large adjustment") ||
    lower.includes("major change") ||
    lower.includes("significant change") ||
    lower.includes("overhaul") ||
    lower.includes("complete redesign");

  if (antiMinimal) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: `Candidate implies large-scale changes. ${key === "calorie_delta_minimize" ? "Calorie delta" : "Changeset"} tolerance reduced.`,
      decisiveVariable,
      confidence: "moderate",
      adjustments: [
        key === "calorie_delta_minimize"
          ? "Prefer smaller gram adjustments to stay within calorie tolerance."
          : "Prefer the smallest set of structure-preserving changes.",
      ],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: `Minimization guidance acknowledged. ${key === "calorie_delta_minimize" ? "Calorie delta" : "Changeset"} within expected tolerance.`,
    decisiveVariable,
    confidence: "moderate",
  };
}

/* =========================================================
   NUTRITION_SOURCE_TRUTH
   Data-override instruction — does not constrain candidate actions.
   Always LAWFUL; high confidence because it is a lookup rule, not a prohibition.
   ========================================================= */

function evalNutritionSourceTruth(
  candidate: NormalizedCandidate,
  constraint: NormalizedConstraint
): CandidateEvaluationDraft {
  const decisiveVariable = constraint.decisiveVariable ?? "macro source";
  const key = constraint.key ?? "declared_macros_override";

  let label: string;
  switch (key) {
    case "declared_macros_override":
      label = "Declared macro values applied as truth source.";
      break;
    case "estimated_defaults_allowed":
      label = "Estimated defaults acknowledged for declared food items.";
      break;
    case "label_priority":
      label = "Label truth applied with priority over generic assumptions.";
      break;
    default:
      label = "Source truth directive acknowledged.";
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: `${label} Constraint satisfied.`,
    decisiveVariable,
    confidence: "high",
  };
}
