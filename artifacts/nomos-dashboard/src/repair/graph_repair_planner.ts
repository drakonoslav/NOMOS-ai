/**
 * graph_repair_planner.ts
 *
 * Deterministic repair plan generator for NOMOS.
 *
 * buildGraphRepairPlan(graph, constraintDiff) examines the violated constraint,
 * detects the violation type, and produces a minimal GraphRepairPlan.
 *
 * Violation types:
 *   undershoot      — observed < threshold (for >= / > constraints)
 *   overshoot       — observed > threshold (for <= / < constraints)
 *   window_failure  — qualifying entities exist but are outside the window
 *   structural_failure — no qualifying entities found at all
 *
 * Minimality order (least to most invasive):
 *   1. UPDATE_QUANTITY       (change an amount on an existing node)
 *   2. UPDATE_RELATION_OFFSET (change a temporal offset on an existing edge)
 *   3. ADD_ENTITY            (create a new node with measures + relation)
 *   4. REMOVE_ENTITY         (delete an existing node)
 *   5. Multiple actions      (score penalty per additional action)
 *
 * Design invariants:
 *   - No LLM calls.
 *   - No text re-parsing.
 *   - Every action references a real node or edge ID from the graph.
 *   - If no qualifying node is found, ADD_ENTITY is used as fallback.
 */

import type { CanonicalGraph, CanonicalGraphNode, CanonicalGraphEdge } from "../graph/canonical_graph_types.ts";
import type {
  GraphRepairPlan,
  GraphRepairAction,
  ConstraintDiffInput,
} from "./graph_repair_types.ts";

/* =========================================================
   Helpers
   ========================================================= */

let actionCounter = 0;
function nextActionId(): string {
  return `ra_${actionCounter++}`;
}

/** Reset counter — for deterministic tests. */
export function resetActionCounter(): void {
  actionCounter = 0;
}

let planCounter = 0;
function nextPlanId(constraintId: string): string {
  return `plan_${constraintId}_${planCounter++}`;
}

export function resetPlanCounter(): void {
  planCounter = 0;
}

function getNodeMeasureAmount(node: CanonicalGraphNode, unit: string): number | null {
  const measures = node.data?.measures as Array<{ amount: number; unit: string; unitNormalized?: string }> | undefined;
  if (!Array.isArray(measures)) return null;
  const m = measures.find(
    (m) =>
      m.unit.toLowerCase() === unit.toLowerCase() ||
      (m.unitNormalized ?? "").toLowerCase() === unit.toLowerCase()
  );
  return m?.amount ?? null;
}

function getNodeTags(node: CanonicalGraphNode): string[] {
  const raw = node.data?.tags;
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).map(String).map((t) => t.toLowerCase());
}

function nodeMatchesTags(node: CanonicalGraphNode, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const nodeTags = getNodeTags(node);
  return tags.every((t) => nodeTags.includes(t.toLowerCase()));
}

function getOutEdges(graph: CanonicalGraph, nodeId: string): CanonicalGraphEdge[] {
  return graph.edges.filter((e) => e.from === nodeId);
}

function getOffsetMinutes(edge: CanonicalGraphEdge): number | null {
  const offset = edge.data?.offset as { amount?: number; unit?: string } | undefined;
  if (!offset?.amount) return null;
  const u = (offset.unit ?? "min").toLowerCase();
  if (u === "min" || u === "minutes" || u === "minute") return offset.amount;
  if (u === "h"   || u === "hr" || u === "hours" || u === "hour") return offset.amount * 60;
  return offset.amount;
}

function findAnchorNode(graph: CanonicalGraph, label: string): CanonicalGraphNode | undefined {
  const lower = label.toLowerCase();
  return graph.nodes.find((n) => n.kind === "anchor" && n.label.toLowerCase() === lower);
}

/* =========================================================
   Violation type detection
   ========================================================= */

type ViolationType = "undershoot" | "overshoot" | "window_failure" | "structural_failure";

function detectViolationType(input: ConstraintDiffInput): ViolationType {
  const { spec, diff, proof } = input;

  // No entity nodes made it through tag filter (step 2)
  const tagStep = proof.steps.find((s) => s.label === "Tag Filter");
  const afterTagCount = tagStep?.selectedNodeIds?.length ?? 0;
  if (afterTagCount === 0) return "structural_failure";

  // Entities had correct tags but were excluded by window restriction (step 4)
  const windowStep = proof.steps.find((s) => s.label === "Window Restriction");
  const windowExcluded = windowStep?.excludedNodeIds?.length ?? 0;
  if (windowExcluded > 0 && afterTagCount > 0 && diff.deltaRequired > 0) {
    return "window_failure";
  }

  // Numeric undershoot: observed < threshold for >= / >
  if (spec.operator === ">=" || spec.operator === ">") return "undershoot";

  // Numeric overshoot: observed > threshold for <= / <
  if (spec.operator === "<=" || spec.operator === "<") return "overshoot";

  return "undershoot";
}

