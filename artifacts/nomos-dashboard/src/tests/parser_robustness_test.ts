/**
 * parser_robustness_test.ts
 *
 * Regression tests for parser robustness requirements:
 *
 * 1. Canonical section headings dominate assignment.
 * 2. Heading matching is case-insensitive, colon optional, whitespace-tolerant.
 * 3. Section boundaries terminate cleanly — no content leakage.
 * 4. Candidate detection accepts A:, A., A), Candidate A:, Option A: formats.
 * 5. Candidate recovery pass finds candidates even when section segmentation is imperfect.
 * 6. The canonical UI template input (dinner planning) is parsed correctly end-to-end.
 */

import { describe, it, expect } from "vitest";
import {
  matchHeading,
  segmentSections,
  matchCandidateLine,
  extractBulletedSection,
  extractSingleSection,
  extractCandidates,
  extractConstraintLines,
  CANONICAL_HEADINGS,
  HEADING_ALIASES,
} from "../compiler/field_extractor";
import { autoCompile } from "../compiler/auto_compiler";

// ─── Canonical dinner planning input (exact reproduction from bug report) ─────

const DINNER_PLANNING_INPUT = `STATE:
- I need to prepare dinner tonight using food already in the apartment.

CONSTRAINTS:
- I cannot leave home.
- Total meal must stay under 700 kcal.
- It must include at least 40g protein.
- I can only use foods currently in the kitchen.

UNCERTAINTIES:
- I am not sure whether I have enough Greek yogurt left.
- I do not know whether the whey scoop is 25g or 30g protein.

CANDIDATES:
A: Make oats, whey, and yogurt bowl.
B: Make eggs with oats and banana.

OBJECTIVE:
Choose the most feasible high-protein dinner under current constraints.`;

// ─── matchHeading ─────────────────────────────────────────────────────────────

describe("matchHeading", () => {
  it("recognizes all canonical headings with colon", () => {
    for (const h of CANONICAL_HEADINGS) {
      expect(matchHeading(`${h}:`)).toBe(h);
    }
  });

  it("recognizes all canonical headings WITHOUT colon", () => {
    for (const h of CANONICAL_HEADINGS) {
      expect(matchHeading(h)).toBe(h);
    }
  });

  it("is case-insensitive", () => {
    expect(matchHeading("state:")).toBe("STATE");
    expect(matchHeading("State:")).toBe("STATE");
    expect(matchHeading("constraints")).toBe("CONSTRAINTS");
    expect(matchHeading("Candidates:")).toBe("CANDIDATES");
    expect(matchHeading("objective")).toBe("OBJECTIVE");
    expect(matchHeading("Uncertainties:")).toBe("UNCERTAINTIES");
    expect(matchHeading("facts")).toBe("FACTS");
  });

  it("handles whitespace before and after colon", () => {
    expect(matchHeading("STATE :")).toBe("STATE");
    expect(matchHeading("STATE : ")).toBe("STATE");
    expect(matchHeading("  CONSTRAINTS:  ")).toBe("CONSTRAINTS");
  });

  it("rejects ordinary content lines that start with a heading word", () => {
    expect(matchHeading("State description follows here.")).toBeNull();
    expect(matchHeading("Constraints on the system include...")).toBeNull();
    expect(matchHeading("Candidates are evaluated below.")).toBeNull();
    expect(matchHeading("Objective function maximizes utility.")).toBeNull();
  });

  it("rejects empty lines", () => {
    expect(matchHeading("")).toBeNull();
    expect(matchHeading("   ")).toBeNull();
  });

  it("rejects single-letter lines (candidate markers)", () => {
    expect(matchHeading("A:")).toBeNull();
    expect(matchHeading("B:")).toBeNull();
    expect(matchHeading("A")).toBeNull();
  });
});

// ─── segmentSections ──────────────────────────────────────────────────────────

