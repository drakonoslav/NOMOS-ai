/**
 * tone_resolver.ts
 *
 * NOMOS presentation resolver.
 *
 * Purpose:
 *   - Convert raw runtime / verification outputs into presentation-safe text
 *   - Enforce approved phrasing templates (NOMOS Presentation Style Guide)
 *   - Prevent non-compliant wording by generating only from controlled builders
 *
 * Constitutional rule:
 *   - This module does NOT decide legality
 *   - It only expresses already-determined state
 */

import type {
  ToneLevel,
  ToneResolverInput,
  ToneMessage,
  VerificationStatus,
} from "./tone_types";

/* =========================================================
   Public API
   ========================================================= */

export { resolveToneLevel };
export { resolveToneMessage };

function resolveToneLevel(input: ToneResolverInput): ToneLevel {
  const {
    verificationStatus,
    epsilonX,
    identifiability,
    modelConfidence,
    robustnessEpsilon,
    robustnessEpsilonMin,
    feasibilityOk,
    robustnessOk,
    observabilityOk,
    modelOk,
    adaptationOk,
  } = input;

  if (verificationStatus === "INVALID") {
    return "TERSE";
  }

  const strongLawful =
    verificationStatus === "LAWFUL" &&
    epsilonX <= 0.05 &&
    identifiability === "FULL" &&
    modelConfidence >= 0.85 &&
    (robustnessEpsilon === undefined ||
      robustnessEpsilonMin === undefined ||
      robustnessEpsilon >= robustnessEpsilonMin * 1.5);

  if (strongLawful) {
    return "TERSE";
  }

  const stableLawful =
    verificationStatus === "LAWFUL" &&
    epsilonX <= 0.10 &&
    identifiability === "FULL" &&
    modelConfidence >= 0.65;

  if (stableLawful) {
    return "CONCISE";
  }

  const highUncertainty =
    identifiability === "NONE" ||
    epsilonX > 0.20 ||
    modelConfidence < 0.40 ||
    observabilityOk === false ||
    feasibilityOk === false;

  if (verificationStatus === "DEGRADED") {
    return highUncertainty ? "EXPANDED" : "EXPLAINED";
  }

  if (
    robustnessOk === false ||
    modelOk === false ||
    adaptationOk === false ||
    identifiability === "PARTIAL"
  ) {
    return highUncertainty ? "EXPANDED" : "EXPLAINED";
  }

  return "CONCISE";
}

/**
 * Maximum body lines per tone level.
 * TERSE:    3  — status + decisive + prediction
 * CONCISE:  4  — adds cause/margin
 * EXPLAINED: 5 — adds one metric
 * EXPANDED:  5 — same ceiling; math belongs in the verification panel
 */
const BODY_LIMIT: Record<ToneLevel, number> = {
  TERSE:    3,
  CONCISE:  4,
  EXPLAINED: 5,
  EXPANDED:  5,
};

/**
 * Maximum body lines per verification status.
 * Applied in conjunction with BODY_LIMIT — the tighter limit wins.
 */
const MAX_LINES: Record<VerificationStatus, number> = {
  LAWFUL:   3,
  DEGRADED: 4,
  INVALID:  3,
};

/** Hard character-width limit per line. Prevents overflow in fixed-width UI panels. */
const MAX_CHARS_PER_LINE = 88;

function enforceLineWidth(lines: string[]): string[] {
  return lines.map((line) =>
    line.length <= MAX_CHARS_PER_LINE
      ? line
      : line.slice(0, MAX_CHARS_PER_LINE - 3) + "..."
  );
}

/* =========================================================
   Semantic compression
   Merges adjacent lines that share semantic subject matter.
   INVALID lines are never merged — refusal clarity is paramount.
   ========================================================= */

function semanticCompress(lines: string[], status: VerificationStatus): string[] {
  if (lines.length <= 1) return lines;
  if (status === "INVALID") return lines;

  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const next    = lines[i + 1];

    if (next && canMerge(current, next)) {
      result.push(mergeLines(current, next));
      i++; // skip next — already consumed
    } else {
      result.push(current);
    }
  }
  return result;
}

function canMerge(a: string, b: string): boolean {
  const A = normalize(a);
  const B = normalize(b);

  if (shareKeyword(A, B, "robustness")) return true;
  if (shareKeyword(A, B, "feasibility")) return true;
  if (shareKeyword(A, B, "model"))       return true;

  if (A.includes("feasibility holds") && B.includes("decisive")) return true;
  if (A.includes("decisive")          && B.includes("drift"))    return true;

  return false;
}