/* =========================================================
   Minimality score
   ========================================================= */

function computeMinimalityScore(actions: GraphRepairAction[]): number {
  if (actions.length === 0) return 1.0;

  const primaryScore: Record<string, number> = {
    UPDATE_QUANTITY:        0.90,
    UPDATE_RELATION_OFFSET: 0.80,
    ADD_ENTITY:             0.60,
    ADD_RELATION:           0.60,
    REMOVE_ENTITY:          0.50,
    REMOVE_RELATION:        0.55,
    MOVE_ENTITY_TO_CANDIDATE: 0.65,
    UPDATE_UNIT:            0.85,
    ADD_TAG:                0.70,
    REMOVE_TAG:             0.70,
  };

  const base = primaryScore[actions[0].type] ?? 0.5;
  const penalty = Math.max(0, (actions.length - 1) * 0.05);
  return Math.max(0, Math.round((base - penalty) * 100) / 100);
}

/* =========================================================
   Repair generators per violation type
   ========================================================= */

function planUndershoot(
  graph: CanonicalGraph,
  input: ConstraintDiffInput
): GraphRepairAction[] {
  const { spec, diff } = input;
  const unit = diff.unit;
  const delta = diff.deltaRequired;
  const tags = spec.selection.entityTags ?? [];

  // Find a qualifying existing entity node with the right tags
  const qualifyingNodes = graph.nodes.filter(
    (n) => (n.kind === "entity" || n.kind === "quantity") && nodeMatchesTags(n, tags)
  );

  if (qualifyingNodes.length > 0) {
    const node = qualifyingNodes[0];
    const current = getNodeMeasureAmount(node, unit) ?? 0;
    const newAmount = current + delta;
    return [
      {
        id:           nextActionId(),
        type:         "UPDATE_QUANTITY",
        targetNodeId: node.id,
        targetEdgeId: null,
        payload:      { unit, newAmount, previousAmount: current },
        rationale:    `increase ${node.label} from ${current}${unit} to ${newAmount}${unit} to meet ${spec.operator}${spec.threshold}${unit} threshold`,
      },
    ];
  }

  // No qualifying node — add a new entity
  const anchorLabel = spec.selection.anchorLabel;
  const relation    = spec.selection.relation ?? "before";
  return [
    {
      id:           nextActionId(),
      type:         "ADD_ENTITY",
      targetNodeId: null,
      targetEdgeId: null,
      payload: {
        label:       `supplemental-${unit}-source`,
        tags,
        measures:    [{ amount: delta, unit, unitNormalized: unit, dimension: "mass" }],
        kind:        "entity",
        anchorLabel: anchorLabel ?? null,
        relation,
        offsetAmount: 30,
        offsetUnit:  "min",
      },
      rationale: `add new entity with ${delta}${unit} (${tags.join("+")} tagged) connected ${relation} ${anchorLabel ?? "anchor"} to satisfy ${spec.operator}${spec.threshold}${unit}`,
    },
  ];
}

function planOvershoot(
  graph: CanonicalGraph,
  input: ConstraintDiffInput
): GraphRepairAction[] {
  const { spec, diff } = input;
  const unit      = diff.unit;
  const excess    = diff.deltaRequired;
  const targetIds = diff.targetNodeIds;
  const tags      = spec.selection.entityTags ?? [];

  if (targetIds.length > 0) {
    const node = graph.nodes.find((n) => n.id === targetIds[0]);
    if (node) {
      const current = getNodeMeasureAmount(node, unit) ?? 0;
      const newAmount = Math.max(0, current - excess);
      return [
        {
          id:           nextActionId(),
          type:         "UPDATE_QUANTITY",
          targetNodeId: node.id,
          targetEdgeId: null,
          payload:      { unit, newAmount, previousAmount: current },
          rationale:    `reduce ${node.label} from ${current}${unit} to ${newAmount}${unit} to satisfy ${spec.operator}${spec.threshold}${unit} constraint`,
        },
      ];
    }
  }

  // No target node — find a qualifying node to reduce
  const qualifyingNodes = graph.nodes.filter(
    (n) => (n.kind === "entity" || n.kind === "quantity") && nodeMatchesTags(n, tags)
  );
  if (qualifyingNodes.length > 0) {
    const node      = qualifyingNodes[0];
    const current   = getNodeMeasureAmount(node, unit) ?? 0;
    const newAmount = Math.max(0, current - excess);
    return [
      {
        id:           nextActionId(),
        type:         "UPDATE_QUANTITY",
        targetNodeId: node.id,
        targetEdgeId: null,
        payload:      { unit, newAmount, previousAmount: current },
        rationale:    `reduce ${node.label} from ${current}${unit} to ${newAmount}${unit} to satisfy ${spec.operator}${spec.threshold}${unit} constraint`,
      },
    ];
  }

  // Last resort — remove an entity
  const nodeId = targetIds[0] ?? graph.nodes.find((n) => n.kind === "entity")?.id ?? null;
  return [
    {
      id:           nextActionId(),
      type:         "REMOVE_ENTITY",
      targetNodeId: nodeId,
      targetEdgeId: null,
      payload:      { label: "disallowed-entity" },
      rationale:    `remove entity to reduce aggregate below ${spec.operator}${spec.threshold}${unit} threshold`,
    },
  ];
}

