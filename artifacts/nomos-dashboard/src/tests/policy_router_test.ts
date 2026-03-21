/**
 * policy_router_test.ts
 *
 * Regression tests for policy_router.ts — deterministic domain resolution,
 * active policy fetching, routing decision building, and record persistence.
 *
 * Scenarios:
 *   1.  resolveEvaluationDomain — NUTRITION_AUDIT → nutrition
 *   2.  resolveEvaluationDomain — TRAINING_AUDIT → training
 *   3.  resolveEvaluationDomain — SCHEDULE_AUDIT → schedule
 *   4.  resolveEvaluationDomain — GENERIC_CONSTRAINT_TASK → generic
 *   5.  resolveEvaluationDomain — UNKNOWN → generic
 *   6.  resolveEvaluationDomain — arbitrary unknown string → generic
 *   7.  resolveActivePolicyForEvaluation — empty state → null
 *   8.  resolveActivePolicyForEvaluation — returns assignment when domain matches
 *   9.  resolveActivePolicyForEvaluation — returns null when domain not assigned
 *  10.  resolveActivePolicyForEvaluation — TRAINING_AUDIT returns training assignment
 *  11.  buildEvaluationRoutingDecision — domain matches intent
 *  12.  buildEvaluationRoutingDecision — usingFallback=false when active policy exists
 *  13.  buildEvaluationRoutingDecision — activePolicyVersionId matches assignment
 *  14.  buildEvaluationRoutingDecision — routingReason contains intent
 *  15.  buildEvaluationRoutingDecision — routingReason contains domain
 *  16.  buildEvaluationRoutingDecision — routingReason contains policyVersionId when assigned
 *  17.  buildEvaluationRoutingDecision — usingFallback=true when no active policy
 *  18.  buildEvaluationRoutingDecision — activePolicyVersionId null when no active policy
 *  19.  buildEvaluationRoutingDecision — routingReason mentions fallback when no active policy
 *  20.  buildEvaluationRoutingDecision — routingReason mentions DEFAULT_POLICY_VERSION_ID
 *  21.  buildEvaluationRoutingDecision — SCHEDULE_AUDIT with schedule policy
 *  22.  buildEvaluationRoutingDecision — GENERIC_CONSTRAINT_TASK with generic policy
 *  23.  buildEvaluationRoutingDecision — does not modify governance state
 *  24.  buildEvaluationRoutingDecision — nutrition assignment doesn't affect training routing
 *  25.  buildEvaluationRoutingDecision — UNKNOWN intent routes to generic domain
 *  26.  buildPersistedRoutingRecord — resolvedDomain matches decision.domain
 *  27.  buildPersistedRoutingRecord — activePolicyVersionId preserved (non-null)
 *  28.  buildPersistedRoutingRecord — activePolicyVersionId preserved (null)
 *  29.  buildPersistedRoutingRecord — usingFallback preserved
 *  30.  buildPersistedRoutingRecord — routingReason preserved exactly
 */

import { describe, it, expect } from "vitest";
import {
  resolveEvaluationDomain,
  resolveActivePolicyForEvaluation,
  buildEvaluationRoutingDecision,
  buildPersistedRoutingRecord,
} from "../audit/policy_router";
import { DEFAULT_POLICY_VERSION_ID } from "../audit/policy_routing_types";
import type { PolicyGovernanceState } from "../audit/policy_governance_types";
import { EMPTY_GOVERNANCE_STATE } from "../audit/policy_governance_types";
import { promotePolicy } from "../audit/policy_governance";

/* =========================================================
   Fixtures
   ========================================================= */

const TS = "2026-01-01T10:00:00.000Z";
const POL_N = "pol-nut00001";
const POL_T = "pol-tra00001";
const POL_S = "pol-sch00001";
const POL_G = "pol-gen00001";

function makeState(assignments: Array<{ domain: "nutrition"|"training"|"schedule"|"generic"; versionId: string }>): PolicyGovernanceState {
  let state = EMPTY_GOVERNANCE_STATE;
  for (const { domain, versionId } of assignments) {
    state = promotePolicy(state, domain, versionId, `${domain} initial`, TS);
  }
  return state;
}

