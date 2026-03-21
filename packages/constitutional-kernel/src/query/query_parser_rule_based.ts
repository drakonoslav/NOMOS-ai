/**
 * query_parser_rule_based.ts
 *
 * Deterministic, section-aware NOMOS query parser.
 *
 * Constitutional role:
 * - Fallback parser when LLM is unavailable.
 * - Robust single-pass section segmentation — headings recognized with or without colons.
 * - Aliases for common natural language heading variants (UNKNOWNS, OPTIONS, GOAL, etc.).
 * - Candidates parsed with multi-format detection: A: / A. / A) / bare "A text".
 * - Falls back to heuristic sentence classification for fully free-form input.
 * - Does NOT assign lawfulness, authority, or constitutional status.
 *
 * Recognized heading roles (canonical + aliases, case-insensitive, colon optional):
 *
 *   objective:   Objective, Goal, Goals, Purpose, Aim
 *   constraint:  Constraint, Constraints, Requirements, Requirement, Rules, Rule,
 *                Limits, Limit, Conditions, Condition
 *   candidate:   Candidate, Candidates, Option, Options, Choice, Choices,
 *                Solution, Solutions, Plan, Plans, Alternative, Alternatives
 *   uncertainty: Uncertainty, Uncertainties, Assumption, Assumptions, Unknown,
 *                Unknowns, Question, Questions
 *   state:       State, Facts, Fact, Context, Situation, Background
 */

import {
  NomosCandidateBlock,
  NomosObjectiveBlock,
  NomosQuery,
  NomosStateBlock,
} from "./query_types.js";

/* =========================================================
   Heading map — maps normalized heading word → semantic role
   ========================================================= */

type HeadingRole = "objective" | "constraint" | "candidate" | "uncertainty" | "state";

const HEADING_MAP: Record<string, HeadingRole> = {
  // Objective
  objective:    "objective",
  objectives:   "objective",
  goal:         "objective",
  goals:        "objective",
  purpose:      "objective",
  aim:          "objective",
  aims:         "objective",
  // Constraint
  constraint:   "constraint",
  constraints:  "constraint",
  requirement:  "constraint",
  requirements: "constraint",
  rule:         "constraint",
  rules:        "constraint",
  limit:        "constraint",
  limits:       "constraint",
  condition:    "constraint",
  conditions:   "constraint",
  // Candidate
  candidate:    "candidate",
  candidates:   "candidate",
  option:       "candidate",
  options:      "candidate",
  choice:       "candidate",
  choices:      "candidate",
  solution:     "candidate",
  solutions:    "candidate",
  plan:         "candidate",
  plans:        "candidate",
  alternative:  "candidate",
  alternatives: "candidate",
  // Uncertainty
  uncertainty:    "uncertainty",
  uncertainties:  "uncertainty",
  assumption:     "uncertainty",
  assumptions:    "uncertainty",
  unknown:        "uncertainty",
  unknowns:       "uncertainty",
  question:       "uncertainty",
  questions:      "uncertainty",
  // State / facts
  state:       "state",
  facts:       "state",
  fact:        "state",
  context:     "state",
  situation:   "state",
  background:  "state",
};

/**
 * matchKernelHeading — recognizes a line as a section heading.
 *
 * Accepts:   "CONSTRAINTS", "Constraints:", "goal", "GOAL:", "OPTIONS :"
 * Rejects:   "Options are many...", "Goal: achieve X with Y" (has inline content)
 *
 * Returns the semantic role if matched, null otherwise.
 */
function matchKernelHeading(line: string): HeadingRole | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Strip optional trailing colon and surrounding whitespace
  // The line must be ONLY the heading word (possibly with colon) — no inline content
  const bare = trimmed.replace(/\s*:?\s*$/, "").trim().toLowerCase();
  if (!bare) return null;

  return HEADING_MAP[bare] ?? null;
}

/* =========================================================
   Single-pass section segmenter
   ========================================================= */

interface KernelSection {
  role: HeadingRole;
  lines: string[];
}

interface SegmentResult {
  sections: KernelSection[];
  unlabeled: string[];
  hasStructure: boolean;
}

