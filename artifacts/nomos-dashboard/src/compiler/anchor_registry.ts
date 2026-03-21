/**
 * anchor_registry.ts
 *
 * A modest, open-vocabulary-compatible registry of known anchor nouns.
 *
 * Anchors are things other things can be measured relative to — activities,
 * events, states, or milestones.  This registry helps the relation binder
 * recognize common anchors quickly; it is NOT a gate on binding.  Unknown
 * nouns that appear after a relation word are still captured as anchors via
 * open-vocabulary noun-phrase extraction.
 *
 * Categories:
 *   activity  — physical or scheduled activities (lifting, workout, sleep, …)
 *   meal      — eating events (meal, breakfast, dinner, …)
 *   event     — generic events / milestones (meeting, deadline, promotion, …)
 *   state     — persistent states (fast, rest, recovery, …)
 */

/* =========================================================
   Types
   ========================================================= */

export type AnchorCategory = "activity" | "meal" | "event" | "state";

export interface AnchorRecord {
  canonical: string;
  category: AnchorCategory;
  aliases: readonly string[];
}

/* =========================================================
   Registry
   ========================================================= */

export const ANCHOR_REGISTRY: readonly AnchorRecord[] = [

  // ── Activity ──────────────────────────────────────────────────────────────
  { canonical: "lifting",  category: "activity", aliases: ["lifting", "lift"] },
  { canonical: "workout",  category: "activity", aliases: ["workout", "training", "exercise", "session"] },
  { canonical: "cardio",   category: "activity", aliases: ["cardio", "run", "running", "jog", "jogging"] },
  { canonical: "sleep",    category: "activity", aliases: ["sleep", "sleeping", "bedtime", "bed"] },
  { canonical: "waking",   category: "activity", aliases: ["waking", "wake", "wakeup", "morning"] },
  { canonical: "commute",  category: "activity", aliases: ["commute", "commuting"] },
  { canonical: "work",     category: "activity", aliases: ["work", "working", "office"] },

  // ── Meal ──────────────────────────────────────────────────────────────────
  { canonical: "meal",      category: "meal", aliases: ["meal", "eating"] },
  { canonical: "breakfast", category: "meal", aliases: ["breakfast"] },
  { canonical: "lunch",     category: "meal", aliases: ["lunch"] },
  { canonical: "dinner",    category: "meal", aliases: ["dinner", "supper"] },
  { canonical: "snack",     category: "meal", aliases: ["snack"] },
  { canonical: "dose",      category: "meal", aliases: ["dose", "dosing"] },

  // ── Event / milestone ─────────────────────────────────────────────────────
  { canonical: "meeting",   category: "event", aliases: ["meeting"] },
  { canonical: "deadline",  category: "event", aliases: ["deadline"] },
  { canonical: "event",     category: "event", aliases: ["event"] },
  { canonical: "launch",    category: "event", aliases: ["launch", "release"] },

  // ── State ─────────────────────────────────────────────────────────────────
  { canonical: "fast",     category: "state", aliases: ["fast", "fasting"] },
  { canonical: "rest",     category: "state", aliases: ["rest", "resting"] },
  { canonical: "recovery", category: "state", aliases: ["recovery", "recovering"] },
];

/* =========================================================
   Lookup helpers
   ========================================================= */

const ANCHOR_MAP = new Map<string, AnchorRecord>();
for (const record of ANCHOR_REGISTRY) {
  for (const alias of record.aliases) {
    const key = alias.toLowerCase();
    if (!ANCHOR_MAP.has(key)) {
      ANCHOR_MAP.set(key, record);
    }
  }
}

/**
 * Resolve a surface form (any casing) to its AnchorRecord, or undefined.
 * Open-vocabulary: callers must handle the undefined case gracefully and
 * still capture the noun phrase as a generic anchor.
 */
export function resolveAnchor(alias: string): AnchorRecord | undefined {
  return ANCHOR_MAP.get(alias.toLowerCase());
}

/**
 * The full set of known anchor alias strings (lowercase).
 * Useful for quick membership tests without a full record lookup.
 */
export const KNOWN_ANCHOR_ALIASES: ReadonlySet<string> = new Set(ANCHOR_MAP.keys());
