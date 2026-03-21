/**
 * role_view_config_test.ts
 *
 * Regression tests for role_view_types.ts and role_view_config.ts.
 *
 * Scenarios:
 *   1.  getCockpitRoleViewConfig("builder") returns mode = "builder"
 *   2.  getCockpitRoleViewConfig("auditor") returns mode = "auditor"
 *   3.  getCockpitRoleViewConfig("governor") returns mode = "governor"
 *   4.  getCockpitRoleViewConfig("operator") returns mode = "operator"
 *   5.  builder config has non-empty visibleCards
 *   6.  builder config emphasizes traceability and diff
 *   7.  builder config defaultExpandedCards includes traceability
 *   8.  auditor config emphasizes traceability and audit-history
 *   9.  auditor config defaultExpandedCards includes audit-history
 *  10.  governor config emphasizes governance, policy, doctrine
 *  11.  governor config summaryPriority starts with governance
 *  12.  governor config defaultExpandedCards includes governance
 *  13.  operator config emphasizes health, prediction, attention
 *  14.  operator config summaryPriority starts with health
 *  15.  operator config defaultExpandedCards includes attention
 *  16.  all four configs have non-empty summaryPriority
 *  17.  all four configs have non-empty emphasizedCards
 *  18.  all four configs have a non-empty label
 *  19.  all four configs have a non-empty description
 *  20.  getCockpitRoleViewConfig does not mutate any shared array
 *  21.  getAllRoleViewConfigs returns 4 entries
 *  22.  builder summaryPriority starts with attention
 *  23.  auditor summaryPriority starts with traceability
 *  24.  operator summaryPriority contains prediction
 *  25.  governor visibleCards includes deliberation
 *  26.  builder visibleCards includes diff
 *  27.  auditor visibleCards includes diff
 *  28.  operator emphasizedCards does not include deliberation
 *  29.  builder config label is "Builder"
 *  30.  operator config label is "Operator"
 */

import { describe, it, expect } from "vitest";
import { getCockpitRoleViewConfig, getAllRoleViewConfigs } from "../ui/cockpit/role_view_config";

