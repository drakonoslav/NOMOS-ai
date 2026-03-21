/**
 * lib/db/src/schema/index.ts
 *
 * STATUS: STUB — no tables defined, not wired to any runtime feature.
 *
 * Infrastructure present: Drizzle ORM, drizzle.config.ts, drizzle-kit.
 * DATABASE_URL must be set before lib/db/src/index.ts can be imported.
 *
 * Nothing in the codebase imports this package at runtime:
 *   - api-server: does NOT import from lib/db
 *   - nomos-dashboard: does NOT import from lib/db
 *
 * All governance/audit state is currently IN_MEMORY_CLIENT_ONLY (localStorage).
 *
 * To connect to this DB: define tables below, wire from api-server route handlers,
 * run `pnpm --filter @workspace/db db:push` or generate and apply migrations.
 *
 * Example governance audit table:
 *
 *   import { pgTable, text, serial, real, timestamp } from "drizzle-orm/pg-core";
 *   import { createInsertSchema } from "drizzle-zod";
 *   import { z } from "zod/v4";
 *
 *   export const auditRecordsTable = pgTable("audit_records", {
 *     id:          serial("id").primaryKey(),
 *     actionId:    text("action_id").notNull().unique(),
 *     status:      text("status").notNull(),
 *     humanReason: text("human_reason"),
 *     recordedAt:  timestamp("recorded_at").defaultNow(),
 *   });
 *
 *   export const insertAuditRecordSchema = createInsertSchema(auditRecordsTable).omit({ id: true });
 *   export type InsertAuditRecord = z.infer<typeof insertAuditRecordSchema>;
 *   export type AuditRecord = typeof auditRecordsTable.$inferSelect;
 */

export {};