/* =========================================================
   Scenario 1-6: resolveEvaluationDomain
   ========================================================= */

describe("resolveEvaluationDomain — NUTRITION_AUDIT → nutrition", () => {
  it("returns 'nutrition'", () => {
    expect(resolveEvaluationDomain("NUTRITION_AUDIT")).toBe("nutrition");
  });
});

describe("resolveEvaluationDomain — TRAINING_AUDIT → training", () => {
  it("returns 'training'", () => {
    expect(resolveEvaluationDomain("TRAINING_AUDIT")).toBe("training");
  });
});

describe("resolveEvaluationDomain — SCHEDULE_AUDIT → schedule", () => {
  it("returns 'schedule'", () => {
    expect(resolveEvaluationDomain("SCHEDULE_AUDIT")).toBe("schedule");
  });
});

describe("resolveEvaluationDomain — GENERIC_CONSTRAINT_TASK → generic", () => {
  it("returns 'generic'", () => {
    expect(resolveEvaluationDomain("GENERIC_CONSTRAINT_TASK")).toBe("generic");
  });
});

describe("resolveEvaluationDomain — UNKNOWN → generic", () => {
  it("returns 'generic'", () => {
    expect(resolveEvaluationDomain("UNKNOWN")).toBe("generic");
  });
});

describe("resolveEvaluationDomain — arbitrary unknown string → generic", () => {
  it("returns 'generic' for unrecognized intent", () => {
    expect(resolveEvaluationDomain("SOME_FUTURE_INTENT")).toBe("generic");
  });

  it("returns 'generic' for empty string", () => {
    expect(resolveEvaluationDomain("")).toBe("generic");
  });
});

/* =========================================================
   Scenario 7-10: resolveActivePolicyForEvaluation
   ========================================================= */

describe("resolveActivePolicyForEvaluation — empty state → null", () => {
  it("returns null", () => {
    const result = resolveActivePolicyForEvaluation(EMPTY_GOVERNANCE_STATE, "NUTRITION_AUDIT");
    expect(result).toBeNull();
  });
});

describe("resolveActivePolicyForEvaluation — returns assignment when domain matches", () => {
  const state = makeState([{ domain: "nutrition", versionId: POL_N }]);
  const result = resolveActivePolicyForEvaluation(state, "NUTRITION_AUDIT");

  it("result is not null", () => {
    expect(result).not.toBeNull();
  });

  it("activePolicyVersionId is POL_N", () => {
    expect(result?.activePolicyVersionId).toBe(POL_N);
  });
});

describe("resolveActivePolicyForEvaluation — returns null when domain not assigned", () => {
  const state = makeState([{ domain: "nutrition", versionId: POL_N }]);

  it("returns null for TRAINING_AUDIT", () => {
    expect(resolveActivePolicyForEvaluation(state, "TRAINING_AUDIT")).toBeNull();
  });
});

describe("resolveActivePolicyForEvaluation — TRAINING_AUDIT returns training assignment", () => {
  const state = makeState([
    { domain: "nutrition", versionId: POL_N },
    { domain: "training", versionId: POL_T },
  ]);
  const result = resolveActivePolicyForEvaluation(state, "TRAINING_AUDIT");

  it("returns training policy", () => {
    expect(result?.activePolicyVersionId).toBe(POL_T);
  });
});

/* =========================================================
   Scenario 11-25: buildEvaluationRoutingDecision
   ========================================================= */

describe("buildEvaluationRoutingDecision — domain matches intent", () => {
  const state = makeState([{ domain: "nutrition", versionId: POL_N }]);
  const decision = buildEvaluationRoutingDecision(state, "NUTRITION_AUDIT");

  it("domain is 'nutrition'", () => {
    expect(decision.domain).toBe("nutrition");
  });
});

describe("buildEvaluationRoutingDecision — usingFallback=false when active policy exists", () => {
  const state = makeState([{ domain: "nutrition", versionId: POL_N }]);
  const decision = buildEvaluationRoutingDecision(state, "NUTRITION_AUDIT");

  it("usingFallback is false", () => {
    expect(decision.usingFallback).toBe(false);
  });
});

