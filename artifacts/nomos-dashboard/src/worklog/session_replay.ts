/**
 * session_replay.ts
 *
 * Deterministic session replay / narrative reconstruction for NOMOS.
 *
 * Functions:
 *   sortSessionEvents       — sort worklog events by timestamp ascending
 *   buildSessionReplaySteps — convert sorted events into readable replay steps
 *   buildSessionNarrative   — produce the full SessionNarrative from a worklog
 *
 * Reconstruction rules:
 *   - preserve exact event order by timestamp
 *   - convert raw events into readable steps deterministically
 *   - do not invent steps not present in the worklog
 *   - only summarise explicit recorded actions
 *
 * No LLM generation. No mutation of inputs.
 */

import type { WorklogEvent, SessionWorklog } from "./worklog_types";
import type {
  SessionReplayStep,
  SessionNarrative,
} from "./session_replay_types";

/* =========================================================
   Event → readable title/description mapping
   ========================================================= */

function eventTitle(event: WorklogEvent): string {
  switch (event.eventType) {
    case "workflow_started":
      return `Workflow started in ${event.roleMode} mode`;
    case "workflow_step_opened":
      return `Opened workflow step: ${event.targetId ?? "unknown"}`;
    case "panel_opened":
      return `Opened panel: ${event.targetId ?? "unknown"}`;
    case "panel_closed":
      return `Closed panel: ${event.targetId ?? "unknown"}`;
    case "decision_made":
      return `Decision recorded: ${event.targetId ?? "none"}`;
    case "rationale_accepted":
      return `Accepted rationale`;
    case "rationale_rejected":
      return `Rejected rationale`;
    case "note_added":
      return `Note added`;
    default:
      return "Unknown event";
  }
}

function eventDescription(event: WorklogEvent): string {
  switch (event.eventType) {
    case "workflow_started":
      return `The user started the guided ${event.roleMode} workflow.`;
    case "workflow_step_opened": {
      const card =
        event.payload && typeof event.payload.targetCardId === "string"
          ? ` (${event.payload.targetCardId})`
          : "";
      return `Navigated to workflow step "${event.targetId ?? "unknown"}"${card}.`;
    }
    case "panel_opened":
      return `Opened the "${event.targetId ?? "unknown"}" panel.`;
    case "panel_closed":
      return `Closed the "${event.targetId ?? "unknown"}" panel.`;
    case "decision_made":
      return `Final governance decision recorded: ${event.targetId ?? "none"}.`;
    case "rationale_accepted": {
      const rat =
        event.payload && typeof event.payload.rationale === "string"
          ? `"${event.payload.rationale}"`
          : "a rationale";
      return `Accepted rationale: ${rat}.`;
    }
    case "rationale_rejected": {
      const rat =
        event.payload && typeof event.payload.rationale === "string"
          ? `"${event.payload.rationale}"`
          : "a rationale";
      return `Rejected rationale: ${rat}.`;
    }
    case "note_added": {
      const note =
        event.payload && typeof event.payload.note === "string"
          ? `"${event.payload.note}"`
          : "a note";
      return `Note added: ${note}.`;
    }
    default:
      return "An unrecognised event was recorded.";
  }
}

/* =========================================================
   sortSessionEvents
   ========================================================= */

/**
 * Returns a new array of worklog events sorted ascending by timestamp.
 *
 * Events with identical timestamps preserve their original relative order.
 * The input array is not mutated.
 */
export function sortSessionEvents(events: WorklogEvent[]): WorklogEvent[] {
  return [...events].sort((a, b) => {
    if (a.timestamp < b.timestamp) return -1;
    if (a.timestamp > b.timestamp) return +1;
    return 0;
  });
}

/* =========================================================
   buildSessionReplaySteps
   ========================================================= */

/**
 * Converts a SessionWorklog's events into an ordered list of
 * human-readable SessionReplayStep objects.
 *
 * Steps are built only from recorded events — no inference.
 * The input worklog is not mutated.
 */
