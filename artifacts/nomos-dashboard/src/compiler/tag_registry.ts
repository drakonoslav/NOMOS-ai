/**
 * tag_registry.ts
 *
 * Canonical label → structured TagRecord registry for the NOMOS canonical layer.
 *
 * Distinct from entity_tag_registry.ts (which serves the legacy pipeline with
 * flat string arrays).  This registry serves the canonical entity schema and
 * carries per-tag confidence scores and sourceRegistryId values.
 *
 * Design principles:
 *   - Each entry maps a normalized label to an array of TagRecord objects.
 *   - Every tag carries confidence (0–1) and a sourceRegistryId.
 *   - Lookup prefers specificity: longer keys win over shorter ones.
 *   - Open-vocabulary: missing labels return null (not an error).
 *   - sourceRegistryId format: "{domain}.{snake_case_label}"
 *
 * Lookup tiers (first match wins):
 *   1. Exact normalized-label match
 *   2. Longest-key containment  (handles "pure cyclic dextrin powder")
 *   3. Token intersection       (handles "raw dextrin extract")
 */

import type { TagRecord } from "./canonical_entity_types.ts";

/* =========================================================
   Registry entry shape
   ========================================================= */

export interface CanonicalRegistryEntry {
  /** Namespaced registry identifier, e.g. "food.cyclic_dextrin". */
  sourceRegistryId: string;
  /** Structured tag records for this entity. */
  tags: TagRecord[];
}

/* =========================================================
   Internal registry
   =========================================================
   Keys: lowercase normalized labels (spaces allowed, not snake_case).
   Longer keys are matched first for specificity.
   ========================================================= */

