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
 * - Reasons are precise, action-specific, and constraint-referenced.
 */

import {
  CandidateEvaluation,
  NormalizedCandidate,
  NormalizedConstraint,
} from "./eval_types.js";

export function evaluateDeterministically(
  constraint: NormalizedConstraint,
  candidate: NormalizedCandidate
): CandidateEvaluation | null {
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

function evalNoDrop(candidate: NormalizedCandidate): CandidateEvaluation {
  if (candidate.riskFlags.includes("release_control")) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: "Constraint violated: control is released during transport.",
      decisiveVariable: "drop risk",
      confidence: "high",
      adjustments: ["Use continuous controlled transport."],
    };
  }

  if (candidate.riskFlags.includes("reduced_control")) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: "Constraint preserved with reduced control margin.",
      decisiveVariable: "control margin",
      confidence: "high",
      adjustments: ["Increase transport stability."],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "Constraint satisfied under controlled transport.",
    decisiveVariable: "control continuity",
    confidence: "high",
  };
}

/* =========================================================
   NO_RELEASE — must maintain control at all times
   ========================================================= */

function evalNoRelease(candidate: NormalizedCandidate): CandidateEvaluation {
  if (candidate.riskFlags.includes("release_control")) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: "Constraint violated: release of control detected.",
      decisiveVariable: "control continuity",
      confidence: "high",
      adjustments: ["Maintain continuous grip or containment throughout."],
    };
  }

  if (candidate.riskFlags.includes("reduced_control")) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: "Constraint preserved with reduced control margin.",
      decisiveVariable: "control continuity",
      confidence: "high",
      adjustments: ["Ensure full control is maintained throughout."],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "Constraint satisfied.",
    decisiveVariable: "control continuity",
    confidence: "high",
  };
}

/* =========================================================
   NO_TURNOVER — soil must not be turned over or disturbed
   ========================================================= */

function evalNoTurnover(candidate: NormalizedCandidate): CandidateEvaluation {
  if (candidate.riskFlags.includes("soil_disturbance")) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: "Constraint violated: soil turnover or tilling detected.",
      decisiveVariable: "soil disturbance",
      confidence: "high",
      adjustments: ["Remove tilling or turnover from the sequence."],
    };
  }

  const lower = candidate.raw.toLowerCase();
  if (lower.includes("fertiliz") || lower.includes("amend") || lower.includes("treat soil")) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: "Constraint preserved, but soil profile is altered by intervention.",
      decisiveVariable: "nutrient intervention",
      confidence: "moderate",
      adjustments: ["Reduce external intervention intensity."],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "Constraint satisfied with low disturbance.",
    decisiveVariable: "soil disturbance",
    confidence: "high",
  };
}

/* =========================================================
   PRESERVE_STRUCTURE — structural integrity must be maintained
   ========================================================= */

function evalPreserveStructure(candidate: NormalizedCandidate): CandidateEvaluation {
  if (candidate.riskFlags.includes("structural_alteration")) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: "Constraint violated: structural alteration detected.",
      decisiveVariable: "structural integrity",
      confidence: "high",
      adjustments: ["Remove actions that alter the structure."],
    };
  }

  if (candidate.riskFlags.includes("release_control") || candidate.riskFlags.includes("reduced_control")) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: "Constraint preserved but transport method introduces structural risk.",
      decisiveVariable: "structural integrity",
      confidence: "moderate",
      adjustments: ["Use cushioned or secured transport to protect structure."],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "Constraint satisfied with no structural risk.",
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
): CandidateEvaluation {
  const lower = candidate.raw.toLowerCase();

  if (lower.includes("delay") || lower.includes("postpone") || lower.includes("later")) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: `Constraint violated: candidate introduces delay against the time bound${constraint.threshold ? ` (${constraint.threshold})` : ""}.`,
      decisiveVariable: "time bound",
      confidence: "high",
      adjustments: ["Remove delay-inducing steps; complete within the declared time bound."],
    };
  }

  if (lower.includes("gradual") || lower.includes("phased") || lower.includes("staged")) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: "Candidate uses a phased approach which may approach the time limit.",
      decisiveVariable: "time bound",
      confidence: "moderate",
      adjustments: ["Confirm total duration remains within the declared bound."],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "Candidate satisfies the time constraint.",
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
): CandidateEvaluation {
  if (candidate.riskFlags.includes("resource_intensity")) {
    return {
      id: candidate.id,
      status: "INVALID",
      reason: `Constraint violated: candidate increases resource use beyond the declared bound${constraint.threshold ? ` (${constraint.threshold})` : ""}.`,
      decisiveVariable: "resource bound",
      confidence: "high",
      adjustments: ["Reduce resource consumption to remain within the bound."],
    };
  }

  const lower = candidate.raw.toLowerCase();
  if (lower.includes("additional") || lower.includes("more") || lower.includes("extra")) {
    return {
      id: candidate.id,
      status: "DEGRADED",
      reason: "Candidate may increase resource usage; verify it remains within the bound.",
      decisiveVariable: "resource bound",
      confidence: "moderate",
      adjustments: ["Quantify resource delta to confirm bound compliance."],
    };
  }

  return {
    id: candidate.id,
    status: "LAWFUL",
    reason: "Candidate does not appear to exceed the resource constraint.",
    decisiveVariable: "resource bound",
    confidence: "moderate",
  };
}