describe("segmentSections — section isolation", () => {
  it("segments the canonical dinner planning input into correct sections", () => {
    const { sections } = segmentSections(DINNER_PLANNING_INPUT);

    expect(sections.has("STATE")).toBe(true);
    expect(sections.has("CONSTRAINTS")).toBe(true);
    expect(sections.has("UNCERTAINTIES")).toBe(true);
    expect(sections.has("CANDIDATES")).toBe(true);
    expect(sections.has("OBJECTIVE")).toBe(true);
  });

  it("STATE section does NOT contain CONSTRAINTS content", () => {
    const { sections } = segmentSections(DINNER_PLANNING_INPUT);
    const stateLines = sections.get("STATE")!.join(" ");
    expect(stateLines).not.toContain("I cannot leave home");
    expect(stateLines).not.toContain("CONSTRAINTS");
  });

  it("CONSTRAINTS section does NOT contain UNCERTAINTIES content", () => {
    const { sections } = segmentSections(DINNER_PLANNING_INPUT);
    const constraintLines = sections.get("CONSTRAINTS")!.join(" ");
    expect(constraintLines).not.toContain("Greek yogurt left");
    expect(constraintLines).not.toContain("whey scoop");
    expect(constraintLines).not.toContain("UNCERTAINTIES");
  });

  it("UNCERTAINTIES section does NOT contain CANDIDATES content", () => {
    const { sections } = segmentSections(DINNER_PLANNING_INPUT);
    const uncertaintyLines = sections.get("UNCERTAINTIES")!.join(" ");
    expect(uncertaintyLines).not.toContain("Make oats");
    expect(uncertaintyLines).not.toContain("CANDIDATES");
  });

  it("CANDIDATES section does NOT contain OBJECTIVE content", () => {
    const { sections } = segmentSections(DINNER_PLANNING_INPUT);
    const candidateLines = sections.get("CANDIDATES")!.join(" ");
    expect(candidateLines).not.toContain("most feasible");
    expect(candidateLines).not.toContain("OBJECTIVE");
  });

  it("state content is only the declared state line", () => {
    const { sections } = segmentSections(DINNER_PLANNING_INPUT);
    const stateContent = sections.get("STATE")!
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");
    expect(stateContent).toContain("prepare dinner tonight");
    expect(stateContent).not.toContain("cannot leave home");
  });

  it("preserves unlabeled content before the first heading", () => {
    const input = "preamble line\nSTATE:\n- actual state";
    const { unlabeled } = segmentSections(input);
    expect(unlabeled.join(" ")).toContain("preamble line");
  });

  it("handles headings without colons as valid section openers", () => {
    const input = `STATE
- current situation

CONSTRAINTS
- must stay under 700 kcal

CANDIDATES
A: Option one
B: Option two`;
    const { sections } = segmentSections(input);
    expect(sections.has("STATE")).toBe(true);
    expect(sections.has("CONSTRAINTS")).toBe(true);
    expect(sections.has("CANDIDATES")).toBe(true);
    const constraintLines = sections.get("CONSTRAINTS")!.join(" ");
    expect(constraintLines).not.toContain("Option one");
  });

  it("handles mixed-case headings", () => {
    const input = `state:
- line 1

constraints:
- line 2`;
    const { sections } = segmentSections(input);
    expect(sections.has("STATE")).toBe(true);
    expect(sections.has("CONSTRAINTS")).toBe(true);
    const stateLines = sections.get("STATE")!.join(" ");
    expect(stateLines).not.toContain("line 2");
  });
});

// ─── matchCandidateLine ───────────────────────────────────────────────────────

