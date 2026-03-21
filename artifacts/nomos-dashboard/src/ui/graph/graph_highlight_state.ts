/**
 * graph_highlight_state.ts
 *
 * Deterministic helpers for building and querying GraphHighlightState.
 *
 * These functions take proof-step data (already computed during execution)
 * and map it to the UI highlight model.  No graph traversal is needed here —
 * all node IDs were captured during execution.
 *
 * Exported functions:
 *   buildHighlightStateFromProofStep(step, stepId) → GraphHighlightState
 *   getNodeHighlightRole(nodeId, state)             → GraphNodeHighlightRole
 *   isStepActive(stepId, state)                     → boolean
 *   clearHighlightState()                           → GraphHighlightState
 */

import type { GraphProofStep } from "../../graph/graph_proof_types.ts";
import type {
  GraphHighlightState,
  GraphNodeHighlightRole,
} from "./graph_highlight_types.ts";
import { NULL_HIGHLIGHT_STATE } from "./graph_highlight_types.ts";

/* =========================================================
   buildHighlightStateFromProofStep
   ========================================================= */

/**
 * Build a GraphHighlightState from a single proof step.
 *
 * The step already carries all node ID arrays from execution.
 * This function simply maps them to the canonical highlight model.
 *
 * @param step   — The GraphProofStep to map.
 * @param stepId — Stable identifier for this step (e.g. "C1-step-2").
 *                 Defaults to `step-${step.stepNumber}` if not provided.
 */
export function buildHighlightStateFromProofStep(
  step:   GraphProofStep,
  stepId?: string
): GraphHighlightState {
  return {
    activeProofStepId:     stepId ?? `step-${step.stepNumber}`,
    selectedNodeIds:       step.selectedNodeIds        ?? [],
    excludedNodeIds:       step.excludedNodeIds        ?? [],
    anchorNodeIds:         step.anchorNodeIds          ?? [],
    windowNodeIds:         step.windowNodeIds          ?? [],
    aggregateSourceNodeIds: step.aggregateSourceNodeIds ?? [],
  };
}

/* =========================================================
   getNodeHighlightRole
   ========================================================= */

/**
 * Determine the visual highlight role for a single node.
 *
 * Priority (highest → lowest):
 *   1. excluded          — always shown as error/muted even if also selected
 *   2. aggregateSource   — contributed to the aggregate
 *   3. selected          — survived filters
 *   4. window            — temporal/spatial window node
 *   5. anchor            — reference anchor node
 *   6. inactive          — not involved in this step (dimmed)
 *
 * @param nodeId — The graph node ID to classify.
 * @param state  — The current highlight state (null → all inactive).
 */
export function getNodeHighlightRole(
  nodeId: string,
  state:  GraphHighlightState | null
): GraphNodeHighlightRole {
  if (!state || state.activeProofStepId === null) return "inactive";

  if (state.excludedNodeIds.includes(nodeId))        return "excluded";
  if (state.aggregateSourceNodeIds.includes(nodeId)) return "aggregate-source";
  if (state.selectedNodeIds.includes(nodeId))        return "selected";
  if (state.windowNodeIds.includes(nodeId))          return "window";
  if (state.anchorNodeIds.includes(nodeId))          return "anchor";
  return "inactive";
}

/* =========================================================
   isStepActive
   ========================================================= */

/**
 * Return true if `stepId` matches the active step in `state`.
 */
export function isStepActive(
  stepId: string,
  state:  GraphHighlightState | null
): boolean {
  return state?.activeProofStepId === stepId;
}

/* =========================================================
   clearHighlightState
   ========================================================= */

/**
 * Return the null (no active step) highlight state.
 */
export function clearHighlightState(): GraphHighlightState {
  return { ...NULL_HIGHLIGHT_STATE };
}