describe("buildEvaluationRoutingDecision — activePolicyVersionId matches assignment", () => {
  const state = makeState([{ domain: "nutrition", versionId: POL_N }]);
  const decision = buildEvaluationRoutingDecision(state, "NUTRITION_AUDIT");

  it("activePolicyVersionId is POL_N", () => {
    expect(decision.activePolicyVersionId).toBe(POL_N);
  });
});

describe("buildEvaluationRoutingDecision — routingReason contains intent", () => {
  const state = makeState([{ domain: "nutrition", versionId: POL_N }]);
  const decision = buildEvaluationRoutingDecision(state, "NUTRITION_AUDIT");

  it("routingReason includes 'NUTRITION_AUDIT'", () => {
    expect(decision.routingReason).toContain("NUTRITION_AUDIT");
  });
});

describe("buildEvaluationRoutingDecision — routingReason contains domain", () => {
  const state = makeState([{ domain: "nutrition", versionId: POL_N }]);
  const decision = buildEvaluationRoutingDecision(state, "NUTRITION_AUDIT");

  it("routingReason includes 'nutrition'", () => {
    expect(decision.routingReason).toContain("nutrition");
  });
});

describe("buildEvaluationRoutingDecision — routingReason contains policyVersionId when assigned", () => {
  const state = makeState([{ domain: "nutrition", versionId: POL_N }]);
  const decision = buildEvaluationRoutingDecision(state, "NUTRITION_AUDIT");

  it("routingReason includes POL_N", () => {
    expect(decision.routingReason).toContain(POL_N);
  });
});

describe("buildEvaluationRoutingDecision — usingFallback=true when no active policy", () => {
  const decision = buildEvaluationRoutingDecision(EMPTY_GOVERNANCE_STATE, "NUTRITION_AUDIT");

  it("usingFallback is true", () => {
    expect(decision.usingFallback).toBe(true);
  });
});

describe("buildEvaluationRoutingDecision — activePolicyVersionId null when no active policy", () => {
  const decision = buildEvaluationRoutingDecision(EMPTY_GOVERNANCE_STATE, "NUTRITION_AUDIT");

  it("activePolicyVersionId is null", () => {
    expect(decision.activePolicyVersionId).toBeNull();
  });
});

describe("buildEvaluationRoutingDecision — routingReason mentions fallback when no active policy", () => {
  const decision = buildEvaluationRoutingDecision(EMPTY_GOVERNANCE_STATE, "NUTRITION_AUDIT");

  it("routingReason includes 'fallback'", () => {
    expect(decision.routingReason.toLowerCase()).toContain("fallback");
  });
});

describe("buildEvaluationRoutingDecision — routingReason mentions DEFAULT_POLICY_VERSION_ID", () => {
  const decision = buildEvaluationRoutingDecision(EMPTY_GOVERNANCE_STATE, "TRAINING_AUDIT");

  it("routingReason includes DEFAULT_POLICY_VERSION_ID", () => {
    expect(decision.routingReason).toContain(DEFAULT_POLICY_VERSION_ID);
  });
});

describe("buildEvaluationRoutingDecision — SCHEDULE_AUDIT with schedule policy", () => {
  const state = makeState([{ domain: "schedule", versionId: POL_S }]);
  const decision = buildEvaluationRoutingDecision(state, "SCHEDULE_AUDIT");

  it("domain is 'schedule'", () => {
    expect(decision.domain).toBe("schedule");
  });

  it("activePolicyVersionId is POL_S", () => {
    expect(decision.activePolicyVersionId).toBe(POL_S);
  });
});

describe("buildEvaluationRoutingDecision — GENERIC_CONSTRAINT_TASK with generic policy", () => {
  const state = makeState([{ domain: "generic", versionId: POL_G }]);
  const decision = buildEvaluationRoutingDecision(state, "GENERIC_CONSTRAINT_TASK");

  it("domain is 'generic'", () => {
    expect(decision.domain).toBe("generic");
  });

  it("activePolicyVersionId is POL_G", () => {
    expect(decision.activePolicyVersionId).toBe(POL_G);
  });
});

