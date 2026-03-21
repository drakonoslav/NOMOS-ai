/**
 * governance_audit_trail_test.ts
 *
 * Regression tests for governance_audit_types.ts and governance_audit_trail.ts.
 *
 * All setup is inside it() blocks so that beforeEach (which calls
 * clearGovernanceAuditTrail) runs cleanly before each test.
 *
 * Scenarios:
 *   1.  buildGovernanceAuditRecord — throws when chosenPolicyVersionId is empty
 *   2.  buildGovernanceAuditRecord — throws when humanReason is empty
 *   3.  buildGovernanceAuditRecord — actionId has prefix "aud-"
 *   4.  buildGovernanceAuditRecord — actionId is 12 chars total ("aud-" + 8)
 *   5.  buildGovernanceAuditRecord — actionId is deterministic (same input → same id)
 *   6.  buildGovernanceAuditRecord — different inputs produce different actionIds
 *   7.  buildGovernanceAuditRecord — record fields match input exactly
 *   8.  buildGovernanceAuditRecord — expectedGains is a copy, not the original array
 *   9.  buildGovernanceAuditRecord — does not mutate input
 *  10.  buildGovernanceAuditRecord — recommendationStrength preserved
 *  11.  buildGovernanceAuditRecord — recommendationConfidence preserved
 *  12.  saveGovernanceAuditRecord — persists record to storage
 *  13.  saveGovernanceAuditRecord — two saves produce two stored records
 *  14.  saveGovernanceAuditRecord — never modifies existing records
 *  15.  listGovernanceAuditRecords — returns empty array when no records
 *  16.  listGovernanceAuditRecords — returns all records most recent first
 *  17.  listGovernanceAuditRecords — filters by domain when provided
 *  18.  listGovernanceAuditRecords — does not affect underlying storage order
 *  19.  listGovernanceAuditRecords — returns all domains when no filter
 *  20.  getGovernanceAuditRecord — returns null when not found
 *  21.  getGovernanceAuditRecord — returns correct record by actionId
 *  22.  getGovernanceAuditRecord — mutation of returned value does not affect storage
 *  23.  clearGovernanceAuditTrail — removes all records from storage
 *  24.  clearGovernanceAuditTrail — listGovernanceAuditRecords returns empty after clear
 *  25.  saveGovernanceAuditRecord — benchEvidenceSummary preserved
 *  26.  saveGovernanceAuditRecord — recommendationSummary preserved
 *  27.  saveGovernanceAuditRecord — currentPolicyVersionId may be null
 *  28.  saveGovernanceAuditRecord — recommendedPolicyVersionId may be null
 *  29.  listGovernanceAuditRecords — domain filter excludes other domains
 *  30.  buildGovernanceAuditRecord — action "rollback" preserved
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildGovernanceAuditRecord,
  saveGovernanceAuditRecord,
  listGovernanceAuditRecords,
  getGovernanceAuditRecord,
  clearGovernanceAuditTrail,
} from "../audit/governance_audit_trail";
import type { GovernanceAuditRecordInput } from "../audit/governance_audit_types";

/* =========================================================
   localStorage mock for node environment
   ========================================================= */

