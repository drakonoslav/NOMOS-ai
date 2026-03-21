/**
 * relation_lexicon.ts
 *
 * Canonical registry of relation words that NOMOS uses to bind measured
 * entities into a reasoning graph.
 *
 * Design rules:
 *   - Multi-word phrases appear before their sub-phrases so scanners always
 *     prefer the longer match ("no more than" before "more than" before "than").
 *   - `category` groups relations by semantic function; `canonical` is the
 *     normalized key stored in RelationBinding.relation.
 *   - This registry is closed for units + relations.  Open vocabulary applies
 *     to entity labels and anchors only.
 */

/* =========================================================
   Types
   ========================================================= */

export type RelationCategory =
  | "temporal"
  | "spatial"
  | "quantitative"
  | "accompaniment";

export type RelationType =
  // Temporal ordering
  | "before"
  | "after"
  | "during"
  | "while"
  | "when"
  | "since"
  | "until"
  | "by"
  // Temporal windows
  | "within"
  | "over"
  | "across"
  | "between"
  | "from"
  | "to"
  | "around"
  | "near"
  | "pre"
  | "post"
  // Spatial
  | "above"
  | "below"
  | "under"
  | "inside"
  | "outside"
  | "beside"
  | "behind"
  | "in front of"
  | "from"
  // Quantitative threshold
  | "at least"
  | "at most"
  | "no more than"
  | "no less than"
  | "greater than"
  | "less than"
  | "equal to"
  | "exactly"
  | "approximately"
  // Accompaniment
  | "with"
  | "for";

export interface RelationRecord {
  canonical: RelationType;
  category: RelationCategory;
  /**
   * All surface forms that trigger this relation.
   * Multi-word phrases are listed first (longest-match wins during scanning).
   */
  surfaces: readonly string[];
}

/* =========================================================
   Registry  (multi-word entries MUST come before any sub-phrase)
   ========================================================= */

export const RELATION_REGISTRY: readonly RelationRecord[] = [

  // ── Quantitative (multi-word — must precede single-word tokens) ──────────
  { canonical: "no more than",  category: "quantitative", surfaces: ["no more than"] },
  { canonical: "no less than",  category: "quantitative", surfaces: ["no less than"] },
  { canonical: "at least",      category: "quantitative", surfaces: ["at least"] },
  { canonical: "at most",       category: "quantitative", surfaces: ["at most"] },
  { canonical: "greater than",  category: "quantitative", surfaces: ["greater than"] },
  { canonical: "less than",     category: "quantitative", surfaces: ["less than"] },
  { canonical: "equal to",      category: "quantitative", surfaces: ["equal to"] },
  { canonical: "approximately", category: "quantitative", surfaces: ["approximately", "approx"] },
  { canonical: "exactly",       category: "quantitative", surfaces: ["exactly"] },

  // ── Spatial (multi-word first) ────────────────────────────────────────────
  { canonical: "in front of", category: "spatial", surfaces: ["in front of"] },
  { canonical: "inside",      category: "spatial", surfaces: ["inside"] },
  { canonical: "outside",     category: "spatial", surfaces: ["outside"] },
  { canonical: "behind",      category: "spatial", surfaces: ["behind"] },
  { canonical: "beside",      category: "spatial", surfaces: ["beside"] },
  { canonical: "above",       category: "spatial", surfaces: ["above"] },
  { canonical: "below",       category: "spatial", surfaces: ["below"] },
  { canonical: "under",       category: "spatial", surfaces: ["under", "beneath"] },
  { canonical: "over",        category: "spatial", surfaces: ["over"] },
  { canonical: "near",        category: "spatial", surfaces: ["near", "nearby"] },
  { canonical: "around",      category: "spatial", surfaces: ["around"] },
  { canonical: "between",     category: "spatial", surfaces: ["between"] },
  { canonical: "from",        category: "spatial", surfaces: ["from"] },

  // ── Temporal ordering ─────────────────────────────────────────────────────
  { canonical: "before",  category: "temporal", surfaces: ["before", "pre"] },
  { canonical: "after",   category: "temporal", surfaces: ["after",  "post"] },
  { canonical: "during",  category: "temporal", surfaces: ["during"] },
  { canonical: "while",   category: "temporal", surfaces: ["while"] },
  { canonical: "when",    category: "temporal", surfaces: ["when"] },
  { canonical: "since",   category: "temporal", surfaces: ["since"] },
  { canonical: "until",   category: "temporal", surfaces: ["until", "till"] },
  { canonical: "by",      category: "temporal", surfaces: ["by"] },
  { canonical: "within",  category: "temporal", surfaces: ["within"] },
  { canonical: "across",  category: "temporal", surfaces: ["across"] },
  { canonical: "to",      category: "temporal", surfaces: ["to"] },

  // ── Accompaniment ─────────────────────────────────────────────────────────
  { canonical: "with",    category: "accompaniment", surfaces: ["with"] },
  { canonical: "for",     category: "accompaniment", surfaces: ["for"] },
];

/* =========================================================
   Lookup helpers
   ========================================================= */

export interface RelationMatch {
  canonical: RelationType;
  category: RelationCategory;
  surface: string;
  startIndex: number;
  endIndex: number;
}

/**
 * All unique surface forms from the registry, sorted longest-first.
 * Used by `findRelationMatches` to guarantee longest-match wins.
 */
const ALL_SURFACES: Array<{ surface: string; record: RelationRecord }> = [];
for (const record of RELATION_REGISTRY) {
  for (const surface of record.surfaces) {
    ALL_SURFACES.push({ surface, record });
  }
}
ALL_SURFACES.sort((a, b) => b.surface.length - a.surface.length);

/**
 * Scan `text` for all relation-word occurrences, longest-match-first per
 * position.  A match is only accepted on word boundaries (space / start / end).
 *
 * Returns matches sorted by startIndex ascending.
 */
export function findRelationMatches(text: string): RelationMatch[] {
  const lower = text.toLowerCase();
  const matched = new Set<number>(); // positions already consumed
  const results: RelationMatch[] = [];

  for (const { surface, record } of ALL_SURFACES) {
    let searchFrom = 0;
    while (searchFrom < lower.length) {
      const idx = lower.indexOf(surface, searchFrom);
      if (idx === -1) break;

      // Word-boundary check: character before must be non-alphanumeric or start
      const before = idx === 0 ? "" : lower[idx - 1];
      const after = lower[idx + surface.length] ?? "";
      const boundaryBefore = before === "" || /\W/.test(before);
      const boundaryAfter  = after  === "" || /\W/.test(after);

      if (boundaryBefore && boundaryAfter && !matched.has(idx)) {
        // Mark all positions in this match as consumed
        for (let p = idx; p < idx + surface.length; p++) matched.add(p);
        results.push({
          canonical: record.canonical,
          category:  record.category,
          surface,
          startIndex: idx,
          endIndex:   idx + surface.length,
        });
      }

      searchFrom = idx + 1;
    }
  }

  results.sort((a, b) => a.startIndex - b.startIndex);
  return results;
}