describe("matchCandidateLine — format variants", () => {
  it("accepts A: text (colon format — the UI template format)", () => {
    const result = matchCandidateLine("A: Make oats, whey, and yogurt bowl.");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("A");
    expect(result!.text).toBe("Make oats, whey, and yogurt bowl.");
  });

  it("accepts A. text (period format)", () => {
    const result = matchCandidateLine("A. Make oats, whey, and yogurt bowl.");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("A");
    expect(result!.text).toBe("Make oats, whey, and yogurt bowl.");
  });

  it("accepts A) text (parenthesis format)", () => {
    const result = matchCandidateLine("A) Make oats, whey, and yogurt bowl.");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("A");
    expect(result!.text).toBe("Make oats, whey, and yogurt bowl.");
  });

  it("accepts Candidate A: text (long form)", () => {
    const result = matchCandidateLine("Candidate A: Make oats, whey, and yogurt bowl.");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("A");
    expect(result!.text).toBe("Make oats, whey, and yogurt bowl.");
  });

  it("accepts Option A: text (long form)", () => {
    const result = matchCandidateLine("Option A: Make oats, whey, and yogurt bowl.");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("A");
    expect(result!.text).toBe("Make oats, whey, and yogurt bowl.");
  });

  it("accepts B: text", () => {
    const result = matchCandidateLine("B: Make eggs with oats and banana.");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("B");
    expect(result!.text).toBe("Make eggs with oats and banana.");
  });

  it("rejects ordinary sentences", () => {
    expect(matchCandidateLine("This is a constraint.")).toBeNull();
    expect(matchCandidateLine("- Cannot leave home.")).toBeNull();
    expect(matchCandidateLine("")).toBeNull();
    expect(matchCandidateLine("Choose the most feasible option.")).toBeNull();
  });

  it("normalizes id to uppercase", () => {
    const result = matchCandidateLine("Candidate a: some text");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("A");
  });
});

// ─── extractCandidates ────────────────────────────────────────────────────────

describe("extractCandidates — primary section detection", () => {
  it("extracts A: B: candidates from canonical CANDIDATES section", () => {
    const candidates = extractCandidates(DINNER_PLANNING_INPUT);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].id).toBe("A");
    expect(candidates[0].text).toBe("Make oats, whey, and yogurt bowl.");
    expect(candidates[1].id).toBe("B");
    expect(candidates[1].text).toBe("Make eggs with oats and banana.");
  });

  it("extracts candidates using A. format inside CANDIDATES section", () => {
    const input = `STATE:\n- context\n\nCANDIDATES:\nA. First option\nB. Second option`;
    const candidates = extractCandidates(input);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].id).toBe("A");
    expect(candidates[1].id).toBe("B");
  });

  it("extracts candidates using A) format inside CANDIDATES section", () => {
    const input = `STATE:\n- context\n\nCANDIDATES:\nA) First option\nB) Second option`;
    const candidates = extractCandidates(input);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].id).toBe("A");
    expect(candidates[1].id).toBe("B");
  });

  it("extracts candidates using Candidate A: format inside CANDIDATES section", () => {
    const input = `CANDIDATES:\nCandidate A: First option\nCandidate B: Second option`;
    const candidates = extractCandidates(input);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].id).toBe("A");
    expect(candidates[1].id).toBe("B");
  });

  it("does not confuse OBJECTIVE heading with candidate content", () => {
    const candidates = extractCandidates(DINNER_PLANNING_INPUT);
    const ids = candidates.map((c) => c.id);
    expect(ids).not.toContain("O"); // OBJECTIVE starts with O but is a heading
  });
});

describe("extractCandidates — recovery pass", () => {
  it("recovers candidates from the full text when the CANDIDATES heading is missing", () => {
    const inputWithoutSection = `STATE:
- I need to prepare dinner tonight.

CONSTRAINTS:
- Cannot leave home.

A: Make oats, whey, and yogurt bowl.
B: Make eggs with oats and banana.

OBJECTIVE:
Choose the most feasible dinner.`;
    const candidates = extractCandidates(inputWithoutSection);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const ids = candidates.map((c) => c.id);
    expect(ids).toContain("A");
    expect(ids).toContain("B");
  });

  it("recovers candidates when headings are slightly messy (missing colon)", () => {
    const input = `STATE
- context here

CANDIDATES
A: First option
B: Second option

OBJECTIVE
Choose one.`;
    const candidates = extractCandidates(input);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].id).toBe("A");
    expect(candidates[1].id).toBe("B");
  });

  it("recovers candidates with period format during recovery pass", () => {
    const inputNoCandidatesSection = `Here is the situation.
A. Do the first thing.
B. Do the second thing.`;
    const candidates = extractCandidates(inputNoCandidatesSection);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const ids = candidates.map((c) => c.id);
    expect(ids).toContain("A");
    expect(ids).toContain("B");
  });

  it("does not report no candidates when candidate-like lines are visibly present", () => {
    const input = `CANDIDATES:\nA: Option alpha\nB: Option beta`;
    const candidates = extractCandidates(input);
    expect(candidates.length).toBeGreaterThan(0);
  });
});

