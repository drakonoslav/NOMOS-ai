/**
 * lib/db/src/schema/index.ts
 *
 * NOMOS durable persistence schema.
 *
 * STATUS: SCHEMA DEFINED — not yet wired to runtime.
 * Tables are designed and ready. The api-server does not yet import this package.
 * localStorage stores remain the current production path.
 *
 * Infrastructure present: Drizzle ORM + drizzle-kit, drizzle.config.ts.
 * DATABASE_URL must be set (via Replit Postgres integration) before any
 * api-server route handler imports from lib/db.
 *
 * ==========================================================================
 * MIGRATION PLAN: localStorage → server-backed durable state
 * ==========================================================================
 *
 * Step 1: Provision database
 *   - Add Replit Postgres integration
 *   - DATABASE_URL secret is set automatically
 *   - Run: pnpm --filter @workspace/db db:push
 *
 * Step 2: Wire api-server route handlers
 *   Four entities require new or updated endpoints:
 *
 *   (A) Evaluation audit records  [audit_records table]
 *       - POST   /api/audit/records          — persist an AuditRecord
 *       - GET    /api/audit/records           — list all (paginated)
 *       - GET    /api/audit/records/:id       — fetch one
 *       - DELETE /api/audit/records/:id       — delete one
 *       Replaces: audit_store.ts localStorage reads/writes
 *
 *   (B) Governance audit trail  [governance_audit_trail table]
 *       - POST   /api/audit/governance        — persist a GovernanceAuditRecord
 *       - GET    /api/audit/governance        — list all (filtered by domain)
 *       - GET    /api/audit/governance/:id    — fetch one by actionId
 *       Records are immutable. No DELETE endpoint.
 *       Replaces: governance_audit_trail.ts localStorage reads/writes
 *
 *   (C) Active policy assignments  [active_policy_assignments table]
 *       - GET    /api/governance/state        — current PolicyGovernanceState
 *       - PUT    /api/governance/state        — write updated state after promote/rollback
 *       Replaces: policy_governance_store.ts localStorage reads/writes
 *
 *   (D) Session worklogs  [worklog_sessions + worklog_events tables]
 *       - POST   /api/worklog/sessions        — create a new session
 *       - PATCH  /api/worklog/sessions/:id    — append events, set final decision
 *       - GET    /api/worklog/sessions        — list sessions
 *       - GET    /api/worklog/sessions/:id    — fetch full session with events
 *       Current state: worklog is in React state (no persistence of any kind).
 *       Note: ui/audit/audit_log.ts (pipeline stage traces) intentionally remains
 *             client-only — it is diagnostic/debug data, not governance state.
 *
 * Step 3: Update dashboard stores
 *   - audit_store.ts: replace localStorage calls with fetch → /api/audit/records
 *   - governance_audit_trail.ts: replace with fetch → /api/audit/governance
 *   - policy_governance_store.ts: replace with fetch → /api/governance/state
 *   - session worklog: wire to /api/worklog/sessions
 *   Each store's current interface (list/save/get/delete/clear) maps directly
 *   to the REST endpoints above with no signature changes needed in callers.
 *
 * Step 4: One-time data migration (optional)
 *   Each localStorage store has a clear() function. On first server-backed load,
 *   if the server returns empty and localStorage has records, push local records
 *   to the server, then clear localStorage.
 *
 * ==========================================================================
 */

