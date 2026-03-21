/**
 * session_replay_test.ts
 *
 * Regression tests for session_replay_types.ts and session_replay.ts.
 *
 * Scenarios:
 *   1.  buildSessionNarrative — sessionId matches
 *   2.  buildSessionNarrative — roleMode matches
 *   3.  buildSessionNarrative — finalDecision matches worklog
 *   4.  buildSessionNarrative — empty worklog produces 0 orderedSteps
 *   5.  buildSessionReplaySteps — one event produces one step
 *   6.  buildSessionReplaySteps — stepNumber starts at 1
 *   7.  buildSessionReplaySteps — step timestamp matches event timestamp
 *   8.  buildSessionReplaySteps — step eventType matches event eventType
 *   9.  buildSessionReplaySteps — step targetId matches event targetId
 *  10.  buildSessionReplaySteps — step title is non-empty
 *  11.  buildSessionReplaySteps — step description is non-empty
 *  12.  sortSessionEvents — sorts events ascending by timestamp
 *  13.  sortSessionEvents — does not mutate input array
 *  14.  buildSessionNarrative — orderedSteps in timestamp order
 *  15.  buildSessionNarrative — summaryLines non-empty
 *  16.  buildSessionNarrative — acceptedRationales matches worklog
 *  17.  buildSessionNarrative — rejectedRationales matches worklog
 *  18.  buildSessionNarrative — notes matches worklog
 *  19.  buildSessionNarrative — summaryLines mention role mode
 *  20.  buildSessionNarrative — summaryLines mention panel opened when panel_opened event present
 *  21.  buildSessionNarrative — summaryLines mention final decision when decision_made present
 *  22.  buildSessionNarrative — summaryLines mention "no events" when worklog is empty
 *  23.  buildSessionNarrative — workflow_started event produces readable step
 *  24.  buildSessionNarrative — decision_made step description mentions decision
 *  25.  buildSessionNarrative — panel_opened step title mentions panel id
 *  26.  buildSessionNarrative — does not mutate input worklog
 *  27.  buildSessionNarrative — summaryLines mention accepted rationale count
 *  28.  buildSessionNarrative — summaryLines mention step count
 *  29.  buildSessionNarrative — startedAt matches worklog.startedAt
 *  30.  buildSessionNarrative — summaryLines mention rejected rationale count when rejections present
 */

import { describe, it, expect } from "vitest";
import {
  sortSessionEvents,
  buildSessionReplaySteps,
  buildSessionNarrative,
} from "../worklog/session_replay";
import {
  createSessionWorklog,
  recordWorkflowStart,
  recordPanelOpened,
  recordDecision,
  recordRationaleAccepted,
  recordRationaleRejected,
} from "../worklog/session_worklog";
import type { WorklogEvent } from "../worklog/worklog_types";

const TS1 = "2026-01-01T10:00:00.000Z";
const TS2 = "2026-01-01T10:01:00.000Z";
const TS3 = "2026-01-01T10:02:00.000Z";

function makeEvent(ts: string, type: WorklogEvent["eventType"], target: string | null = null): WorklogEvent {
  return {
    eventId: `wev-${type}-${ts}`,
    timestamp: ts,
    sessionId: "sess-test",
    roleMode: "governor",
    eventType: type,
    targetId: target,
    payload: null,
  };
}

function governorWorklog() {
  let wl = createSessionWorklog("sess-test", "governor", TS1);
  wl = recordWorkflowStart(wl, TS1);
  wl = recordPanelOpened(wl, "doctrine", TS2);
  wl = recordDecision(wl, "promote", TS3);
  return wl;
}

