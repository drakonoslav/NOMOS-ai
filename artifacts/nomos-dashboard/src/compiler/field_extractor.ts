import { IntentType } from "./domain_templates";

export interface ExtractedTarget {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  raw: string;
}

export interface ExtractedCandidate {
  id: string;
  text: string;
}

export interface ExtractedFields {
  intent: IntentType;

  rawInput: string;

  hasMealSystem: boolean;
  mealSystemText?: string;

  hasTargets: boolean;
  targets: ExtractedTarget[];

  hasLabels: boolean;
  labelsMentioned: string[];

  hasConstraints: boolean;
  constraints: string[];

  hasCandidates: boolean;
  candidates: ExtractedCandidate[];

  hasObjective: boolean;
  objective?: string;

  hasState: boolean;
  stateLines: string[];

  hasUncertainties: boolean;
  uncertainties: string[];

  detectedFoods: string[];
  detectedPhases: string[];

  notes: string[];
}

const FOOD_KEYWORDS = [
  "whey",
  "flax",
  "oat",
  "oats",
  "dextrin",
  "yogurt",
  "banana",
  "egg",
  "eggs",
];

const PHASE_KEYWORDS = [
  "base",
  "carb up",
  "carb cut",
  "fat cut",
  "recomp",
  "deload",
  "diet break",
  "peak bulk",
];

const LABEL_HINTS = [
  "images in order",
  "food label",
  "food labels",
  "nutrition facts",
  "attached labels",
  "whey",
  "flax",
  "oat",
  "dextrin",
  "yogurt",
];

const OBJECTIVE_HINTS = [
  "fix macros",
  "audit my meal plan",
  "keep calories on lockdown",
  "do not move protein placements",
  "preserve protein placement",
  "without breaking timing",
  "correct my system",
];

export function extractFields(
  rawInput: string,
  intent: IntentType
): ExtractedFields {
  const normalized = normalizeInput(rawInput);

  const stateLines = extractBulletedSection(normalized, "STATE");
  const uncertainties = extractBulletedSection(normalized, "UNCERTAINTIES");
  const constraints = extractConstraintLines(normalized);
  const candidates = extractCandidates(normalized);
  const objective = extractObjective(normalized);
  const targets = extractTargets(normalized);

  const detectedFoods = detectFoods(normalized);
  const detectedPhases = detectPhases(normalized);

  const hasMealSystem = detectMealSystem(normalized, detectedPhases);
  const mealSystemText = hasMealSystem
    ? extractMealSystemText(normalized)
    : undefined;

  const labelsMentioned = detectLabels(normalized);
  const hasLabels = labelsMentioned.length > 0;

  const hasTargets = targets.length > 0;
  const hasConstraints = constraints.length > 0;
  const hasCandidates = candidates.length > 0;
  const hasObjective = objective !== undefined;

  const notes: string[] = [];

  if (!hasMealSystem) {
    notes.push("No computable meal system detected.");
  }

  if (!hasTargets) {
    notes.push("No explicit target macro blocks detected.");
  }

  if (!hasLabels) {
    notes.push("No label or food-source-truth reference detected.");
  }

  if (!hasConstraints) {
    notes.push("No explicit constraints section or hard-limit phrases detected.");
  }

  if (!hasCandidates) {
    notes.push("No explicit candidates detected.");
  }

  if (!hasObjective) {
    notes.push("No explicit objective detected.");
  }

  return {
    intent,
    rawInput,
    hasMealSystem,
    mealSystemText,
    hasTargets,
    targets,
    hasLabels,
    labelsMentioned,
    hasConstraints,
    constraints,
    hasCandidates,
    candidates,
    hasObjective,
    objective,
    hasState: stateLines.length > 0,
    stateLines,
    hasUncertainties: uncertainties.length > 0,
    uncertainties,
    detectedFoods,
    detectedPhases,
    notes,
  };
}

export function normalizeInput(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractTargets(text: string): ExtractedTarget[] {
  const targets: ExtractedTarget[] = [];
  const lines = text.split("\n");

  const targetRegex =
    /\((\d{3,4})\s*\/\s*(\d{2,3})p\s*\/\s*(\d{2,3})c\s*\/\s*(\d{1,3})f\)/i;

  for (const line of lines) {
    const match = line.match(targetRegex);
    if (!match) continue;

    targets.push({
      calories: Number(match[1]),
      protein: Number(match[2]),
      carbs: Number(match[3]),
      fat: Number(match[4]),
      raw: line.trim(),
    });
  }

  return targets;
}

export function extractCandidates(text: string): ExtractedCandidate[] {
  const candidates: ExtractedCandidate[] = [];
  const lines = text.split("\n");

  let inCandidatesSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (/^CANDIDATES\s*:/i.test(line)) {
      inCandidatesSection = true;
      continue;
    }

    if (
      inCandidatesSection &&
      /^[A-Z][A-Z _]+\s*:/i.test(line) &&
      !/^[A-Z]\s*:/i.test(line)
    ) {
      break;
    }

    const explicitCandidate = line.match(/^([A-Z])\s*:\s*(.+)$/);
    if (inCandidatesSection && explicitCandidate) {
      candidates.push({
        id: explicitCandidate[1],
        text: explicitCandidate[2].trim(),
      });
    }
  }

  return candidates;
}

