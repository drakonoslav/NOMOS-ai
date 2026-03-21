/**
 * query_parser_rule_based.ts
 *
 * Deterministic, regex-based NOMOS query parser.
 *
 * Constitutional role:
 * - Fallback parser when LLM is unavailable.
 * - Extracts structured fields from natural language using heuristics.
 * - Does NOT assign lawfulness, authority, or constitutional status.
 */

import {
  NomosCandidateBlock,
  NomosObjectiveBlock,
  NomosQuery,
  NomosStateBlock,
} from "./query_types.js";

function splitSentences(input: string): string[] {
  return input
    .split(/[\n.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function looksLikeConstraint(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return [
    "must",
    "cannot",
    "can't",
    "should not",
    "at least",
    "no more than",
    "avoid",
    "need to",
    "required",
    "limit",
  ].some((token) => lower.includes(token));
}

function looksLikeUncertainty(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return [
    "not sure",
    "uncertain",
    "unknown",
    "maybe",
    "might",
    "probably",
    "guess",
    "unsure",
    "unclear",
  ].some((token) => lower.includes(token));
}

function looksLikeObjective(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return [
    "goal",
    "want",
    "maximize",
    "minimize",
    "best",
    "optimize",
    "trying to",
    "would like",
    "priority",
  ].some((token) => lower.includes(token));
}

function looksLikeCandidate(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return [
    "option",
    "candidate",
    "could",
    "either",
    "or",
    "plan",
    "choice",
    "path",
    "stay",
    "leave",
    "accept",
    "reject",
    "increase",
    "decrease",
  ].some((token) => lower.includes(token));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

export class NomosQueryParser {
  public parse(rawInput: string): NomosQuery {
    const sentences = splitSentences(rawInput);

    const facts: string[] = [];
    const constraints: string[] = [];
    const uncertainties: string[] = [];
    const objectiveSentences: string[] = [];
    const candidateSentences: string[] = [];

    for (const sentence of sentences) {
      if (looksLikeConstraint(sentence)) {
        constraints.push(sentence);
        continue;
      }
      if (looksLikeUncertainty(sentence)) {
        uncertainties.push(sentence);
        continue;
      }
      if (looksLikeObjective(sentence)) {
        objectiveSentences.push(sentence);
        continue;
      }
      if (looksLikeCandidate(sentence)) {
        candidateSentences.push(sentence);
        continue;
      }
      facts.push(sentence);
    }

    const candidates = this.extractCandidates(candidateSentences, rawInput);
    const state = this.buildState(rawInput, facts, constraints, uncertainties);
    const objective = this.buildObjective(objectiveSentences);

    const completeness = this.assessCompleteness(state, candidates, objective);
    const parserConfidence = this.assessConfidence(state, candidates, completeness);

    const notes: string[] = [];
    if (candidates.length === 0) notes.push("No explicit candidates detected.");
    if (constraints.length === 0) notes.push("No explicit hard constraints detected.");
    if (!objective) notes.push("No explicit objective detected.");
    notes.push("Rule-based parser used. Consider providing more explicit structure.");

    return {
      rawInput,
      state,
      candidates,
      objective,
      parserConfidence,
      completeness,
      notes,
    };
  }

  private buildState(
    rawInput: string,
    facts: string[],
    constraints: string[],
    uncertainties: string[]
  ): NomosStateBlock {
    return {
      description: rawInput.trim(),
      facts: dedupe(facts),
      constraints: dedupe(constraints),
      uncertainties: dedupe(uncertainties),
    };
  }

  private buildObjective(sentences: string[]): NomosObjectiveBlock | undefined {
    const normalized = dedupe(sentences);
    if (normalized.length === 0) return undefined;
    return { description: normalized.join("; ") };
  }

  private extractCandidates(
    candidateSentences: string[],
    rawInput: string
  ): NomosCandidateBlock[] {
    const labeledMatches = [...rawInput.matchAll(/\b([A-Z])\s*:\s*([^\n]+)/g)];
    if (labeledMatches.length > 0) {
      return labeledMatches.map((match) => ({
        id: match[1],
        description: match[2].trim(),
      }));
    }

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

  private assessCompleteness(
    state: NomosStateBlock,
    candidates: NomosCandidateBlock[],
    objective?: NomosObjectiveBlock
  ): "COMPLETE" | "PARTIAL" | "INSUFFICIENT" {
    const hasFacts = state.facts.length > 0 || state.description.length > 0;
    const hasConstraints = state.constraints.length > 0;
    const hasCandidates = candidates.length > 0;
    const hasObjective = !!objective;

    if (hasFacts && hasConstraints && hasCandidates && hasObjective) return "COMPLETE";
    if (hasFacts && hasCandidates) return "PARTIAL";
    return "INSUFFICIENT";
  }

  private assessConfidence(
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
}
