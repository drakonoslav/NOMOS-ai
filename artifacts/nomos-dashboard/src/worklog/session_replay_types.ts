/**
 * session_replay_types.ts
 *
 * Canonical types for NOMOS session replay / narrative reconstruction.
 *
 * A SessionNarrative is a human-readable reconstruction of a session
 * built strictly from recorded worklog events.  It does not infer
 * unseen actions or generate content beyond the explicit event record.
 *
 * No LLM generation.
 */

import type { CockpitRoleMode } from "../ui/cockpit/role_view_types";

/**
 * A single human-readable step in a session replay.
 *
 * stepNumber:   1-based position in the replay sequence.
 * timestamp:    ISO-8601 timestamp from the original worklog event.
 * eventType:    the worklog event type this step was derived from.
 * title:        short action-oriented label for the step.
 * description:  plain-language sentence describing what happened.
 * targetId:     the panel, card, or decision target (may be null).
 */
export interface SessionReplayStep {
  stepNumber: number;
  timestamp: string;
  eventType: string;
  title: string;
  description: string;
  targetId: string | null;
}

/**
 * The full human-readable session narrative.
 *
 * sessionId:          the session this narrative describes.
 * roleMode:           the role mode in which the session was conducted.
 * startedAt:          ISO-8601 timestamp when the session began.
 * finalDecision:      the governance decision made, or null if none.
 * orderedSteps:       chronological ordered steps reconstructed from events.
 * acceptedRationales: rationale text explicitly accepted during the session.
 * rejectedRationales: rationale text explicitly rejected during the session.
 * notes:              free-text notes recorded during the session.
 * summaryLines:       plain-language narrative sentences summarising the session.
 */
export interface SessionNarrative {
  sessionId: string;
  roleMode: CockpitRoleMode;

  startedAt: string;
  finalDecision: "promote" | "rollback" | "hold" | null;

  orderedSteps: SessionReplayStep[];

  acceptedRationales: string[];
  rejectedRationales: string[];
  notes: string[];

  summaryLines: string[];
}