const _REGISTRY: Record<string, CanonicalRegistryEntry> = {

  // ── Carbohydrates — fast ───────────────────────────────────────────────────
  "cyclic dextrin": {
    sourceRegistryId: "food.cyclic_dextrin",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.98, sourceRegistryId: "food.cyclic_dextrin" },
      { tag: "fast", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.cyclic_dextrin" },
    ],
  },
  "highly branched cyclic dextrin": {
    sourceRegistryId: "food.highly_branched_cyclic_dextrin",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.98, sourceRegistryId: "food.highly_branched_cyclic_dextrin" },
      { tag: "fast", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.highly_branched_cyclic_dextrin" },
    ],
  },
  "cluster dextrin": {
    sourceRegistryId: "food.cluster_dextrin",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.98, sourceRegistryId: "food.cluster_dextrin" },
      { tag: "fast", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.cluster_dextrin" },
    ],
  },
  "maltodextrin": {
    sourceRegistryId: "food.maltodextrin",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.maltodextrin" },
      { tag: "fast", provenance: "registry", confidence: 0.95, sourceRegistryId: "food.maltodextrin" },
    ],
  },
  "dextrose": {
    sourceRegistryId: "food.dextrose",
    tags: [
      { tag: "carb",  provenance: "registry", confidence: 0.99, sourceRegistryId: "food.dextrose" },
      { tag: "fast",  provenance: "registry", confidence: 0.99, sourceRegistryId: "food.dextrose" },
      { tag: "sugar", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.dextrose" },
    ],
  },
  "glucose": {
    sourceRegistryId: "food.glucose",
    tags: [
      { tag: "carb",  provenance: "registry", confidence: 0.99, sourceRegistryId: "food.glucose" },
      { tag: "fast",  provenance: "registry", confidence: 0.99, sourceRegistryId: "food.glucose" },
      { tag: "sugar", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.glucose" },
    ],
  },
  "fructose": {
    sourceRegistryId: "food.fructose",
    tags: [
      { tag: "carb",  provenance: "registry", confidence: 0.99, sourceRegistryId: "food.fructose" },
      { tag: "sugar", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.fructose" },
    ],
  },
  "dextrin": {
    sourceRegistryId: "food.dextrin",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.96, sourceRegistryId: "food.dextrin" },
      { tag: "fast", provenance: "registry", confidence: 0.94, sourceRegistryId: "food.dextrin" },
    ],
  },
  "white rice": {
    sourceRegistryId: "food.white_rice",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.98, sourceRegistryId: "food.white_rice" },
      { tag: "fast", provenance: "registry", confidence: 0.91, sourceRegistryId: "food.white_rice" },
    ],
  },
  "bread": {
    sourceRegistryId: "food.bread",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.bread" },
      { tag: "fast", provenance: "registry", confidence: 0.88, sourceRegistryId: "food.bread" },
    ],
  },
  "bagel": {
    sourceRegistryId: "food.bagel",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.bagel" },
      { tag: "fast", provenance: "registry", confidence: 0.87, sourceRegistryId: "food.bagel" },
    ],
  },
  "banana": {
    sourceRegistryId: "food.banana",
    tags: [
      { tag: "carb",  provenance: "registry", confidence: 0.97, sourceRegistryId: "food.banana" },
      { tag: "fast",  provenance: "registry", confidence: 0.89, sourceRegistryId: "food.banana" },
      { tag: "fruit", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.banana" },
    ],
  },

  // ── Carbohydrates — slow ───────────────────────────────────────────────────
  "rolled oats": {
    sourceRegistryId: "food.rolled_oats",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.98, sourceRegistryId: "food.rolled_oats" },
      { tag: "slow", provenance: "registry", confidence: 0.96, sourceRegistryId: "food.rolled_oats" },
    ],
  },
  "oats": {
    sourceRegistryId: "food.oats",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.98, sourceRegistryId: "food.oats" },
      { tag: "slow", provenance: "registry", confidence: 0.95, sourceRegistryId: "food.oats" },
    ],
  },
  "oat": {
    sourceRegistryId: "food.oat",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.98, sourceRegistryId: "food.oat" },
      { tag: "slow", provenance: "registry", confidence: 0.95, sourceRegistryId: "food.oat" },
    ],
  },
  "sweet potato": {
    sourceRegistryId: "food.sweet_potato",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.sweet_potato" },
      { tag: "slow", provenance: "registry", confidence: 0.92, sourceRegistryId: "food.sweet_potato" },
    ],
  },
  "brown rice": {
    sourceRegistryId: "food.brown_rice",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.98, sourceRegistryId: "food.brown_rice" },
      { tag: "slow", provenance: "registry", confidence: 0.90, sourceRegistryId: "food.brown_rice" },
    ],
  },
  "quinoa": {
    sourceRegistryId: "food.quinoa",
    tags: [
      { tag: "carb",    provenance: "registry", confidence: 0.92, sourceRegistryId: "food.quinoa" },
      { tag: "slow",    provenance: "registry", confidence: 0.87, sourceRegistryId: "food.quinoa" },
      { tag: "protein", provenance: "registry", confidence: 0.80, sourceRegistryId: "food.quinoa" },
    ],
  },

  // ── Carbohydrates — neutral ────────────────────────────────────────────────
  "rice": {
    sourceRegistryId: "food.rice",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.rice" },
    ],
  },
  "pasta": {
    sourceRegistryId: "food.pasta",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.pasta" },
    ],
  },
  "potato": {
    sourceRegistryId: "food.potato",
    tags: [
      { tag: "carb", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.potato" },
    ],
  },

  // ── Protein — fast ─────────────────────────────────────────────────────────
  "whey protein": {
    sourceRegistryId: "food.whey_protein",
    tags: [
      { tag: "protein", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.whey_protein" },
      { tag: "fast",    provenance: "registry", confidence: 0.94, sourceRegistryId: "food.whey_protein" },
    ],
  },
  "whey": {
    sourceRegistryId: "food.whey",
    tags: [
      { tag: "protein", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.whey" },
      { tag: "fast",    provenance: "registry", confidence: 0.93, sourceRegistryId: "food.whey" },
    ],
  },

  // ── Protein — slow ─────────────────────────────────────────────────────────
  "casein protein": {
    sourceRegistryId: "food.casein_protein",
    tags: [
      { tag: "protein", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.casein_protein" },
      { tag: "slow",    provenance: "registry", confidence: 0.96, sourceRegistryId: "food.casein_protein" },
    ],
  },
  "casein": {
    sourceRegistryId: "food.casein",
    tags: [
      { tag: "protein", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.casein" },
      { tag: "slow",    provenance: "registry", confidence: 0.95, sourceRegistryId: "food.casein" },
    ],
  },

  // ── Protein — neutral ──────────────────────────────────────────────────────
  "chicken breast": { sourceRegistryId: "food.chicken_breast", tags: [{ tag: "protein", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.chicken_breast" }] },
  "chicken":        { sourceRegistryId: "food.chicken",        tags: [{ tag: "protein", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.chicken" }] },
  "ground beef":    { sourceRegistryId: "food.ground_beef",    tags: [{ tag: "protein", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.ground_beef" }] },
  "beef":           { sourceRegistryId: "food.beef",           tags: [{ tag: "protein", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.beef" }] },
  "salmon":         { sourceRegistryId: "food.salmon",         tags: [{ tag: "protein", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.salmon" }, { tag: "fat", provenance: "registry", confidence: 0.90, sourceRegistryId: "food.salmon" }] },
  "tuna":           { sourceRegistryId: "food.tuna",           tags: [{ tag: "protein", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.tuna" }] },
  "eggs":           { sourceRegistryId: "food.eggs",           tags: [{ tag: "protein", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.eggs" }] },
  "egg":            { sourceRegistryId: "food.egg",            tags: [{ tag: "protein", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.egg" }] },
  "greek yogurt":   { sourceRegistryId: "food.greek_yogurt",   tags: [{ tag: "protein", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.greek_yogurt" }, { tag: "dairy", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.greek_yogurt" }] },
  "yogurt":         { sourceRegistryId: "food.yogurt",         tags: [{ tag: "protein", provenance: "registry", confidence: 0.95, sourceRegistryId: "food.yogurt" }, { tag: "dairy", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.yogurt" }] },
  "cottage cheese": { sourceRegistryId: "food.cottage_cheese", tags: [{ tag: "protein", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.cottage_cheese" }, { tag: "dairy", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.cottage_cheese" }] },
  "turkey":         { sourceRegistryId: "food.turkey",         tags: [{ tag: "protein", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.turkey" }] },
  "tofu":           { sourceRegistryId: "food.tofu",           tags: [{ tag: "protein", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.tofu" }] },

  // ── Fluids ─────────────────────────────────────────────────────────────────
  "water":          { sourceRegistryId: "fluid.water",          tags: [{ tag: "fluid", provenance: "registry", confidence: 0.99, sourceRegistryId: "fluid.water" }] },
  "sparkling water":{ sourceRegistryId: "fluid.sparkling_water", tags: [{ tag: "fluid", provenance: "registry", confidence: 0.99, sourceRegistryId: "fluid.sparkling_water" }] },
  "milk":           { sourceRegistryId: "fluid.milk",           tags: [{ tag: "fluid", provenance: "registry", confidence: 0.99, sourceRegistryId: "fluid.milk" }, { tag: "dairy", provenance: "registry", confidence: 0.99, sourceRegistryId: "fluid.milk" }, { tag: "protein", provenance: "registry", confidence: 0.85, sourceRegistryId: "fluid.milk" }] },
  "juice":          { sourceRegistryId: "fluid.juice",          tags: [{ tag: "fluid", provenance: "registry", confidence: 0.99, sourceRegistryId: "fluid.juice" }, { tag: "carb", provenance: "registry", confidence: 0.90, sourceRegistryId: "fluid.juice" }] },
  "orange juice":   { sourceRegistryId: "fluid.orange_juice",   tags: [{ tag: "fluid", provenance: "registry", confidence: 0.99, sourceRegistryId: "fluid.orange_juice" }, { tag: "carb", provenance: "registry", confidence: 0.95, sourceRegistryId: "fluid.orange_juice" }, { tag: "fast", provenance: "registry", confidence: 0.87, sourceRegistryId: "fluid.orange_juice" }] },
  "coffee":         { sourceRegistryId: "fluid.coffee",         tags: [{ tag: "fluid", provenance: "registry", confidence: 0.99, sourceRegistryId: "fluid.coffee" }] },
  "tea":            { sourceRegistryId: "fluid.tea",            tags: [{ tag: "fluid", provenance: "registry", confidence: 0.99, sourceRegistryId: "fluid.tea" }] },
  "electrolyte":    { sourceRegistryId: "fluid.electrolyte",    tags: [{ tag: "fluid", provenance: "registry", confidence: 0.95, sourceRegistryId: "fluid.electrolyte" }, { tag: "supplement", provenance: "registry", confidence: 0.90, sourceRegistryId: "fluid.electrolyte" }] },

  // ── Fats ───────────────────────────────────────────────────────────────────
  "peanut butter":  { sourceRegistryId: "food.peanut_butter",  tags: [{ tag: "fat", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.peanut_butter" }, { tag: "protein", provenance: "registry", confidence: 0.85, sourceRegistryId: "food.peanut_butter" }] },
  "almond butter":  { sourceRegistryId: "food.almond_butter",  tags: [{ tag: "fat", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.almond_butter" }, { tag: "protein", provenance: "registry", confidence: 0.80, sourceRegistryId: "food.almond_butter" }] },
  "avocado":        { sourceRegistryId: "food.avocado",        tags: [{ tag: "fat", provenance: "registry", confidence: 0.97, sourceRegistryId: "food.avocado" }] },
  "olive oil":      { sourceRegistryId: "food.olive_oil",      tags: [{ tag: "fat", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.olive_oil" }] },
  "butter":         { sourceRegistryId: "food.butter",         tags: [{ tag: "fat", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.butter" }, { tag: "dairy", provenance: "registry", confidence: 0.99, sourceRegistryId: "food.butter" }] },

  // ── Supplements ────────────────────────────────────────────────────────────
  "creatine monohydrate": { sourceRegistryId: "supplement.creatine_monohydrate", tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.creatine_monohydrate" }] },
  "creatine":       { sourceRegistryId: "supplement.creatine",   tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.creatine" }] },
  "caffeine":       { sourceRegistryId: "supplement.caffeine",   tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.caffeine" }, { tag: "stimulant", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.caffeine" }] },
  "melatonin":      { sourceRegistryId: "supplement.melatonin",  tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.melatonin" }] },
  "magnesium":      { sourceRegistryId: "supplement.magnesium",  tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.magnesium" }, { tag: "mineral", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.magnesium" }] },
  "zinc":           { sourceRegistryId: "supplement.zinc",       tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.zinc" }, { tag: "mineral", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.zinc" }] },
  "iron":           { sourceRegistryId: "supplement.iron",       tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.iron" }, { tag: "mineral", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.iron" }] },
  "vitamin d":      { sourceRegistryId: "supplement.vitamin_d",  tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.vitamin_d" }, { tag: "vitamin", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.vitamin_d" }] },
  "vitamin c":      { sourceRegistryId: "supplement.vitamin_c",  tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.vitamin_c" }, { tag: "vitamin", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.vitamin_c" }] },
  "vitamin":        { sourceRegistryId: "supplement.vitamin",    tags: [{ tag: "supplement", provenance: "registry", confidence: 0.97, sourceRegistryId: "supplement.vitamin" }, { tag: "vitamin", provenance: "registry", confidence: 0.97, sourceRegistryId: "supplement.vitamin" }] },
  "omega 3":        { sourceRegistryId: "supplement.omega_3",    tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.omega_3" }, { tag: "fat", provenance: "registry", confidence: 0.95, sourceRegistryId: "supplement.omega_3" }] },
  "fish oil":       { sourceRegistryId: "supplement.fish_oil",   tags: [{ tag: "supplement", provenance: "registry", confidence: 0.98, sourceRegistryId: "supplement.fish_oil" }, { tag: "fat", provenance: "registry", confidence: 0.95, sourceRegistryId: "supplement.fish_oil" }] },
  "bcaa":           { sourceRegistryId: "supplement.bcaa",       tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.bcaa" }, { tag: "protein", provenance: "registry", confidence: 0.90, sourceRegistryId: "supplement.bcaa" }] },
  "eaa":            { sourceRegistryId: "supplement.eaa",        tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.eaa" }, { tag: "protein", provenance: "registry", confidence: 0.90, sourceRegistryId: "supplement.eaa" }] },
  "collagen":       { sourceRegistryId: "supplement.collagen",   tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.collagen" }, { tag: "protein", provenance: "registry", confidence: 0.90, sourceRegistryId: "supplement.collagen" }] },
  "l-theanine":     { sourceRegistryId: "supplement.l_theanine", tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.l_theanine" }] },
  "ashwagandha":    { sourceRegistryId: "supplement.ashwagandha",tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.ashwagandha" }] },
  "glutamine":      { sourceRegistryId: "supplement.glutamine",  tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.glutamine" }, { tag: "protein", provenance: "registry", confidence: 0.85, sourceRegistryId: "supplement.glutamine" }] },
  "pre-workout":    { sourceRegistryId: "supplement.pre_workout",tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.pre_workout" }, { tag: "stimulant", provenance: "registry", confidence: 0.90, sourceRegistryId: "supplement.pre_workout" }] },
  "preworkout":     { sourceRegistryId: "supplement.preworkout", tags: [{ tag: "supplement", provenance: "registry", confidence: 0.99, sourceRegistryId: "supplement.preworkout" }, { tag: "stimulant", provenance: "registry", confidence: 0.90, sourceRegistryId: "supplement.preworkout" }] },
};

/* =========================================================
   Sorted keys — longest first for specificity
   ========================================================= */

const _SORTED_KEYS = Object.keys(_REGISTRY).sort((a, b) => b.length - a.length);

/* =========================================================
   Public API
   ========================================================= */

/**
 * Look up canonical TagRecord entries for a normalized entity label.
 *
 * Lookup order (first match wins):
 *   1. Exact match on normalized label
 *   2. Containment (longest matching key that is a substring)
 *   3. Token intersection (any significant word matches a registry key)
 *
 * Returns null when no entry is found.
 * Callers should fall through to category inference on null.
 */
export function lookupCanonicalTags(normalizedLabel: string): CanonicalRegistryEntry | null {
  const lower = normalizedLabel.trim().toLowerCase();
  if (!lower) return null;

  // 1. Exact match
  if (_REGISTRY[lower]) return _REGISTRY[lower];

  // 2. Containment — prefer longest key
  for (const key of _SORTED_KEYS) {
    if (lower.includes(key)) return _REGISTRY[key];
  }

  // 3. Token match
  const tokens = lower.split(/\s+/).filter((t) => t.length > 2);
  for (const key of _SORTED_KEYS) {
    if (tokens.includes(key)) return _REGISTRY[key];
  }

  return null;
}

/**
 * Direct registry entry access (testing and inspection).
 */
export function getCanonicalRegistryEntry(label: string): CanonicalRegistryEntry | undefined {
  return _REGISTRY[label.trim().toLowerCase()];
}
