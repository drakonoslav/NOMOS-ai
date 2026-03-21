/**
 * workflow_config_test.ts
 *
 * Regression tests for workflow_types.ts and workflow_config.ts.
 *
 * Scenarios:
 *   1.  getRoleWorkflow("builder") returns mode = "builder"
 *   2.  getRoleWorkflow("auditor") returns mode = "auditor"
 *   3.  getRoleWorkflow("governor") returns mode = "governor"
 *   4.  getRoleWorkflow("operator") returns mode = "operator"
 *   5.  builder workflow has at least 3 steps
 *   6.  auditor workflow has at least 3 steps
 *   7.  governor workflow has at least 4 steps
 *   8.  operator workflow has at least 3 steps
 *   9.  builder workflow first step targets "attention"
 *  10.  auditor workflow first step targets "traceability"
 *  11.  governor workflow first step targets "recommendation"
 *  12.  operator workflow first step targets "health"
 *  13.  all builder workflow steps have non-empty title
 *  14.  all governor workflow steps have non-empty description
 *  15.  all workflow steps have non-empty id
 *  16.  all workflow steps have non-empty targetCardId
 *  17.  builder workflow title is non-empty
 *  18.  builder workflow summary is non-empty
 *  19.  governor workflow steps include a "doctrine" target
 *  20.  governor workflow steps include a "governance" target
 *  21.  operator workflow steps include "prediction" target
 *  22.  auditor workflow steps include "diff" target
 *  23.  getAllRoleWorkflows returns 4 entries
 *  24.  getRoleWorkflow does not mutate shared step arrays
 *  25.  builder workflow step ids are unique
 *  26.  auditor workflow step ids are unique
 *  27.  governor workflow step ids are unique
 *  28.  operator workflow step ids are unique
 *  29.  operator workflow last step targets "governance"
 *  30.  auditor workflow steps include "audit-history" target
 */

import { describe, it, expect } from "vitest";
import { getRoleWorkflow, getAllRoleWorkflows } from "../ui/cockpit/workflow_config";

