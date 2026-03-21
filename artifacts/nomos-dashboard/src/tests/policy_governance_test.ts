/**
 * policy_governance_test.ts
 *
 * Regression tests for policy_governance.ts — deterministic manual
 * policy promotion, rollback, domain assignment, and history logging.
 *
 * Scenarios:
 *   1.  getActivePolicyForDomain — returns null on empty state
 *   2.  getActivePolicyForDomain — returns assignment after promote
 *   3.  getActivePolicyForDomain — returns correct domain when multiple exist
 *   4.  getActivePolicyForDomain — returns null for domain with no assignment
 *   5.  promotePolicy — creates one history record
 *   6.  promotePolicy — record action is "promote"
 *   7.  promotePolicy — record fromPolicyVersionId is null when no prior
 *   8.  promotePolicy — record fromPolicyVersionId is prior version when exists
 *   9.  promotePolicy — active assignment updated to new version
 *  10.  promotePolicy — does not mutate input state (no shared references)
 *  11.  promotePolicy — empty reason throws
 *  12.  promotePolicy — whitespace-only reason throws
 *  13.  promotePolicy — second promote adds second history record
 *  14.  promotePolicy — domain isolation: promoting nutrition does not affect training
 *  15.  rollbackPolicy — creates one history record
 *  16.  rollbackPolicy — record action is "rollback"
 *  17.  rollbackPolicy — fromPolicyVersionId is prior active version
 *  18.  rollbackPolicy — active assignment updated to rollback target
 *  19.  rollbackPolicy — full history retained after rollback
 *  20.  rollbackPolicy — does not mutate input state
 *  21.  rollbackPolicy — empty reason throws
 *  22.  listPromotionHistory — returns empty array on empty state
 *  23.  listPromotionHistory — returns all records when no domain filter
 *  24.  listPromotionHistory — returns most recent first
 *  25.  listPromotionHistory — domain filter returns only matching records
 *  26.  listPromotionHistory — domain filter returns empty when no records for that domain
 *  27.  listPromotionHistory — does not mutate governanceState
 *  28.  actionId — deterministic: same inputs produce same actionId
 *  29.  actionId — different domain produces different actionId
 *  30.  actionId — different toPolicyVersionId produces different actionId
 */

import { describe, it, expect } from "vitest";
import {
  getActivePolicyForDomain,
  promotePolicy,
  rollbackPolicy,
  listPromotionHistory,
} from "../audit/policy_governance";
import type { PolicyGovernanceState } from "../audit/policy_governance_types";
import { EMPTY_GOVERNANCE_STATE } from "../audit/policy_governance_types";

/* =========================================================
   Fixtures
   ========================================================= */

const TS1 = "2026-01-01T10:00:00.000Z";
const TS2 = "2026-01-02T10:00:00.000Z";
const TS3 = "2026-01-03T10:00:00.000Z";

const POL_A = "pol-aaaaaaaa";
const POL_B = "pol-bbbbbbbb";
const POL_C = "pol-cccccccc";

/* =========================================================
   Scenario 1: getActivePolicyForDomain — null on empty state
   ========================================================= */

describe("getActivePolicyForDomain — returns null on empty state", () => {
  const result = getActivePolicyForDomain(EMPTY_GOVERNANCE_STATE, "nutrition");

  it("returns null", () => {
    expect(result).toBeNull();
  });
});

/* =========================================================
   Scenario 2: getActivePolicyForDomain — returns assignment after promote
   ========================================================= */

describe("getActivePolicyForDomain — returns assignment after promote", () => {
  const state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "Initial nutrition policy", TS1);
  const result = getActivePolicyForDomain(state, "nutrition");

  it("result is not null", () => {
    expect(result).not.toBeNull();
  });

  it("activePolicyVersionId matches POL_A", () => {
    expect(result?.activePolicyVersionId).toBe(POL_A);
  });

  it("domain is 'nutrition'", () => {
    expect(result?.domain).toBe("nutrition");
  });
});

/* =========================================================
   Scenario 3: getActivePolicyForDomain — correct domain when multiple exist
   ========================================================= */

