/**
 * governance_audit_trail.ts
 *
 * Governance audit trail for NOMOS.
 *
 * Every policy promotion or rollback is saved as a GovernanceAuditRecord with
 * full decision context. Records are immutable once written.
 *
 * Storage:
 *   localStorage key: "nomos_gov_audit_trail_v1"
 *   Format: JSON array of GovernanceAuditRecord[], most recent last.
 *
 * Functions:
 *   buildGovernanceAuditRecord(input)
 *     Constructs a GovernanceAuditRecord with a deterministic actionId.
 *     Does not persist.
 *
 *   saveGovernanceAuditRecord(record)
 *     Appends the record to localStorage. Never modifies existing records.
 *
 *   listGovernanceAuditRecords(domain?)
 *     Returns all records (optionally filtered by domain), most recent first.
 *
 *   getGovernanceAuditRecord(actionId)
 *     Returns a single record by actionId, or null if not found.
 *
 * actionId derivation:
 *   djb2 hash of: timestamp + domain + action + chosenPolicyVersionId +
 *                 (currentPolicyVersionId ?? "") + humanReason
 *   Formatted as "aud-XXXXXXXX" (8 lowercase hex chars).
 *
 * No LLM generation is used.
 */

import type {
  GovernanceAuditRecord,
  GovernanceAuditRecordInput,
} from "./governance_audit_types";

/* =========================================================
   Storage key
   ========================================================= */

const STORAGE_KEY = "nomos_gov_audit_trail_v1";

/* =========================================================
   djb2 hash (same algorithm used elsewhere in NOMOS)
   ========================================================= */

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function auditId(input: GovernanceAuditRecordInput): string {
  const raw =
    input.timestamp +
    input.domain +
    input.action +
    input.chosenPolicyVersionId +
    (input.currentPolicyVersionId ?? "") +
    (input.recommendedPolicyVersionId ?? "") +
    input.humanReason;
  const hash = djb2(raw).toString(16).padStart(8, "0");
  return `aud-${hash}`;
}

/* =========================================================
   buildGovernanceAuditRecord
   ========================================================= */

/**
 * Constructs a GovernanceAuditRecord from a GovernanceAuditRecordInput.
 *
 * The actionId is derived deterministically from key input fields.
 * Calling this with the same input always produces the same actionId.
 *
 * Does not persist. Call saveGovernanceAuditRecord to persist.
 * Does not mutate the input.
 */
export function buildGovernanceAuditRecord(
  input: GovernanceAuditRecordInput
): GovernanceAuditRecord {
  if (!input.chosenPolicyVersionId) {
    throw new Error("chosenPolicyVersionId is required for a governance audit record.");
  }
  if (!input.humanReason.trim()) {
    throw new Error("humanReason is required for a governance audit record.");
  }

  return {
    actionId: auditId(input),
    timestamp: input.timestamp,
    domain: input.domain,
    action: input.action,
    currentPolicyVersionId: input.currentPolicyVersionId,
    recommendedPolicyVersionId: input.recommendedPolicyVersionId,
    chosenPolicyVersionId: input.chosenPolicyVersionId,
    expectedGains: [...input.expectedGains],
    expectedTradeoffs: [...input.expectedTradeoffs],
    expectedRisks: [...input.expectedRisks],
    recommendationStrength: input.recommendationStrength,
    recommendationConfidence: input.recommendationConfidence,
    humanReason: input.humanReason,
    benchEvidenceSummary: [...input.benchEvidenceSummary],
    recommendationSummary: [...input.recommendationSummary],
  };
}

/* =========================================================
   Storage helpers
   ========================================================= */

function readTrail(): GovernanceAuditRecord[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as GovernanceAuditRecord[];
  } catch {
    return [];
  }
}

function writeTrail(records: GovernanceAuditRecord[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // storage unavailable — silently ignore
  }
}

/* =========================================================
   saveGovernanceAuditRecord
   ========================================================= */

/**
 * Appends a GovernanceAuditRecord to the audit trail in localStorage.
 *
 * Existing records are never modified. If a record with the same actionId
 * already exists, the new record is still appended (idempotent duplicates
 * are the responsibility of the caller to avoid).
 */
export function saveGovernanceAuditRecord(record: GovernanceAuditRecord): void {
  const existing = readTrail();
  writeTrail([...existing, record]);
}

/* =========================================================
   listGovernanceAuditRecords
   ========================================================= */

/**
 * Returns all governance audit records, most recent first.
 *
 * If domain is provided, only records for that domain are returned.
 */
export function listGovernanceAuditRecords(
  domain?: GovernanceAuditRecord["domain"]
): GovernanceAuditRecord[] {
  const all = readTrail();
  const filtered = domain ? all.filter((r) => r.domain === domain) : all;
  return [...filtered].reverse();
}

/* =========================================================
   getGovernanceAuditRecord
   ========================================================= */

/**
 * Returns the GovernanceAuditRecord with the given actionId, or null
 * if no such record exists in the trail.
 */
export function getGovernanceAuditRecord(
  actionId: string
): GovernanceAuditRecord | null {
  const all = readTrail();
  return all.find((r) => r.actionId === actionId) ?? null;
}

/* =========================================================
   clearGovernanceAuditTrail (testing / reset only)
   ========================================================= */

/**
 * Clears the entire audit trail from localStorage.
 * Only for use in tests and development reset flows.
 * Historical production records must never be cleared.
 */
export function clearGovernanceAuditTrail(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // noop
  }
}
