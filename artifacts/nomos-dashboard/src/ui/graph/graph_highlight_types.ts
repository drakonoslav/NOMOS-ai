/**
 * graph_highlight_types.ts
 *
 * Canonical types for graph node highlighting driven by proof-step selection.
 *
 * When a user clicks a step in the GraphProofTracePanel, the panel emits a
 * GraphHighlightState that the OperandGraphView uses to apply distinct visual
 * roles to each node.
 *
 * Highlight roles (in decreasing visual priority):
 *   excluded          — node was present before this step but filtered out
 *   aggregateSource   — node actually contributed a value to the aggregate
 *   selected          — node survived all filters up to and including this step
 *   window            — temporal/spatial window node applied in this step
 *   anchor            — anchor node referenced in this step
 *   (no role)         — node was not involved in this step (dimmed)
 *
 * All node ID arrays contain graph node IDs from an OperandGraph.
 * The mapping is deterministic — the same proof step always produces the
 * same GraphHighlightState.
 */

export interface GraphHighlightState {
  /**
   * Stable step identifier, e.g. "${constraintId}-step-${stepNumber}".
   * Null when no step is active.
   */
  activeProofStepId: string | null;

  /** Node IDs that survived all filters up to this step. */
  selectedNodeIds: string[];

  /** Node IDs that were filtered out by this step. */
  excludedNodeIds: string[];

  /** Anchor node IDs referenced in this step (Window Restriction). */
  anchorNodeIds: string[];

  /** Window node IDs applied in this step (Window Restriction). */
  windowNodeIds: string[];

  /** Entity node IDs that contributed a non-zero value to the aggregate. */
  aggregateSourceNodeIds: string[];
}

/** A null highlight state — no step is active. */
export const NULL_HIGHLIGHT_STATE: GraphHighlightState = {
  activeProofStepId:     null,
  selectedNodeIds:       [],
  excludedNodeIds:       [],
  anchorNodeIds:         [],
  windowNodeIds:         [],
  aggregateSourceNodeIds: [],
};

/**
 * Visual role assigned to each node.
 * Used as a CSS class suffix: `gv-node--${GraphNodeHighlightRole}`.
 */
export type GraphNodeHighlightRole =
  | "excluded"
  | "aggregate-source"
  | "selected"
  | "window"
  | "anchor"
  | "inactive";