describe("getActivePolicyForDomain — returns correct domain when multiple exist", () => {
  let state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "Nutrition v1", TS1);
  state = promotePolicy(state, "training", POL_B, "Training v1", TS2);

  it("nutrition returns POL_A", () => {
    expect(getActivePolicyForDomain(state, "nutrition")?.activePolicyVersionId).toBe(POL_A);
  });

  it("training returns POL_B", () => {
    expect(getActivePolicyForDomain(state, "training")?.activePolicyVersionId).toBe(POL_B);
  });
});

/* =========================================================
   Scenario 4: getActivePolicyForDomain — null for unassigned domain
   ========================================================= */

describe("getActivePolicyForDomain — null for domain with no assignment", () => {
  const state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "Nutrition v1", TS1);

  it("returns null for training", () => {
    expect(getActivePolicyForDomain(state, "training")).toBeNull();
  });
});

/* =========================================================
   Scenario 5: promotePolicy — creates one history record
   ========================================================= */

describe("promotePolicy — creates one history record", () => {
  const state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "Initial", TS1);

  it("promotionHistory has 1 record", () => {
    expect(state.promotionHistory).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 6: promotePolicy — record action is "promote"
   ========================================================= */

describe("promotePolicy — record action is 'promote'", () => {
  const state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "Initial", TS1);

  it("action is 'promote'", () => {
    expect(state.promotionHistory[0].action).toBe("promote");
  });
});

/* =========================================================
   Scenario 7: promotePolicy — fromPolicyVersionId is null when no prior
   ========================================================= */

describe("promotePolicy — fromPolicyVersionId is null when no prior", () => {
  const state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "First promotion", TS1);

  it("fromPolicyVersionId is null", () => {
    expect(state.promotionHistory[0].fromPolicyVersionId).toBeNull();
  });
});

/* =========================================================
   Scenario 8: promotePolicy — fromPolicyVersionId is prior when exists
   ========================================================= */

describe("promotePolicy — fromPolicyVersionId is prior version when exists", () => {
  let state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "v1", TS1);
  state = promotePolicy(state, "nutrition", POL_B, "v2 better calibration", TS2);

  it("fromPolicyVersionId is POL_A", () => {
    expect(state.promotionHistory[1].fromPolicyVersionId).toBe(POL_A);
  });

  it("toPolicyVersionId is POL_B", () => {
    expect(state.promotionHistory[1].toPolicyVersionId).toBe(POL_B);
  });
});

/* =========================================================
   Scenario 9: promotePolicy — active assignment updated
   ========================================================= */

describe("promotePolicy — active assignment updated to new version", () => {
  let state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "v1", TS1);
  state = promotePolicy(state, "nutrition", POL_B, "v2", TS2);

  it("active version is now POL_B", () => {
    expect(getActivePolicyForDomain(state, "nutrition")?.activePolicyVersionId).toBe(POL_B);
  });

  it("only one nutrition assignment (no duplicates)", () => {
    const nutritionAssignments = state.activeAssignments.filter((a) => a.domain === "nutrition");
    expect(nutritionAssignments).toHaveLength(1);
  });
});

/* =========================================================
   Scenario 10: promotePolicy — does not mutate input state
   ========================================================= */

describe("promotePolicy — does not mutate input state", () => {
  const original = { ...EMPTY_GOVERNANCE_STATE };
  promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "v1", TS1);

  it("original activeAssignments is still empty", () => {
    expect(EMPTY_GOVERNANCE_STATE.activeAssignments).toHaveLength(0);
  });

  it("original promotionHistory is still empty", () => {
    expect(EMPTY_GOVERNANCE_STATE.promotionHistory).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 11: promotePolicy — empty reason throws
   ========================================================= */

describe("promotePolicy — empty reason throws", () => {
  it("throws on empty reason", () => {
    expect(() =>
      promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "", TS1)
    ).toThrow();
  });
});

/* =========================================================
   Scenario 12: promotePolicy — whitespace-only reason throws
   ========================================================= */

describe("promotePolicy — whitespace-only reason throws", () => {
  it("throws on whitespace-only reason", () => {
    expect(() =>
      promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "   ", TS1)
    ).toThrow();
  });
});

/* =========================================================
   Scenario 13: promotePolicy — second promote adds second history record
   ========================================================= */

describe("promotePolicy — second promote adds second history record", () => {
  let state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "v1", TS1);
  state = promotePolicy(state, "nutrition", POL_B, "v2 improved", TS2);

  it("promotionHistory has 2 records", () => {
    expect(state.promotionHistory).toHaveLength(2);
  });
});

