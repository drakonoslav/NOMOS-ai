/**
 * unit_registry.ts
 *
 * Registry of recognized units for the quantified entity extractor.
 *
 * Design constraints:
 *   - All aliases are lowercase for case-insensitive matching in the extractor.
 *   - Longer aliases appear before shorter ones within each UnitRecord so that
 *     the generated regex prefers "grams" over "g" on an exact token boundary.
 *   - The canonical field is the normalized short form used in normalizedUnit.
 *   - The category determines how category inference works downstream:
 *       mass     → evidence for food/supplement/load (decided by entity label)
 *       volume   → evidence for food/fluid/supplement
 *       count    → evidence for countable_item (if unit = entity label)
 *       time     → evidence for duration
 *       training → evidence for countable_item
 */

/* =========================================================
   Types
   ========================================================= */

export type UnitCategory = "mass" | "volume" | "count" | "time" | "training";

export interface UnitRecord {
  /** Normalized short form, e.g. "g", "ml", "rep". */
  canonical: string;
  category: UnitCategory;
  /** All recognized surface forms, longest first. */
  aliases: readonly string[];
  /**
   * True when the unit is itself the entity name (egg, banana, etc.).
   * When true and no noun follows, the entity label defaults to `canonical`.
   */
  isSelfEntity?: boolean;
}

/* =========================================================
   Registry
   ========================================================= */

export const UNIT_REGISTRY: readonly UnitRecord[] = [
  // ── Mass ────────────────────────────────────────────────────────────────────
  { canonical: "g",  category: "mass",     aliases: ["grams", "gram", "g"] },
  { canonical: "kg", category: "mass",     aliases: ["kg"] },
  { canonical: "mg", category: "mass",     aliases: ["mg"] },
  { canonical: "lb", category: "mass",     aliases: ["lbs", "lb"] },
  { canonical: "oz", category: "mass",     aliases: ["oz"] },

  // ── Volume ──────────────────────────────────────────────────────────────────
  { canonical: "ml",        category: "volume", aliases: ["ml", "ml"] },
  { canonical: "ml",        category: "volume", aliases: ["mL"] },
  { canonical: "l",         category: "volume", aliases: ["L", "l"] },
  { canonical: "cup",       category: "volume", aliases: ["cups", "cup"] },
  { canonical: "tbsp",      category: "volume", aliases: ["tbsp"] },
  { canonical: "tsp",       category: "volume", aliases: ["tsp"] },
  { canonical: "scoop",     category: "volume", aliases: ["scoops", "scoop"] },
  { canonical: "container", category: "volume", aliases: ["containers", "container"] },

  // ── Count ───────────────────────────────────────────────────────────────────
  { canonical: "unit",    category: "count", aliases: ["units",    "unit"] },
  { canonical: "capsule", category: "count", aliases: ["capsules", "capsule"] },
  { canonical: "tablet",  category: "count", aliases: ["tablets",  "tablet"] },
  { canonical: "serving", category: "count", aliases: ["servings", "serving"] },
  { canonical: "piece",   category: "count", aliases: ["pieces",   "piece"] },
  // Self-entity count units (the unit IS the entity)
  { canonical: "egg",    category: "count", aliases: ["eggs",    "egg"],    isSelfEntity: true },
  { canonical: "banana", category: "count", aliases: ["bananas", "banana"], isSelfEntity: true },

  // ── Time ────────────────────────────────────────────────────────────────────
  { canonical: "s",   category: "time", aliases: ["seconds", "second"] },
  { canonical: "min", category: "time", aliases: ["minutes", "minute"] },
  { canonical: "hr",  category: "time", aliases: ["hours",   "hour"] },
  { canonical: "d",   category: "time", aliases: ["days",    "day"] },

  // ── Training ────────────────────────────────────────────────────────────────
  { canonical: "rep", category: "training", aliases: ["reps", "rep"] },
  { canonical: "set", category: "training", aliases: ["sets", "set"] },
];

/* =========================================================
   Lookup helpers
   ========================================================= */

/**
 * Flat map of alias (lowercase) → UnitRecord.
 * Built once at module load time.
 */
const ALIAS_MAP = new Map<string, UnitRecord>();
for (const record of UNIT_REGISTRY) {
  for (const alias of record.aliases) {
    // First writer wins; registry ordering resolves conflicts.
    if (!ALIAS_MAP.has(alias.toLowerCase())) {
      ALIAS_MAP.set(alias.toLowerCase(), record);
    }
  }
}

/**
 * Resolve a surface form (any casing) to its UnitRecord.
 * Returns undefined if the alias is not registered.
 */
export function resolveUnit(alias: string): UnitRecord | undefined {
  return ALIAS_MAP.get(alias.toLowerCase());
}

/**
 * Build a regex-ready alternation string of all unit aliases, sorted
 * longest-first to prevent partial matches (e.g. "grams" before "g").
 *
 * The result is suitable for embedding directly into a RegExp constructor:
 *   new RegExp(`(\\d+)\\s*(${buildUnitRegexPattern()})\\b`, "gi")
 */
export function buildUnitRegexPattern(): string {
  const allAliases = UNIT_REGISTRY.flatMap((r) =>
    r.aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  // Deduplicate while preserving first-seen order; then sort longest-first.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const a of allAliases) {
    if (!seen.has(a)) {
      seen.add(a);
      unique.push(a);
    }
  }
  return unique.sort((a, b) => b.length - a.length).join("|");
}
