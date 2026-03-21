/**
 * session_worklog_test.ts
 *
 * Regression tests for worklog_types.ts and session_worklog.ts.
 *
 * Scenarios:
 *   1.  createSessionWorklog — sessionId matches
 *   2.  createSessionWorklog — roleMode matches
 *   3.  createSessionWorklog — events is empty
 *   4.  createSessionWorklog — finalDecision is null
 *   5.  createSessionWorklog — acceptedRationales is empty
 *   6.  createSessionWorklog — rejectedRationales is empty
 *   7.  createSessionWorklog — notes is empty
 *   8.  appendWorklogEvent — event is appended
 *   9.  appendWorklogEvent — does not mutate input worklog
 *  10.  recordWorkflowStart — appends workflow_started event
 *  11.  recordWorkflowStart — event.targetId matches roleMode
 *  12.  recordWorkflowStepOpened — appends workflow_step_opened event
 *  13.  recordWorkflowStepOpened — event.targetId matches stepId
 *  14.  recordPanelOpened — appends panel_opened event
 *  15.  recordPanelOpened — event.targetId matches panelId
 *  16.  recordPanelClosed — appends panel_closed event
 *  17.  recordPanelClosed — event.targetId matches panelId
 *  18.  recordDecision — sets finalDecision to "promote"
 *  19.  recordDecision — appends decision_made event
 *  20.  recordDecision — does not mutate input worklog
 *  21.  recordRationaleAccepted — adds rationale to acceptedRationales
 *  22.  recordRationaleAccepted — appends rationale_accepted event
 *  23.  recordRationaleRejected — adds rationale to rejectedRationales
 *  24.  recordRationaleRejected — appends rationale_rejected event
 *  25.  addWorklogNote — adds note to notes
 *  26.  addWorklogNote — appends note_added event
 *  27.  all event eventIds start with "wev-"
 *  28.  chaining multiple operations preserves all events in order
 *  29.  recordDecision to "rollback" sets finalDecision to "rollback"
 *  30.  two separate workflow starts produce different eventIds
 */

import { describe, it, expect } from "vitest";
import {
  createSessionWorklog,
  appendWorklogEvent,
  recordWorkflowStart,
  recordWorkflowStepOpened,
  recordPanelOpened,
  recordPanelClosed,
  recordDecision,
  recordRationaleAccepted,
  recordRationaleRejected,
  addWorklogNote,
} from "../worklog/session_worklog";
import type { WorklogEvent } from "../worklog/worklog_types";

const TS = "2026-01-01T12:00:00.000Z";
const TS2 = "2026-01-01T12:01:00.000Z";

function baseWorklog() {
  return createSessionWorklog("sess-001", "governor", TS);
}

function makeEvent(overrides?: Partial<WorklogEvent>): WorklogEvent {
  return {
    eventId: "wev-aaaaaaaa",
    timestamp: TS,
    sessionId: "sess-001",
    roleMode: "governor",
    eventType: "panel_opened",
    targetId: "governance",
    payload: null,
    ...overrides,
  };
}

