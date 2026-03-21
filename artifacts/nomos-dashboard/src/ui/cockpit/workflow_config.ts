/**
 * workflow_config.ts
 *
 * Deterministic guided workflow definitions for each NOMOS cockpit role mode.
 *
 * getRoleWorkflow(mode) returns the full RoleWorkflow for a given role.
 * All four workflows are defined statically — no inference, no LLM generation.
 *
 * Workflows are guidance only.  They do not execute any action or complete
 * steps on behalf of the user.
 */

import type { CockpitRoleMode } from "./role_view_types";
import type { RoleWorkflow } from "./workflow_types";
import { COCKPIT_CARD_IDS as C } from "./role_view_types";

/* =========================================================
   Builder workflow
   ========================================================= */

const BUILDER_WORKFLOW: RoleWorkflow = {
  mode: "builder",
  title: "Builder Workflow",
  summary:
    "Inspect the system structure, identify constraint failures, trace formulas, and locate the root cause of any degradation.",
  steps: [
    {
      id: "builder-step-1",
      title: "Inspect current attention alerts",
      description:
        "Begin here to identify any detected issues: shallow history, churn, low calibration, or failing constraints.",
      targetCardId: C.ATTENTION,
    },
    {
      id: "builder-step-2",
      title: "Open trace / proof source",
      description:
        "Navigate to the health traceability panel to inspect exact inputs, formula lines, and contributing record IDs for each component score.",
      targetCardId: C.TRACEABILITY,
    },
    {
      id: "builder-step-3",
      title: "Inspect invariant break or evaluator mismatch",
      description:
        "Review the diff panel for baseline vs candidate divergence. Check whether a parser or evaluator output differs from expected constraints.",
      targetCardId: C.DIFF,
    },
    {
      id: "builder-step-4",
      title: "Inspect formula or health trace if needed",
      description:
        "If a component score is unexpectedly low, open the traceability detail for that component to verify the exact weighted formula used.",
      targetCardId: C.TRACEABILITY,
    },
  ],
};

/* =========================================================
   Auditor workflow
   ========================================================= */

const AUDITOR_WORKFLOW: RoleWorkflow = {
  mode: "auditor",
  title: "Auditor Workflow",
  summary:
    "Validate that system outputs are correct, traceable, and consistent with the underlying evidence.",
  steps: [
    {
      id: "auditor-step-1",
      title: "Open candidate proof trace",
      description:
        "Start with the health traceability panel to inspect the exact inputs, formula, and record IDs behind each component score.",
      targetCardId: C.TRACEABILITY,
    },
    {
      id: "auditor-step-2",
      title: "Compare with prior run diff",
      description:
        "Open the diff panel to verify that changes between the baseline and candidate policy are consistent with the stated expected gains.",
      targetCardId: C.DIFF,
    },
    {
      id: "auditor-step-3",
      title: "Inspect health traceability",
      description:
        "Review the full health trace to confirm every component score is explainable from its raw inputs. Check for missing or null inputs.",
      targetCardId: C.TRACEABILITY,
    },
    {
      id: "auditor-step-4",
      title: "Verify satisfaction vs verdict consistency",
      description:
        "Cross-reference the audit history to confirm that governance outcomes recorded in the review report match the health index trajectory.",
      targetCardId: C.AUDIT_HISTORY,
    },
  ],
};

/* =========================================================
   Governor workflow
   ========================================================= */

const GOVERNOR_WORKFLOW: RoleWorkflow = {
  mode: "governor",
  title: "Governor Workflow",
  summary:
    "Review the policy recommendation, assess doctrine alignment, and reach a justified governance decision.",
  steps: [
    {
      id: "governor-step-1",
      title: "Review policy recommendation",
      description:
        "Open the recommendation panel to see the bench-recommended policy, its strength, confidence, and stated expected gains.",
      targetCardId: C.RECOMMENDATION,
    },
    {
      id: "governor-step-2",
      title: "Inspect doctrine crosswalk",
      description:
        "Review which heuristics support or caution against the recommendation. Check whether cautions outnumber supporting doctrine.",
      targetCardId: C.DOCTRINE,
    },
    {
      id: "governor-step-3",
      title: "Review gains, tradeoffs, and risks",
      description:
        "Examine the expected gains, accepted tradeoffs, and flagged risks from the governance state panel before committing to a decision.",
      targetCardId: C.GOVERNANCE,
    },
    {
      id: "governor-step-4",
      title: "Open deliberation summary",
      description:
        "Review the deliberation summary to understand the reasoning chain, counterarguments considered, and final recommendation rationale.",
      targetCardId: C.DELIBERATION,
    },
    {
      id: "governor-step-5",
      title: "Proceed to governance action if justified",
      description:
        "If evidence supports action and doctrine is aligned, proceed to the governance panel to record your decision, rationale, and outcome expectations.",
      targetCardId: C.GOVERNANCE,
    },
  ],
};

/* =========================================================
   Operator workflow
   ========================================================= */

const OPERATOR_WORKFLOW: RoleWorkflow = {
  mode: "operator",
  title: "Operator Workflow",
  summary:
    "Assess the current system state quickly, identify what needs attention, and determine if governance action is warranted.",
  steps: [
    {
      id: "operator-step-1",
      title: "Inspect ecosystem health",
      description:
        "Start with the health card to assess the overall score, band, and which component is the weakest.",
      targetCardId: C.HEALTH,
    },
    {
      id: "operator-step-2",
      title: "Inspect current prediction state",
      description:
        "Review the failure prediction card to understand the current risk direction, predicted mode, and prediction confidence.",
      targetCardId: C.PREDICTION,
    },
    {
      id: "operator-step-3",
      title: "Inspect attention alerts",
      description:
        "Check all active alerts to determine if any issue requires immediate review — calibration fragility, churn, recurring violations.",
      targetCardId: C.ATTENTION,
    },
    {
      id: "operator-step-4",
      title: "Review active policy and governance state if needed",
      description:
        "If alerts reference governance or policy issues, open the governance and policy cards to understand what is active and whether a change is warranted.",
      targetCardId: C.GOVERNANCE,
    },
  ],
};

/* =========================================================
   Map and export
   ========================================================= */

const WORKFLOW_MAP: Record<CockpitRoleMode, RoleWorkflow> = {
  builder:  BUILDER_WORKFLOW,
  auditor:  AUDITOR_WORKFLOW,
  governor: GOVERNOR_WORKFLOW,
  operator: OPERATOR_WORKFLOW,
};

/**
 * Returns the guided workflow for the given role mode.
 *
 * Deterministic — the same mode always returns the same workflow.
 * No inputs are mutated.
 */
export function getRoleWorkflow(mode: CockpitRoleMode): RoleWorkflow {
  return WORKFLOW_MAP[mode];
}

/**
 * Returns all four role workflows in a stable display order.
 */
export function getAllRoleWorkflows(): RoleWorkflow[] {
  return [
    BUILDER_WORKFLOW,
    AUDITOR_WORKFLOW,
    GOVERNOR_WORKFLOW,
    OPERATOR_WORKFLOW,
  ];
}