// ─── extractBulletedSection ───────────────────────────────────────────────────

describe("extractBulletedSection — section isolation", () => {
  it("extracts only STATE content, stops at CONSTRAINTS", () => {
    const lines = extractBulletedSection(DINNER_PLANNING_INPUT, "STATE");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("prepare dinner tonight");
    expect(lines.join(" ")).not.toContain("cannot leave home");
  });

  it("extracts only CONSTRAINTS content — 4 items, no uncertainty leakage", () => {
    const lines = extractBulletedSection(DINNER_PLANNING_INPUT, "CONSTRAINTS");
    expect(lines).toHaveLength(4);
    expect(lines.join(" ")).toContain("cannot leave home");
    expect(lines.join(" ")).toContain("700 kcal");
    expect(lines.join(" ")).toContain("40g protein");
    expect(lines.join(" ")).toContain("foods currently in the kitchen");
    expect(lines.join(" ")).not.toContain("Greek yogurt left");
    expect(lines.join(" ")).not.toContain("whey scoop");
  });

  it("extracts only UNCERTAINTIES content — 2 items, no candidates leakage", () => {
    const lines = extractBulletedSection(DINNER_PLANNING_INPUT, "UNCERTAINTIES");
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).toContain("Greek yogurt left");
    expect(lines.join(" ")).toContain("whey scoop");
    expect(lines.join(" ")).not.toContain("Make oats");
    expect(lines.join(" ")).not.toContain("Make eggs");
  });

  it("works with lowercase section name argument", () => {
    const lines = extractBulletedSection(DINNER_PLANNING_INPUT, "constraints");
    expect(lines).toHaveLength(4);
  });

  it("works when heading has no colon", () => {
    const input = `CONSTRAINTS\n- must stay home\n- under 700 kcal\n\nCANDIDATES\nA: do something`;
    const lines = extractBulletedSection(input, "CONSTRAINTS");
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).not.toContain("do something");
  });

  it("handles mixed-case heading in input", () => {
    const input = `constraints:\n- must stay home\n- under 700 kcal\n\nCandidates:\nA: do something`;
    const lines = extractBulletedSection(input, "CONSTRAINTS");
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).not.toContain("do something");
  });
});

// ─── extractSingleSection ─────────────────────────────────────────────────────

describe("extractSingleSection — OBJECTIVE extraction", () => {
  it("extracts only the OBJECTIVE text, not CANDIDATES content", () => {
    const result = extractSingleSection(DINNER_PLANNING_INPUT, "OBJECTIVE");
    expect(result).toBeDefined();
    expect(result!).toContain("most feasible");
    expect(result!).not.toContain("Make oats");
    expect(result!).not.toContain("Make eggs");
  });

  it("works with lowercase section name argument", () => {
    const result = extractSingleSection(DINNER_PLANNING_INPUT, "objective");
    expect(result).toBeDefined();
    expect(result!).toContain("most feasible");
  });
});

// ─── extractConstraintLines ───────────────────────────────────────────────────

describe("extractConstraintLines", () => {
  it("returns the 4 explicit constraints from CONSTRAINTS section", () => {
    const lines = extractConstraintLines(DINNER_PLANNING_INPUT);
    expect(lines).toHaveLength(4);
    expect(lines.join(" ")).not.toContain("Greek yogurt");
  });
});