function planWindowFailure(
  graph: CanonicalGraph,
  input: ConstraintDiffInput
): GraphRepairAction[] {
  const { spec, proof } = input;
  const windowStep   = proof.steps.find((s) => s.label === "Window Restriction");
  const excludedIds  = windowStep?.excludedNodeIds ?? [];
  const windowMinutes = spec.selection.windowMinutes ?? 90;
  const anchorLabel   = spec.selection.anchorLabel;
  const relation      = spec.selection.relation ?? "before";

  if (excludedIds.length > 0) {
    const node = graph.nodes.find((n) => n.id === excludedIds[0]);
    if (node) {
      // Find the edge from this node to the anchor
      const anchorNode    = anchorLabel ? findAnchorNode(graph, anchorLabel) : undefined;
      const anchorId      = anchorNode?.id ?? null;
      const outEdges      = getOutEdges(graph, node.id);
      const relEdge       = outEdges.find((e) => {
        const kindMatch = e.kind.toLowerCase() === relation.toLowerCase();
        const toMatch   = anchorId ? e.to === anchorId : true;
        return kindMatch && toMatch;
      });

      if (relEdge) {
        const currentOffsetMin = getOffsetMinutes(relEdge) ?? 120;
        const newOffsetMin     = Math.min(windowMinutes - 15, currentOffsetMin);
        return [
          {
            id:           nextActionId(),
            type:         "UPDATE_RELATION_OFFSET",
            targetNodeId: node.id,
            targetEdgeId: relEdge.id,
            payload: {
              previousOffsetAmount: currentOffsetMin,
              newOffsetAmount:      newOffsetMin,
              unit:                 "min",
            },
            rationale:    `move ${node.label} from ${currentOffsetMin}min to ${newOffsetMin}min before ${anchorLabel ?? "anchor"} to enter ${windowMinutes}min admissible window`,
          },
        ];
      }

      // Edge not found — add a relation at the correct offset
      const targetOffset = Math.min(windowMinutes - 15, 75);
      return [
        {
          id:           nextActionId(),
          type:         "ADD_RELATION",
          targetNodeId: node.id,
          targetEdgeId: null,
          payload: {
            fromNodeId:  node.id,
            toNodeId:    anchorId ?? "anc_unknown",
            kind:        relation,
            offset:      { amount: targetOffset, unit: "min" },
            confidence:  0.95,
          },
          rationale:    `add ${relation} relation from ${node.label} to ${anchorLabel ?? "anchor"} at ${targetOffset}min (within ${windowMinutes}min window)`,
        },
      ];
    }
  }

  // No excluded node IDs in proof — generic window expansion
  const targetOffset = Math.min(windowMinutes - 15, 75);
  return [
    {
      id:           nextActionId(),
      type:         "ADD_ENTITY",
      targetNodeId: null,
      targetEdgeId: null,
      payload: {
        label:       "corrected-entity",
        tags:        spec.selection.entityTags ?? [],
        measures:    [{ amount: input.diff.deltaRequired || 30, unit: input.diff.unit, unitNormalized: input.diff.unit }],
        kind:        "entity",
        anchorLabel: anchorLabel ?? null,
        relation,
        offsetAmount: targetOffset,
        offsetUnit:  "min",
      },
      rationale:    `add correctly-timed entity at ${targetOffset}min before ${anchorLabel ?? "anchor"} (within ${windowMinutes}min window)`,
    },
  ];
}

