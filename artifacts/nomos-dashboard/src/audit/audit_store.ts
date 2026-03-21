/**
 * PERSISTENCE: SERVER_BACKED — Postgres via api-server /api/audit/records
 * Storage backend: audit_records table (lib/db schema)
 * Durability: durable — survives browser data wipe, incognito, and server restarts
 * Fallback: returns empty results on network error; write failures are silent
 *
 * All functions are async. Function names are unchanged from the former
 * localStorage version so callers need only add await.
 *
 * LOCAL NOTE:
 *   ui/audit/audit_log.ts (pipeline stage traces) remains client-only intentionally.
 *   That data is diagnostic/debug output, not governance state, and is not persisted here.
 */

import { AuditRecord } from "./audit_types";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const ENDPOINT = `${BASE}/api/audit/records`;

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function listAuditRecords(): Promise<AuditRecord[]> {
  try {
    const res = await apiFetch(ENDPOINT);
    if (!res.ok) return [];
    const rows = await res.json() as unknown[];
    return Array.isArray(rows) ? (rows as AuditRecord[]) : [];
  } catch {
    return [];
  }
}

export async function saveAuditRecord(record: AuditRecord): Promise<void> {
  try {
    await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify(record),
    });
  } catch {
  }
}

export async function getAuditRecord(id: string): Promise<AuditRecord | null> {
  try {
    const res = await apiFetch(`${ENDPOINT}/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return (await res.json()) as AuditRecord;
  } catch {
    return null;
  }
}

export async function deleteAuditRecord(id: string): Promise<void> {
  try {
    await apiFetch(`${ENDPOINT}/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
  }
}

export async function clearAuditRecords(): Promise<void> {
  try {
    await apiFetch(ENDPOINT, { method: "DELETE" });
  } catch {
  }
}