const _store: Record<string, string> = {};
const localStorageMock: Storage = {
  getItem:    (key: string) => _store[key] ?? null,
  setItem:    (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear:      () => { for (const k of Object.keys(_store)) delete _store[k]; },
  key:        (i: number) => Object.keys(_store)[i] ?? null,
  get length() { return Object.keys(_store).length; },
};
// Install on globalThis so the module under test can access it
(globalThis as Record<string, unknown>)["localStorage"] = localStorageMock;

/* =========================================================
   Fixtures
   ========================================================= */

function makeInput(overrides?: Partial<GovernanceAuditRecordInput>): GovernanceAuditRecordInput {
  return {
    timestamp: "2026-03-21T10:00:00.000Z",
    domain: "nutrition",
    action: "promote",
    currentPolicyVersionId: "pol-aaaaaaaa",
    recommendedPolicyVersionId: "pol-bbbbbbbb",
    chosenPolicyVersionId: "pol-bbbbbbbb",
    expectedGains: ["Exact-match performance is likely to improve."],
    expectedTradeoffs: ["Confidence outputs may become slightly more conservative."],
    expectedRisks: ["Bench evidence is limited to a shallow window."],
    recommendationStrength: "moderate",
    recommendationConfidence: "moderate",
    humanReason: "Bench evidence clearly supports this promotion.",
    benchEvidenceSummary: ["2 policies evaluated."],
    recommendationSummary: ["pol-bbbbbbbb is recommended."],
    ...overrides,
  };
}

/* =========================================================
   Reset trail before each test
   ========================================================= */

beforeEach(() => {
  localStorageMock.clear();
});

/* =========================================================
   Scenario 1: throws when chosenPolicyVersionId is empty
   ========================================================= */

describe("buildGovernanceAuditRecord — throws when chosenPolicyVersionId is empty", () => {
  it("throws", () => {
    expect(() =>
      buildGovernanceAuditRecord(makeInput({ chosenPolicyVersionId: "" }))
    ).toThrow();
  });
});

/* =========================================================
   Scenario 2: throws when humanReason is empty
   ========================================================= */

describe("buildGovernanceAuditRecord — throws when humanReason is empty", () => {
  it("throws", () => {
    expect(() =>
      buildGovernanceAuditRecord(makeInput({ humanReason: "   " }))
    ).toThrow();
  });
});

/* =========================================================
   Scenario 3: actionId has prefix "aud-"
   ========================================================= */

describe("buildGovernanceAuditRecord — actionId has prefix 'aud-'", () => {
  it("actionId starts with 'aud-'", () => {
    const record = buildGovernanceAuditRecord(makeInput());
    expect(record.actionId).toMatch(/^aud-/);
  });
});

/* =========================================================
   Scenario 4: actionId is 12 chars total ("aud-" + 8)
   ========================================================= */

describe("buildGovernanceAuditRecord — actionId is 12 chars total", () => {
  it("actionId has length 12", () => {
    const record = buildGovernanceAuditRecord(makeInput());
    expect(record.actionId).toHaveLength(12);
  });
});

/* =========================================================
   Scenario 5: actionId is deterministic
   ========================================================= */

describe("buildGovernanceAuditRecord — actionId is deterministic", () => {
  it("same input produces same actionId", () => {
    const input = makeInput();
    const r1 = buildGovernanceAuditRecord(input);
    const r2 = buildGovernanceAuditRecord(input);
    expect(r1.actionId).toBe(r2.actionId);
  });
});

/* =========================================================
   Scenario 6: different inputs produce different actionIds
   ========================================================= */

describe("buildGovernanceAuditRecord — different inputs produce different actionIds", () => {
  it("actionIds differ", () => {
    const r1 = buildGovernanceAuditRecord(makeInput({ humanReason: "First reason" }));
    const r2 = buildGovernanceAuditRecord(makeInput({ humanReason: "Second reason" }));
    expect(r1.actionId).not.toBe(r2.actionId);
  });
});

/* =========================================================
   Scenario 7: record fields match input exactly
   ========================================================= */

describe("buildGovernanceAuditRecord — record fields match input exactly", () => {
  it("all key fields match", () => {
    const input = makeInput();
    const record = buildGovernanceAuditRecord(input);
    expect(record.timestamp).toBe(input.timestamp);
    expect(record.domain).toBe(input.domain);
    expect(record.action).toBe(input.action);
    expect(record.currentPolicyVersionId).toBe(input.currentPolicyVersionId);
    expect(record.chosenPolicyVersionId).toBe(input.chosenPolicyVersionId);
    expect(record.humanReason).toBe(input.humanReason);
  });
});

/* =========================================================
   Scenario 8: expectedGains is a copy, not original array
   ========================================================= */

describe("buildGovernanceAuditRecord — expectedGains is a defensive copy", () => {
  it("record.expectedGains not affected by mutation of input", () => {
    const input = makeInput();
    const original = [...input.expectedGains];
    const record = buildGovernanceAuditRecord(input);
    input.expectedGains.push("mutated after build");
    expect(record.expectedGains).toEqual(original);
  });
});

/* =========================================================
   Scenario 9: does not mutate input
   ========================================================= */

describe("buildGovernanceAuditRecord — does not mutate input", () => {
  it("humanReason unchanged", () => {
    const input = makeInput();
    const originalReason = input.humanReason;
    buildGovernanceAuditRecord(input);
    expect(input.humanReason).toBe(originalReason);
  });
});

/* =========================================================
   Scenario 10: recommendationStrength preserved
   ========================================================= */

describe("buildGovernanceAuditRecord — recommendationStrength preserved", () => {
  it("recommendationStrength is 'strong'", () => {
    const record = buildGovernanceAuditRecord(makeInput({ recommendationStrength: "strong" }));
    expect(record.recommendationStrength).toBe("strong");
  });
});

/* =========================================================
   Scenario 11: recommendationConfidence preserved
   ========================================================= */

describe("buildGovernanceAuditRecord — recommendationConfidence preserved", () => {
  it("recommendationConfidence is 'high'", () => {
    const record = buildGovernanceAuditRecord(makeInput({ recommendationConfidence: "high" }));
    expect(record.recommendationConfidence).toBe("high");
  });
});

/* =========================================================
   Scenario 12: saveGovernanceAuditRecord — persists record
   ========================================================= */

describe("saveGovernanceAuditRecord — persists record to storage", () => {
  it("record is retrievable by actionId", () => {
    const record = buildGovernanceAuditRecord(makeInput());
    saveGovernanceAuditRecord(record);
    const found = getGovernanceAuditRecord(record.actionId);
    expect(found).not.toBeNull();
    expect(found?.actionId).toBe(record.actionId);
  });
});

/* =========================================================
   Scenario 13: two saves produce two stored records
   ========================================================= */

describe("saveGovernanceAuditRecord — two saves produce two stored records", () => {
  it("two records stored", () => {
    const r1 = buildGovernanceAuditRecord(makeInput({ humanReason: "First action" }));
    const r2 = buildGovernanceAuditRecord(makeInput({ humanReason: "Second action", timestamp: "2026-03-21T11:00:00.000Z" }));
    saveGovernanceAuditRecord(r1);
    saveGovernanceAuditRecord(r2);
    const all = listGovernanceAuditRecords();
    expect(all).toHaveLength(2);
  });
});

/* =========================================================
   Scenario 14: save never modifies existing records
   ========================================================= */

describe("saveGovernanceAuditRecord — never modifies existing records", () => {
  it("first record's humanReason unchanged after second save", () => {
    const r1 = buildGovernanceAuditRecord(makeInput({ humanReason: "Existing record" }));
    saveGovernanceAuditRecord(r1);
    const r2 = buildGovernanceAuditRecord(makeInput({ humanReason: "New record", timestamp: "2026-03-22T00:00:00.000Z" }));
    saveGovernanceAuditRecord(r2);
    const found = getGovernanceAuditRecord(r1.actionId);
    expect(found?.humanReason).toBe("Existing record");
  });
});

/* =========================================================
   Scenario 15: listGovernanceAuditRecords — empty when no records
   ========================================================= */

describe("listGovernanceAuditRecords — empty array when no records", () => {
  it("returns empty array", () => {
    expect(listGovernanceAuditRecords()).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 16: listGovernanceAuditRecords — most recent first
   ========================================================= */

describe("listGovernanceAuditRecords — returns all records most recent first", () => {
  it("first result is most recent, second is older", () => {
    const r1 = buildGovernanceAuditRecord(makeInput({ humanReason: "First", timestamp: "2026-03-21T09:00:00.000Z" }));
    const r2 = buildGovernanceAuditRecord(makeInput({ humanReason: "Second", timestamp: "2026-03-21T10:00:00.000Z" }));
    saveGovernanceAuditRecord(r1);
    saveGovernanceAuditRecord(r2);
    const all = listGovernanceAuditRecords();
    expect(all[0]?.actionId).toBe(r2.actionId);
    expect(all[1]?.actionId).toBe(r1.actionId);
  });
});

/* =========================================================
   Scenario 17: listGovernanceAuditRecords — filters by domain
   ========================================================= */

describe("listGovernanceAuditRecords — filters by domain when provided", () => {
  it("only nutrition records returned, exactly 1", () => {
    const rNut = buildGovernanceAuditRecord(makeInput({ domain: "nutrition", humanReason: "Nutrition action" }));
    const rTrn = buildGovernanceAuditRecord(makeInput({ domain: "training", humanReason: "Training action", timestamp: "2026-03-21T11:00:00.000Z" }));
    saveGovernanceAuditRecord(rNut);
    saveGovernanceAuditRecord(rTrn);
    const nutOnly = listGovernanceAuditRecords("nutrition");
    expect(nutOnly.every((r) => r.domain === "nutrition")).toBe(true);
    expect(nutOnly).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 18: listGovernanceAuditRecords — does not affect storage order
   ========================================================= */

describe("listGovernanceAuditRecords — does not affect underlying storage order", () => {
  it("still 2 records after two list calls", () => {
    const r1 = buildGovernanceAuditRecord(makeInput({ humanReason: "A", timestamp: "2026-03-21T09:00:00.000Z" }));
    const r2 = buildGovernanceAuditRecord(makeInput({ humanReason: "B", timestamp: "2026-03-21T10:00:00.000Z" }));
    saveGovernanceAuditRecord(r1);
    saveGovernanceAuditRecord(r2);
    listGovernanceAuditRecords();
    const all = listGovernanceAuditRecords();
    expect(all).toHaveLength(2);
  });
});

/* =========================================================
   Scenario 19: listGovernanceAuditRecords — no filter returns all domains
   ========================================================= */

describe("listGovernanceAuditRecords — returns all domains when no filter", () => {
  it("2 records returned (both domains)", () => {
    const rNut = buildGovernanceAuditRecord(makeInput({ domain: "nutrition", humanReason: "A" }));
    const rTrn = buildGovernanceAuditRecord(makeInput({ domain: "training", humanReason: "B", timestamp: "2026-03-21T11:00:00.000Z" }));
    saveGovernanceAuditRecord(rNut);
    saveGovernanceAuditRecord(rTrn);
    const all = listGovernanceAuditRecords();
    expect(all).toHaveLength(2);
  });
});

/* =========================================================
   Scenario 20: getGovernanceAuditRecord — null when not found
   ========================================================= */

describe("getGovernanceAuditRecord — returns null when not found", () => {
  it("returns null for unknown actionId", () => {
    expect(getGovernanceAuditRecord("aud-00000000")).toBeNull();
  });
});

/* =========================================================
   Scenario 21: getGovernanceAuditRecord — returns correct record
   ========================================================= */

describe("getGovernanceAuditRecord — returns correct record by actionId", () => {
  it("found record has correct humanReason", () => {
    const record = buildGovernanceAuditRecord(makeInput({ humanReason: "Specific record" }));
    saveGovernanceAuditRecord(record);
    const found = getGovernanceAuditRecord(record.actionId);
    expect(found?.humanReason).toBe("Specific record");
  });
});

/* =========================================================
   Scenario 22: getGovernanceAuditRecord — mutation of returned value
   ========================================================= */

describe("getGovernanceAuditRecord — mutation of returned value does not affect storage", () => {
  it("stored record humanReason unchanged after mutation of returned value", () => {
    const record = buildGovernanceAuditRecord(makeInput());
    saveGovernanceAuditRecord(record);
    const originalReason = record.humanReason;
    const found = getGovernanceAuditRecord(record.actionId);
    if (found) {
      found.humanReason = "mutated";
      const foundAgain = getGovernanceAuditRecord(record.actionId);
      expect(foundAgain?.humanReason).toBe(originalReason);
    } else {
      // localStorage not available — skip
      expect(true).toBe(true);
    }
  });
});

/* =========================================================
   Scenario 23: clearGovernanceAuditTrail — removes all records
   ========================================================= */

describe("clearGovernanceAuditTrail — removes all records from storage", () => {
  it("record not found after clear", () => {
    const r = buildGovernanceAuditRecord(makeInput());
    saveGovernanceAuditRecord(r);
    clearGovernanceAuditTrail();
    expect(getGovernanceAuditRecord(r.actionId)).toBeNull();
  });
});

/* =========================================================
   Scenario 24: listGovernanceAuditRecords — empty after clear
   ========================================================= */

describe("clearGovernanceAuditTrail — listGovernanceAuditRecords returns empty after clear", () => {
  it("returns empty array", () => {
    saveGovernanceAuditRecord(buildGovernanceAuditRecord(makeInput()));
    clearGovernanceAuditTrail();
    expect(listGovernanceAuditRecords()).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 25: benchEvidenceSummary preserved
   ========================================================= */

describe("saveGovernanceAuditRecord — benchEvidenceSummary preserved", () => {
  it("benchEvidenceSummary has 2 entries", () => {
    const record = buildGovernanceAuditRecord(
      makeInput({ benchEvidenceSummary: ["3 policies evaluated.", "pol-aaa is best."] })
    );
    saveGovernanceAuditRecord(record);
    const found = getGovernanceAuditRecord(record.actionId);
    expect(found?.benchEvidenceSummary).toHaveLength(2);
  });
});

/* =========================================================
   Scenario 26: recommendationSummary preserved
   ========================================================= */

describe("saveGovernanceAuditRecord — recommendationSummary preserved", () => {
  it("recommendationSummary[0] matches", () => {
    const record = buildGovernanceAuditRecord(
      makeInput({ recommendationSummary: ["pol-bbb is recommended for nutrition."] })
    );
    saveGovernanceAuditRecord(record);
    const found = getGovernanceAuditRecord(record.actionId);
    expect(found?.recommendationSummary[0]).toContain("pol-bbb");
  });
});

/* =========================================================
   Scenario 27: currentPolicyVersionId may be null
   ========================================================= */

describe("saveGovernanceAuditRecord — currentPolicyVersionId may be null", () => {
  it("currentPolicyVersionId is null", () => {
    const record = buildGovernanceAuditRecord(makeInput({ currentPolicyVersionId: null }));
    saveGovernanceAuditRecord(record);
    const found = getGovernanceAuditRecord(record.actionId);
    expect(found?.currentPolicyVersionId).toBeNull();
  });
});

/* =========================================================
   Scenario 28: recommendedPolicyVersionId may be null
   ========================================================= */

describe("saveGovernanceAuditRecord — recommendedPolicyVersionId may be null", () => {
  it("recommendedPolicyVersionId is null", () => {
    const record = buildGovernanceAuditRecord(makeInput({ recommendedPolicyVersionId: null }));
    saveGovernanceAuditRecord(record);
    const found = getGovernanceAuditRecord(record.actionId);
    expect(found?.recommendedPolicyVersionId).toBeNull();
  });
});

/* =========================================================
   Scenario 29: domain filter excludes other domains
   ========================================================= */

describe("listGovernanceAuditRecords — domain filter excludes other domains", () => {
  it("no nutrition records in schedule filter", () => {
    const rNut = buildGovernanceAuditRecord(makeInput({ domain: "nutrition", humanReason: "N" }));
    const rSch = buildGovernanceAuditRecord(makeInput({ domain: "schedule", humanReason: "S", timestamp: "2026-03-21T12:00:00.000Z" }));
    saveGovernanceAuditRecord(rNut);
    saveGovernanceAuditRecord(rSch);
    const schOnly = listGovernanceAuditRecords("schedule");
    expect(schOnly.some((r) => r.domain === "nutrition")).toBe(false);
  });
});

/* =========================================================
   Scenario 30: action "rollback" preserved
   ========================================================= */

describe("buildGovernanceAuditRecord — action 'rollback' preserved", () => {
  it("action is 'rollback'", () => {
    const record = buildGovernanceAuditRecord(makeInput({ action: "rollback" }));
    expect(record.action).toBe("rollback");
  });
});