import {
  pgTable,
  text,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/* ==========================================================================
   (A) Evaluation audit records
   Source type: artifacts/nomos-dashboard/src/audit/audit_types.ts → AuditRecord
   ========================================================================== */

export const auditRecordsTable = pgTable("audit_records", {
  id:                   text("id").primaryKey(),
  versionId:            text("version_id").notNull(),
  parentVersionId:      text("parent_version_id"),

  timestamp:            text("timestamp").notNull(),

  intent:               text("intent").notNull(),
  title:                text("title").notNull(),

  isEvaluable:          boolean("is_evaluable").notNull().default(false),
  isConfirmed:          boolean("is_confirmed").notNull().default(false),

  canonicalDeclaration: text("canonical_declaration").notNull(),

  /** Nested complex types stored as JSONB. Schema enforced client-side. */
  compileResult:        jsonb("compile_result"),
  patchedDraft:         jsonb("patched_draft"),
  evaluationResult:     jsonb("evaluation_result"),
  routingRecord:        jsonb("routing_record"),
});

export const insertAuditRecordSchema = createInsertSchema(auditRecordsTable);
export type InsertAuditRecord = z.infer<typeof insertAuditRecordSchema>;
export type AuditRecordRow = typeof auditRecordsTable.$inferSelect;

/* ==========================================================================
   (B) Governance audit trail
   Source type: artifacts/nomos-dashboard/src/audit/governance_audit_types.ts → GovernanceAuditRecord
   Rows are IMMUTABLE once written. No UPDATE or DELETE operations permitted.
   ========================================================================== */

export const governanceAuditTrailTable = pgTable("governance_audit_trail", {
  actionId:  text("action_id").primaryKey(),
  timestamp: text("timestamp").notNull(),

  domain: text("domain").notNull(),
  action: text("action").notNull(),

  currentPolicyVersionId:     text("current_policy_version_id"),
  recommendedPolicyVersionId: text("recommended_policy_version_id"),
  chosenPolicyVersionId:      text("chosen_policy_version_id").notNull(),

  /** String arrays stored as JSONB. */
  expectedGains:        jsonb("expected_gains").notNull().$default(() => []),
  expectedTradeoffs:    jsonb("expected_tradeoffs").notNull().$default(() => []),
  expectedRisks:        jsonb("expected_risks").notNull().$default(() => []),

  recommendationStrength:   text("recommendation_strength").notNull(),
  recommendationConfidence: text("recommendation_confidence").notNull(),

  humanReason: text("human_reason").notNull(),

  benchEvidenceSummary:  jsonb("bench_evidence_summary").notNull().$default(() => []),
  recommendationSummary: jsonb("recommendation_summary").notNull().$default(() => []),
});

export const insertGovernanceAuditRecordSchema = createInsertSchema(governanceAuditTrailTable);
export type InsertGovernanceAuditRecord = z.infer<typeof insertGovernanceAuditRecordSchema>;
export type GovernanceAuditRecordRow = typeof governanceAuditTrailTable.$inferSelect;

/* ==========================================================================
   (C) Active policy assignments
   Source type: artifacts/nomos-dashboard/src/audit/policy_governance_types.ts → ActivePolicyAssignment
   One row per governance domain. Upserted (not inserted) on promote or rollback.
   ========================================================================== */

export const activePolicyAssignmentsTable = pgTable("active_policy_assignments", {
  domain:          text("domain").primaryKey(),
  policyVersionId: text("policy_version_id").notNull(),
  policyLabel:     text("policy_label").notNull(),
  activatedAt:     text("activated_at").notNull(),
  activatedBy:     text("activated_by").notNull(),
});

export const insertActivePolicyAssignmentSchema = createInsertSchema(activePolicyAssignmentsTable);
export type InsertActivePolicyAssignment = z.infer<typeof insertActivePolicyAssignmentSchema>;
export type ActivePolicyAssignmentRow = typeof activePolicyAssignmentsTable.$inferSelect;

/* ==========================================================================
   (D) Session worklogs
   Source type: artifacts/nomos-dashboard/src/worklog/worklog_types.ts → SessionWorklog + WorklogEvent
   Normalized: session header row + child event rows in a separate table.
   Current state: worklog lives in React state with no persistence of any kind.
   ========================================================================== */

export const worklogSessionsTable = pgTable("worklog_sessions", {
  sessionId:  text("session_id").primaryKey(),
  startedAt:  text("started_at").notNull(),
  roleMode:   text("role_mode").notNull(),

  finalDecision: text("final_decision"),

  /** String arrays stored as JSONB. */
  acceptedRationales: jsonb("accepted_rationales").notNull().$default(() => []),
  rejectedRationales: jsonb("rejected_rationales").notNull().$default(() => []),
  notes:              jsonb("notes").notNull().$default(() => []),
});

export const worklogEventsTable = pgTable("worklog_events", {
  eventId:   text("event_id").primaryKey(),
  sessionId: text("session_id").notNull(),

  timestamp: text("timestamp").notNull(),
  roleMode:  text("role_mode").notNull(),
  eventType: text("event_type").notNull(),

  targetId: text("target_id"),
  payload:  jsonb("payload"),
});

export const insertWorklogSessionSchema = createInsertSchema(worklogSessionsTable);
export type InsertWorklogSession = z.infer<typeof insertWorklogSessionSchema>;
export type WorklogSessionRow = typeof worklogSessionsTable.$inferSelect;

export const insertWorklogEventSchema = createInsertSchema(worklogEventsTable);
export type InsertWorklogEvent = z.infer<typeof insertWorklogEventSchema>;
export type WorklogEventRow = typeof worklogEventsTable.$inferSelect;