/**
 * segmentKernelSections — single-pass segmenter with alias-aware heading detection.
 *
 * Headings are recognized:
 *   - Case-insensitively (CONSTRAINTS, constraints, Constraints)
 *   - With or without colon (STATE: and STATE both open a section)
 *   - As the complete trimmed line — no false positives on inline content
 *
 * Content under a heading belongs to that heading's section until the
 * next recognized heading appears.
 */
function segmentKernelSections(text: string): SegmentResult {
  const lines = text.split("\n");
  const sections: KernelSection[] = [];
  const unlabeled: string[] = [];
  let current: KernelSection | null = null;
  let hasStructure = false;

  for (const rawLine of lines) {
    const role = matchKernelHeading(rawLine);

    if (role !== null) {
      hasStructure = true;
      current = { role, lines: [] };
      sections.push(current);
      continue;
    }

    if (current === null) {
      unlabeled.push(rawLine);
    } else {
      current.lines.push(rawLine);
    }
  }

  return { sections, unlabeled, hasStructure };
}

/**
 * Collect all lines under a given role from the segmented sections.
 * Multiple sections with the same role are merged (handles duplicate headings).
 */
function getSectionLines(sections: KernelSection[], role: HeadingRole): string[] {
  return sections.filter((s) => s.role === role).flatMap((s) => s.lines);
}

/* =========================================================
   Candidate parsing — multi-format
   ========================================================= */

/**
 * parseCandidateLine — parses a single line as a candidate in a candidate section.
 *
 * Accepted formats:
 *   A: text      (colon format)
 *   A. text      (period format)
 *   A) text      (paren format)
 *   A text       (bare space — accepted within explicit candidate sections, A-D only)
 *   Candidate A: text
 *   Option A: text
 *
 * The bare "A text" format is only used within explicit candidate sections to avoid
 * false positives. Recovery scanning uses stricter formats only.
 */
function parseCandidateLine(line: string, withinSection: boolean): NomosCandidateBlock | null {
  const t = line.trim();
  if (!t) return null;

  // Colon / period / paren format: A: text  A. text  A) text
  const punctuated = t.match(/^([A-Z])\s*[:.)] \s*(.+)$/i);
  if (punctuated) {
    return { id: punctuated[1].toUpperCase(), description: punctuated[2].trim() };
  }

  // No-space version: A:text  A.text  A)text
  const nospace = t.match(/^([A-Z])[:.)](.+)$/i);
  if (nospace) {
    const text = nospace[2].trim();
    if (text) return { id: nospace[1].toUpperCase(), description: text };
  }

  // Long form: "Candidate A: text"  "Option A: text"
  const long = t.match(/^(?:candidate|option)\s+([A-Z])\s*[:.)]?\s*(.+)$/i);
  if (long) {
    return { id: long[1].toUpperCase(), description: long[2].trim() };
  }

  // Bare format: "A text" — only accepted within explicit candidate sections
  // Restricted to A-D to limit false positives
  if (withinSection) {
    const bare = t.match(/^([A-D])\s+(.{2,})$/i);
    if (bare) {
      return { id: bare[1].toUpperCase(), description: bare[2].trim() };
    }
  }

  return null;
}

function parseCandidateBlock(lines: string[]): NomosCandidateBlock[] {
  const results: NomosCandidateBlock[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const match = parseCandidateLine(line, true);
    if (match && !seen.has(match.id)) {
      seen.add(match.id);
      results.push(match);
    }
  }

  return results;
}

/* =========================================================
   Constraint / uncertainty list extraction
   ========================================================= */

