/**
 * worklog_types.ts
 *
 * Canonical types for the NOMOS session worklog layer.
 *
 * The worklog records the human operational trace on top of the machine trace:
 *   - which workflow the user followed
 *   - which panels they opened
 *   - what decision they reached
 *   - what rationale they accepted or rejected
 *
 * This is an audit/worklog layer — not automation.
 * It only records explicit user actions.
 * It does not infer human intent.
 * No LLM generation.
 */

import type { CockpitRoleMode } from "../ui/cockpit/role_view_types";

/**
 * A single recorded user action in a session.
 *
 * eventId:   deterministic identifier derived from session, event type, and timestamp.
 * timestamp: ISO-8601 timestamp of the action.
 * sessionId: the session this event belongs to.
 * roleMode:  the role mode active when this event was recorded.
 *
 * eventType:
 *   workflow_started      — user began the guided workflow for their role.
 *   workflow_step_opened  — user navigated to a specific workflow step's panel.
 *   panel_opened          — user opened a panel not through the workflow.
 *   panel_closed          — user closed a panel.
 *   decision_made         — user recorded a final governance decision.
 *   rationale_accepted    — user accepted a recommendation rationale line.
 *   rationale_rejected    — user rejected a recommendation rationale line.
 *   note_added            — user added a free-text note.
 *
 * targetId:  the panel, card, workflow step, or decision value targeted.
 *            Null when not applicable.
 *
 * payload:   optional structured data associated with this event.
 *            Used for notes, decision values, and rationale text.
 */
export interface WorklogEvent {
  eventId: string;
  timestamp: string;

  sessionId: string;
  roleMode: CockpitRoleMode;

  eventType:
    | "workflow_started"
    | "workflow_step_opened"
    | "panel_opened"
    | "panel_closed"
    | "decision_made"
    | "rationale_accepted"
    | "rationale_rejected"
    | "note_added";

  targetId: string | null;
  payload: Record<string, unknown> | null;
}

/**
 * The complete human operational trace for a single working session.
 *
 * sessionId:          unique identifier for this session.
 * startedAt:          ISO-8601 timestamp when the session was created.
 * roleMode:           the role mode in which this session was started.
 *
 * events:             ordered log of all recorded user actions, oldest-first.
 *
 * finalDecision:      the governance decision recorded in this session, or null.
 * acceptedRationales: rationale text/IDs explicitly accepted by the user.
 * rejectedRationales: rationale text/IDs explicitly rejected by the user.
 * notes:              free-text notes added during the session.
 */
export interface SessionWorklog {
  sessionId: string;
  startedAt: string;
  roleMode: CockpitRoleMode;

  events: WorklogEvent[];

  finalDecision: "promote" | "rollback" | "hold" | null;
  acceptedRationales: string[];
  rejectedRationales: string[];
  notes: string[];
}
