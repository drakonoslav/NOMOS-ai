/**
 * margin_scorer.ts
 *
 * Additive scoring layer on top of the categorical evaluation pipeline.
 *
 * Constitutional role:
 * - Does NOT change categorical status — LAWFUL, DEGRADED, INVALID are set upstream.
 * - Computes marginScore ∈ [0.00, 1.00]: distance from constraint failure boundary.
 * - Computes marginLabel as a presentation-safe bucket from the score.
 * - 1.00 = maximal margin. 0.00 = direct failure.
 *
 * Label thresholds:
 *   >= 0.75 → HIGH
 *   >= 0.50 → MODERATE
 *   >  0.00 → LOW
 *   == 0.00 → FAILED
 *
 * Scoring is constraint-kind-specific. UNKNOWN constraints use a
 * confidence-derived heuristic score.
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
  if (status === "INVALID") {
    return { marginScore: 0.00, marginLabel: "FAILED" };
  }

  let score: number;

  switch (constraint.kind) {
    case "NO_DROP":
    case "NO_RELEASE":
      score = scoreControlConstraint(candidate, status);
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

  const marginScore = clamp(round2(score));
  return { marginScore, marginLabel: toMarginLabel(marginScore) };
}

/* =========================================================
   Label derivation
   ========================================================= */

export function toMarginLabel(score: number): MarginLabel {
  if (score === 0.00) return "FAILED";
  if (score >= 0.75)  return "HIGH";
  if (score >= 0.50)  return "MODERATE";
  return "LOW";
}

/* =========================================================
   NO_DROP / NO_RELEASE — control continuity
   ========================================================= */

function scoreControlConstraint(
  candidate: NormalizedCandidate,
  status: CandidateStatus
): number {
  if (status === "INVALID") return 0.00;

  if (status === "DEGRADED") {
    const lower = candidate.raw.toLowerCase();
    let s = 0.38;
    if (lower.includes("guide") || lower.includes("rail") || lower.includes("track")) s += 0.04;
    return s;
  }

  // LAWFUL — start from base and add positive signals
  const lower = candidate.raw.toLowerCase();
  let s = 0.80;

  if (lower.includes("both hands"))               s = Math.max(s, 0.85);
  if (lower.includes("carefully"))                s = Math.max(s, 0.83);
  if (lower.includes("padded") || lower.includes("cushion")) s += 0.03;
  if (lower.includes("secure") || lower.includes("secured")) {
    s += 0.05;
    if (lower.includes("cart") || lower.includes("carrier") || lower.includes("cradle")) {
      s += 0.07; // cart + secured = highest margin in domain
    }
  }
  if (lower.includes("grip") || lower.includes("clamp") || lower.includes("strap")) s += 0.02;

  return s;
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
    let s = 0.36;
    if (lower.includes("surface") || lower.includes("light")) s += 0.05;
    return s;
  }

  // LAWFUL
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
    let s = 0.40;
    if (lower.includes("cushion") || lower.includes("padded")) s += 0.06;
    return s;
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
    let s = 0.44;
    if (lower.includes("fast") || lower.includes("quick")) s += 0.05;
    return s;
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

  if (status === "DEGRADED") {
    return 0.42;
  }

  const lower = candidate.raw.toLowerCase();
  let s = 0.80;
  if (lower.includes("minimal") || lower.includes("low resource") || lower.includes("efficient")) s += 0.07;
  return s;
}

/* =========================================================
   UNKNOWN — heuristic from confidence
   ========================================================= */

function scoreUnknown(
  status: CandidateStatus,
  confidence: "high" | "moderate" | "low"
): number {
  if (status === "INVALID") return 0.00;

  const base = status === "LAWFUL" ? 0.72 : 0.33;
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