describe("getRoleWorkflow — builder mode field", () => {
  it("mode = 'builder'", () => {
    expect(getRoleWorkflow("builder").mode).toBe("builder");
  });
});
describe("getRoleWorkflow — auditor mode field", () => {
  it("mode = 'auditor'", () => {
    expect(getRoleWorkflow("auditor").mode).toBe("auditor");
  });
});
describe("getRoleWorkflow — governor mode field", () => {
  it("mode = 'governor'", () => {
    expect(getRoleWorkflow("governor").mode).toBe("governor");
  });
});
describe("getRoleWorkflow — operator mode field", () => {
  it("mode = 'operator'", () => {
    expect(getRoleWorkflow("operator").mode).toBe("operator");
  });
});
describe("getRoleWorkflow — builder has at least 3 steps", () => {
  it("steps.length >= 3", () => {
    expect(getRoleWorkflow("builder").steps.length).toBeGreaterThanOrEqual(3);
  });
});
describe("getRoleWorkflow — auditor has at least 3 steps", () => {
  it("steps.length >= 3", () => {
    expect(getRoleWorkflow("auditor").steps.length).toBeGreaterThanOrEqual(3);
  });
});
describe("getRoleWorkflow — governor has at least 4 steps", () => {
  it("steps.length >= 4", () => {
    expect(getRoleWorkflow("governor").steps.length).toBeGreaterThanOrEqual(4);
  });
});
describe("getRoleWorkflow — operator has at least 3 steps", () => {
  it("steps.length >= 3", () => {
    expect(getRoleWorkflow("operator").steps.length).toBeGreaterThanOrEqual(3);
  });
});
describe("getRoleWorkflow — builder first step targets attention", () => {
  it("steps[0].targetCardId = 'attention'", () => {
    expect(getRoleWorkflow("builder").steps[0].targetCardId).toBe("attention");
  });
});
describe("getRoleWorkflow — auditor first step targets traceability", () => {
  it("steps[0].targetCardId = 'traceability'", () => {
    expect(getRoleWorkflow("auditor").steps[0].targetCardId).toBe("traceability");
  });
});
describe("getRoleWorkflow — governor first step targets recommendation", () => {
  it("steps[0].targetCardId = 'recommendation'", () => {
    expect(getRoleWorkflow("governor").steps[0].targetCardId).toBe("recommendation");
  });
});
describe("getRoleWorkflow — operator first step targets health", () => {
  it("steps[0].targetCardId = 'health'", () => {
    expect(getRoleWorkflow("operator").steps[0].targetCardId).toBe("health");
  });
});
describe("getRoleWorkflow — all builder steps have non-empty title", () => {
  it("all titles non-empty", () => {
    for (const step of getRoleWorkflow("builder").steps) {
      expect(step.title.length).toBeGreaterThan(0);
    }
  });
});
describe("getRoleWorkflow — all governor steps have non-empty description", () => {
  it("all descriptions non-empty", () => {
    for (const step of getRoleWorkflow("governor").steps) {
      expect(step.description.length).toBeGreaterThan(0);
    }
  });
});
describe("getRoleWorkflow — all workflow steps have non-empty id", () => {
  it("all step ids non-empty across four workflows", () => {
    for (const mode of ["builder", "auditor", "governor", "operator"] as const) {
      for (const step of getRoleWorkflow(mode).steps) {
        expect(step.id.length).toBeGreaterThan(0);
      }
    }
  });
});
describe("getRoleWorkflow — all workflow steps have non-empty targetCardId", () => {
  it("all targetCardIds non-empty across four workflows", () => {
    for (const mode of ["builder", "auditor", "governor", "operator"] as const) {
      for (const step of getRoleWorkflow(mode).steps) {
        expect(step.targetCardId.length).toBeGreaterThan(0);
      }
    }
  });
});
describe("getRoleWorkflow — builder title non-empty", () => {
  it("title.length > 0", () => {
    expect(getRoleWorkflow("builder").title.length).toBeGreaterThan(0);
  });
});
describe("getRoleWorkflow — builder summary non-empty", () => {
  it("summary.length > 0", () => {
    expect(getRoleWorkflow("builder").summary.length).toBeGreaterThan(0);
  });
});
describe("getRoleWorkflow — governor steps include doctrine target", () => {
  it("at least one step targets doctrine", () => {
    expect(getRoleWorkflow("governor").steps.some((s) => s.targetCardId === "doctrine")).toBe(true);
  });
});
describe("getRoleWorkflow — governor steps include governance target", () => {
  it("at least one step targets governance", () => {
    expect(getRoleWorkflow("governor").steps.some((s) => s.targetCardId === "governance")).toBe(true);
  });
});
describe("getRoleWorkflow — operator steps include prediction target", () => {
  it("at least one step targets prediction", () => {
    expect(getRoleWorkflow("operator").steps.some((s) => s.targetCardId === "prediction")).toBe(true);
  });
});
describe("getRoleWorkflow — auditor steps include diff target", () => {
  it("at least one step targets diff", () => {
    expect(getRoleWorkflow("auditor").steps.some((s) => s.targetCardId === "diff")).toBe(true);
  });
});
describe("getAllRoleWorkflows — returns 4 entries", () => {
  it("length = 4", () => {
    expect(getAllRoleWorkflows()).toHaveLength(4);
  });
});
describe("getRoleWorkflow — does not mutate shared step arrays", () => {
  it("calling twice returns equal arrays", () => {
    const a = getRoleWorkflow("governor").steps;
    const b = getRoleWorkflow("governor").steps;
    expect(a).toEqual(b);
  });
});
describe("getRoleWorkflow — builder step ids are unique", () => {
  it("no duplicate ids", () => {
    const ids = getRoleWorkflow("builder").steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
describe("getRoleWorkflow — auditor step ids are unique", () => {
  it("no duplicate ids", () => {
    const ids = getRoleWorkflow("auditor").steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
describe("getRoleWorkflow — governor step ids are unique", () => {
  it("no duplicate ids", () => {
    const ids = getRoleWorkflow("governor").steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
describe("getRoleWorkflow — operator step ids are unique", () => {
  it("no duplicate ids", () => {
    const ids = getRoleWorkflow("operator").steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
describe("getRoleWorkflow — operator last step targets governance", () => {
  it("last step targetCardId = 'governance'", () => {
    const steps = getRoleWorkflow("operator").steps;
    expect(steps[steps.length - 1].targetCardId).toBe("governance");
  });
});
describe("getRoleWorkflow — auditor steps include audit-history target", () => {
  it("at least one step targets audit-history", () => {
    expect(getRoleWorkflow("auditor").steps.some((s) => s.targetCardId === "audit-history")).toBe(true);
  });
});
