import { DomainTemplate, IntentType, getDomainTemplate } from "./domain_templates";
import { ExtractedFields, extractFields } from "./field_extractor";
import { GapDetectionResult, detectGaps } from "./gap_detector";

export interface CompiledCandidate {
  id: string;
  text: string;
}

export interface StructuredDraft {
  intent: IntentType;
  title: string;

  state: string[];
  constraints: string[];
  uncertainties: string[];
  candidates: CompiledCandidate[];
  objective: string[];

  missingRequiredFields: string[];
  missingOptionalFields: string[];
  warnings: string[];
  notes: string[];

  isEvaluable: boolean;
}

export interface AutoCompileResult {
  intent: IntentType;
  template: DomainTemplate | null;
  extracted: ExtractedFields | null;
  gaps: GapDetectionResult | null;
  draft: StructuredDraft | null;
}

export function autoCompile(
  rawInput: string,
  intent: IntentType
): AutoCompileResult {
  const template = getDomainTemplate(intent);

  if (!template) {
    return {
      intent,
      template: null,
      extracted: null,
      gaps: null,
      draft: null,
    };
  }

  const extracted = extractFields(rawInput, intent);
  const gaps = detectGaps(template, extracted);
  const draft = buildStructuredDraft(template, extracted, gaps);

  return {
    intent,
    template,
    extracted,
    gaps,
    draft,
  };
}

export function buildStructuredDraft(
  template: DomainTemplate,
  extracted: ExtractedFields,
  gaps: GapDetectionResult
): StructuredDraft {
  const state = buildState(template, extracted);
  const constraints = buildConstraints(template, extracted);
  const uncertainties = buildUncertainties(template, extracted, gaps);
  const candidates = buildCandidates(template, extracted);
  const objective = buildObjective(template, extracted);

  const detectedStructureNotes = buildDetectedStructureNotes(extracted);
  const queryFamilyNote = `query_family: ${template.intent}`;

  return {
    intent: template.intent,
    title: template.title,

    state,
    constraints,
    uncertainties,
    candidates,
    objective,

    missingRequiredFields: gaps.missingRequiredFields.map((f) => f.key),
    missingOptionalFields: gaps.missingOptionalFields.map((f) => f.key),
    warnings: gaps.warnings,
    notes: dedupe([queryFamilyNote, ...gaps.notes, ...detectedStructureNotes]),

    isEvaluable: gaps.isEvaluable,
  };
}

function buildState(
  template: DomainTemplate,
  extracted: ExtractedFields
): string[] {
  const lines: string[] = [];

  if (template.intent === "NUTRITION_AUDIT") {
    if (extracted.hasMealSystem) {
      lines.push(
        "A declared multi-meal or multi-phase nutrition system is present."
      );
    } else {
      lines.push(
        "A nutrition system is implied, but no computable meal system has been declared yet."
      );
    }

    if (extracted.detectedFoods.length > 0) {
      lines.push(`Detected foods: ${formatList(extracted.detectedFoods)}.`);
    }

    if (extracted.hasTargets) {
      lines.push("Target macro blocks were detected.");
    } else {
      lines.push("Target macro blocks were not detected.");
    }

    if (extracted.hasLabels) {
      lines.push("Food-label or source-truth references were detected.");
    } else {
      lines.push("Food-label or source-truth references were not detected.");
    }
  }

  if (template.intent === "NUTRITION_TEMPORAL_FUELING") {
    lines.push("A nutrition timing decision query is present.");

    if (extracted.hasCandidates) {
      lines.push("Candidate fueling actions are declared.");
    }

    if (extracted.hasConstraints) {
      lines.push("Temporal nutrient constraints are declared.");
    }

    lines.push(
      "The task is to determine admissibility and strongest margin across candidates."
    );

    if (extracted.stateLines.length > 0) {
      lines.push(...dedupe(extracted.stateLines));
    }
  }

  if (template.intent === "NUTRITION_LABEL_AUDIT") {
    lines.push("A nutrition label audit or food comparison query is present.");

    if (extracted.hasLabels) {
      lines.push("Label-derived macro data is the governing source of truth.");
    } else {
      lines.push("Label or source-truth data has not yet been attached.");
    }

    if (extracted.stateLines.length > 0) {
      lines.push(...dedupe(extracted.stateLines));
    }
  }

  if (template.intent === "TRAINING_AUDIT") {
    if (extracted.hasState) {
      lines.push("A training system or program description is present.");
    } else {
      lines.push(
        "A training task is implied, but no explicit training system has been declared yet."
      );
    }
  }

  if (template.intent === "SCHEDULE_AUDIT") {
    if (extracted.hasState) {
      lines.push("A schedule or time-block structure is present.");
    } else {
      lines.push(
        "A schedule task is implied, but no explicit schedule structure has been declared yet."
      );
    }
  }

  if (template.intent === "GENERIC_CONSTRAINT_TASK") {
    lines.push(
      "A structured task is implied, but domain-specific structure remains incomplete."
    );
  }

  if (extracted.stateLines.length > 0) {
    lines.push(...dedupe(extracted.stateLines));
  }

  if (lines.length === 0) {
    return template.state;
  }

  return dedupe(lines);
}

function buildConstraints(
  template: DomainTemplate,
  extracted: ExtractedFields
): string[] {
  if (extracted.constraints.length > 0) {
    return dedupe(extracted.constraints);
  }

  return template.constraints;
}