// ─── End-to-end: autoCompile on canonical dinner planning input ───────────────

describe("autoCompile — canonical dinner planning input", () => {
  it("detects 2 candidates (A and B)", () => {
    const result = autoCompile(DINNER_PLANNING_INPUT, "GENERIC_CONSTRAINT_TASK");
    expect(result.draft).not.toBeNull();
    expect(result.draft!.candidates).toHaveLength(2);
    expect(result.draft!.candidates[0].id).toBe("A");
    expect(result.draft!.candidates[1].id).toBe("B");
  });

  it("extracts 4 constraints", () => {
    const result = autoCompile(DINNER_PLANNING_INPUT, "GENERIC_CONSTRAINT_TASK");
    expect(result.draft!.constraints.length).toBeGreaterThanOrEqual(4);
    const joined = result.draft!.constraints.join(" ");
    expect(joined).toContain("cannot leave home");
    expect(joined).not.toContain("Greek yogurt left");
  });

  it("extracts uncertainties", () => {
    const result = autoCompile(DINNER_PLANNING_INPUT, "GENERIC_CONSTRAINT_TASK");
    const joined = result.draft!.uncertainties.join(" ");
    expect(joined).toContain("Greek yogurt left");
    expect(joined).toContain("whey scoop");
  });

  it("state does not contain entire submission", () => {
    const result = autoCompile(DINNER_PLANNING_INPUT, "GENERIC_CONSTRAINT_TASK");
    const stateText = result.draft!.state.join(" ");
    // State should not contain constraints, uncertainties, or candidates content
    expect(stateText).not.toContain("cannot leave home");
    expect(stateText).not.toContain("Greek yogurt left");
    expect(stateText).not.toContain("Make oats");
  });

  it("extracts objective correctly", () => {
    const result = autoCompile(DINNER_PLANNING_INPUT, "GENERIC_CONSTRAINT_TASK");
    const obj = result.draft!.objective.join(" ");
    expect(obj).toContain("most feasible");
  });

  it("is evaluable when candidates and constraints are present", () => {
    const result = autoCompile(DINNER_PLANNING_INPUT, "GENERIC_CONSTRAINT_TASK");
    expect(result.draft!.candidates.length).toBeGreaterThan(0);
    expect(result.draft!.constraints.length).toBeGreaterThan(0);
  });
});

// ─── Cross-boundary content isolation proof ───────────────────────────────────

describe("Section content isolation — no cross-boundary leakage", () => {
  const MULTI_SECTION = `STATE:
- situation line one

FACTS:
- fact one
- fact two

CONSTRAINTS:
- constraint one
- constraint two

UNCERTAINTIES:
- uncertainty one

CANDIDATES:
A: candidate alpha
B: candidate beta

OBJECTIVE:
the final objective`;

  it("STATE contains only STATE content", () => {
    const lines = extractBulletedSection(MULTI_SECTION, "STATE");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("situation line one");
  });

  it("FACTS contains only FACTS content", () => {
    const lines = extractBulletedSection(MULTI_SECTION, "FACTS");
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).not.toContain("constraint");
  });

  it("CONSTRAINTS contains only CONSTRAINTS content", () => {
    const lines = extractBulletedSection(MULTI_SECTION, "CONSTRAINTS");
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).not.toContain("uncertainty");
    expect(lines.join(" ")).not.toContain("candidate");
  });

  it("UNCERTAINTIES contains only UNCERTAINTIES content", () => {
    const lines = extractBulletedSection(MULTI_SECTION, "UNCERTAINTIES");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("uncertainty one");
    expect(lines.join(" ")).not.toContain("candidate");
  });

  it("OBJECTIVE contains only OBJECTIVE content", () => {
    const result = extractSingleSection(MULTI_SECTION, "OBJECTIVE");
    expect(result).toBe("the final objective");
    expect(result).not.toContain("candidate");
  });

  it("CANDIDATES section is correctly isolated — does not leak into OBJECTIVE", () => {
    const candidates = extractCandidates(MULTI_SECTION);
    expect(candidates).toHaveLength(2);
    const texts = candidates.map((c) => c.text);
    expect(texts.join(" ")).not.toContain("final objective");
  });
});

