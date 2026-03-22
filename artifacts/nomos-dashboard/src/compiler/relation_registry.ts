/**
 * relation_registry.ts
 *
 * Maps legacy surface-form relation strings (from relation_lexicon.ts)
 * to canonical CanonicalRelationType values from the typed schema.
 *
 * Also computes per-relation confidence and source registry IDs.
 *
 * Design:
 *   - WITHIN_WINDOW is assigned to "within", "over", "across" since they
 *     always denote bounded intervals in measurement contexts.
 *   - "pre" and "post" are shorthand surfaces that expand to BEFORE/AFTER
 *     and receive provenance="normalized".
 *   - Quantitative threshold words (at least, no more than, etc.) always
 *     map to COMPARES_TO_THRESHOLD regardless of direction.
 *   - Spatial words (above, below, near, etc.) map to RELATIVE_TO_ANCHOR
 *     since NOMOS treats spatial positioning as anchor-relative.
 */

import type { CanonicalRelationType, RelationProvenance } from "./canonical_relation_types.ts";

/* =========================================================
   Surface → CanonicalRelationType map
   ========================================================= */

/**
 * Maps every canonical surface string from relation_lexicon.ts to its
 * CanonicalRelationType.  The key is the `canonical` field from
 * RelationRecord (lowercase string), not the raw surface form.
 */
export const RELATION_TYPE_MAP: Readonly<Record<string, CanonicalRelationType>> = {
  // ── Temporal ordering ──────────────────────────────────────────────────────
  "before":   "BEFORE",
  "after":    "AFTER",
  "during":   "DURING",
  "while":    "DURING",
  "when":     "DURING",
  "since":    "AFTER",
  "until":    "BEFORE",
  "by":       "BEFORE",
  "from":     "BEFORE",
  "to":       "AFTER",

  // ── Temporal windows ───────────────────────────────────────────────────────
  "within":   "WITHIN_WINDOW",
  "over":     "WITHIN_WINDOW",
  "across":   "WITHIN_WINDOW",
  "between":  "BETWEEN",
  "around":   "RELATIVE_TO_ANCHOR",
  "near":     "RELATIVE_TO_ANCHOR",

  // ── Spatial ────────────────────────────────────────────────────────────────
  "above":      "RELATIVE_TO_ANCHOR",
  "below":      "RELATIVE_TO_ANCHOR",
  "under":      "RELATIVE_TO_ANCHOR",
  "inside":     "RELATIVE_TO_ANCHOR",
  "outside":    "RELATIVE_TO_ANCHOR",
  "behind":     "RELATIVE_TO_ANCHOR",
  "beside":     "RELATIVE_TO_ANCHOR",
  "in front of":"RELATIVE_TO_ANCHOR",

  // ── Quantitative threshold ─────────────────────────────────────────────────
  "at least":      "COMPARES_TO_THRESHOLD",
  "at most":       "COMPARES_TO_THRESHOLD",
  "no more than":  "COMPARES_TO_THRESHOLD",
  "no less than":  "COMPARES_TO_THRESHOLD",
  "greater than":  "COMPARES_TO_THRESHOLD",
  "less than":     "COMPARES_TO_THRESHOLD",
  "equal to":      "COMPARES_TO_THRESHOLD",
  "exactly":       "COMPARES_TO_THRESHOLD",
  "approximately": "COMPARES_TO_THRESHOLD",

  // ── Accompaniment ──────────────────────────────────────────────────────────
  "with":  "WITH",
  "for":   "WITH",
};

/* =========================================================
   Shorthand surfaces
   ========================================================= */

/**
 * Shorthand surface forms that expand to a canonical type but do not appear
 * literally as a full word in the relation phrase.
 *
 * "pre" → BEFORE (e.g. "pre lifting", "pre-lift" compound)
 * "post" → AFTER  (e.g. "post workout", "post-meal")
 */
export const SHORTHAND_SURFACES: ReadonlySet<string> = new Set(["pre", "post"]);

