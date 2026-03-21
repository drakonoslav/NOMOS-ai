/**
 * query_parser_rule_based.ts
 *
 * Deterministic, section-aware NOMOS query parser.
 *
 * Constitutional role:
 * - Fallback parser when LLM is unavailable.
 * - Uses anchored regex block capture for structured input (section headers).
 * - Candidates are parsed ONLY from the Candidates block — never from full text.
 * - Falls back to heuristic sentence classification for free-form input.
 * - Does NOT assign lawfulness, authority, or constitutional status.
 *
 * Supported section format (case-insensitive, any order):
 *   Objective:   <text>
 *   Constraint:  <text> (also: Constraints:)
 *   Candidates:
 *     A. <text>
 *     B. <text>
 *   Question:    <text>
 *   Assumption:  <text>  (also: Assumptions:, Uncertainty:)
 */

import {
  NomosCandidateBlock,
  NomosObjectiveBlock,
  NomosQuery,
  NomosStateBlock,
} from "./query_types.js";

/* =========================================================
   Known section header names
   ========================================================= */

const SECTION_HEADERS = [
  "Objective",
  "Constraint",
  "Candidate",
  "Question",
  "Assumption",
  "Uncertainty",
];

/* =========================================================
   Section extraction — regex block capture
   Each label captures ALL content until the next section header or EOF.
   ========================================================= */

/**
 * Lookahead pattern that stops capture at any known section header.
 * Accounts for plural forms (Constraints:, Candidates:, Assumptions:).
 */
function buildSectionLookahead(): string {
  const alts = SECTION_HEADERS.map((h) => `${h}s?`).join("|");
  return `(?=\\n(?:${alts})\\s*:|$)`;
}

/**
 * Extract a named section's content block.
 * Returns trimmed content or empty string if not found.
 */
function extractSection(text: string, label: string): string {
  const lookahead = buildSectionLookahead();
  // Match "label:" or "labels:" (plural), capture content until next section or EOF
  const pattern = new RegExp(
    `(?:^|\\n)${label}s?\\s*:\\s*([\\s\\S]*?)${lookahead}`,
    "i"
  );
  const match = text.match(pattern);
  return match ? match[1].trim() : "";
}

/**
 * Returns true when the input contains at least one known section header.
 */
function hasSectionHeaders(text: string): boolean {
  return SECTION_HEADERS.some((h) =>
    new RegExp(`(?:^|\\n)${h}s?\\s*:`, "i").test(text)
  );
}

/* =========================================================
   Candidates — section-scoped only
   Pattern: "A. description" — letter A–D followed by period and space
   ========================================================= */

function parseCandidateBlock(block: string): NomosCandidateBlock[] {
  const results: NomosCandidateBlock[] = [];

  for (const line of block.split("\n")) {
    const match = line.match(/^([A-D])\.\s+(\S.*)/);
    if (match) {
      results.push({ id: match[1], description: match[2].trim() });
    }
  }

  return results;
}

/* =========================================================
   Constraint / uncertainty list extraction
   Splits on newlines and semicolons, strips bullet characters
   ========================================================= */