/* =========================================================
   Scenario 14: promotePolicy — domain isolation
   ========================================================= */

describe("promotePolicy — promoting nutrition does not affect training", () => {
  const state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "Nutrition v1", TS1);

  it("training is still null", () => {
    expect(getActivePolicyForDomain(state, "training")).toBeNull();
  });

  it("schedule is still null", () => {
    expect(getActivePolicyForDomain(state, "schedule")).toBeNull();
  });
});

/* =========================================================
   Scenario 15: rollbackPolicy — creates one history record
   ========================================================= */

describe("rollbackPolicy — creates one history record", () => {
  let state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "Initial", TS1);
  state = promotePolicy(state, "nutrition", POL_B, "Upgrade", TS2);
  state = rollbackPolicy(state, "nutrition", POL_A, "v2 degraded accuracy", TS3);

  it("promotionHistory has 3 records", () => {
    expect(state.promotionHistory).toHaveLength(3);
  });
});

/* =========================================================
   Scenario 16: rollbackPolicy — record action is "rollback"
   ========================================================= */

describe("rollbackPolicy — record action is 'rollback'", () => {
  let state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "Initial", TS1);
  state = rollbackPolicy(state, "nutrition", POL_A, "Reverting immediately", TS2);

  it("last record action is 'rollback'", () => {
    expect(state.promotionHistory[1].action).toBe("rollback");
  });
});

/* =========================================================
   Scenario 17: rollbackPolicy — fromPolicyVersionId is prior active
   ========================================================= */

describe("rollbackPolicy — fromPolicyVersionId is prior active version", () => {
  let state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_B, "Current active", TS1);
  state = rollbackPolicy(state, "nutrition", POL_A, "Rolling back to POL_A", TS2);

  it("fromPolicyVersionId is POL_B", () => {
    const record = state.promotionHistory.find((r) => r.action === "rollback")!;
    expect(record.fromPolicyVersionId).toBe(POL_B);
  });
});

/* =========================================================
   Scenario 18: rollbackPolicy — active assignment updated to rollback target
   ========================================================= */

describe("rollbackPolicy — active assignment updated to rollback target", () => {
  let state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_B, "v2", TS1);
  state = rollbackPolicy(state, "nutrition", POL_A, "Rollback to v1", TS2);

  it("active version is POL_A after rollback", () => {
    expect(getActivePolicyForDomain(state, "nutrition")?.activePolicyVersionId).toBe(POL_A);
  });
});

/* =========================================================
   Scenario 19: rollbackPolicy — full history retained
   ========================================================= */

describe("rollbackPolicy — full history retained after rollback", () => {
  let state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "v1", TS1);
  state = promotePolicy(state, "nutrition", POL_B, "v2", TS2);
  state = rollbackPolicy(state, "nutrition", POL_A, "Rollback", TS3);

  it("all 3 records present", () => {
    expect(state.promotionHistory).toHaveLength(3);
  });

  it("first record was promote to POL_A", () => {
    expect(state.promotionHistory[0].toPolicyVersionId).toBe(POL_A);
    expect(state.promotionHistory[0].action).toBe("promote");
  });
});

/* =========================================================
   Scenario 20: rollbackPolicy — does not mutate input state
   ========================================================= */

describe("rollbackPolicy — does not mutate input state", () => {
  const beforeState = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_B, "Current", TS1);
  const historyLen = beforeState.promotionHistory.length;
  rollbackPolicy(beforeState, "nutrition", POL_A, "Rollback", TS2);

  it("original promotionHistory length unchanged", () => {
    expect(beforeState.promotionHistory).toHaveLength(historyLen);
  });
});

/* =========================================================
   Scenario 21: rollbackPolicy — empty reason throws
   ========================================================= */

describe("rollbackPolicy — empty reason throws", () => {
  const state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_B, "Initial", TS1);

  it("throws on empty reason", () => {
    expect(() => rollbackPolicy(state, "nutrition", POL_A, "", TS2)).toThrow();
  });
});

/* =========================================================
   Scenario 22: listPromotionHistory — empty on empty state
   ========================================================= */