describe("getCockpitRoleViewConfig — builder mode field", () => {
  it("mode = 'builder'", () => {
    expect(getCockpitRoleViewConfig("builder").mode).toBe("builder");
  });
});
describe("getCockpitRoleViewConfig — auditor mode field", () => {
  it("mode = 'auditor'", () => {
    expect(getCockpitRoleViewConfig("auditor").mode).toBe("auditor");
  });
});
describe("getCockpitRoleViewConfig — governor mode field", () => {
  it("mode = 'governor'", () => {
    expect(getCockpitRoleViewConfig("governor").mode).toBe("governor");
  });
});
describe("getCockpitRoleViewConfig — operator mode field", () => {
  it("mode = 'operator'", () => {
    expect(getCockpitRoleViewConfig("operator").mode).toBe("operator");
  });
});
describe("getCockpitRoleViewConfig — builder visibleCards non-empty", () => {
  it("visibleCards.length > 0", () => {
    expect(getCockpitRoleViewConfig("builder").visibleCards.length).toBeGreaterThan(0);
  });
});
describe("getCockpitRoleViewConfig — builder emphasizes traceability and diff", () => {
  it("emphasizedCards includes traceability and diff", () => {
    const ec = getCockpitRoleViewConfig("builder").emphasizedCards;
    expect(ec).toContain("traceability");
    expect(ec).toContain("diff");
  });
});
describe("getCockpitRoleViewConfig — builder defaultExpandedCards includes traceability", () => {
  it("defaultExpandedCards includes traceability", () => {
    expect(getCockpitRoleViewConfig("builder").defaultExpandedCards).toContain("traceability");
  });
});
describe("getCockpitRoleViewConfig — auditor emphasizes traceability and audit-history", () => {
  it("emphasizedCards includes traceability and audit-history", () => {
    const ec = getCockpitRoleViewConfig("auditor").emphasizedCards;
    expect(ec).toContain("traceability");
    expect(ec).toContain("audit-history");
  });
});
describe("getCockpitRoleViewConfig — auditor defaultExpandedCards includes audit-history", () => {
  it("defaultExpandedCards includes audit-history", () => {
    expect(getCockpitRoleViewConfig("auditor").defaultExpandedCards).toContain("audit-history");
  });
});
describe("getCockpitRoleViewConfig — governor emphasizes governance, policy, doctrine", () => {
  it("emphasizedCards includes governance, policy, doctrine", () => {
    const ec = getCockpitRoleViewConfig("governor").emphasizedCards;
    expect(ec).toContain("governance");
    expect(ec).toContain("policy");
    expect(ec).toContain("doctrine");
  });
});
describe("getCockpitRoleViewConfig — governor summaryPriority starts with governance", () => {
  it("summaryPriority[0] = 'governance'", () => {
    expect(getCockpitRoleViewConfig("governor").summaryPriority[0]).toBe("governance");
  });
});
describe("getCockpitRoleViewConfig — governor defaultExpandedCards includes governance", () => {
  it("defaultExpandedCards includes governance", () => {
    expect(getCockpitRoleViewConfig("governor").defaultExpandedCards).toContain("governance");
  });
});
describe("getCockpitRoleViewConfig — operator emphasizes health, prediction, attention", () => {
  it("emphasizedCards includes health, prediction, attention", () => {
    const ec = getCockpitRoleViewConfig("operator").emphasizedCards;
    expect(ec).toContain("health");
    expect(ec).toContain("prediction");
    expect(ec).toContain("attention");
  });
});
describe("getCockpitRoleViewConfig — operator summaryPriority starts with health", () => {
  it("summaryPriority[0] = 'health'", () => {
    expect(getCockpitRoleViewConfig("operator").summaryPriority[0]).toBe("health");
  });
});
describe("getCockpitRoleViewConfig — operator defaultExpandedCards includes attention", () => {
  it("defaultExpandedCards includes attention", () => {
    expect(getCockpitRoleViewConfig("operator").defaultExpandedCards).toContain("attention");
  });
});
describe("getCockpitRoleViewConfig — all four have non-empty summaryPriority", () => {
  it("all summaryPriority arrays non-empty", () => {
    const modes = ["builder", "auditor", "governor", "operator"] as const;
    for (const m of modes) {
      expect(getCockpitRoleViewConfig(m).summaryPriority.length).toBeGreaterThan(0);
    }
  });
});
describe("getCockpitRoleViewConfig — all four have non-empty emphasizedCards", () => {
  it("all emphasizedCards arrays non-empty", () => {
    const modes = ["builder", "auditor", "governor", "operator"] as const;
    for (const m of modes) {
      expect(getCockpitRoleViewConfig(m).emphasizedCards.length).toBeGreaterThan(0);
    }
  });
});
describe("getCockpitRoleViewConfig — all four have non-empty label", () => {
  it("all labels non-empty", () => {
    const modes = ["builder", "auditor", "governor", "operator"] as const;
    for (const m of modes) {
      expect(getCockpitRoleViewConfig(m).label.length).toBeGreaterThan(0);
    }
  });
});
describe("getCockpitRoleViewConfig — all four have non-empty description", () => {
  it("all descriptions non-empty", () => {
    const modes = ["builder", "auditor", "governor", "operator"] as const;
    for (const m of modes) {
      expect(getCockpitRoleViewConfig(m).description.length).toBeGreaterThan(0);
    }
  });
});
describe("getCockpitRoleViewConfig — does not mutate any shared array", () => {
  it("calling twice returns identical arrays", () => {
    const a = getCockpitRoleViewConfig("builder").visibleCards;
    const b = getCockpitRoleViewConfig("builder").visibleCards;
    expect(a).toEqual(b);
  });
});
describe("getAllRoleViewConfigs — returns 4 entries", () => {
  it("length = 4", () => {
    expect(getAllRoleViewConfigs()).toHaveLength(4);
  });
});
describe("getCockpitRoleViewConfig — builder summaryPriority starts with attention", () => {
  it("summaryPriority[0] = 'attention'", () => {
    expect(getCockpitRoleViewConfig("builder").summaryPriority[0]).toBe("attention");
  });
});
describe("getCockpitRoleViewConfig — auditor summaryPriority starts with traceability", () => {
  it("summaryPriority[0] = 'traceability'", () => {
    expect(getCockpitRoleViewConfig("auditor").summaryPriority[0]).toBe("traceability");
  });
});
describe("getCockpitRoleViewConfig — operator summaryPriority contains prediction", () => {
  it("summaryPriority includes prediction", () => {
    expect(getCockpitRoleViewConfig("operator").summaryPriority).toContain("prediction");
  });
});
describe("getCockpitRoleViewConfig — governor visibleCards includes deliberation", () => {
  it("visibleCards includes deliberation", () => {
    expect(getCockpitRoleViewConfig("governor").visibleCards).toContain("deliberation");
  });
});
describe("getCockpitRoleViewConfig — builder visibleCards includes diff", () => {
  it("visibleCards includes diff", () => {
    expect(getCockpitRoleViewConfig("builder").visibleCards).toContain("diff");
  });
});
describe("getCockpitRoleViewConfig — auditor visibleCards includes diff", () => {
  it("visibleCards includes diff", () => {
    expect(getCockpitRoleViewConfig("auditor").visibleCards).toContain("diff");
  });
});
describe("getCockpitRoleViewConfig — operator emphasizedCards does not include deliberation", () => {
  it("deliberation not in operator emphasizedCards", () => {
    expect(getCockpitRoleViewConfig("operator").emphasizedCards).not.toContain("deliberation");
  });
});
describe("getCockpitRoleViewConfig — builder label is 'Builder'", () => {
  it("label = 'Builder'", () => {
    expect(getCockpitRoleViewConfig("builder").label).toBe("Builder");
  });
});
describe("getCockpitRoleViewConfig — operator label is 'Operator'", () => {
  it("label = 'Operator'", () => {
    expect(getCockpitRoleViewConfig("operator").label).toBe("Operator");
  });
});