export function extractObjective(text: string): string | undefined {
  const explicit = extractSingleSection(text, "OBJECTIVE");
  if (explicit) return explicit;

  const lower = text.toLowerCase();
  for (const hint of OBJECTIVE_HINTS) {
    if (lower.includes(hint)) {
      return sentenceFromHint(text, hint);
    }
  }

  return undefined;
}

export function extractConstraintLines(text: string): string[] {
  const explicit = extractBulletedSection(text, "CONSTRAINTS");
  if (explicit.length > 0) return explicit;

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const inferred = lines.filter((line) => {
    const lower = line.toLowerCase();
    return (
      lower.includes("do not ") ||
      lower.includes("must ") ||
      lower.includes("must not ") ||
      lower.includes("without breaking ") ||
      lower.includes("keep calories on lockdown") ||
      lower.includes("preserve ")
    );
  });

  return uniqueStrings(inferred);
}

export function extractBulletedSection(
  text: string,
  sectionName: string
): string[] {
  const lines = text.split("\n");
  const out: string[] = [];

  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (new RegExp(`^${escapeRegExp(sectionName)}\\s*:`, "i").test(line)) {
      inSection = true;
      continue;
    }

    if (inSection && /^[A-Z][A-Z _]+\s*:/i.test(line)) {
      break;
    }

    if (!inSection) continue;

    const bullet = line.match(/^[-•]\s*(.+)$/);
    if (bullet) {
      out.push(bullet[1].trim());
      continue;
    }

    if (line.length > 0) {
      out.push(line);
    }
  }

  return uniqueStrings(out.filter(Boolean));
}

export function extractSingleSection(
  text: string,
  sectionName: string
): string | undefined {
  const lines = text.split("\n");
  const parts: string[] = [];
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (new RegExp(`^${escapeRegExp(sectionName)}\\s*:`, "i").test(line)) {
      inSection = true;
      continue;
    }

    if (inSection && /^[A-Z][A-Z _]+\s*:/i.test(line)) {
      break;
    }

    if (inSection && line.length > 0) {
      parts.push(line.replace(/^[-•]\s*/, ""));
    }
  }

  const joined = parts.join(" ").trim();
  return joined || undefined;
}

export function detectFoods(text: string): string[] {
  const lower = text.toLowerCase();
  return FOOD_KEYWORDS.filter((food) => lower.includes(food));
}

export function detectPhases(text: string): string[] {
  const lower = text.toLowerCase();
  return PHASE_KEYWORDS.filter((phase) => lower.includes(phase));
}

export function detectLabels(text: string): string[] {
  const lower = text.toLowerCase();
  const found = LABEL_HINTS.filter((hint) => lower.includes(hint));
  return uniqueStrings(found);
}

export function detectMealSystem(
  text: string,
  detectedPhases: string[]
): boolean {
  const lower = text.toLowerCase();

  const hasMealNumbers =
    /1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|6️⃣|7️⃣/.test(text) ||
    /\bpre-cardio\b/.test(lower) ||
    /\bpost-cardio\b/.test(lower) ||
    /\bpre-lift\b/.test(lower) ||
    /\bpost-lift\b/.test(lower);

  const hasFoods = detectFoods(text).length >= 3;

  const hasTargets = extractTargets(text).length > 0;

  return detectedPhases.length > 0 && hasMealNumbers && hasFoods && hasTargets;
}

export function extractMealSystemText(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];

  let keep = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (containsPhaseHeader(line)) {
      keep = true;
    }

    if (keep) {
      kept.push(rawLine);
    }
  }

  return kept.join("\n").trim();
}

function containsPhaseHeader(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    PHASE_KEYWORDS.some((phase) => lower.includes(phase)) && /\(/.test(line)
  );
}

function sentenceFromHint(text: string, hint: string): string {
  const lines = text.split("\n");
  const found = lines.find((l) => l.toLowerCase().includes(hint));
  return found?.trim() ?? hint;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
