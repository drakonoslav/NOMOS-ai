/**
 * constraint_dedupe.ts  (dashboard compiler)
 *
 * Deduplicates and collapses compiled constraints.
 *
 * Constitutional role:
 * - Collapses multiple INTERPRETATION_REQUIRED constraints into one combined
 *   warning. Prevents the same fallback message from appearing under every
 *   candidate when several constraints could not be typed.
 * - Removes exact duplicate compiled constraints (same key + same kind).
 * - Leaves typed constraints (STRUCTURAL_LOCK, ALLOWED_ACTION, etc.) unchanged.
 *
 * Usage:
 *   const compiled = compileConstraints(draft.constraints);
 *   const deduped  = dedupeConstraints(compiled);
 *   // deduped.typed    — all typed constraints, no duplicates
 *   // deduped.fallback — one combined constraint if any INTERPRETATION_REQUIRED
 *   // deduped.all      — typed + fallback, for iterating in order
 *   // deduped.unresolvedCount — number of INTERPRETATION_REQUIRED before collapse
 */

import { CompiledConstraint } from "./constraint_compiler";

export interface DedupedConstraintSet {
  /** All typed constraints (non-INTERPRETATION_REQUIRED), deduplicated by key. */
  typed: CompiledConstraint[];
  /**
   * One combined fallback constraint if any INTERPRETATION_REQUIRED were present,
   * otherwise null. Raw text lists all collapsed constraint texts.
   */
  fallback: CompiledConstraint | null;
  /**
   * typed + [fallback] if fallback is not null — the full display list.
   * This is the canonical ordered list for rendering.
   */
  all: CompiledConstraint[];
  /** Number of INTERPRETATION_REQUIRED constraints before collapsing. */
  unresolvedCount: number;
}

/**
 * Deduplicates and collapses a list of compiled constraints.
 *
 * Steps:
 *   1. Remove exact key+kind duplicates within typed constraints.
 *   2. Collect all INTERPRETATION_REQUIRED constraints.
 *   3. If any INTERPRETATION_REQUIRED exist, collapse into one combined fallback.
 *   4. Return DedupedConstraintSet with typed, fallback, all, unresolvedCount.
 */
export function dedupeConstraints(compiled: CompiledConstraint[]): DedupedConstraintSet {
  const typed: CompiledConstraint[] = [];
  const unresolved: CompiledConstraint[] = [];
  const seenKeys = new Set<string>();

  for (const c of compiled) {
    if (c.kind === "INTERPRETATION_REQUIRED") {
      unresolved.push(c);
    } else {
      const dedupeKey = `${c.kind}:${c.key}`;
      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        typed.push(c);
      }
    }
  }

  const fallback = buildFallback(unresolved);
  const all = fallback ? [...typed, fallback] : [...typed];

  return {
    typed,
    fallback,
    all,
    unresolvedCount: unresolved.length,
  };
}

/**
 * Builds a single combined INTERPRETATION_REQUIRED constraint from a list of
 * unresolved constraints. Returns null if the input list is empty.
 */
function buildFallback(unresolved: CompiledConstraint[]): CompiledConstraint | null {
  if (unresolved.length === 0) return null;

  if (unresolved.length === 1) return unresolved[0]!;

  const rawTexts = unresolved.map((c) => c.raw).join("; ");
  const combinedRaw =
    unresolved.length === 2
      ? `[2 unresolved constraints] ${rawTexts}`
      : `[${unresolved.length} unresolved constraints] ${rawTexts}`;

  return {
    raw: combinedRaw,
    kind: "INTERPRETATION_REQUIRED",
    key: "combined_unresolved",
    operator: null,
    lhs: null,
    rhs: null,
    decisiveVariable: "constraint interpretation",
  };
}

/**
 * Returns true if any constraint in the set requires manual interpretation.
 * Equivalent to deduped.unresolvedCount > 0.
 */
export function hasUnresolvedConstraints(deduped: DedupedConstraintSet): boolean {
  return deduped.unresolvedCount > 0;
}

/**
 * Formats an unresolved constraint warning for display.
 * Returns null if there are no unresolved constraints.
 */
export function formatUnresolvedWarning(deduped: DedupedConstraintSet): string | null {
  if (deduped.unresolvedCount === 0) return null;
  if (deduped.unresolvedCount === 1) {
    return `1 constraint requires manual review: "${deduped.fallback?.raw ?? ""}"`;
  }
  return `${deduped.unresolvedCount} constraints require manual review and cannot be evaluated deterministically.`;
}