function parseListBlock(lines: string[]): string[] {
  const out: string[] = [];
  for (const rawLine of lines) {
    const parts = rawLine.split(";").map((s) => s.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
    out.push(...parts);
  }
  return dedupe(out);
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
   Heuristic helpers — used for fully unstructured free-form input
   (no recognized headings found anywhere)
   ========================================================= */

function splitSentences(input: string): string[] {
  return input
    .split(/[\n.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function looksLikeConstraint(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return [
    "must", "cannot", "can't", "should not", "at least", "no more than",
    "avoid", "need to", "required", "limit", "under ", "maximum", "minimum",
    "no less than", "at most", "fewer than", "more than", "only",
  ].some((t) => lower.includes(t));
}

function looksLikeUncertainty(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return [
    "not sure", "uncertain", "unknown", "maybe", "might", "probably",
    "guess", "unsure", "unclear", "not certain", "depends",
  ].some((t) => lower.includes(t));
}

function looksLikeObjective(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return [
    "goal", "want", "maximize", "minimize", "best", "optimize",
    "trying to", "would like", "priority", "aim", "purpose",
  ].some((t) => lower.includes(t));
}

function looksLikeCandidate(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return [
    "option", "candidate", "either", "plan", "choice", "path",
    "stay", "leave", "accept", "reject", "alternative",
  ].some((t) => lower.includes(t));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/**
 * Heuristic candidate extraction for fully unstructured input.
 */
function heuristicCandidates(
  candidateSentences: string[],
  rawInput: string
): NomosCandidateBlock[] {
  // Lettered list with punctuation: "A. something"  "A: something"  "A) something"
  const punctMatches = [...rawInput.matchAll(/(?:^|\n)([A-D])[:.)] \s*([^\n]+)/gi)];
  if (punctMatches.length > 0) {
    const seen = new Set<string>();
    return punctMatches
      .map((m) => ({ id: m[1].toUpperCase(), description: m[2].trim() }))
      .filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
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

  // Fall back to heuristic candidate sentences (filtered to exclude single-word matches)
  const filtered = candidateSentences.filter((s) => s.length > 5);
  return dedupe(filtered).map((description, i) => ({
    id: String.fromCharCode(65 + i),
    description,
  }));
}

/* =========================================================
   Parser class
   ========================================================= */

export class NomosQueryParser {
  public parse(rawInput: string): NomosQuery {
    const segmented = segmentKernelSections(rawInput);

    return segmented.hasStructure
      ? this.parseSectionBased(rawInput, segmented)
      : this.parseHeuristic(rawInput);
  }

  /* -------------------------------------------------------
     Section-based parsing (structured input with recognized headings)
     ------------------------------------------------------- */

  private parseSectionBased(rawInput: string, segmented: SegmentResult): NomosQuery {
    const { sections } = segmented;

    const objectiveLines    = getSectionLines(sections, "objective");
    const constraintLines   = getSectionLines(sections, "constraint");
    const candidateLines    = getSectionLines(sections, "candidate");
    const uncertaintyLines  = getSectionLines(sections, "uncertainty");
    const stateLines        = getSectionLines(sections, "state");

    const constraints   = parseListBlock(constraintLines);
    const uncertainties = parseListBlock(uncertaintyLines);
    const stateFacts    = parseListBlock(stateLines);
    const candidates    = parseCandidateBlock(candidateLines);

    // Objective: join all non-empty lines from the objective section
    const objectiveText = objectiveLines
      .map((l) => l.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean)
      .join(" ");

    const state: NomosStateBlock = {
      description:  rawInput.trim(),
      facts:        stateFacts,
      constraints,
      uncertainties,
    };

    const objective: NomosObjectiveBlock | undefined =
      objectiveText ? { description: objectiveText } : undefined;

    const completeness     = assessCompleteness(state, candidates, objective);
    const parserConfidence = assessConfidence(state, candidates, completeness);

    const notes: string[] = [];
    if (!objectiveText)           notes.push("Missing objective.");
    if (candidates.length === 0)  notes.push("No candidates found. Use 'A: text', 'A. text', or 'A) text' format.");
    if (constraints.length === 0) notes.push("No constraints declared.");
    notes.push("Section-based parser used.");

    return { rawInput, state, candidates, objective, parserConfidence, completeness, notes };
  }

  /* -------------------------------------------------------
     Heuristic parsing (fully unstructured free-form input)
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
      "Goal:, Constraints:, Options:, Unknowns:"
    );

    return { rawInput, state, candidates, objective, parserConfidence, completeness, notes };
  }
}
