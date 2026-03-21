import { StructuredDraft, CompiledCandidate } from "./auto_compiler";

export interface SerializedDraftRecord {
  intent: string;
  title: string;
  isEvaluable: boolean;
  canonicalText: string;
}

export function serializeDraft(draft: StructuredDraft): string {
  const sections: string[] = [];

  const state = serializeDraftSection("STATE", draft.state);
  const constraints = serializeDraftSection("CONSTRAINTS", draft.constraints);
  const uncertainties = serializeDraftSection("UNCERTAINTIES", draft.uncertainties);
  const candidates = serializeCandidates(draft.candidates);
  const objective = serializeDraftSection("OBJECTIVE", draft.objective);

  if (state) sections.push(state);
  if (constraints) sections.push(constraints);
  if (uncertainties) sections.push(uncertainties);
  if (candidates) sections.push(candidates);
  if (objective) sections.push(objective);

  return normalizeSerializedText(sections.join("\n\n"));
}

export function serializeDraftSection(
  title: string,
  items: string[]
): string {
  const cleaned = normalizeLines(items);
  if (cleaned.length === 0) return "";

  return [
    `${title}:`,
    ...cleaned.map((item) => `- ${item}`),
  ].join("\n");
}

export function serializeCandidates(
  candidates: CompiledCandidate[]
): string {
  const cleaned = dedupeCandidates(candidates);
  if (cleaned.length === 0) return "";

  return [
    "CANDIDATES:",
    ...cleaned.map((c) => `${c.id}: ${normalizeInline(c.text)}`),
  ].join("\n");
}

export function buildSerializedDraftRecord(
  draft: StructuredDraft
): SerializedDraftRecord {
  return {
    intent: draft.intent,
    title: draft.title,
    isEvaluable: draft.isEvaluable,
    canonicalText: serializeDraft(draft),
  };
}

function normalizeSerializedText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeLines(lines: string[]): string[] {
  return [
    ...new Set(
      lines.map((line) => normalizeInline(line)).filter(Boolean)
    ),
  ];
}

function normalizeInline(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function dedupeCandidates(
  candidates: CompiledCandidate[]
): CompiledCandidate[] {
  const seen = new Set<string>();
  const out: CompiledCandidate[] = [];

  for (const candidate of candidates) {
    const normalized: CompiledCandidate = {
      id: normalizeInline(candidate.id),
      text: normalizeInline(candidate.text),
    };
    const key = `${normalized.id}:${normalized.text}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }

  return out;
}
