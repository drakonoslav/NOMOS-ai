/**
 * margin_scorer.ts
 *
 * Additive margin scoring layer on top of the categorical evaluation pipeline.
 *
 * Constitutional role:
 * - Does NOT change categorical status — LAWFUL, DEGRADED, INVALID are set upstream.
 * - Computes marginScore ∈ [0.00, 1.00]: distance from constraint failure boundary.
 * - Computes marginLabel as a presentation-safe bucket from the score.
 * - 1.00 = maximal margin. 0.00 = direct failure.
 *
 * Label thresholds (marginLabelFromScore):
 *   <= 0    → FAILED
 *   <  0.50 → LOW
 *   <  0.75 → MODERATE
 *   >= 0.75 → HIGH
 */

import { CandidateStatus, MarginLabel, NormalizedCandidate, NormalizedConstraint } from "./eval_types.js";

export interface MarginResult {
  marginScore: number;
  marginLabel: MarginLabel;
}

export function computeMarginScore(
  candidate: NormalizedCandidate,
  constraint: NormalizedConstraint,
  status: CandidateStatus,
  confidence: "high" | "moderate" | "low"
): MarginResult {
  let score: number;

  switch (constraint.kind) {
    case "NO_DROP":
    case "NO_RELEASE":
      score = scoreNoDropCandidate(candidate, status);
      break;

    case "NO_TURNOVER":
      score = scoreNoTurnover(candidate, status);
      break;

    case "PRESERVE_STRUCTURE":
      score = scorePreserveStructure(candidate, status);
      break;

    case "BOUNDED_TIME":
      score = scoreBoundedTime(candidate, status);
      break;

    case "BOUNDED_RESOURCE":
      score = scoreBoundedResource(candidate, status);
      break;

    case "UNKNOWN":
    default:
      score = scoreUnknown(status, confidence);
      break;
  }

  const marginScore = round2(clamp(score));
  return { marginScore, marginLabel: marginLabelFromScore(marginScore) };
}

/* =========================================================
   Label derivation — exact per spec
   ========================================================= */

export function marginLabelFromScore(score: number): MarginLabel {
  if (score <= 0)    return "FAILED";
  if (score < 0.50)  return "LOW";
  if (score < 0.75)  return "MODERATE";
  return "HIGH";
}

/* =========================================================
   NO_DROP / NO_RELEASE — exact spec scoring function
   ========================================================= */

function scoreNoDropCandidate(
  candidate: NormalizedCandidate,
  status: CandidateStatus
): number {
  const text = candidate.raw.toLowerCase();

  // hard failure
  if (
    candidate.riskFlags.includes("release_control") ||
    text.includes("toss") ||
    text.includes("throw")
  ) {
    return 0.00;
  }

  // degraded / low margin
  if (
    candidate.riskFlags.includes("reduced_control") ||
    text.includes("slide")
  ) {
    return 0.40;
  }

  // strongest lawful — secure cart
  if (
    text.includes("cart") &&
    (text.includes("secure") || text.includes("securely"))
  ) {
    return 0.92;
  }

  // normal lawful — controlled carry
  if (
    text.includes("carry") &&
    (text.includes("both hands") || text.includes("carefully"))
  ) {
    return 0.85;
  }

  // fallback admissible but moderate
  return 0.60;
}

/* =========================================================
   NO_TURNOVER — soil disturbance
   ========================================================= */

function scoreNoTurnover(
  candidate: NormalizedCandidate,
  status: CandidateStatus
): number {
  if (status === "INVALID") return 0.00;

  if (status === "DEGRADED") {
    const lower = candidate.raw.toLowerCase();
    return lower.includes("surface") || lower.includes("light") ? 0.41 : 0.36;
  }

  const lower = candidate.raw.toLowerCase();
  let s = 0.82;
  if (lower.includes("no till") || lower.includes("no-till") || lower.includes("minimal")) s += 0.05;
  if (lower.includes("surface only")) s += 0.06;
  return s;
}

/* =========================================================
   PRESERVE_STRUCTURE — structural integrity
   ========================================================= */

function scorePreserveStructure(
  candidate: NormalizedCandidate,
  status: CandidateStatus
): number {
  if (status === "INVALID") return 0.00;

  if (status === "DEGRADED") {
    const lower = candidate.raw.toLowerCase();
    return lower.includes("cushion") || lower.includes("padded") ? 0.46 : 0.40;
  }

  const lower = candidate.raw.toLowerCase();
  let s = 0.82;
  if (lower.includes("rigid") || lower.includes("reinforced")) s += 0.05;
  if (lower.includes("no contact") || lower.includes("isolated")) s += 0.04;
  return s;
}

/* =========================================================
   BOUNDED_TIME — time constraint
   ========================================================= */

function scoreBoundedTime(
  candidate: NormalizedCandidate,
  status: CandidateStatus
): number {
  if (status === "INVALID") return 0.00;

  if (status === "DEGRADED") {
    const lower = candidate.raw.toLowerCase();
    return lower.includes("fast") || lower.includes("quick") ? 0.49 : 0.44;
  }

  const lower = candidate.raw.toLowerCase();
  let s = 0.80;
  if (lower.includes("immediately") || lower.includes("instant")) s += 0.07;
  if (lower.includes("minimal") || lower.includes("short")) s += 0.04;
  return s;
}

/* =========================================================
   BOUNDED_RESOURCE — resource constraint
   ========================================================= */

function scoreBoundedResource(
  candidate: NormalizedCandidate,
  status: CandidateStatus
): number {
  if (status === "INVALID") return 0.00;
  if (status === "DEGRADED") return 0.42;

  const lower = candidate.raw.toLowerCase();
  let s = 0.80;
  if (lower.includes("minimal") || lower.includes("efficient")) s += 0.07;
  return s;
}

/* =========================================================
   UNKNOWN — confidence-derived heuristic
   ========================================================= */

function scoreUnknown(
  status: CandidateStatus,
  confidence: "high" | "moderate" | "low"
): number {
  if (status === "INVALID") return 0.00;

  const base  = status === "LAWFUL" ? 0.72 : 0.33;
  const boost = confidence === "high" ? 0.08 : confidence === "moderate" ? 0.04 : 0.00;
  return base + boost;
}

/* =========================================================
   Utilities
   ========================================================= */

function clamp(v: number): number {
  return Math.min(1.00, Math.max(0.00, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
