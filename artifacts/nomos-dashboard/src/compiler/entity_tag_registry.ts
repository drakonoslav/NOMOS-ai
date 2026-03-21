/**
 * entity_tag_registry.ts
 *
 * Canonical entity-label → tag registry for the NOMOS graph layer.
 *
 * Design principles:
 *   - Classification happens once, here, and is reused downstream.
 *   - Tags are domain-semantic (fast, slow, carb, protein, …).
 *   - Category is infra-semantic (food, supplement, fluid, …).
 *   - Provenance is recorded for every tag, not just the tag set.
 *   - Open-vocabulary: unlisted labels fall through to category inference.
 *
 * Tag provenance levels:
 *   "explicit"  — tag was declared in source input (reserved, not yet assigned
 *                 by the extractor — set when user syntax evolves to support it)
 *   "registry"  — tag comes from this lookup table
 *   "inferred"  — tag derived from unit/category analysis (no registry entry)
 *   "fallback"  — tag derived from label heuristics when nothing else matched
 */

export type TagProvenanceSource = "explicit" | "registry" | "inferred" | "fallback";

export interface TagRecord {
  tags:       string[];
  provenance: Record<string, TagProvenanceSource>;
}

/* =========================================================
   Canonical registry
   =========================================================
   Keys must be lowercase normalized labels.
   Longer (more specific) keys take priority over shorter ones.
   ========================================================= */

