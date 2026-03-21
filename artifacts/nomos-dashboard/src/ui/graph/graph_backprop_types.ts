/**
 * graph_backprop_types.ts
 *
 * Canonical types for graph node back-propagation.
 *
 * Back-propagation answers the question:
 *   "Given a node I can see in the graph, what role did it play in
 *    proof execution, constraint evaluation, and candidate structure?"
 *
 * This makes graph inspection and proof inspection fully bidirectional:
 *   proof step → highlights nodes in graph
 *   graph node → explains its role in every relevant proof step
 *
 * All references are built deterministically from actual execution data.
 * No roles are inferred — only roles explicitly recorded during proof execution.
 */

/* =========================================================
   Proof step reference
   ========================================================= */

/**
 * Describes the role a node played in one step of one proof trace.
 *
 * One reference per (node, step) pair — highest-priority role wins when
 * a node appears in multiple step arrays.
 *
 * Priority: excluded > aggregate_source > selected > anchor > window
 */
export type NodeRoleInStep =
  | "selected"
  | "excluded"
  | "anchor"
  | "window"
  | "aggregate_source";

export interface NodeProofReference {
  /** The constraint this proof trace belongs to. */
  constraintId: string;

  /**
   * Stable trace identifier — format "${constraintId}".
   * Used to cross-reference with the proof panel.
   */
  proofTraceId: string;

  /**
   * Stable step identifier — format "${constraintId}-step-${stepNumber}".
   * Used to select the matching step in the proof panel.
   */
  proofStepId: string;

  /** Human-readable step label (e.g. "Tag Filter"). */
  proofStepLabel: string;

  /** The role this node played in this step. */
  roleInStep: NodeRoleInStep;
}

/* =========================================================
   Constraint reference
   ========================================================= */

/**
 * Identifies a constraint that touched (referenced) this node in any step.
 */
export interface NodeConstraintReference {
  constraintId:    string;
  constraintLabel: string;
}

/* =========================================================
   Candidate reference
   ========================================================= */

/**
 * Identifies a candidate node this entity belongs to.
 * Derived from BELONGS_TO_CANDIDATE edges in the OperandGraph.
 */
export interface NodeCandidateReference {
  candidateId:    string;
  candidateLabel: string;
}

/* =========================================================
   Full back-prop record
   ========================================================= */

/**
 * Complete back-propagation record for a single graph node.
 *
 * One record exists per graph node in the back-prop index.
 * Nodes not touched by any proof step still have records —
 * with empty arrays and a "not referenced" summary line.
 */
export interface GraphNodeBackpropRecord {
  /** The graph node ID this record describes. */
  nodeId: string;

  /** One entry per (proof trace step) that referenced this node. */
  proofReferences: NodeProofReference[];

  /**
   * De-duplicated list of constraints that touched this node in any step.
   * Ordered by first appearance.
   */
  constraintReferences: NodeConstraintReference[];

  /**
   * Candidates this node belongs to (from BELONGS_TO_CANDIDATE edges).
   */
  candidateReferences: NodeCandidateReference[];

  /**
   * Human-readable summary lines for the detail panel.
   *
   * Examples:
   *   "This node was selected in 2 proof steps and excluded in 1."
   *   "This node belongs to candidate D."
   *   "This node participated in the fast-carb window constraint."
   */
  summaryLines: string[];
}

/* =========================================================
   Index type
   ========================================================= */

/** Maps graph node ID → GraphNodeBackpropRecord. */
export type GraphBackpropIndex = Map<string, GraphNodeBackpropRecord>;