function planStructuralFailure(
  graph: CanonicalGraph,
  input: ConstraintDiffInput
): GraphRepairAction[] {
  const { spec, diff } = input;
  const tags        = spec.selection.entityTags ?? [];
  const anchorLabel = spec.selection.anchorLabel;
  const relation    = spec.selection.relation ?? "before";
  const unit        = diff.unit;
  const amount      = spec.threshold;
  const windowMin   = spec.selection.windowMinutes ?? 90;
  const targetOffset = Math.min(windowMin - 15, 60);

  const actions: GraphRepairAction[] = [];

  // Add a new entity with the right tags
  actions.push({
    id:           nextActionId(),
    type:         "ADD_ENTITY",
    targetNodeId: null,
    targetEdgeId: null,
    payload: {
      label:       `${tags.join("-")}-source`,
      tags,
      measures:    [{ amount, unit, unitNormalized: unit, dimension: "mass" }],
      kind:        "entity",
      anchorLabel: anchorLabel ?? null,
      relation,
      offsetAmount: targetOffset,
      offsetUnit:  "min",
    },
    rationale:    `add ${tags.join("+")} entity with ${amount}${unit} at ${targetOffset}min before ${anchorLabel ?? "anchor"} to satisfy structural requirement`,
  });

  return actions;
}

/* =========================================================
   Expected repair effect lines
   ========================================================= */

function buildExpectedEffect(
  input: ConstraintDiffInput,
  actions: GraphRepairAction[],
  violationType: ViolationType
): string[] {
  const { spec, diff } = input;
  const lines: string[] = [];

  switch (violationType) {
    case "undershoot":
      lines.push(
        `${spec.aggregation.aggregation}(${diff.unit}) will increase by ${diff.deltaRequired}${diff.unit}`,
        `expected observed value after repair: ${diff.deltaRequired + (spec.threshold - diff.deltaRequired)}${diff.unit}`,
        `constraint '${spec.label}' expected to pass`
      );
      break;
    case "overshoot":
      lines.push(
        `${spec.aggregation.aggregation}(${diff.unit}) will decrease by ${diff.deltaRequired}${diff.unit}`,
        `constraint '${spec.label}' expected to pass`
      );
      break;
    case "window_failure":
      lines.push(
        `entity will be repositioned inside ${spec.selection.windowMinutes ?? 90}min window`,
        `qualifying entities within window will increase`,
        `constraint '${spec.label}' expected to pass`
      );
      break;
    case "structural_failure":
      lines.push(
        `new ${(spec.selection.entityTags ?? []).join("+")} entity will be added`,
        `qualifying entity count: 0 → 1`,
        `constraint '${spec.label}' expected to pass`
      );
      break;
  }

  lines.push(`${actions.length} action(s) applied in order`);
  return lines;
}

/* =========================================================
   Public entry point
   ========================================================= */

/**
 * Build a deterministic graph repair plan for a violated constraint.
 *
 * @param graph          The original (un-repaired) CanonicalGraph.
 * @param constraintDiff The diff + spec + proof from graph-first evaluation.
 * @returns              A GraphRepairPlan with ordered actions and minimality score.
 */
export function buildGraphRepairPlan(
  graph: CanonicalGraph,
  constraintDiff: ConstraintDiffInput
): GraphRepairPlan {
  const { spec, diff } = constraintDiff;

  // If already passing, return empty plan
  if (diff.alreadyPassing) {
    return {
      id:                      nextPlanId(spec.constraintId),
      constraintId:            spec.constraintId,
      variableName:            spec.label,
      actions:                 [],
      expectedRepairEffect:    [`constraint '${spec.label}' is already passing — no repair needed`],
      estimatedMinimalityScore: 1.0,
      violationType:           "undershoot",
    };
  }

  const violationType = detectViolationType(constraintDiff);

  let actions: GraphRepairAction[];
  switch (violationType) {
    case "undershoot":
      actions = planUndershoot(graph, constraintDiff);
      break;
    case "overshoot":
      actions = planOvershoot(graph, constraintDiff);
      break;
    case "window_failure":
      actions = planWindowFailure(graph, constraintDiff);
      break;
    case "structural_failure":
      actions = planStructuralFailure(graph, constraintDiff);
      break;
  }

  const score  = computeMinimalityScore(actions);
  const effect = buildExpectedEffect(constraintDiff, actions, violationType);

  return {
    id:                      nextPlanId(spec.constraintId),
    constraintId:            spec.constraintId,
    variableName:            spec.label,
    actions,
    expectedRepairEffect:    effect,
    estimatedMinimalityScore: score,
    violationType,
  };
}