function mergeLines(a: string, b: string): string {
  const A = stripPeriod(a);
  const B = stripPeriod(b);

  if (A.toLowerCase().includes("feasibility holds") && B.toLowerCase().includes("decisive")) {
    return `${A}; ${B.toLowerCase()}.`;
  }
  if (A.toLowerCase().includes("decisive") && B.includes("Given current drift")) {
    return `${A}; ${B.toLowerCase()}`;
  }

  return `${A}; ${lowerFirst(B)}.`;
}

function normalize(s: string):            string  { return s.toLowerCase(); }
function shareKeyword(a: string, b: string, k: string): boolean { return a.includes(k) && b.includes(k); }
function stripPeriod(s: string):          string  { return s.replace(/\.$/, ""); }
function lowerFirst(s: string):           string  { return s.charAt(0).toLowerCase() + s.slice(1); }

function resolveToneMessage(input: ToneResolverInput): ToneMessage {
  if (!input.decisiveVariable) {
    input = { ...input, decisiveVariable: inferDecisiveVariable(input) };
  }

  const tone = resolveToneLevel(input);

  let msg: ToneMessage;
  switch (input.verificationStatus) {
    case "LAWFUL":   msg = lawfulMessage(input, tone);   break;
    case "DEGRADED": msg = degradedMessage(input, tone); break;
    default:         msg = invalidMessage(input, tone);  break;
  }

  // Full output pipeline: semantic compress → tighter of status/tone budget → width → hard fail
  const limit = Math.min(MAX_LINES[msg.status], BODY_LIMIT[tone]);
  let   body  = semanticCompress(msg.body, msg.status);
  body = body.slice(0, limit);
  body = enforceLineWidth(body);
  if (body.length === 0) body = ["Invalid output state."];

  return { ...msg, body, decisiveVariable: input.decisiveVariable };
}

/* =========================================================
   Template builders
   ========================================================= */

function lawfulMessage(input: ToneResolverInput, tone: ToneLevel): ToneMessage {
  const admissible = formatCandidateSet(input.selectedCandidateIds);
  const findings = buildFindings(input);
  const adjustments: string[] = [];

  if (tone === "TERSE") {
    return {
      status: "LAWFUL",
      authority: input.authority,
      tone,
      title: "LAWFUL",
      summary: "Action authorized.",
      body: compactBody([
        "All constraints satisfied.",
        decisiveVariableLine(input, "Outcome is governed by"),
        predictionLine(input),
        predictionCalibrationLine(input),
        marginLine(input, true),
        admissible ? `Admissible candidates: ${admissible}.` : undefined,
      ]),
      findings,
      adjustments,
    };
  }

  if (tone === "CONCISE") {
    return {
      status: "LAWFUL",
      authority: input.authority,
      tone,
      title: "LAWFUL",
      summary: "Action authorized under current model assumptions.",
      body: compactBody([
        "Feasibility satisfied.",
        decisiveVariableLine(input, "Outcome is governed by"),
        predictionLine(input),
        predictionCalibrationLine(input),
        marginLine(input, true),
        admissible ? `Admissible candidates: ${admissible}.` : undefined,
      ]),
      findings,
      adjustments,
    };
  }

  if (tone === "EXPLAINED") {
    return {
      status: "LAWFUL",
      authority: input.authority,
      tone,
      title: "LAWFUL",
      summary: "Action authorized with bounded uncertainty.",
      body: compactBody([
        "All constraints satisfied.",
        decisiveVariableLine(input, "Outcome is governed by"),
        predictionLine(input),
        predictionCalibrationLine(input),
        marginLine(input, true),
        `State tolerance εx = ${fmt(input.epsilonX)}.`,
        `Model confidence = ${fmt(input.modelConfidence)}.`,
        admissible ? `Admissible candidates: ${admissible}.` : undefined,
      ]),
      findings,
      adjustments,
    };
  }

  return {
    status: "LAWFUL",
    authority: input.authority,
    tone,
    title: "LAWFUL",
    summary: "Action authorized, with legality established under the current declared state.",
    body: compactBody([
      "All constraints satisfied.",
      decisiveVariableLine(input, "Outcome is governed by"),
      predictionLine(input),
      marginLine(input, true),
      `State tolerance εx = ${fmt(input.epsilonX)}.`,
      `Identifiability = ${input.identifiability}.`,
      `Model confidence = ${fmt(input.modelConfidence)}.`,
      admissible ? `Admissible candidates: ${admissible}.` : undefined,
    ]),
    findings,
    adjustments,
  };
}

