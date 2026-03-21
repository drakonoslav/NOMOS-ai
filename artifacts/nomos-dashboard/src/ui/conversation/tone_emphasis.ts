/**
 * tone_emphasis.ts
 *
 * Applies markdown-style bold markers to key diagnostic terms.
 * The UI parser splits on ** to render <strong> elements.
 * Used only on diagnostic lines — never on stage prompts.
 */

const EMPHASIS_TERMS = [
  "missing threshold",
  "missing unit",
  "ambiguous",
  "undefined intent",
  "missing constraints",
  "missing assumptions",
];

export function emphasizeKeyTerms(line: string): string {
  if (!line) return "";

  let result = line;
  for (const term of EMPHASIS_TERMS) {
    result = result.replace(term, `**${term}**`);
  }
  return result;
}

/**
 * Parse a line with **bold** markers into React-renderable segments.
 * Returns an array of { text, bold } segments.
 */
export interface TextSegment {
  text: string;
  bold: boolean;
}

export function parseEmphasis(line: string): TextSegment[] {
  const parts = line.split("**");
  return parts.map((text, i) => ({ text, bold: i % 2 === 1 }));
}
