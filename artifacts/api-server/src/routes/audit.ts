/**
 * routes/audit.ts
 *
 * Evaluation audit records persistence.
 *
 * POST   /audit/records       — upsert an AuditRecord (insert or update by id)
 * GET    /audit/records       — list all records, newest first
 * GET    /audit/records/:id   — fetch one by id
 * DELETE /audit/records       — clear all records
 * DELETE /audit/records/:id   — delete one by id
 *
 * Storage: audit_records table in Postgres via lib/db.
 * This replaces the dashboard's localStorage-backed audit_store.ts.
 */

import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, auditRecordsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const auditRouter = Router();

auditRouter.get("/audit/records", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(auditRecordsTable)
      .orderBy(auditRecordsTable.timestamp);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "audit/records GET failed");
    const message = err instanceof Error ? err.message : "DB error";
    res.status(500).json({ error: "DB_ERROR", message });
  }
});

auditRouter.post("/audit/records", async (req, res) => {
  const body = req.body as Record<string, unknown> | null;

  if (!body || typeof body !== "object" || typeof body["id"] !== "string") {
    res.status(400).json({ error: "INVALID_INPUT", message: "Record with string id is required." });
    return;
  }

  const row = {
    id:                   String(body["id"]),
    versionId:            String(body["versionId"] ?? ""),
    parentVersionId:      body["parentVersionId"] != null ? String(body["parentVersionId"]) : null,
    timestamp:            String(body["timestamp"] ?? new Date().toISOString()),
    intent:               String(body["intent"] ?? ""),
    title:                String(body["title"] ?? ""),
    isEvaluable:          Boolean(body["isEvaluable"]),
    isConfirmed:          Boolean(body["isConfirmed"]),
    canonicalDeclaration: String(body["canonicalDeclaration"] ?? ""),
    compileResult:        body["compileResult"] ?? null,
    patchedDraft:         body["patchedDraft"] ?? null,
    evaluationResult:     body["evaluationResult"] ?? null,
    routingRecord:        body["routingRecord"] ?? null,
  };

  try {
    const [upserted] = await db
      .insert(auditRecordsTable)
      .values(row)
      .onConflictDoUpdate({
        target: auditRecordsTable.id,
        set: {
          versionId:            row.versionId,
          parentVersionId:      row.parentVersionId,
          timestamp:            row.timestamp,
          intent:               row.intent,
          title:                row.title,
          isEvaluable:          row.isEvaluable,
          isConfirmed:          row.isConfirmed,
          canonicalDeclaration: row.canonicalDeclaration,
          compileResult:        row.compileResult,
          patchedDraft:         row.patchedDraft,
          evaluationResult:     row.evaluationResult,
          routingRecord:        row.routingRecord,
        },
      })
      .returning();
    res.json(upserted);
  } catch (err) {
    logger.error({ err }, "audit/records POST failed");
    const message = err instanceof Error ? err.message : "DB error";
    res.status(500).json({ error: "DB_ERROR", message });
  }
});

auditRouter.get("/audit/records/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [row] = await db
      .select()
      .from(auditRecordsTable)
      .where(eq(auditRecordsTable.id, id));
    if (!row) {
      res.status(404).json({ error: "NOT_FOUND", message: `Record ${id} not found.` });
      return;
    }
    res.json(row);
  } catch (err) {
    logger.error({ err, id }, "audit/records/:id GET failed");
    const message = err instanceof Error ? err.message : "DB error";
    res.status(500).json({ error: "DB_ERROR", message });
  }
});

auditRouter.delete("/audit/records", async (_req, res) => {
  try {
    await db.delete(auditRecordsTable);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "audit/records DELETE all failed");
    const message = err instanceof Error ? err.message : "DB error";
    res.status(500).json({ error: "DB_ERROR", message });
  }
});

auditRouter.delete("/audit/records/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.delete(auditRecordsTable).where(eq(auditRecordsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id }, "audit/records/:id DELETE failed");
    const message = err instanceof Error ? err.message : "DB error";
    res.status(500).json({ error: "DB_ERROR", message });
  }
});

export default auditRouter;
