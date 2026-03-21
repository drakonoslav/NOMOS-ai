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
 */

import {
  CandidateEvaluationDraft,
  NormalizedCandidate,
  NormalizedConstraint,
} from "./eval_types.js";

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