describe("buildEvaluationRoutingDecision — does not modify governance state", () => {
  const state = makeState([{ domain: "nutrition", versionId: POL_N }]);
  const originalLen = state.activeAssignments.length;
  buildEvaluationRoutingDecision(state, "NUTRITION_AUDIT");

  it("activeAssignments length unchanged", () => {
    expect(state.activeAssignments).toHaveLength(originalLen);
  });

  it("promotionHistory length unchanged", () => {
    expect(state.promotionHistory).toHaveLength(originalLen);
  });
});

describe("buildEvaluationRoutingDecision — nutrition assignment doesn't affect training routing", () => {
  const state = makeState([{ domain: "nutrition", versionId: POL_N }]);
  const decision = buildEvaluationRoutingDecision(state, "TRAINING_AUDIT");

  it("training domain uses fallback", () => {
    expect(decision.usingFallback).toBe(true);
  });

  it("domain is training", () => {
    expect(decision.domain).toBe("training");
  });
});

describe("buildEvaluationRoutingDecision — UNKNOWN intent routes to generic domain", () => {
  const state = makeState([{ domain: "generic", versionId: POL_G }]);
  const decision = buildEvaluationRoutingDecision(state, "UNKNOWN");

  it("domain is generic", () => {
    expect(decision.domain).toBe("generic");
  });
});

/* =========================================================
   Scenario 26-30: buildPersistedRoutingRecord
   ========================================================= */

describe("buildPersistedRoutingRecord — resolvedDomain matches decision.domain", () => {
  const state = makeState([{ domain: "training", versionId: POL_T }]);
  const decision = buildEvaluationRoutingDecision(state, "TRAINING_AUDIT");
  const record = buildPersistedRoutingRecord(decision);

  it("resolvedDomain is 'training'", () => {
    expect(record.resolvedDomain).toBe("training");
  });
});

describe("buildPersistedRoutingRecord — activePolicyVersionId preserved (non-null)", () => {
  const state = makeState([{ domain: "nutrition", versionId: POL_N }]);
  const decision = buildEvaluationRoutingDecision(state, "NUTRITION_AUDIT");
  const record = buildPersistedRoutingRecord(decision);

  it("activePolicyVersionId is POL_N", () => {
    expect(record.activePolicyVersionId).toBe(POL_N);
  });
});

describe("buildPersistedRoutingRecord — activePolicyVersionId preserved (null)", () => {
  const decision = buildEvaluationRoutingDecision(EMPTY_GOVERNANCE_STATE, "NUTRITION_AUDIT");
  const record = buildPersistedRoutingRecord(decision);

  it("activePolicyVersionId is null", () => {
    expect(record.activePolicyVersionId).toBeNull();
  });
});

describe("buildPersistedRoutingRecord — usingFallback preserved", () => {
  const decisionFallback = buildEvaluationRoutingDecision(EMPTY_GOVERNANCE_STATE, "TRAINING_AUDIT");
  const state = makeState([{ domain: "training", versionId: POL_T }]);
  const decisionActive = buildEvaluationRoutingDecision(state, "TRAINING_AUDIT");

  it("usingFallback=true preserved", () => {
    expect(buildPersistedRoutingRecord(decisionFallback).usingFallback).toBe(true);
  });

  it("usingFallback=false preserved", () => {
    expect(buildPersistedRoutingRecord(decisionActive).usingFallback).toBe(false);
  });
});

describe("buildPersistedRoutingRecord — routingReason preserved exactly", () => {
  const state = makeState([{ domain: "nutrition", versionId: POL_N }]);
  const decision = buildEvaluationRoutingDecision(state, "NUTRITION_AUDIT");
  const record = buildPersistedRoutingRecord(decision);

  it("routingReason matches decision.routingReason exactly", () => {
    expect(record.routingReason).toBe(decision.routingReason);
  });
});
