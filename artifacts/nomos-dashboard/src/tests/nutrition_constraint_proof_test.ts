/**
 * nutrition_constraint_proof_test.ts
 *
 * Proof table: verifies that every nutrition constraint pattern the system
 * is expected to handle is correctly compiled by the dashboard constraint
 * compiler.
 *
 * For each row the test asserts:
 *   - compiled.kind      — must equal the expected typed kind (never INTERPRETATION_REQUIRED)
 *   - compiled.key       — must equal the expected sub-key within its kind
 *   - compiled.decisiveVariable — must equal the expected UI display variable
 *   - compiled.operator  — must be non-null (deterministic path)
 *
 * A console.table summary is printed at the start of the suite so the proof
 * table is visible in raw test-runner output without digging into individual
 * assertion lines.
 *
 * Run with:
 *   pnpm --filter @workspace/nomos-dashboard test
 */

import { describe, it, expect, beforeAll } from "vitest";
import { normalizeConstraintText } from "../compiler/constraint_normalizer";
import {
  compileConstraint,
  CompiledConstraint,
  CompiledConstraintKind,
} from "../compiler/constraint_compiler";

/* =========================================================
   Proof table rows
   ========================================================= */

interface ProofRow {
  /** Short human-readable label for the constraint pattern. */
  label: string;
  /** Raw constraint text as it would appear in a user draft. */
  raw: string;
  /** Expected compiled kind. */
  expectedKind: CompiledConstraintKind;
  /** Expected sub-key within the kind. */
  expectedKey: string;
  /** Expected decisive variable shown in the UI. */
  expectedDecisiveVariable: string;
}

const PROOF_TABLE: ProofRow[] = [
  {
    label: "protein placement",
    raw: "Preserve protein placement. Do not move protein between meals.",
    expectedKind: "STRUCTURAL_LOCK",
    expectedKey: "preserve_protein_placement",
    expectedDecisiveVariable: "protein placement",
  },
  {
    label: "meal order",
    raw: "Do not change meal order.",
    expectedKind: "STRUCTURAL_LOCK",
    expectedKey: "preserve_meal_order",
    expectedDecisiveVariable: "meal order",
  },
  {
    label: "meal count",
    raw: "Do not remove meals from the plan.",
    expectedKind: "STRUCTURAL_LOCK",
    expectedKey: "preserve_meal_count",
    expectedDecisiveVariable: "meal count",
  },
  {
    label: "meal dispersal",
    raw: "Preserve meal plan dispersal and timeblock pattern.",
    expectedKind: "STRUCTURAL_LOCK",
    expectedKey: "preserve_meal_dispersal",
    expectedDecisiveVariable: "meal dispersal",
  },
  {
    label: "calorie lockdown",
    raw: "Calorie lockdown — keep as tightly as possible to target.",
    expectedKind: "TARGET_TOLERANCE",
    expectedKey: "calorie_delta_minimize",
    expectedDecisiveVariable: "calorie delta",
  },
  {
    label: "already-present foods only",
    raw: "Only adjust gram amounts of already-present foods.",
    expectedKind: "ALLOWED_ACTION",
    expectedKey: "adjustment_scope",
    expectedDecisiveVariable: "disallowed food adjustment",
  },
  {
    label: "declared macro truth",
    raw: "Use declared macro values as truth.",
    expectedKind: "SOURCE_TRUTH",
    expectedKey: "declared_macros_override",
    expectedDecisiveVariable: "macro source",
  },
  {
    label: "estimated banana/egg defaults",
    raw: "Treat banana and eggs as estimated defaults from known nutritional tables.",
    expectedKind: "SOURCE_TRUTH",
    expectedKey: "estimated_defaults_allowed",
    expectedDecisiveVariable: "estimated defaults",
  },
  {
    label: "minimal structure-preserving changes",
    raw: "Prefer the smallest set of structure-preserving changes.",
    expectedKind: "TARGET_TOLERANCE",
    expectedKey: "minimize_change_magnitude",
    expectedDecisiveVariable: "change magnitude",
  },
  {
    label: "label priority",
    raw: "Label truth takes priority. Labels provided override generic assumptions.",
    expectedKind: "SOURCE_TRUTH",
    expectedKey: "label_priority",
    expectedDecisiveVariable: "macro source conflict",
  },
];

/* =========================================================
   Print summary table before tests run
   ========================================================= */

beforeAll(() => {
  const rows = PROOF_TABLE.map((row) => {
    const normalized = normalizeConstraintText(row.raw);
    const compiled = compileConstraint(row.raw);
    return {
      label: row.label,
      kind: compiled.kind,
      key: compiled.key,
      decisiveVariable: compiled.decisiveVariable,
      deterministic: compiled.kind !== "INTERPRETATION_REQUIRED" ? "YES" : "NO",
      normalized,
    };
  });

  console.log("\n=== NUTRITION CONSTRAINT PROOF TABLE ===\n");
  console.table(
    rows.map((r) => ({
      label: r.label,
      kind: r.kind,
      key: r.key,
      "decisive variable": r.decisiveVariable,
      deterministic: r.deterministic,
    }))
  );

  console.log("\n--- Normalized texts ---");
  rows.forEach((r) => {
    console.log(`  [${r.label}]`);
    console.log(`    raw:        ${PROOF_TABLE.find((p) => p.label === r.label)!.raw}`);
    console.log(`    normalized: ${r.normalized}\n`);
  });
});