function degradedMessage(input: ToneResolverInput, tone: ToneLevel): ToneMessage {
  const admissible = formatCandidateSet(input.selectedCandidateIds);
  const findings = buildFindings(input);
  const adjustments = sanitizeAdjustments(input.adjustments ?? []);

  if (tone === "TERSE") {
    return {
      status: "DEGRADED",
      authority: input.authority,
      tone,
      title: "DEGRADED",
      summary: "Constrained action applied.",
      body: compactBody([
        "Feasibility holds; margin reduced.",
        decisiveVariableLine(input, "The decisive factor is"),
        predictionLine(input),
        predictionCalibrationLine(input),
        degradedCauseLine(input),
        admissible ? `Admissible under constraint: ${admissible}.` : undefined,
      ]),
      findings,
      adjustments,
    };
  }

  if (tone === "CONCISE") {
    return {
      status: "DEGRADED",
      authority: input.authority,
      tone,
      title: "DEGRADED",
      summary: "Constrained action applied under reduced margin.",
      body: compactBody([
        "Feasibility holds.",
        decisiveVariableLine(input, "The decisive factor is"),
        predictionLine(input),
        predictionCalibrationLine(input),
        degradedCauseLine(input),
        admissible ? `Admissible under constraint: ${admissible}.` : undefined,
      ]),
      findings,
      adjustments,
    };
  }

  if (tone === "EXPLAINED") {
    return {
      status: "DEGRADED",
      authority: input.authority,
      tone,
      title: "DEGRADED",
      summary: "Feasibility holds, but one or more operating margins are reduced.",
      body: compactBody([
        "Feasibility holds; robustness or model confidence is below preferred threshold.",
        decisiveVariableLine(input, "The decisive factor is"),
        predictionLine(input),
        predictionCalibrationLine(input),
        degradedCauseLine(input),
        marginLine(input, false),
        `State tolerance εx = ${fmt(input.epsilonX)}.`,
        `Model confidence = ${fmt(input.modelConfidence)}.`,
        admissible ? `Admissible under constraint: ${admissible}.` : undefined,
      ]),
      findings,
      adjustments,
    };
  }

  return {
    status: "DEGRADED",
    authority: input.authority,
    tone,
    title: "DEGRADED",
    summary:
      "Reliable full-authority action is not supported by the current epistemic or robustness state.",
    body: compactBody([
      "Feasibility holds, but operation is constrained.",
      decisiveVariableLine(input, "The decisive factor is"),
      predictionLine(input),
      degradedCauseLine(input),
      marginLine(input, false),
      `State tolerance εx = ${fmt(input.epsilonX)}.`,
      `Identifiability = ${input.identifiability}.`,
      `Model confidence = ${fmt(input.modelConfidence)}.`,
      admissible ? `Admissible under constraint: ${admissible}.` : undefined,
    ]),
    findings,
    adjustments,
  };
}

function invalidMessage(input: ToneResolverInput, tone: ToneLevel): ToneMessage {
  const findings = buildFindings(input);
  const rejected = formatCandidateSet(input.rejectedCandidateIds);
  const invalidReason = deriveInvalidReason(input);
  const adjustments = sanitizeAdjustments(input.adjustments ?? []);

  if (tone === "TERSE") {
    return {
      status: "INVALID",
      authority: input.authority,
      tone,
      title: "INVALID",
      summary: "Action refused.",
      body: compactBody([
        invalidReason,
        decisiveVariableLine(input, "Failure is governed by"),
        predictionLine(input),
        predictionCalibrationLine(input),
        rejected ? `Excluded candidates: ${rejected}.` : undefined,
        "No admissible candidates remain.",
      ]),
      findings,
      adjustments,
    };
  }

  if (tone === "CONCISE") {
    return {
      status: "INVALID",
      authority: input.authority,
      tone,
      title: "INVALID",
      summary: "No lawful action exists.",
      body: compactBody([
        invalidReason,
        decisiveVariableLine(input, "Failure is governed by"),
        predictionLine(input),
        predictionCalibrationLine(input),
        rejected ? `Excluded candidates: ${rejected}.` : undefined,
        "No admissible candidates remain.",
      ]),
      findings,
      adjustments,
    };
  }

  if (tone === "EXPLAINED") {
    return {
      status: "INVALID",
      authority: input.authority,
      tone,
      title: "INVALID",
      summary: "The current state does not satisfy minimum legality conditions.",
      body: compactBody([
        invalidReason,
        decisiveVariableLine(input, "Failure is governed by"),
        predictionLine(input),
        predictionCalibrationLine(input),
        `State tolerance εx = ${fmt(input.epsilonX)}.`,
        rejected ? `Excluded candidates: ${rejected}.` : undefined,
        "No admissible candidates remain.",
      ]),
      findings,
      adjustments,
    };
  }

  return {
    status: "INVALID",
    authority: input.authority,
    tone,
    title: "INVALID",
    summary:
      "Action is refused because legality cannot be established under the current constraints, knowledge state, or model condition.",
    body: compactBody([
      invalidReason,
      decisiveVariableLine(input, "Failure is governed by"),
      predictionLine(input),
      `State tolerance εx = ${fmt(input.epsilonX)}.`,
      `Identifiability = ${input.identifiability}.`,
      `Model confidence = ${fmt(input.modelConfidence)}.`,
      rejected ? `Excluded candidates: ${rejected}.` : undefined,
      "No admissible candidates remain.",
    ]),
    findings,
    adjustments,
  };
}