describe("listPromotionHistory — returns empty array on empty state", () => {
  it("returns empty array", () => {
    expect(listPromotionHistory(EMPTY_GOVERNANCE_STATE)).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 23: listPromotionHistory — returns all records when no filter
   ========================================================= */

describe("listPromotionHistory — returns all records when no domain filter", () => {
  let state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "v1", TS1);
  state = promotePolicy(state, "training", POL_B, "v1", TS2);
  state = promotePolicy(state, "schedule", POL_C, "v1", TS3);

  it("returns 3 records", () => {
    expect(listPromotionHistory(state)).toHaveLength(3);
  });
});

/* =========================================================
   Scenario 24: listPromotionHistory — most recent first
   ========================================================= */

describe("listPromotionHistory — returns most recent first", () => {
  let state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "v1", TS1);
  state = promotePolicy(state, "nutrition", POL_B, "v2", TS2);
  state = promotePolicy(state, "nutrition", POL_C, "v3", TS3);

  const history = listPromotionHistory(state);

  it("first entry is the most recent action (POL_C)", () => {
    expect(history[0].toPolicyVersionId).toBe(POL_C);
  });

  it("last entry is the earliest action (POL_A)", () => {
    expect(history[2].toPolicyVersionId).toBe(POL_A);
  });
});

/* =========================================================
   Scenario 25: listPromotionHistory — domain filter
   ========================================================= */

describe("listPromotionHistory — domain filter returns only matching records", () => {
  let state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "Nutrition v1", TS1);
  state = promotePolicy(state, "training", POL_B, "Training v1", TS2);
  state = promotePolicy(state, "nutrition", POL_B, "Nutrition v2", TS3);

  const nutritionHistory = listPromotionHistory(state, "nutrition");

  it("returns 2 nutrition records", () => {
    expect(nutritionHistory).toHaveLength(2);
  });

  it("all records are for nutrition domain", () => {
    expect(nutritionHistory.every((r) => r.domain === "nutrition")).toBe(true);
  });
});

/* =========================================================
   Scenario 26: listPromotionHistory — domain filter: no records for domain
   ========================================================= */

describe("listPromotionHistory — domain filter returns empty when no records for domain", () => {
  const state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "Nutrition v1", TS1);
  const trainingHistory = listPromotionHistory(state, "training");

  it("returns empty array", () => {
    expect(trainingHistory).toHaveLength(0);
  });
});

/* =========================================================
   Scenario 27: listPromotionHistory — does not mutate state
   ========================================================= */

describe("listPromotionHistory — does not mutate governanceState", () => {
  let state = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "v1", TS1);
  const historyLen = state.promotionHistory.length;
  const result = listPromotionHistory(state);
  result.push(result[0]); // mutate result to check state is unaffected

  it("promotionHistory length unchanged", () => {
    expect(state.promotionHistory).toHaveLength(historyLen);
  });
});

/* =========================================================
   Scenario 28: actionId — deterministic: same inputs produce same actionId
   ========================================================= */

describe("actionId — deterministic: same inputs produce same actionId", () => {
  const state1 = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "Test", TS1);
  const state2 = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "Test", TS1);

  it("actionIds are equal", () => {
    expect(state1.promotionHistory[0].actionId).toBe(state2.promotionHistory[0].actionId);
  });
});

/* =========================================================
   Scenario 29: actionId — different domain produces different actionId
   ========================================================= */

describe("actionId — different domain produces different actionId", () => {
  const state1 = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "Test", TS1);
  const state2 = promotePolicy(EMPTY_GOVERNANCE_STATE, "training", POL_A, "Test", TS1);

  it("actionIds differ", () => {
    expect(state1.promotionHistory[0].actionId).not.toBe(state2.promotionHistory[0].actionId);
  });
});

/* =========================================================
   Scenario 30: actionId — different toPolicyVersionId produces different actionId
   ========================================================= */

describe("actionId — different toPolicyVersionId produces different actionId", () => {
  const state1 = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_A, "Test", TS1);
  const state2 = promotePolicy(EMPTY_GOVERNANCE_STATE, "nutrition", POL_B, "Test", TS1);

  it("actionIds differ", () => {
    expect(state1.promotionHistory[0].actionId).not.toBe(state2.promotionHistory[0].actionId);
  });
});
