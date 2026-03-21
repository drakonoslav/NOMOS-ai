/**
 * text_normalizer.ts  (dashboard compiler)
 *
 * Normalizes raw constraint text for deterministic matching.
 *
 * Role:
 * - Produces a clean, lowercased, punctuation-normalized string
 *   that can be passed to the constraint compiler without heuristic mismatch.
 * - Does NOT classify constraints — that is the constraint compiler's job.
 * - Idempotent and pure: same input always produces same output.
 *
 * Note: This file is NOT the same as packages/constitutional-kernel/src/evaluation/
 * constraint_normalizer.ts. The kernel's module classifies constraint KINDS
 * (NO_DROP, BOUNDED_RESOURCE, etc.). This module normalizes raw text only.
 *
 * Normalization steps:
 *   1. Trim leading/trailing whitespace.
 *   2. Collapse internal runs of whitespace to a single space.
 *   3. Strip trailing periods, commas, and semicolons.
 *   4. Replace Unicode comparison operators with ASCII equivalents.
 *   5. Lowercase the result for case-insensitive matching.
 */

export function normalizeConstraintText(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.;,]+$/, "")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/≠/g, "!=")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .toLowerCase();
}

/**
 * Normalizes a list of raw constraint strings, deduplicating identical
 * normalized forms (case-insensitive exact duplicates).
 */
export function normalizeConstraintList(raws: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of raws) {
    const n = normalizeConstraintText(raw);
    if (!seen.has(n)) {
      seen.add(n);
      result.push(raw.trim());
    }
  }
  return result;
}
