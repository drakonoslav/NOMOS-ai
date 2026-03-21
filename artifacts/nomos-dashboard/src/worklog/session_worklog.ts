/**
 * session_worklog.ts
 *
 * Deterministic functions for building and appending to NOMOS session worklogs.
 *
 * All functions are pure — they return new SessionWorklog objects
 * without mutating their inputs.
 *
 * Functions:
 *   createSessionWorklog         — initialise a new empty worklog
 *   appendWorklogEvent           — append a pre-built event (low-level)
 *   recordWorkflowStart          — log that the user started their role workflow
 *   recordWorkflowStepOpened     — log that the user navigated to a workflow step
 *   recordPanelOpened            — log that the user opened a panel
 *   recordPanelClosed            — log that the user closed a panel
 *   recordDecision               — log a final governance decision
 *   recordRationaleAccepted      — log that the user accepted a rationale
 *   recordRationaleRejected      — log that the user rejected a rationale
 *   addWorklogNote               — log a free-text note
 *
 * No LLM generation. No state mutation. No intent inference.
 */

import type { WorklogEvent, SessionWorklog } from "./worklog_types";
import type { CockpitRoleMode } from "../ui/cockpit/role_view_types";

/* =========================================================
   djb2 hash — consistent with NOMOS audit ID convention
   ========================================================= */

