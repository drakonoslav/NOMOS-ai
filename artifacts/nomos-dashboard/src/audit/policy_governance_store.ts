/**
 * policy_governance_store.ts
 *
 * Persists and retrieves PolicyGovernanceState from localStorage.
 *
 * Used by evaluation entry points (e.g. QueryBuilderPage) to read the active
 * governance state before building routing decisions, and by PolicyGovernancePanel
 * to persist governance actions.
 *
 * Storage key is versioned so schema changes don't silently corrupt state.
 */

import type { PolicyGovernanceState } from "./policy_governance_types";
import { EMPTY_GOVERNANCE_STATE } from "./policy_governance_types";

const GOVERNANCE_STORAGE_KEY = "nomos_governance_state_v1";

/**
 * Reads the current governance state from localStorage.
 * Returns EMPTY_GOVERNANCE_STATE on missing or malformed data.
 */
export function readGovernanceState(): PolicyGovernanceState {
  try {
    const raw = localStorage.getItem(GOVERNANCE_STORAGE_KEY);
    if (!raw) return EMPTY_GOVERNANCE_STATE;
    const parsed = JSON.parse(raw) as PolicyGovernanceState;
    if (!parsed || typeof parsed !== "object") return EMPTY_GOVERNANCE_STATE;
    return parsed;
  } catch {
    return EMPTY_GOVERNANCE_STATE;
  }
}

/**
 * Writes the governance state to localStorage.
 * Silent on write failure (e.g. storage quota exceeded).
 */
export function writeGovernanceState(state: PolicyGovernanceState): void {
  try {
    localStorage.setItem(GOVERNANCE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Silent — cannot write to localStorage
  }
}

/**
 * Clears the persisted governance state.
 * Only used for testing or explicit reset flows.
 */
export function clearGovernanceState(): void {
  try {
    localStorage.removeItem(GOVERNANCE_STORAGE_KEY);
  } catch {
    // Silent
  }
}