describe("createSessionWorklog — sessionId matches", () => {
  it("sessionId = 'sess-001'", () => {
    expect(baseWorklog().sessionId).toBe("sess-001");
  });
});
describe("createSessionWorklog — roleMode matches", () => {
  it("roleMode = 'governor'", () => {
    expect(baseWorklog().roleMode).toBe("governor");
  });
});
describe("createSessionWorklog — events is empty", () => {
  it("events = []", () => {
    expect(baseWorklog().events).toHaveLength(0);
  });
});
describe("createSessionWorklog — finalDecision is null", () => {
  it("finalDecision = null", () => {
    expect(baseWorklog().finalDecision).toBeNull();
  });
});
describe("createSessionWorklog — acceptedRationales is empty", () => {
  it("acceptedRationales = []", () => {
    expect(baseWorklog().acceptedRationales).toHaveLength(0);
  });
});
describe("createSessionWorklog — rejectedRationales is empty", () => {
  it("rejectedRationales = []", () => {
    expect(baseWorklog().rejectedRationales).toHaveLength(0);
  });
});
describe("createSessionWorklog — notes is empty", () => {
  it("notes = []", () => {
    expect(baseWorklog().notes).toHaveLength(0);
  });
});
describe("appendWorklogEvent — event is appended", () => {
  it("events.length = 1 after append", () => {
    const wl = appendWorklogEvent(baseWorklog(), makeEvent());
    expect(wl.events).toHaveLength(1);
  });
});
describe("appendWorklogEvent — does not mutate input worklog", () => {
  it("original events array unchanged", () => {
    const original = baseWorklog();
    appendWorklogEvent(original, makeEvent());
    expect(original.events).toHaveLength(0);
  });
});
describe("recordWorkflowStart — appends workflow_started event", () => {
  it("first event.eventType = 'workflow_started'", () => {
    const wl = recordWorkflowStart(baseWorklog(), TS);
    expect(wl.events[0].eventType).toBe("workflow_started");
  });
});
describe("recordWorkflowStart — event.targetId matches roleMode", () => {
  it("targetId = 'governor'", () => {
    const wl = recordWorkflowStart(baseWorklog(), TS);
    expect(wl.events[0].targetId).toBe("governor");
  });
});
describe("recordWorkflowStepOpened — appends workflow_step_opened event", () => {
  it("event.eventType = 'workflow_step_opened'", () => {
    const wl = recordWorkflowStepOpened(baseWorklog(), "governor-step-1", "governance", TS);
    expect(wl.events[0].eventType).toBe("workflow_step_opened");
  });
});
describe("recordWorkflowStepOpened — event.targetId matches stepId", () => {
  it("targetId = 'governor-step-1'", () => {
    const wl = recordWorkflowStepOpened(baseWorklog(), "governor-step-1", "governance", TS);
    expect(wl.events[0].targetId).toBe("governor-step-1");
  });
});
describe("recordPanelOpened — appends panel_opened event", () => {
  it("event.eventType = 'panel_opened'", () => {
    const wl = recordPanelOpened(baseWorklog(), "doctrine", TS);
    expect(wl.events[0].eventType).toBe("panel_opened");
  });
});
describe("recordPanelOpened — event.targetId matches panelId", () => {
  it("targetId = 'doctrine'", () => {
    const wl = recordPanelOpened(baseWorklog(), "doctrine", TS);
    expect(wl.events[0].targetId).toBe("doctrine");
  });
});
describe("recordPanelClosed — appends panel_closed event", () => {
  it("event.eventType = 'panel_closed'", () => {
    const wl = recordPanelClosed(baseWorklog(), "doctrine", TS);
    expect(wl.events[0].eventType).toBe("panel_closed");
  });
});
describe("recordPanelClosed — event.targetId matches panelId", () => {
  it("targetId = 'doctrine'", () => {
    const wl = recordPanelClosed(baseWorklog(), "doctrine", TS);
    expect(wl.events[0].targetId).toBe("doctrine");
  });
});
describe("recordDecision — sets finalDecision to 'promote'", () => {
  it("finalDecision = 'promote'", () => {
    const wl = recordDecision(baseWorklog(), "promote", TS);
    expect(wl.finalDecision).toBe("promote");
  });
});
describe("recordDecision — appends decision_made event", () => {
  it("event.eventType = 'decision_made'", () => {
    const wl = recordDecision(baseWorklog(), "promote", TS);
    expect(wl.events[0].eventType).toBe("decision_made");
  });
});
describe("recordDecision — does not mutate input worklog", () => {
  it("original finalDecision unchanged", () => {
    const original = baseWorklog();
    recordDecision(original, "promote", TS);
    expect(original.finalDecision).toBeNull();
  });
});
describe("recordRationaleAccepted — adds rationale to acceptedRationales", () => {
  it("acceptedRationales contains the rationale", () => {
    const wl = recordRationaleAccepted(baseWorklog(), "improved exact-match rate", TS);
    expect(wl.acceptedRationales).toContain("improved exact-match rate");
  });
});
describe("recordRationaleAccepted — appends rationale_accepted event", () => {
  it("event.eventType = 'rationale_accepted'", () => {
    const wl = recordRationaleAccepted(baseWorklog(), "improved exact-match rate", TS);
    expect(wl.events[0].eventType).toBe("rationale_accepted");
  });
});
describe("recordRationaleRejected — adds rationale to rejectedRationales", () => {
  it("rejectedRationales contains the rationale", () => {
    const wl = recordRationaleRejected(baseWorklog(), "shallow history caution", TS);
    expect(wl.rejectedRationales).toContain("shallow history caution");
  });
});
describe("recordRationaleRejected — appends rationale_rejected event", () => {
  it("event.eventType = 'rationale_rejected'", () => {
    const wl = recordRationaleRejected(baseWorklog(), "shallow history caution", TS);
    expect(wl.events[0].eventType).toBe("rationale_rejected");
  });
});
describe("addWorklogNote — adds note to notes", () => {
  it("notes contains the note text", () => {
    const wl = addWorklogNote(baseWorklog(), "Review again next week.", TS);
    expect(wl.notes).toContain("Review again next week.");
  });
});
describe("addWorklogNote — appends note_added event", () => {
  it("event.eventType = 'note_added'", () => {
    const wl = addWorklogNote(baseWorklog(), "Review again next week.", TS);
    expect(wl.events[0].eventType).toBe("note_added");
  });
});
describe("all event eventIds start with 'wev-'", () => {
  it("eventId starts with 'wev-'", () => {
    let wl = baseWorklog();
    wl = recordWorkflowStart(wl, TS);
    expect(wl.events[0].eventId.startsWith("wev-")).toBe(true);
  });
});
describe("chaining multiple operations preserves all events in order", () => {
  it("events.length = 3 after three operations", () => {
    let wl = baseWorklog();
    wl = recordWorkflowStart(wl, TS);
    wl = recordPanelOpened(wl, "doctrine", TS2);
    wl = recordDecision(wl, "promote", "2026-01-01T12:02:00.000Z");
    expect(wl.events).toHaveLength(3);
    expect(wl.events[0].eventType).toBe("workflow_started");
    expect(wl.events[1].eventType).toBe("panel_opened");
    expect(wl.events[2].eventType).toBe("decision_made");
  });
});
describe("recordDecision to 'rollback' sets finalDecision to 'rollback'", () => {
  it("finalDecision = 'rollback'", () => {
    const wl = recordDecision(baseWorklog(), "rollback", TS);
    expect(wl.finalDecision).toBe("rollback");
  });
});
describe("two separate workflow starts produce different eventIds", () => {
  it("eventIds differ when timestamps differ", () => {
    const a = recordWorkflowStart(baseWorklog(), TS).events[0].eventId;
    const b = recordWorkflowStart(baseWorklog(), TS2).events[0].eventId;
    expect(a).not.toBe(b);
  });
});