function buildUncertainties(
  template: DomainTemplate,
  extracted: ExtractedFields,
  gaps: GapDetectionResult
): string[] {
  const lines: string[] = [];

  if (extracted.uncertainties.length > 0) {
    lines.push(...dedupe(extracted.uncertainties));
  }

  if (template.intent === "NUTRITION_AUDIT") {
    const lower = extracted.rawInput.toLowerCase();

    if (
      !lower.includes("banana") ||
      !lower.includes("banana macros are estimated")
    ) {
      lines.push("Banana macros may be estimated unless separately grounded.");
    }

    if (
      !lower.includes("egg") ||
      !lower.includes("egg macros are estimated")
    ) {
      lines.push("Egg macros may be estimated unless separately grounded.");
    }

    if (!containsAny(lower, ["fiber", "net carb"])) {
      lines.push("Fiber versus net-carb handling is not explicitly defined.");
    }

    if (
      extracted.hasLabels &&
      !containsAny(lower, ["yogurt: 1 cup", "1 cup = 1 container", "150g"])
    ) {
      lines.push("Yogurt unit interpretation may require confirmation.");
    }
  }

  if (template.intent === "NUTRITION_TEMPORAL_FUELING") {
    const lower = extracted.rawInput.toLowerCase();

    const hasExplicitClassification = containsAny(lower, [
      "fast-digesting",
      "slow-digesting",
      "high gi",
      "low gi",
      "cyclic dextrin = fast",
      "oats = slow",
      "classification",
    ]);

    if (!hasExplicitClassification) {
      lines.push(
        "Fast vs slow carbohydrate classification should be explicitly declared for each candidate food."
      );
    }

    if (containsAny(lower, ["strongest margin", "margin", "rank"])) {
      lines.push(
        '"Strongest margin" is interpreted as the greatest admissible distance from constraint failure.'
      );
    }
  }

  if (template.intent === "NUTRITION_LABEL_AUDIT") {
    const lower = extracted.rawInput.toLowerCase();

    if (!containsAny(lower, ["per serving", "per 100g", "serving size"])) {
      lines.push(
        "Unit conversion (per serving vs per 100g) may require explicit declaration."
      );
    }

    if (!extracted.hasLabels) {
      lines.push("Label images or label text may not yet be attached.");
    }
  }

  for (const warning of gaps.warnings) {
    if (!lines.includes(warning)) {
      lines.push(warning);
    }
  }

  if (lines.length === 0) {
    return template.uncertainties;
  }

  return dedupe(lines);
}

function buildCandidates(
  template: DomainTemplate,
  extracted: ExtractedFields
): CompiledCandidate[] {
  if (extracted.candidates.length > 0) {
    return dedupeCandidates(extracted.candidates);
  }

  return template.candidates.map((c) => ({
    id: c.id,
    text: c.text,
  }));
}

function buildObjective(
  template: DomainTemplate,
  extracted: ExtractedFields
): string[] {
  const lines: string[] = [];

  if (extracted.objective) {
    lines.push(extracted.objective);
  }

  if (template.intent === "NUTRITION_AUDIT") {
    if (extracted.hasMealSystem && extracted.hasLabels) {
      lines.push(
        "Determine whether the declared nutrition system is faithful to source-truth food data."
      );
    } else {
      lines.push(
        "Determine whether the nutrition task is sufficiently declared for valid audit."
      );
    }
  }

  if (template.intent === "NUTRITION_TEMPORAL_FUELING") {
    lines.push(
      "Determine which candidates are admissible under the declared temporal nutrient constraints."
    );

    const lower = extracted.rawInput.toLowerCase();
    if (containsAny(lower, ["strongest margin", "margin", "rank"])) {
      lines.push(
        "Among admissible candidates, identify the candidate with the strongest margin."
      );
    }
  }

  if (template.intent === "NUTRITION_LABEL_AUDIT") {
    lines.push(
      "Verify food macro data against declared source-truth labels."
    );
    lines.push(
      "Identify discrepancies and, if requested, produce the smallest label-faithful correction."
    );
  }

  if (lines.length === 0) {
    return template.objective;
  }

  return dedupe(lines);
}

function containsAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p.toLowerCase()));
}

function formatList(items: string[]): string {
  return dedupe(items).join(", ");
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function dedupeCandidates(values: CompiledCandidate[]): CompiledCandidate[] {
  const seen = new Set<string>();
  const out: CompiledCandidate[] = [];

  for (const value of values) {
    const key = `${value.id}:${value.text}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }

  return out;
}

/**
 * buildDetectedStructureNotes — produces debug output lines in the compiled
 * draft's notes section. Reports structural signals and per-phase target block
 * detection, allowing reviewers to verify parsing without running the code.
 *
 * Format:
 *   DETECTED_STRUCTURE: phases_detected: true | meals_detected: true | targets_detected: true
 *   DETECTED_TARGET_BLOCKS:
 *   - BASE: true
 *   - CARB_UP: true
 *   - CARB_CUT: false
 *   ...
 */
function buildDetectedStructureNotes(extracted: ExtractedFields): string[] {
  const { phasesDetected, mealsDetected, targetsDetected, detectedTargetBlocksByPhase } =
    extracted.detectedStructure;

  const lines: string[] = [
    `DETECTED_STRUCTURE: phases_detected: ${phasesDetected} | meals_detected: ${mealsDetected} | targets_detected: ${targetsDetected}`,
  ];

  const phaseKeys = Object.keys(detectedTargetBlocksByPhase);
  if (phaseKeys.length > 0) {
    lines.push("DETECTED_TARGET_BLOCKS:");
    for (const phase of phaseKeys) {
      lines.push(`- ${phase}: ${detectedTargetBlocksByPhase[phase]}`);
    }
  }

  return lines;
}