/* =========================================================
   Proof assertions
   ========================================================= */

describe("nutrition constraint proof table", () => {
  for (const row of PROOF_TABLE) {
    describe(`${row.label}`, () => {
      let normalized: string;
      let compiled: CompiledConstraint;

      beforeAll(() => {
        normalized = normalizeConstraintText(row.raw);
        compiled = compileConstraint(row.raw);
      });

      it("normalizes to lowercase with whitespace collapsed", () => {
        expect(normalized).toBe(normalized.toLowerCase());
        expect(normalized).not.toMatch(/\s{2,}/);
      });

      it(`compiles to kind: ${row.expectedKind}`, () => {
        expect(compiled.kind).toBe(row.expectedKind);
      });

      it(`compiles to key: ${row.expectedKey}`, () => {
        expect(compiled.key).toBe(row.expectedKey);
      });

      it(`decisiveVariable is: "${row.expectedDecisiveVariable}"`, () => {
        expect(compiled.decisiveVariable).toBe(row.expectedDecisiveVariable);
      });

      it("is deterministic — operator is not null", () => {
        expect(compiled.operator).not.toBeNull();
      });

      it("is not INTERPRETATION_REQUIRED", () => {
        expect(compiled.kind).not.toBe("INTERPRETATION_REQUIRED");
      });

      it("raw text is preserved verbatim in compiled.raw", () => {
        expect(compiled.raw).toBe(row.raw);
      });

      it("is idempotent — compiling twice produces the same result", () => {
        const first = compileConstraint(row.raw);
        const second = compileConstraint(row.raw);
        expect(second).toStrictEqual(first);
      });
    });
  }

  describe("normalizeConstraintText — shared properties", () => {
    it("is pure — same input always produces same output", () => {
      for (const row of PROOF_TABLE) {
        const a = normalizeConstraintText(row.raw);
        const b = normalizeConstraintText(row.raw);
        expect(a).toBe(b);
      }
    });

    it("strips trailing period and comma", () => {
      expect(normalizeConstraintText("Do not move protein.")).toBe(
        "do not move protein"
      );
      expect(normalizeConstraintText("Do not move protein,")).toBe(
        "do not move protein"
      );
    });

    it("collapses unicode comparison operators", () => {
      expect(normalizeConstraintText("Calories ≥ 2000")).toBe("calories >= 2000");
      expect(normalizeConstraintText("Fat ≤ 60g")).toBe("fat <= 60g");
    });

    it("preserves the relationship between raw and normalized — all proof rows", () => {
      for (const row of PROOF_TABLE) {
        const norm = normalizeConstraintText(row.raw);
        expect(typeof norm).toBe("string");
        expect(norm.length).toBeGreaterThan(0);
        // Normalized text is always a substring-compatible lowered form of the raw text
        expect(norm).toBe(norm.toLowerCase());
      }
    });
  });

  describe("compileConstraints — full-table determinism", () => {
    it("every proof row compiles to a non-INTERPRETATION_REQUIRED kind", () => {
      const results = PROOF_TABLE.map((row) => compileConstraint(row.raw));
      const fallbacks = results.filter((r) => r.kind === "INTERPRETATION_REQUIRED");
      expect(fallbacks).toHaveLength(0);
    });

    it("every proof row has a non-null lhs and rhs", () => {
      const results = PROOF_TABLE.map((row) => compileConstraint(row.raw));
      for (const r of results) {
        expect(r.lhs).not.toBeNull();
        expect(r.rhs).not.toBeNull();
      }
    });

    it("each proof row produces a unique key", () => {
      const keys = PROOF_TABLE.map((row) => compileConstraint(row.raw).key);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(PROOF_TABLE.length);
    });

    it("decisive variables cover the expected UI variable set", () => {
      const dvs = new Set(
        PROOF_TABLE.map((row) => compileConstraint(row.raw).decisiveVariable)
      );
      expect(dvs).toContain("protein placement");
      expect(dvs).toContain("meal order");
      expect(dvs).toContain("meal count");
      expect(dvs).toContain("meal dispersal");
      expect(dvs).toContain("calorie delta");
      expect(dvs).toContain("disallowed food adjustment");
      expect(dvs).toContain("macro source");
      expect(dvs).toContain("estimated defaults");
      expect(dvs).toContain("change magnitude");
      expect(dvs).toContain("macro source conflict");
    });
  });
});
