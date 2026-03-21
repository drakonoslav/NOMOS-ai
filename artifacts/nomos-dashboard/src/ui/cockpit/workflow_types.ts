/**
 * workflow_types.ts
 *
 * Canonical types for NOMOS cockpit guided role workflows.
 *
 * Guided workflows are deterministic navigation recommendations —
 * not automation, not wizards, not silent decision-makers.
 *
 * A workflow tells the user where to look next in a sensible
 * domain-appropriate order.  It does not complete steps on their
 * behalf or infer their intent.
 *
 * No LLM generation. No state mutation.
 */

import type { CockpitRoleMode } from "./role_view_types";

/**
 * A single step in a role workflow.
 *
 * id:            stable identifier for this step (e.g. "builder-step-1").
 * title:         short action-oriented label (e.g. "Inspect current alert").
 * description:   one or two sentences explaining what to look for in this step.
 * targetCardId:  the cockpit card or panel ID this step routes to.
 */
export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  targetCardId: string;
}

/**
 * The full guided workflow for a role mode.
 *
 * mode:    which role mode this workflow applies to.
 * title:   display title (e.g. "Builder Workflow").
 * summary: one-sentence description of the workflow's intent.
 * steps:   ordered list of navigation steps.
 */
export interface RoleWorkflow {
  mode: CockpitRoleMode;
  title: string;
  summary: string;
  steps: WorkflowStep[];
}
