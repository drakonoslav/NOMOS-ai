import { AuditRecord } from "./audit_types";

const STORAGE_KEY = "nomos_audit_history_v1";

export function listAuditRecords(): AuditRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuditRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAuditRecord(record: AuditRecord): void {
  const records = listAuditRecords();
  const existingIndex = records.findIndex((r) => r.id === record.id);

  if (existingIndex >= 0) {
    records[existingIndex] = record;
  } else {
    records.unshift(record);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
  }
}

export function getAuditRecord(id: string): AuditRecord | null {
  const records = listAuditRecords();
  return records.find((r) => r.id === id) ?? null;
}

export function deleteAuditRecord(id: string): void {
  const records = listAuditRecords().filter((r) => r.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
  }
}

export function clearAuditRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
  }
}