const _REGISTRY: Record<string, TagRecord> = {

  // ── Carbohydrates — fast ───────────────────────────────────────────────────
  "cyclic dextrin":       { tags: ["fast","carb"],         provenance: { fast:"registry", carb:"registry" } },
  "highly branched cyclic dextrin": { tags: ["fast","carb"], provenance: { fast:"registry", carb:"registry" } },
  "cluster dextrin":      { tags: ["fast","carb"],         provenance: { fast:"registry", carb:"registry" } },
  "maltodextrin":         { tags: ["fast","carb"],         provenance: { fast:"registry", carb:"registry" } },
  "dextrose":             { tags: ["fast","carb","sugar"], provenance: { fast:"registry", carb:"registry", sugar:"registry" } },
  "glucose":              { tags: ["fast","carb","sugar"], provenance: { fast:"registry", carb:"registry", sugar:"registry" } },
  "fructose":             { tags: ["carb","sugar"],        provenance: { carb:"registry", sugar:"registry" } },
  "sucrose":              { tags: ["carb","sugar"],        provenance: { carb:"registry", sugar:"registry" } },
  "white rice":           { tags: ["fast","carb"],         provenance: { fast:"registry", carb:"registry" } },
  "white bread":          { tags: ["fast","carb"],         provenance: { fast:"registry", carb:"registry" } },
  "bread":                { tags: ["fast","carb"],         provenance: { fast:"registry", carb:"registry" } },
  "bagel":                { tags: ["fast","carb"],         provenance: { fast:"registry", carb:"registry" } },
  "banana":               { tags: ["fast","carb","fruit"], provenance: { fast:"registry", carb:"registry", fruit:"registry" } },
  "dextrin":              { tags: ["fast","carb"],         provenance: { fast:"registry", carb:"registry" } },

  // ── Carbohydrates — slow ───────────────────────────────────────────────────
  "oats":                 { tags: ["slow","carb"],         provenance: { slow:"registry", carb:"registry" } },
  "oat":                  { tags: ["slow","carb"],         provenance: { slow:"registry", carb:"registry" } },
  "rolled oats":          { tags: ["slow","carb"],         provenance: { slow:"registry", carb:"registry" } },
  "sweet potato":         { tags: ["slow","carb"],         provenance: { slow:"registry", carb:"registry" } },
  "yam":                  { tags: ["slow","carb"],         provenance: { slow:"registry", carb:"registry" } },
  "brown rice":           { tags: ["slow","carb"],         provenance: { slow:"registry", carb:"registry" } },
  "lentil":               { tags: ["slow","carb","protein"], provenance: { slow:"registry", carb:"registry", protein:"registry" } },
  "lentils":              { tags: ["slow","carb","protein"], provenance: { slow:"registry", carb:"registry", protein:"registry" } },
  "chickpea":             { tags: ["slow","carb","protein"], provenance: { slow:"registry", carb:"registry", protein:"registry" } },
  "chickpeas":            { tags: ["slow","carb","protein"], provenance: { slow:"registry", carb:"registry", protein:"registry" } },
  "quinoa":               { tags: ["slow","carb","protein"], provenance: { slow:"registry", carb:"registry", protein:"registry" } },
  "barley":               { tags: ["slow","carb"],         provenance: { slow:"registry", carb:"registry" } },

  // ── Carbohydrates — neutral ────────────────────────────────────────────────
  "rice":                 { tags: ["carb"],                provenance: { carb:"registry" } },
  "pasta":                { tags: ["carb"],                provenance: { carb:"registry" } },
  "potato":               { tags: ["carb"],                provenance: { carb:"registry" } },
  "potatoes":             { tags: ["carb"],                provenance: { carb:"registry" } },
  "apple":                { tags: ["carb","fruit"],        provenance: { carb:"registry", fruit:"registry" } },
  "berries":              { tags: ["carb","fruit"],        provenance: { carb:"registry", fruit:"registry" } },
  "blueberries":          { tags: ["carb","fruit"],        provenance: { carb:"registry", fruit:"registry" } },
  "strawberries":         { tags: ["carb","fruit"],        provenance: { carb:"registry", fruit:"registry" } },

  // ── Protein — fast ─────────────────────────────────────────────────────────
  "whey protein":         { tags: ["protein","fast"],      provenance: { protein:"registry", fast:"registry" } },
  "whey":                 { tags: ["protein","fast"],      provenance: { protein:"registry", fast:"registry" } },
  "egg white":            { tags: ["protein","fast"],      provenance: { protein:"registry", fast:"registry" } },

  // ── Protein — slow ─────────────────────────────────────────────────────────
  "casein protein":       { tags: ["protein","slow"],      provenance: { protein:"registry", slow:"registry" } },
  "casein":               { tags: ["protein","slow"],      provenance: { protein:"registry", slow:"registry" } },

  // ── Protein — neutral ──────────────────────────────────────────────────────
  "protein":              { tags: ["protein"],             provenance: { protein:"registry" } },
  "chicken":              { tags: ["protein"],             provenance: { protein:"registry" } },
  "chicken breast":       { tags: ["protein"],             provenance: { protein:"registry" } },
  "beef":                 { tags: ["protein"],             provenance: { protein:"registry" } },
  "ground beef":          { tags: ["protein"],             provenance: { protein:"registry" } },
  "salmon":               { tags: ["protein","fat"],       provenance: { protein:"registry", fat:"registry" } },
  "tuna":                 { tags: ["protein"],             provenance: { protein:"registry" } },
  "egg":                  { tags: ["protein"],             provenance: { protein:"registry" } },
  "eggs":                 { tags: ["protein"],             provenance: { protein:"registry" } },
  "yogurt":               { tags: ["protein","dairy"],     provenance: { protein:"registry", dairy:"registry" } },
  "greek yogurt":         { tags: ["protein","dairy"],     provenance: { protein:"registry", dairy:"registry" } },
  "cottage cheese":       { tags: ["protein","dairy"],     provenance: { protein:"registry", dairy:"registry" } },
  "turkey":               { tags: ["protein"],             provenance: { protein:"registry" } },
  "shrimp":               { tags: ["protein"],             provenance: { protein:"registry" } },
  "tofu":                 { tags: ["protein"],             provenance: { protein:"registry" } },
  "tempeh":               { tags: ["protein"],             provenance: { protein:"registry" } },

  // ── Dairy ──────────────────────────────────────────────────────────────────
  "milk":                 { tags: ["fluid","dairy","protein"], provenance: { fluid:"registry", dairy:"registry", protein:"registry" } },
  "cheese":               { tags: ["protein","dairy","fat"], provenance: { protein:"registry", dairy:"registry", fat:"registry" } },
  "butter":               { tags: ["fat","dairy"],         provenance: { fat:"registry", dairy:"registry" } },

  // ── Fluids ─────────────────────────────────────────────────────────────────
  "water":                { tags: ["fluid"],               provenance: { fluid:"registry" } },
  "sparkling water":      { tags: ["fluid"],               provenance: { fluid:"registry" } },
  "juice":                { tags: ["fluid","carb"],        provenance: { fluid:"registry", carb:"registry" } },
  "orange juice":         { tags: ["fluid","carb","fast"], provenance: { fluid:"registry", carb:"registry", fast:"registry" } },
  "coffee":               { tags: ["fluid"],               provenance: { fluid:"registry" } },
  "tea":                  { tags: ["fluid"],               provenance: { fluid:"registry" } },
  "broth":                { tags: ["fluid"],               provenance: { fluid:"registry" } },
  "electrolyte":          { tags: ["fluid","supplement"],  provenance: { fluid:"registry", supplement:"registry" } },
  "electrolytes":         { tags: ["fluid","supplement"],  provenance: { fluid:"registry", supplement:"registry" } },
  "sports drink":         { tags: ["fluid","carb","supplement"], provenance: { fluid:"registry", carb:"registry", supplement:"registry" } },

  // ── Fats / oils ────────────────────────────────────────────────────────────
  "olive oil":            { tags: ["fat"],                 provenance: { fat:"registry" } },
  "coconut oil":          { tags: ["fat"],                 provenance: { fat:"registry" } },
  "oil":                  { tags: ["fat"],                 provenance: { fat:"registry" } },
  "peanut butter":        { tags: ["fat","protein"],       provenance: { fat:"registry", protein:"registry" } },
  "almond butter":        { tags: ["fat","protein"],       provenance: { fat:"registry", protein:"registry" } },
  "almond":               { tags: ["fat","protein"],       provenance: { fat:"registry", protein:"registry" } },
  "almonds":              { tags: ["fat","protein"],       provenance: { fat:"registry", protein:"registry" } },
  "walnut":               { tags: ["fat","protein"],       provenance: { fat:"registry", protein:"registry" } },
  "walnuts":              { tags: ["fat","protein"],       provenance: { fat:"registry", protein:"registry" } },
  "peanut":               { tags: ["fat","protein"],       provenance: { fat:"registry", protein:"registry" } },
  "avocado":              { tags: ["fat"],                 provenance: { fat:"registry" } },

  // ── Supplements ────────────────────────────────────────────────────────────
  "creatine":             { tags: ["supplement"],          provenance: { supplement:"registry" } },
  "creatine monohydrate": { tags: ["supplement"],          provenance: { supplement:"registry" } },
  "caffeine":             { tags: ["supplement"],          provenance: { supplement:"registry" } },
  "melatonin":            { tags: ["supplement"],          provenance: { supplement:"registry" } },
  "magnesium":            { tags: ["supplement","mineral"], provenance: { supplement:"registry", mineral:"registry" } },
  "zinc":                 { tags: ["supplement","mineral"], provenance: { supplement:"registry", mineral:"registry" } },
  "iron":                 { tags: ["supplement","mineral"], provenance: { supplement:"registry", mineral:"registry" } },
  "potassium":            { tags: ["supplement","mineral"], provenance: { supplement:"registry", mineral:"registry" } },
  "sodium":               { tags: ["supplement","mineral"], provenance: { supplement:"registry", mineral:"registry" } },
  "vitamin d":            { tags: ["supplement","vitamin"], provenance: { supplement:"registry", vitamin:"registry" } },
  "vitamin c":            { tags: ["supplement","vitamin"], provenance: { supplement:"registry", vitamin:"registry" } },
  "vitamin":              { tags: ["supplement","vitamin"], provenance: { supplement:"registry", vitamin:"registry" } },
  "omega 3":              { tags: ["supplement","fat"],    provenance: { supplement:"registry", fat:"registry" } },
  "omega":                { tags: ["supplement","fat"],    provenance: { supplement:"registry", fat:"registry" } },
  "fish oil":             { tags: ["supplement","fat"],    provenance: { supplement:"registry", fat:"registry" } },
  "bcaa":                 { tags: ["supplement","protein"], provenance: { supplement:"registry", protein:"registry" } },
  "eaa":                  { tags: ["supplement","protein"], provenance: { supplement:"registry", protein:"registry" } },
  "beta-alanine":         { tags: ["supplement"],          provenance: { supplement:"registry" } },
  "citrulline":           { tags: ["supplement"],          provenance: { supplement:"registry" } },
  "l-citrulline":         { tags: ["supplement"],          provenance: { supplement:"registry" } },
  "collagen":             { tags: ["supplement","protein"], provenance: { supplement:"registry", protein:"registry" } },
  "l-theanine":           { tags: ["supplement"],          provenance: { supplement:"registry" } },
  "ashwagandha":          { tags: ["supplement"],          provenance: { supplement:"registry" } },
  "rhodiola":             { tags: ["supplement"],          provenance: { supplement:"registry" } },
  "glutamine":            { tags: ["supplement","protein"], provenance: { supplement:"registry", protein:"registry" } },
  "preworkout":           { tags: ["supplement"],          provenance: { supplement:"registry" } },
  "pre-workout":          { tags: ["supplement"],          provenance: { supplement:"registry" } },

  // ── Vegetables (low carb) ─────────────────────────────────────────────────
  "spinach":              { tags: ["vegetable"],           provenance: { vegetable:"registry" } },
  "broccoli":             { tags: ["vegetable"],           provenance: { vegetable:"registry" } },
  "kale":                 { tags: ["vegetable"],           provenance: { vegetable:"registry" } },
};

