/**
 * unit_registry.ts
 *
 * Master registry of recognized measurement units for the NOMOS parser layer.
 *
 * Design constraints:
 *   - All aliases are lowercase for case-insensitive matching.
 *   - Longer aliases appear before shorter ones so the generated regex
 *     prefers "grams" over "gram" over "g" on an exact token boundary.
 *   - `canonical` is the normalized short form used in normalizedUnit.
 *   - `category` drives downstream category inference — it is NOT a gate
 *     on extraction.  Unknown nouns are preserved open-vocabulary.
 *   - `isSelfEntity` = true means the unit surface form IS the entity label
 *     (e.g. "2 eggs" → entity label = "egg").
 *
 * Categories:
 *   mass     → evidence for food / supplement / load (resolved by entity label)
 *   volume   → evidence for food / fluid / supplement
 *   count    → evidence for countable_item
 *   time     → evidence for duration
 *   distance → evidence for spatial / distance
 *   training → evidence for countable_item (reps/sets/laps/steps)
 */

/* =========================================================
   Types
   ========================================================= */

export type UnitCategory =
  | "mass"
  | "volume"
  | "count"
  | "time"
  | "distance"
  | "training"
  | "energy"
  | "rate";

export interface UnitRecord {
  canonical: string;
  category: UnitCategory;
  aliases: readonly string[];
  isSelfEntity?: boolean;
}

/* =========================================================
   Registry
   ========================================================= */

