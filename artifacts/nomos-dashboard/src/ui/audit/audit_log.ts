/**
 * audit_log.ts
 *
 * Client-side audit log for NOMOS UI.
 * Records pipeline stage traces from live evaluations.
 *
 * PERSISTENCE: IN_MEMORY_CLIENT_ONLY
 * Storage backend: browser localStorage (key: "nomos_ui_audit_log")
 * Durability: none — clears on browser data wipe, private/incognito session end,
 *             or explicit user action. Not replicated, not server-backed.
 * Classification: client convenience / local audit trail
 * Server-side durable storage: NOT wired
 * This is NOT immutable infrastructure. Do not treat as canonical truth.
 */

export interface AuditEntry {
  id: string;
  runId: string;
  timestamp: number;
  stage: string;
  payload: unknown;
}

export interface AuditRun {
  runId: string;
  startedAt: number;
  label?: string;
}

const STORAGE_KEY = "nomos_ui_audit_log";

export class AuditLog {
  private entries: AuditEntry[] = [];
  private runs: AuditRun[] = [];
  private currentRunId: string | null = null;

  startRun(label?: string): string {
    this.currentRunId = crypto.randomUUID();
    this.runs.push({
      runId: this.currentRunId,
      startedAt: Date.now(),
      label,
    });
    this.persist();
    return this.currentRunId;
  }

  record(stage: string, payload: unknown): void {
    if (!this.currentRunId) {
      this.startRun();
    }
    this.entries.push({
      id: crypto.randomUUID(),
      runId: this.currentRunId!,
      timestamp: Date.now(),
      stage,
      payload,
    });
    this.persist();
  }

  getRuns(): AuditRun[] {
    return [...this.runs].reverse();
  }

  getEntries(): AuditEntry[] {
    return this.entries;
  }

  getEntriesByRun(runId: string): AuditEntry[] {
    return this.entries.filter((e) => e.runId === runId);
  }

  clear(): void {
    this.entries = [];
    this.runs = [];
    this.currentRunId = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.entries = parsed.entries ?? [];
      this.runs = parsed.runs ?? [];
    } catch {}
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        entries: this.entries,
        runs: this.runs,
      }));
    } catch {}
  }
}