describe("buildSessionNarrative — sessionId matches", () => {
  it("sessionId = 'sess-test'", () => {
    expect(buildSessionNarrative(governorWorklog()).sessionId).toBe("sess-test");
  });
});
describe("buildSessionNarrative — roleMode matches", () => {
  it("roleMode = 'governor'", () => {
    expect(buildSessionNarrative(governorWorklog()).roleMode).toBe("governor");
  });
});
describe("buildSessionNarrative — finalDecision matches worklog", () => {
  it("finalDecision = 'promote'", () => {
    expect(buildSessionNarrative(governorWorklog()).finalDecision).toBe("promote");
  });
});
describe("buildSessionNarrative — empty worklog produces 0 orderedSteps", () => {
  it("orderedSteps.length = 0", () => {
    const wl = createSessionWorklog("sess-empty", "operator", TS1);
    expect(buildSessionNarrative(wl).orderedSteps).toHaveLength(0);
  });
});
describe("buildSessionReplaySteps — one event produces one step", () => {
  it("steps.length = 1", () => {
    let wl = createSessionWorklog("sess-test", "operator", TS1);
    wl = recordPanelOpened(wl, "health", TS1);
    expect(buildSessionReplaySteps(wl)).toHaveLength(1);
  });
});
describe("buildSessionReplaySteps — stepNumber starts at 1", () => {
  it("steps[0].stepNumber = 1", () => {
    const steps = buildSessionReplaySteps(governorWorklog());
    expect(steps[0].stepNumber).toBe(1);
  });
});
describe("buildSessionReplaySteps — step timestamp matches event", () => {
  it("step[0].timestamp = TS1", () => {
    const steps = buildSessionReplaySteps(governorWorklog());
    expect(steps[0].timestamp).toBe(TS1);
  });
});
describe("buildSessionReplaySteps — step eventType matches event", () => {
  it("step[0].eventType = 'workflow_started'", () => {
    const steps = buildSessionReplaySteps(governorWorklog());
    expect(steps[0].eventType).toBe("workflow_started");
  });
});
describe("buildSessionReplaySteps — step targetId matches event", () => {
  it("step[1].targetId = 'doctrine'", () => {
    const steps = buildSessionReplaySteps(governorWorklog());
    expect(steps[1].targetId).toBe("doctrine");
  });
});
describe("buildSessionReplaySteps — step title is non-empty", () => {
  it("all titles non-empty", () => {
    for (const step of buildSessionReplaySteps(governorWorklog())) {
      expect(step.title.length).toBeGreaterThan(0);
    }
  });
});
describe("buildSessionReplaySteps — step description is non-empty", () => {
  it("all descriptions non-empty", () => {
    for (const step of buildSessionReplaySteps(governorWorklog())) {
      expect(step.description.length).toBeGreaterThan(0);
    }
  });
});
describe("sortSessionEvents — sorts events ascending by timestamp", () => {
  it("sorted order: TS2 first, TS1 second when input is reversed", () => {
    const events = [makeEvent(TS2, "panel_opened"), makeEvent(TS1, "panel_closed")];
    const sorted = sortSessionEvents(events);
    expect(sorted[0].timestamp).toBe(TS1);
    expect(sorted[1].timestamp).toBe(TS2);
  });
});
describe("sortSessionEvents — does not mutate input array", () => {
  it("input array order unchanged", () => {
    const events = [makeEvent(TS2, "panel_opened"), makeEvent(TS1, "panel_closed")];
    sortSessionEvents(events);
    expect(events[0].timestamp).toBe(TS2);
  });
});
describe("buildSessionNarrative — orderedSteps in timestamp order", () => {
  it("orderedSteps[0].timestamp <= orderedSteps[1].timestamp", () => {
    const steps = buildSessionNarrative(governorWorklog()).orderedSteps;
    expect(steps[0].timestamp <= steps[1].timestamp).toBe(true);
  });
});
describe("buildSessionNarrative — summaryLines non-empty", () => {
  it("summaryLines.length > 0", () => {
    expect(buildSessionNarrative(governorWorklog()).summaryLines.length).toBeGreaterThan(0);
  });
});
describe("buildSessionNarrative — acceptedRationales matches worklog", () => {
  it("acceptedRationales contains the accepted rationale", () => {
    let wl = createSessionWorklog("sess-nar", "governor", TS1);
    wl = recordRationaleAccepted(wl, "improved match rate", TS2);
    expect(buildSessionNarrative(wl).acceptedRationales).toContain("improved match rate");
  });
});
describe("buildSessionNarrative — rejectedRationales matches worklog", () => {
  it("rejectedRationales contains the rejected rationale", () => {
    let wl = createSessionWorklog("sess-nar", "governor", TS1);
    wl = recordRationaleRejected(wl, "shallow history caution", TS2);
    expect(buildSessionNarrative(wl).rejectedRationales).toContain("shallow history caution");
  });
});
describe("buildSessionNarrative — notes matches worklog", () => {
  it("notes is empty when no notes added", () => {
    expect(buildSessionNarrative(governorWorklog()).notes).toHaveLength(0);
  });
});
describe("buildSessionNarrative — summaryLines mention role mode", () => {
  it("at least one summary line contains 'governor'", () => {
    expect(buildSessionNarrative(governorWorklog()).summaryLines.some((l) => l.includes("governor"))).toBe(true);
  });
});
describe("buildSessionNarrative — summaryLines mention panel when panel_opened present", () => {
  it("at least one summary line mentions 'doctrine'", () => {
    expect(buildSessionNarrative(governorWorklog()).summaryLines.some((l) => l.includes("doctrine"))).toBe(true);
  });
});
describe("buildSessionNarrative — summaryLines mention final decision", () => {
  it("at least one summary line mentions 'promot'", () => {
    expect(buildSessionNarrative(governorWorklog()).summaryLines.some((l) => l.toLowerCase().includes("promot"))).toBe(true);
  });
});
describe("buildSessionNarrative — summaryLines mention 'no events' when worklog is empty", () => {
  it("summary mentions 'No events' for empty worklog", () => {
    const wl = createSessionWorklog("sess-empty", "operator", TS1);
    expect(buildSessionNarrative(wl).summaryLines.some((l) => l.includes("No events"))).toBe(true);
  });
});
describe("buildSessionNarrative — workflow_started event produces readable step", () => {
  it("step title includes 'Workflow started'", () => {
    const steps = buildSessionNarrative(governorWorklog()).orderedSteps;
    expect(steps[0].title.includes("Workflow started")).toBe(true);
  });
});
describe("buildSessionNarrative — decision_made step description mentions decision", () => {
  it("decision step description includes 'promote'", () => {
    const steps = buildSessionNarrative(governorWorklog()).orderedSteps;
    const decisionStep = steps.find((s) => s.eventType === "decision_made");
    expect(decisionStep).toBeDefined();
    expect(decisionStep!.description.toLowerCase().includes("promote")).toBe(true);
  });
});
describe("buildSessionNarrative — panel_opened step title mentions panel id", () => {
  it("panel step title includes 'doctrine'", () => {
    const steps = buildSessionNarrative(governorWorklog()).orderedSteps;
    const panelStep = steps.find((s) => s.eventType === "panel_opened");
    expect(panelStep).toBeDefined();
    expect(panelStep!.title.includes("doctrine")).toBe(true);
  });
});
describe("buildSessionNarrative — does not mutate input worklog", () => {
  it("input events length unchanged", () => {
    const wl = governorWorklog();
    const originalCount = wl.events.length;
    buildSessionNarrative(wl);
    expect(wl.events).toHaveLength(originalCount);
  });
});
describe("buildSessionNarrative — summaryLines mention accepted rationale count", () => {
  it("summary mentions '1 rationale' when one rationale accepted", () => {
    let wl = createSessionWorklog("sess-rat", "governor", TS1);
    wl = recordRationaleAccepted(wl, "good evidence", TS2);
    wl = recordDecision(wl, "promote", TS3);
    expect(buildSessionNarrative(wl).summaryLines.some((l) => l.includes("1 rationale"))).toBe(true);
  });
});
describe("buildSessionNarrative — summaryLines mention step count", () => {
  it("summary mentions step count", () => {
    const narrative = buildSessionNarrative(governorWorklog());
    const steps = governorWorklog().events.length;
    expect(narrative.summaryLines.some((l) => l.includes(String(steps)))).toBe(true);
  });
});
describe("buildSessionNarrative — startedAt matches worklog.startedAt", () => {
  it("startedAt = TS1", () => {
    expect(buildSessionNarrative(governorWorklog()).startedAt).toBe(TS1);
  });
});
describe("buildSessionNarrative — summaryLines mention rejected rationale count when present", () => {
  it("summary mentions rejection when rationale rejected", () => {
    let wl = createSessionWorklog("sess-rej", "auditor", TS1);
    wl = recordRationaleRejected(wl, "insufficient evidence", TS2);
    expect(buildSessionNarrative(wl).summaryLines.some((l) => l.includes("rejected"))).toBe(true);
  });
});