function parseListBlock(block: string): string[] {
  if (!block) return [];
  return block
    .split(/\n|;/)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

/* =========================================================
   Completeness + confidence assessment
   ========================================================= */

function assessCompleteness(
  state: NomosStateBlock,
  candidates: NomosCandidateBlock[],
  objective?: NomosObjectiveBlock
): "COMPLETE" | "PARTIAL" | "INSUFFICIENT" {
  const hasFacts       = state.facts.length > 0 || state.description.length > 0;
  const hasConstraints = state.constraints.length > 0;
  const hasCandidates  = candidates.length > 0;
  const hasObjective   = !!objective;

  if (hasFacts && hasConstraints && hasCandidates && hasObjective) return "COMPLETE";
  if (hasFacts && hasCandidates)                                    return "PARTIAL";
  return "INSUFFICIENT";
}

function assessConfidence(
  state: NomosStateBlock,
  candidates: NomosCandidateBlock[],
  completeness: "COMPLETE" | "PARTIAL" | "INSUFFICIENT"
): "HIGH" | "MEDIUM" | "LOW" {
  if (
    completeness === "COMPLETE" &&
    state.constraints.length >= 1 &&
    candidates.length >= 2
  ) {
    return "HIGH";
  }
  if (completeness === "PARTIAL") return "MEDIUM";
  return "LOW";
}

/* =========================================================
   Heuristic helpers — used for unstructured free-form input
   ========================================================= */

function splitSentences(input: string): string[] {
  return input
    .split(/[\n.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function looksLikeConstraint(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return ["must", "cannot", "can't", "should not", "at least", "no more than",
    "avoid", "need to", "required", "limit"].some((t) => lower.includes(t));
}

function looksLikeUncertainty(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return ["not sure", "uncertain", "unknown", "maybe", "might", "probably",
    "guess", "unsure", "unclear"].some((t) => lower.includes(t));
}

function looksLikeObjective(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return ["goal", "want", "maximize", "minimize", "best", "optimize",
    "trying to", "would like", "priority"].some((t) => lower.includes(t));
}

function looksLikeCandidate(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return ["option", "candidate", "either", "plan", "choice", "path",
    "stay", "leave", "accept", "reject"].some((t) => lower.includes(t));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/**
 * Heuristic candidate extraction for unstructured input.
 * Uses "A. text" pattern (period, not colon) to avoid matching section headers.
 */
function heuristicCandidates(
  candidateSentences: string[],
  rawInput: string
): NomosCandidateBlock[] {
  // Lettered list with period: "A. something" — safe, avoids "Objective:" etc.
  const dotMatches = [...rawInput.matchAll(/(?:^|\n)([A-D])\.\s+([^\n]+)/g)];
  if (dotMatches.length > 0) {
    return dotMatches.map((m) => ({ id: m[1], description: m[2].trim() }));
  }

  // Either/or split
  const lower = rawInput.toLowerCase();
  if (lower.includes("either") && lower.includes(" or ")) {
    const parts = rawInput.split(/\bor\b/i).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return parts.slice(0, 3).map((description, i) => ({
        id: String.fromCharCode(65 + i),
        description,
      }));
    }
  }

  return dedupe(candidateSentences).map((description, i) => ({
    id: String.fromCharCode(65 + i),
    description,
  }));
}

/* =========================================================
   Parser class
   ========================================================= */

export class NomosQueryParser {
  public parse(rawInput: string): NomosQuery {
    return hasSectionHeaders(rawInput)
      ? this.parseSectionBased(rawInput)
      : this.parseHeuristic(rawInput);
  }

  /* -------------------------------------------------------
     Section-based parsing (structured input with headers)
     ------------------------------------------------------- */

  private parseSectionBased(rawInput: string): NomosQuery {
    const objectiveText   = extractSection(rawInput, "Objective");
    const constraintText  = extractSection(rawInput, "Constraint");
    const candidatesText  = extractSection(rawInput, "Candidate");
    const questionText    = extractSection(rawInput, "Question");
    const assumptionText  = extractSection(rawInput, "Assumption");
    const uncertaintyText = extractSection(rawInput, "Uncertainty");

    const constraints   = dedupe(parseListBlock(constraintText));
    const uncertainties = dedupe(parseListBlock(uncertaintyText || assumptionText));

    // CRITICAL: parse candidates ONLY from the Candidates block
    const candidates = parseCandidateBlock(candidatesText);

    const state: NomosStateBlock = {
      description:  rawInput.trim(),
      facts:        [],
      constraints,
      uncertainties,
    };

    const objective: NomosObjectiveBlock | undefined =
      objectiveText ? { description: objectiveText } : undefined;

    const completeness     = assessCompleteness(state, candidates, objective);
    const parserConfidence = assessConfidence(state, candidates, completeness);

    const notes: string[] = [];
    if (!objectiveText)            notes.push("Missing objective.");
    if (candidates.length === 0)   notes.push("No candidates found in Candidates block. Use 'A. text' format.");
    if (constraints.length === 0)  notes.push("No constraints declared.");
    if (questionText)              notes.push(`Question: ${questionText}`);
    notes.push("Section-based parser used.");

    return { rawInput, state, candidates, objective, parserConfidence, completeness, notes };
  }

  /* -------------------------------------------------------
     Heuristic parsing (unstructured free-form input)
     ------------------------------------------------------- */

  private parseHeuristic(rawInput: string): NomosQuery {
    const sentences = splitSentences(rawInput);

    const facts:              string[] = [];
    const constraints:        string[] = [];
    const uncertainties:      string[] = [];
    const objectiveSentences: string[] = [];
    const candidateSentences: string[] = [];

    for (const sentence of sentences) {
      if (looksLikeConstraint(sentence))  { constraints.push(sentence);        continue; }
      if (looksLikeUncertainty(sentence)) { uncertainties.push(sentence);      continue; }
      if (looksLikeObjective(sentence))   { objectiveSentences.push(sentence); continue; }
      if (looksLikeCandidate(sentence))   { candidateSentences.push(sentence); continue; }
      facts.push(sentence);
    }

    const candidates = heuristicCandidates(candidateSentences, rawInput);

    const state: NomosStateBlock = {
      description:  rawInput.trim(),
      facts:        dedupe(facts),
      constraints:  dedupe(constraints),
      uncertainties: dedupe(uncertainties),
    };

    const objectiveNormalized = dedupe(objectiveSentences);
    const objective: NomosObjectiveBlock | undefined =
      objectiveNormalized.length > 0
        ? { description: objectiveNormalized.join("; ") }
        : undefined;

    const completeness     = assessCompleteness(state, candidates, objective);
    const parserConfidence = assessConfidence(state, candidates, completeness);

    const notes: string[] = [];
    if (candidates.length === 0)  notes.push("No explicit candidates detected.");
    if (constraints.length === 0) notes.push("No explicit hard constraints detected.");
    if (!objective)               notes.push("No explicit objective detected.");
    notes.push(
      "Heuristic parser used. For precise results, use section headers: " +
      "Objective:, Constraint:, Candidates:, Question:"
    );

    return { rawInput, state, candidates, objective, parserConfidence, completeness, notes };
  }
}