/* =========================================================
   Sorted keys (longest first — prefer specificity)
   ========================================================= */

const _SORTED_KEYS = Object.keys(_REGISTRY).sort((a, b) => b.length - a.length);

/* =========================================================
   Public API
   ========================================================= */

/**
 * Look up canonical tags for a normalized entity label.
 *
 * Lookup order (first match wins):
 *   1. Exact normalized-label match
 *   2. Prefix containment (longest registry key whose value is a substring)
 *   3. Token intersection (any significant word token matches a single-word key)
 *
 * Returns null when no registry entry is found.
 * Callers should fall through to category-based inference when null.
 */
export function lookupEntityTags(normalizedLabel: string): TagRecord | null {
  const lower = normalizedLabel.trim().toLowerCase();
  if (!lower) return null;

  // 1. Exact match
  if (_REGISTRY[lower]) return _REGISTRY[lower];

  // 2. Containment — prefer longest key to avoid partial-word collisions
  for (const key of _SORTED_KEYS) {
    if (lower.includes(key)) return _REGISTRY[key];
  }

  // 3. Token match — allows "cyclic dextrin extract" → matches "dextrin"
  const tokens = lower.split(/\s+/).filter((t) => t.length > 2);
  for (const key of _SORTED_KEYS) {
    if (tokens.includes(key)) return _REGISTRY[key];
  }

  return null;
}

/**
 * Direct registry entry access (for testing and registry inspection).
 * Returns undefined when the key is not present.
 */
export function getRegistryEntry(normalizedLabel: string): TagRecord | undefined {
  return _REGISTRY[normalizedLabel.trim().toLowerCase()];
}