/* =========================================================
   Controlled phrase builders
   ========================================================= */

function deriveInvalidReason(input: ToneResolverInput): string {
  if (input.feasibilityOk === false) {
    return input.activeConstraint
      ? `Feasibility violation detected: ${sanitizePhrase(input.activeConstraint)}.`
      : "Feasibility violation detected.";
  }

  if (input.observabilityOk === false) {
    return "Observability insufficient for reliable control.";
  }

  if (input.identifiability === "NONE" || input.identifiabilityOk === false) {
    return "Identifiability failure detected.";
  }

  if (input.modelOk === false) {
    return "Model adequacy below legal threshold.";
  }

  if (input.robustnessOk === false) {
    return input.activeConstraint
      ? `Robustness below minimum required margin at ${sanitizePhrase(input.activeConstraint)}.`
      : "Robustness below minimum required margin.";
  }

  if (input.adaptationOk === false) {
    return "Adaptation integrity below required threshold.";
  }

  return "Verification failed.";
}

function degradedCauseLine(input: ToneResolverInput): string | undefined {
  if (input.robustnessOk === false) {
    if (input.activeConstraint) {
      return `Constraint margin reduced: ${sanitizePhrase(input.activeConstraint)}.`;
    }
    return "Robustness margin reduced.";
  }

  if (input.modelOk === false) {
    return "Model confidence reduced.";
  }

  if (input.identifiability === "PARTIAL" || input.identifiabilityOk === false) {
    return "Identifiability reduced to partial resolution.";
  }

  if (input.observabilityOk === false) {
    return "Observability reduced below preferred operating conditions.";
  }

  if (input.adaptationOk === false) {
    return "Adaptive recovery remains below preferred operating conditions.";
  }

  return "Operating margin reduced.";
}

/**
 * Emit the decisive variable line with prefix-aware framing.
 * Silently suppresses sentinel values ("none", "unknown").
 */
function decisiveVariableLine(
  input: ToneResolverInput,
  prefix: "The decisive factor is" | "Outcome is governed by" | "Failure is governed by"
): string | undefined {
  if (!input.decisiveVariable) return undefined;

  const clean = sanitizePhrase(input.decisiveVariable);

  if (!clean || clean === "unknown" || clean === "none") {
    return undefined;
  }

  return `${prefix} ${clean}.`;
}

/**
 * Emit the calibration note when prediction confidence was downgraded.
 * Surfaces the reason for reduced confidence without editorial commentary.
 */
function predictionCalibrationLine(input: ToneResolverInput): string | undefined {
  const note = input.prediction?.calibrationNote;
  if (!note) return undefined;

  return sanitizePhrase(note);
}

/**
 * Emit the failure prediction line.
 * Only surfaced when confidence is moderate or high.
 * Low-confidence predictions are suppressed to avoid speculative framing.
 */
function predictionLine(input: ToneResolverInput): string | undefined {
  if (!input.prediction) return undefined;

  const { nextFailure, confidence } = input.prediction;

  if (!nextFailure || confidence === "low") return undefined;

  const clean = sanitizePhrase(nextFailure);
  if (!clean) return undefined;

  return `Given current drift, ${clean} is next.`;
}

/**
 * Infer the decisive variable from the verification flags
 * when none is explicitly provided by the runtime.
 */
function inferDecisiveVariable(input: ToneResolverInput): string {
  if (input.feasibilityOk === false)    return "feasibility constraint";
  if (input.robustnessOk === false)     return "robustness margin";
  if (input.modelOk === false)          return "model confidence";
  if (input.identifiabilityOk === false) return "identifiability";
  if (input.observabilityOk === false)  return "observability";
  if (input.adaptationOk === false)     return "adaptation integrity";
  return "robustness margin";
}