function djb2(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function makeEventId(
  sessionId: string,
  eventType: WorklogEvent["eventType"],
  targetId: string | null,
  timestamp: string
): string {
  const raw = sessionId + eventType + (targetId ?? "") + timestamp;
  const hash = djb2(raw).toString(16).padStart(8, "0");
  return `wev-${hash}`;
}

/* =========================================================
   createSessionWorklog
   ========================================================= */

/**
 * Creates a new empty SessionWorklog for the given session and role mode.
 *
 * startedAt defaults to the current ISO-8601 timestamp when not provided.
 * The worklog begins with no events, no decision, and no notes.
 */
export function createSessionWorklog(
  sessionId: string,
  roleMode: CockpitRoleMode,
  startedAt?: string
): SessionWorklog {
  return {
    sessionId,
    startedAt: startedAt ?? new Date().toISOString(),
    roleMode,
    events: [],
    finalDecision: null,
    acceptedRationales: [],
    rejectedRationales: [],
    notes: [],
  };
}

/* =========================================================
   appendWorklogEvent
   ========================================================= */

/**
 * Returns a new SessionWorklog with the given event appended.
 *
 * The input worklog is not mutated.
 * Events are appended in insertion order (oldest-first).
 */
export function appendWorklogEvent(
  worklog: SessionWorklog,
  event: WorklogEvent
): SessionWorklog {
  return {
    ...worklog,
    events: [...worklog.events, event],
  };
}

/* =========================================================
   recordWorkflowStart
   ========================================================= */

/**
 * Records that the user started the guided workflow for their role mode.
 * Returns a new worklog with the event appended.
 */
export function recordWorkflowStart(
  worklog: SessionWorklog,
  timestamp?: string
): SessionWorklog {
  const ts = timestamp ?? new Date().toISOString();
  const event: WorklogEvent = {
    eventId: makeEventId(worklog.sessionId, "workflow_started", worklog.roleMode, ts),
    timestamp: ts,
    sessionId: worklog.sessionId,
    roleMode: worklog.roleMode,
    eventType: "workflow_started",
    targetId: worklog.roleMode,
    payload: null,
  };
  return appendWorklogEvent(worklog, event);
}

/* =========================================================
   recordWorkflowStepOpened
   ========================================================= */

/**
 * Records that the user navigated to a specific workflow step.
 *
 * stepId:      the WorkflowStep.id of the step opened.
 * targetCardId: the card/panel this step routes to.
 */
export function recordWorkflowStepOpened(
  worklog: SessionWorklog,
  stepId: string,
  targetCardId: string,
  timestamp?: string
): SessionWorklog {
  const ts = timestamp ?? new Date().toISOString();
  const event: WorklogEvent = {
    eventId: makeEventId(worklog.sessionId, "workflow_step_opened", stepId, ts),
    timestamp: ts,
    sessionId: worklog.sessionId,
    roleMode: worklog.roleMode,
    eventType: "workflow_step_opened",
    targetId: stepId,
    payload: { targetCardId },
  };
  return appendWorklogEvent(worklog, event);
}

/* =========================================================
   recordPanelOpened
   ========================================================= */

/**
 * Records that the user opened a panel (outside the guided workflow).
 */
export function recordPanelOpened(
  worklog: SessionWorklog,
  panelId: string,
  timestamp?: string
): SessionWorklog {
  const ts = timestamp ?? new Date().toISOString();
  const event: WorklogEvent = {
    eventId: makeEventId(worklog.sessionId, "panel_opened", panelId, ts),
    timestamp: ts,
    sessionId: worklog.sessionId,
    roleMode: worklog.roleMode,
    eventType: "panel_opened",
    targetId: panelId,
    payload: null,
  };
  return appendWorklogEvent(worklog, event);
}

/* =========================================================
   recordPanelClosed
   ========================================================= */

/**
 * Records that the user closed a panel.
 */
export function recordPanelClosed(
  worklog: SessionWorklog,
  panelId: string,
  timestamp?: string
): SessionWorklog {
  const ts = timestamp ?? new Date().toISOString();
  const event: WorklogEvent = {
    eventId: makeEventId(worklog.sessionId, "panel_closed", panelId, ts),
    timestamp: ts,
    sessionId: worklog.sessionId,
    roleMode: worklog.roleMode,
    eventType: "panel_closed",
    targetId: panelId,
    payload: null,
  };
  return appendWorklogEvent(worklog, event);
}

/* =========================================================
   recordDecision
   ========================================================= */

/**
 * Records the user's final governance decision.
 *
 * Sets worklog.finalDecision to the given value.
 * Also appends a decision_made event.
 * Returns a new worklog — does not mutate the input.
 */
export function recordDecision(
  worklog: SessionWorklog,
  decision: "promote" | "rollback" | "hold",
  timestamp?: string
): SessionWorklog {
  const ts = timestamp ?? new Date().toISOString();
  const event: WorklogEvent = {
    eventId: makeEventId(worklog.sessionId, "decision_made", decision, ts),
    timestamp: ts,
    sessionId: worklog.sessionId,
    roleMode: worklog.roleMode,
    eventType: "decision_made",
    targetId: decision,
    payload: { decision },
  };
  const withEvent = appendWorklogEvent(worklog, event);
  return { ...withEvent, finalDecision: decision };
}

/* =========================================================
   recordRationaleAccepted
   ========================================================= */

/**
 * Records that the user explicitly accepted a rationale line.
 *
 * rationale: the rationale text or ID accepted.
 * Adds to worklog.acceptedRationales and appends an event.
 * Does not mutate the input.
 */
export function recordRationaleAccepted(
  worklog: SessionWorklog,
  rationale: string,
  timestamp?: string
): SessionWorklog {
  const ts = timestamp ?? new Date().toISOString();
  const event: WorklogEvent = {
    eventId: makeEventId(worklog.sessionId, "rationale_accepted", rationale, ts),
    timestamp: ts,
    sessionId: worklog.sessionId,
    roleMode: worklog.roleMode,
    eventType: "rationale_accepted",
    targetId: null,
    payload: { rationale },
  };
  const withEvent = appendWorklogEvent(worklog, event);
  return {
    ...withEvent,
    acceptedRationales: [...withEvent.acceptedRationales, rationale],
  };
}

/* =========================================================
   recordRationaleRejected
   ========================================================= */

/**
 * Records that the user explicitly rejected a rationale line.
 *
 * rationale: the rationale text or ID rejected.
 * Adds to worklog.rejectedRationales and appends an event.
 * Does not mutate the input.
 */
export function recordRationaleRejected(
  worklog: SessionWorklog,
  rationale: string,
  timestamp?: string
): SessionWorklog {
  const ts = timestamp ?? new Date().toISOString();
  const event: WorklogEvent = {
    eventId: makeEventId(worklog.sessionId, "rationale_rejected", rationale, ts),
    timestamp: ts,
    sessionId: worklog.sessionId,
    roleMode: worklog.roleMode,
    eventType: "rationale_rejected",
    targetId: null,
    payload: { rationale },
  };
  const withEvent = appendWorklogEvent(worklog, event);
  return {
    ...withEvent,
    rejectedRationales: [...withEvent.rejectedRationales, rationale],
  };
}

/* =========================================================
   addWorklogNote
   ========================================================= */

/**
 * Records a free-text note added by the user.
 *
 * Adds to worklog.notes and appends an event.
 * Does not mutate the input.
 */
export function addWorklogNote(
  worklog: SessionWorklog,
  note: string,
  timestamp?: string
): SessionWorklog {
  const ts = timestamp ?? new Date().toISOString();
  const event: WorklogEvent = {
    eventId: makeEventId(worklog.sessionId, "note_added", null, ts),
    timestamp: ts,
    sessionId: worklog.sessionId,
    roleMode: worklog.roleMode,
    eventType: "note_added",
    targetId: null,
    payload: { note },
  };
  const withEvent = appendWorklogEvent(worklog, event);
  return {
    ...withEvent,
    notes: [...withEvent.notes, note],
  };
}