/**
 * True when the raw text for a binding used a shorthand surface rather than
 * the explicit relation word.
 *
 * Detection: if rawText contains `\bpre\b` but not `\bbefore\b`,
 * or contains `\bpost\b` but not `\bafter\b`, the surface was shorthand.
 */
export function isShorthandRelation(rawText: string, relation: string): boolean {
  const lower = rawText.toLowerCase();
  if (relation === "before") {
    return /\bpre\b/.test(lower) && !/\bbefore\b/.test(lower);
  }
  if (relation === "after") {
    return /\bpost\b/.test(lower) && !/\bafter\b/.test(lower);
  }
  return false;
}

/* =========================================================
   Canonical type resolution
   ========================================================= */

/**
 * Resolve a legacy surface/canonical string to a CanonicalRelationType.
 * Falls back to RELATIVE_TO_ANCHOR for unrecognized strings.
 */
export function resolveCanonicalRelationType(relation: string): CanonicalRelationType {
  return RELATION_TYPE_MAP[relation] ?? "RELATIVE_TO_ANCHOR";
}

/* =========================================================
   Confidence scoring
   ========================================================= */

/**
 * Compute confidence for a canonical relation based on its type, whether
 * an explicit offset was present, and its provenance.
 *
 * Scoring table:
 *   inferred structural          → 0.99  (always correct by construction)
 *   COMPARES_TO_THRESHOLD+offset → 0.97
 *   COMPARES_TO_THRESHOLD        → 0.90
 *   BEFORE/AFTER+offset          → 0.95  (fully explicit temporal)
 *   BEFORE/AFTER                 → 0.85  (temporal, no offset)
 *   WITHIN_WINDOW                → 0.92
 *   BETWEEN                      → 0.88
 *   DURING                       → 0.85
 *   WITH                         → 0.82
 *   RELATIVE_TO_ANCHOR           → 0.70
 *   normalized (shorthand)       → −0.05 (penalty applied to base)
 *   fallback                     → 0.50
 */
export function computeRelationConfidence(
  type: CanonicalRelationType,
  hasOffset: boolean,
  provenance: RelationProvenance,
): number {
  if (provenance === "inferred") return 0.99;
  if (provenance === "fallback") return 0.50;

  let base: number;
  switch (type) {
    case "COMPARES_TO_THRESHOLD": base = hasOffset ? 0.97 : 0.90; break;
    case "BEFORE":
    case "AFTER":                 base = hasOffset ? 0.95 : 0.85; break;
    case "WITHIN_WINDOW":         base = 0.92; break;
    case "BETWEEN":               base = 0.88; break;
    case "DURING":                base = 0.85; break;
    case "WITH":                  base = 0.82; break;
    case "RELATIVE_TO_ANCHOR":    base = 0.70; break;
    default:                      base = 0.75; break;
  }

  if (provenance === "normalized") {
    base = Math.max(0.0, base - 0.05);
  }

  return base;
}

/* =========================================================
   Source registry IDs
   ========================================================= */

/**
 * Return a namespaced source registry ID for a known canonical relation type.
 * Format: "{category}.{relation_lowercase}"
 *
 * Temporal, spatial, accompaniment, and threshold relations each get their
 * own namespace. Structural (inferred) relations return null.
 */
export function getRelationSourceRegistryId(
  type: CanonicalRelationType,
): string | null {
  const TEMPORAL = new Set<CanonicalRelationType>(["BEFORE", "AFTER", "WITHIN_WINDOW", "DURING", "BETWEEN"]);
  const SPATIAL  = new Set<CanonicalRelationType>(["RELATIVE_TO_ANCHOR"]);
  const ACCOMPANIMENT = new Set<CanonicalRelationType>(["WITH"]);
  const THRESHOLD = new Set<CanonicalRelationType>(["COMPARES_TO_THRESHOLD"]);

  if (TEMPORAL.has(type))     return `temporal.${type.toLowerCase()}`;
  if (SPATIAL.has(type))      return `spatial.${type.toLowerCase()}`;
  if (ACCOMPANIMENT.has(type))return `accompaniment.${type.toLowerCase()}`;
  if (THRESHOLD.has(type))    return `quantitative.${type.toLowerCase()}`;
  return null;
}