export function buildSessionReplaySteps(
  worklog: SessionWorklog
): SessionReplayStep[] {
  const sorted = sortSessionEvents(worklog.events);
  return sorted.map((event, i) => ({
    stepNumber:  i + 1,
    timestamp:   event.timestamp,
    eventType:   event.eventType,
    title:       eventTitle(event),
    description: eventDescription(event),
    targetId:    event.targetId,
  }));
}

/* =========================================================
   buildSessionNarrative
   ========================================================= */

/**
 * Produces the full SessionNarrative from a SessionWorklog.
 *
 * Summary lines are derived deterministically from the recorded events.
 * No LLM generation. No intent inference. No invented steps.
 */
export function buildSessionNarrative(
  worklog: SessionWorklog
): SessionNarrative {
  const orderedSteps = buildSessionReplaySteps(worklog);

  const summaryLines = buildSummaryLines(worklog, orderedSteps);

  return {
    sessionId:          worklog.sessionId,
    roleMode:           worklog.roleMode,
    startedAt:          worklog.startedAt,
    finalDecision:      worklog.finalDecision,
    orderedSteps,
    acceptedRationales: [...worklog.acceptedRationales],
    rejectedRationales: [...worklog.rejectedRationales],
    notes:              [...worklog.notes],
    summaryLines,
  };
}

/* =========================================================
   buildSummaryLines (internal)
   ========================================================= */

function buildSummaryLines(
  worklog: SessionWorklog,
  orderedSteps: SessionReplayStep[]
): string[] {
  const lines: string[] = [];

  // Role mode and session opener
  const workflowStarted = worklog.events.some(
    (e) => e.eventType === "workflow_started"
  );
  if (workflowStarted) {
    lines.push(
      `The user followed the ${worklog.roleMode} workflow during this session.`
    );
  } else {
    lines.push(
      `The session was conducted in ${worklog.roleMode} mode without starting the guided workflow.`
    );
  }

  // Panels and steps opened
  const panelsOpened = orderedSteps
    .filter((s) => s.eventType === "panel_opened" || s.eventType === "workflow_step_opened")
    .map((s) => s.targetId)
    .filter((id): id is string => id !== null);

  if (panelsOpened.length > 0) {
    const unique = [...new Set(panelsOpened)];
    if (unique.length === 1) {
      lines.push(`The user inspected the "${unique[0]}" panel.`);
    } else {
      lines.push(
        `The user inspected the following panels: ${unique.map((id) => `"${id}"`).join(", ")}.`
      );
    }
  }

  // Rationale outcome
  const accepted = worklog.acceptedRationales.length;
  const rejected = worklog.rejectedRationales.length;
  if (accepted > 0 || rejected > 0) {
    lines.push(
      `${accepted} rationale${accepted !== 1 ? "s" : ""} accepted and ${rejected} rationale${rejected !== 1 ? "s" : ""} rejected during the session.`
    );
  }

  // Final decision
  if (worklog.finalDecision !== null) {
    const decisionVerb =
      worklog.finalDecision === "promote"  ? "promotion"  :
      worklog.finalDecision === "rollback" ? "rollback"   :
      "hold (no change)";
    lines.push(`The final decision was ${decisionVerb}.`);
    if (accepted > 0 && rejected === 0) {
      lines.push(
        `The decision was reached after accepting ${accepted} rationale${accepted !== 1 ? "s" : ""} with no rejections.`
      );
    } else if (rejected > 0) {
      lines.push(
        `The decision was reached after reviewing and rejecting ${rejected} caution${rejected !== 1 ? "s" : ""}.`
      );
    }
  } else {
    lines.push("No final governance decision was recorded in this session.");
  }

  // Notes
  if (worklog.notes.length > 0) {
    lines.push(
      `${worklog.notes.length} note${worklog.notes.length !== 1 ? "s" : ""} were added during the session.`
    );
  }

  // Step count
  if (orderedSteps.length === 0) {
    lines.push("No events were recorded in this session.");
  } else {
    lines.push(
      `The session comprised ${orderedSteps.length} recorded step${orderedSteps.length !== 1 ? "s" : ""} in total.`
    );
  }

  return lines;
}