// ─── Heading alias tests — natural language variants ──────────────────────────

describe("matchHeading — alias recognition", () => {
  it("HEADING_ALIASES maps to canonical headings", () => {
    expect(HEADING_ALIASES["unknowns"]).toBe("UNCERTAINTIES");
    expect(HEADING_ALIASES["options"]).toBe("CANDIDATES");
    expect(HEADING_ALIASES["goal"]).toBe("OBJECTIVE");
    expect(HEADING_ALIASES["context"]).toBe("STATE");
    expect(HEADING_ALIASES["requirements"]).toBe("CONSTRAINTS");
  });

  it("recognizes UNKNOWNS as UNCERTAINTIES", () => {
    expect(matchHeading("UNKNOWNS")).toBe("UNCERTAINTIES");
    expect(matchHeading("UNKNOWNS:")).toBe("UNCERTAINTIES");
    expect(matchHeading("unknowns")).toBe("UNCERTAINTIES");
    expect(matchHeading("Unknowns:")).toBe("UNCERTAINTIES");
  });

  it("recognizes OPTIONS as CANDIDATES", () => {
    expect(matchHeading("OPTIONS")).toBe("CANDIDATES");
    expect(matchHeading("OPTIONS:")).toBe("CANDIDATES");
    expect(matchHeading("options")).toBe("CANDIDATES");
    expect(matchHeading("Options:")).toBe("CANDIDATES");
  });

  it("recognizes GOAL as OBJECTIVE", () => {
    expect(matchHeading("GOAL")).toBe("OBJECTIVE");
    expect(matchHeading("GOAL:")).toBe("OBJECTIVE");
    expect(matchHeading("goal")).toBe("OBJECTIVE");
    expect(matchHeading("Goal:")).toBe("OBJECTIVE");
  });

  it("recognizes CONTEXT as STATE", () => {
    expect(matchHeading("CONTEXT")).toBe("STATE");
    expect(matchHeading("context:")).toBe("STATE");
    expect(matchHeading("SITUATION")).toBe("STATE");
  });

  it("recognizes REQUIREMENTS as CONSTRAINTS", () => {
    expect(matchHeading("REQUIREMENTS")).toBe("CONSTRAINTS");
    expect(matchHeading("requirements:")).toBe("CONSTRAINTS");
    expect(matchHeading("RULES")).toBe("CONSTRAINTS");
  });

  it("rejects inline-content lines that start with alias words", () => {
    expect(matchHeading("Options are many.")).toBeNull();
    expect(matchHeading("Goal: achieve X with Y")).toBeNull();
    expect(matchHeading("Unknowns remain unclear.")).toBeNull();
  });
});

// ─── The exact user input from the bug report screenshot ──────────────────────

const SCREENSHOT_INPUT = `STATE
Need dinner at home

CONSTRAINTS
under 700 kcal
40g protein minimum

UNKNOWNS
not sure if yogurt is available

OPTIONS
A eggs and oats
B whey and yogurt

GOAL
best feasible dinner`;