export const UNIT_REGISTRY: readonly UnitRecord[] = [

  // ── Mass ──────────────────────────────────────────────────────────────────
  { canonical: "mcg", category: "mass", aliases: ["micrograms", "microgram", "mcg", "μg"] },
  { canonical: "mg",  category: "mass", aliases: ["milligrams", "milligram", "mg"] },
  { canonical: "g",   category: "mass", aliases: ["grams", "gram", "g"] },
  { canonical: "kg",  category: "mass", aliases: ["kilograms", "kilogram", "kg"] },
  { canonical: "oz",  category: "mass", aliases: ["ounces", "ounce", "oz"] },
  { canonical: "lb",  category: "mass", aliases: ["pounds", "pound", "lbs", "lb"] },
  { canonical: "ton", category: "mass", aliases: ["tonnes", "tonne", "tons", "ton"] },

  // ── Volume ────────────────────────────────────────────────────────────────
  { canonical: "ml",  category: "volume", aliases: ["milliliters", "milliliter", "mL", "ml"] },
  { canonical: "l",   category: "volume", aliases: ["liters", "liter", "L", "l"] },
  { canonical: "tsp", category: "volume", aliases: ["teaspoons", "teaspoon", "tsp"] },
  { canonical: "tbsp",category: "volume", aliases: ["tablespoons", "tablespoon", "tbsp"] },
  { canonical: "cup", category: "volume", aliases: ["cups", "cup"] },
  { canonical: "pint",category: "volume", aliases: ["pints", "pint"] },
  { canonical: "qt",  category: "volume", aliases: ["quarts", "quart", "qt"] },
  { canonical: "gal", category: "volume", aliases: ["gallons", "gallon", "gal"] },

  // ── Count / discrete ──────────────────────────────────────────────────────
  { canonical: "unit",      category: "count", aliases: ["units",      "unit"] },
  { canonical: "item",      category: "count", aliases: ["items",      "item"] },
  { canonical: "piece",     category: "count", aliases: ["pieces",     "piece"] },
  { canonical: "serving",   category: "count", aliases: ["servings",   "serving"] },
  { canonical: "scoop",     category: "count", aliases: ["scoops",     "scoop"] },
  { canonical: "container", category: "count", aliases: ["containers", "container"] },
  { canonical: "capsule",   category: "count", aliases: ["capsules",   "capsule"] },
  { canonical: "tablet",    category: "count", aliases: ["tablets",    "tablet"] },
  { canonical: "bottle",    category: "count", aliases: ["bottles",    "bottle"] },
  { canonical: "drop",      category: "count", aliases: ["drops",      "drop"] },
  { canonical: "packet",    category: "count", aliases: ["packets",    "packet"] },
  { canonical: "can",       category: "count", aliases: ["cans",       "can"] },
  // Self-entity count units (unit surface IS the entity label)
  { canonical: "egg",    category: "count", aliases: ["eggs",    "egg"],    isSelfEntity: true },
  { canonical: "banana", category: "count", aliases: ["bananas", "banana"], isSelfEntity: true },

  // ── Time ──────────────────────────────────────────────────────────────────
  { canonical: "s",           category: "time", aliases: ["seconds",     "second"] },
  { canonical: "min",         category: "time", aliases: ["minutes",     "minute",  "min"] },
  { canonical: "hr",          category: "time", aliases: ["hours",       "hour",    "hr"] },
  { canonical: "d",           category: "time", aliases: ["days",        "day"] },
  { canonical: "wk",          category: "time", aliases: ["weeks",       "week",    "wk"] },
  { canonical: "mo",          category: "time", aliases: ["months",      "month",   "mo"] },
  { canonical: "yr",          category: "time", aliases: ["years",       "year",    "yr"] },
  { canonical: "decade",      category: "time", aliases: ["decades",     "decade"] },
  { canonical: "century",     category: "time", aliases: ["centuries",   "century"] },
  { canonical: "millennium",  category: "time", aliases: ["millennia",   "millennium"] },
  { canonical: "era",         category: "time", aliases: ["eras",        "era"] },
  { canonical: "eon",         category: "time", aliases: ["eons",        "eon"] },

  // ── Distance ──────────────────────────────────────────────────────────────
  { canonical: "mm",  category: "distance", aliases: ["millimeters", "millimeter", "mm"] },
  { canonical: "cm",  category: "distance", aliases: ["centimeters", "centimeter", "cm"] },
  { canonical: "m",   category: "distance", aliases: ["meters",      "meter",      "m"] },
  { canonical: "km",  category: "distance", aliases: ["kilometers",  "kilometer",  "km"] },
  { canonical: "in",  category: "distance", aliases: ["inches",      "inch",       "in"] },
  { canonical: "ft",  category: "distance", aliases: ["feet",        "foot",       "ft"] },
  { canonical: "yd",  category: "distance", aliases: ["yards",       "yard",       "yd"] },
  { canonical: "mi",  category: "distance", aliases: ["miles",       "mile",       "mi"] },

  // ── Training / motion ────────────────────────────────────────────────────
  { canonical: "rep",  category: "training", aliases: ["reps",  "rep"] },
  { canonical: "set",  category: "training", aliases: ["sets",  "set"] },
  { canonical: "lap",  category: "training", aliases: ["laps",  "lap"] },
  { canonical: "step", category: "training", aliases: ["steps", "step"] },

  // ── Energy ────────────────────────────────────────────────────────────────
  { canonical: "kcal", category: "energy", aliases: ["kilocalories", "kilocalorie", "kcal", "Calories", "Cal"] },
  { canonical: "cal",  category: "energy", aliases: ["calories",     "calorie",     "cal"] },
  { canonical: "kj",   category: "energy", aliases: ["kilojoules",   "kilojoule",   "kJ",  "kj"] },
  { canonical: "j",    category: "energy", aliases: ["joules",       "joule",       "J"] },

  // ── Rate ──────────────────────────────────────────────────────────────────
  { canonical: "bpm",  category: "rate", aliases: ["bpm",   "beats per minute"] },
  { canonical: "rpm",  category: "rate", aliases: ["rpm",   "revolutions per minute"] },
  { canonical: "mph",  category: "rate", aliases: ["mph",   "miles per hour"] },
  { canonical: "kph",  category: "rate", aliases: ["kph",   "kmh", "km/h", "kilometers per hour"] },
];

/* =========================================================
   Lookup helpers
   ========================================================= */

/**
 * Flat map of alias (lowercase) → UnitRecord.
 * Built once at module load time.  First writer wins (registry order resolves
 * conflicts between records sharing an alias).
 */
const ALIAS_MAP = new Map<string, UnitRecord>();
for (const record of UNIT_REGISTRY) {
  for (const alias of record.aliases) {
    const key = alias.toLowerCase();
    if (!ALIAS_MAP.has(key)) {
      ALIAS_MAP.set(key, record);
    }
  }
}

/**
 * Resolve a surface form (any casing) to its UnitRecord.
 * Returns undefined if the alias is not in the registry.
 */
export function resolveUnit(alias: string): UnitRecord | undefined {
  return ALIAS_MAP.get(alias.toLowerCase());
}

/**
 * Build a regex-ready alternation string of all unit aliases, sorted
 * longest-first so the regex engine prefers longer tokens (e.g. "grams"
 * before "gram" before "g").
 *
 *   new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${buildUnitRegexPattern()})\\b`, "gi")
 */
export function buildUnitRegexPattern(): string {
  const allAliases = UNIT_REGISTRY.flatMap((r) =>
    r.aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
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