function marginLine(
  input: ToneResolverInput,
  favorable: boolean
): string | undefined {
  if (
    input.robustnessEpsilon === undefined ||
    input.robustnessEpsilonMin === undefined
  ) {
    return favorable ? undefined : "Robustness margin reduced.";
  }

  const epsilon = fmt(input.robustnessEpsilon);
  const min = fmt(input.robustnessEpsilonMin);

  if (favorable) {
    return `Robustness margin acceptable: ε = ${epsilon}, threshold = ${min}.`;
  }

  return `Robustness margin reduced: ε = ${epsilon}, threshold = ${min}.`;
}

function formatCandidateSet(ids?: string[]): string | undefined {
  if (!ids || ids.length === 0) return undefined;
  return ids.map(sanitizePhrase).join(", ");
}

function buildFindings(input: ToneResolverInput): string[] {
  const findings: string[] = [];

  if (input.feasibilityOk !== undefined) {
    findings.push(
      input.feasibilityOk
        ? "Feasibility satisfied."
        : "Feasibility violation detected."
    );
  }

  if (input.robustnessOk !== undefined) {
    findings.push(
      input.robustnessOk
        ? "Robustness condition satisfied."
        : "Robustness condition below threshold."
    );
  }

  if (input.observabilityOk !== undefined) {
    findings.push(
      input.observabilityOk
        ? "Observability condition satisfied."
        : "Observability condition insufficient."
    );
  }

  if (input.identifiabilityOk !== undefined) {
    findings.push(
      input.identifiabilityOk
        ? "Identifiability condition satisfied."
        : "Identifiability condition insufficient."
    );
  }

  if (input.modelOk !== undefined) {
    findings.push(
      input.modelOk
        ? "Model adequacy satisfied."
        : "Model adequacy below threshold."
    );
  }

  if (input.adaptationOk !== undefined) {
    findings.push(
      input.adaptationOk
        ? "Adaptation integrity satisfied."
        : "Adaptation integrity below threshold."
    );
  }

  for (const reason of input.reasons ?? []) {
    findings.push(reasonToFinding(reason));
  }

  return dedupe(compactBody(findings));
}

/* =========================================================
   Safety / compliance helpers
   ========================================================= */

/**
 * Intentionally restrictive.
 * Presentation output must not drift into theatrical, vague,
 * conversational, or speculative language.
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\bseems?\b/gi,
  /\bprobably\b/gi,
  /\bkind of\b/gi,
  /\bmaybe\b/gi,
  /\bmight be okay\b/gi,
  /\bgood idea\b/gi,
  /\bbad idea\b/gi,
  /\byou should\b/gi,
  /\bi recommend\b/gi,
  /\blet's\b/gi,
  /\bbasically\b/gi,
  /\bhonestly\b/gi,
  /\bi think\b/gi,
  /\bclearly\b/gi,
  /\bobviously\b/gi,
  /\bas anyone can see\b/gi,
  /!+/g,
];

function sanitizePhrase(text: string): string {
  let out = text.trim();

  for (const pattern of FORBIDDEN_PATTERNS) {
    out = out.replace(pattern, "");
  }

  out = out.replace(/\s+/g, " ").trim();

  if (!out) {
    return "unspecified condition";
  }

  return ensureTerminalPeriodRemoved(out);
}

function sanitizeAdjustments(adjustments: string[]): string[] {
  return dedupe(
    adjustments
      .map(sanitizePhrase)
      .filter(Boolean)
      .map((s) => (s.endsWith(".") ? s : `${s}.`))
  );
}

function reasonToFinding(reason: string): string {
  const clean = sanitizePhrase(reason);
  if (!clean) return "Unspecified finding.";
  return clean.endsWith(".") ? clean : `${clean}.`;
}

function compactBody(lines: Array<string | undefined>): string[] {
  const seen = new Set<string>();

  return lines
    .filter((line): line is string => Boolean(line))
    .map((line) => {
      const clean = sanitizePhrase(line);
      return clean.endsWith(".") ? clean : `${clean}.`;
    })
    .filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(3) : "n/a";
}

function ensureTerminalPeriodRemoved(text: string): string {
  return text.replace(/\.+$/, "");
}

/* =========================================================
   Re-export types so callers can import from one place
   ========================================================= */
export type { ToneLevel, ToneResolverInput, ToneMessage, VerificationStatus };