describe("segmentSections — screenshot input aliases", () => {
  it("recognizes all 5 sections despite non-canonical headings", () => {
    const { sections } = segmentSections(SCREENSHOT_INPUT);
    expect(sections.has("STATE")).toBe(true);
    expect(sections.has("CONSTRAINTS")).toBe(true);
    expect(sections.has("UNCERTAINTIES")).toBe(true);  // from UNKNOWNS alias
    expect(sections.has("CANDIDATES")).toBe(true);     // from OPTIONS alias
    expect(sections.has("OBJECTIVE")).toBe(true);      // from GOAL alias
  });

  it("CONSTRAINTS section contains the 2 constraint lines", () => {
    const { sections } = segmentSections(SCREENSHOT_INPUT);
    const lines = sections.get("CONSTRAINTS")!.map((l) => l.trim()).filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines.join(" ")).toContain("700 kcal");
    expect(lines.join(" ")).toContain("40g protein");
  });

  it("UNCERTAINTIES section contains the uncertainty (from UNKNOWNS)", () => {
    const { sections } = segmentSections(SCREENSHOT_INPUT);
    const lines = sections.get("UNCERTAINTIES")!.map((l) => l.trim()).filter(Boolean);
    expect(lines.join(" ")).toContain("yogurt");
  });

  it("CANDIDATES section contains A and B lines (from OPTIONS)", () => {
    const { sections } = segmentSections(SCREENSHOT_INPUT);
    const lines = sections.get("CANDIDATES")!.map((l) => l.trim()).filter(Boolean);
    expect(lines.join(" ")).toContain("eggs and oats");
    expect(lines.join(" ")).toContain("whey and yogurt");
  });

  it("OBJECTIVE section contains the goal text (from GOAL)", () => {
    const { sections } = segmentSections(SCREENSHOT_INPUT);
    const lines = sections.get("OBJECTIVE")!.map((l) => l.trim()).filter(Boolean);
    expect(lines.join(" ")).toContain("best feasible dinner");
  });
});

describe("extractCandidates — bare A text format within OPTIONS section", () => {
  it("extracts A and B from screenshot OPTIONS section (bare space format)", () => {
    const candidates = extractCandidates(SCREENSHOT_INPUT);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const ids = candidates.map((c) => c.id);
    expect(ids).toContain("A");
    expect(ids).toContain("B");
  });

  it("candidate texts are correct — eggs and oats / whey and yogurt", () => {
    const candidates = extractCandidates(SCREENSHOT_INPUT);
    const a = candidates.find((c) => c.id === "A");
    const b = candidates.find((c) => c.id === "B");
    expect(a?.text).toBe("eggs and oats");
    expect(b?.text).toBe("whey and yogurt");
  });
});

describe("extractConstraintLines — screenshot input no-colon CONSTRAINTS", () => {
  it("extracts 2 constraints from CONSTRAINTS section without bullet prefix", () => {
    const lines = extractConstraintLines(SCREENSHOT_INPUT);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.join(" ")).toContain("700 kcal");
    expect(lines.join(" ")).toContain("protein");
  });
});

describe("extractSingleSection — screenshot GOAL→OBJECTIVE alias", () => {
  it("extracts objective from GOAL section", () => {
    const result = extractSingleSection(SCREENSHOT_INPUT, "OBJECTIVE");
    expect(result).toBeDefined();
    expect(result!).toContain("best feasible dinner");
  });
});

describe("autoCompile — screenshot alias input end-to-end", () => {
  it("detects 2 candidates from OPTIONS section using bare format", () => {
    const result = autoCompile(SCREENSHOT_INPUT, "GENERIC_CONSTRAINT_TASK");
    expect(result.draft).not.toBeNull();
    expect(result.draft!.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("extracts constraints from CONSTRAINTS section", () => {
    const result = autoCompile(SCREENSHOT_INPUT, "GENERIC_CONSTRAINT_TASK");
    const joined = result.draft!.constraints.join(" ");
    expect(joined).toContain("700 kcal");
  });

  it("extracts uncertainty from UNKNOWNS section", () => {
    const result = autoCompile(SCREENSHOT_INPUT, "GENERIC_CONSTRAINT_TASK");
    const joined = result.draft!.uncertainties.join(" ");
    expect(joined).toContain("yogurt");
  });

  it("extracts objective from GOAL section", () => {
    const result = autoCompile(SCREENSHOT_INPUT, "GENERIC_CONSTRAINT_TASK");
    const joined = result.draft!.objective.join(" ");
    expect(joined).toContain("feasible dinner");
  });
});
