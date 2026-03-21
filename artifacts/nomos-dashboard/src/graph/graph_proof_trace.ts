/**
 * graph_proof_trace.ts
 *
 * Builds a GraphConstraintProofTrace from a graph and a constraint spec.
 *
 * The trace captures every query step that the constraint executor runs,
 * recording which node IDs survived and which were excluded at each stage.
 *
 * This function runs the full execution pipeline internally so the trace
 * reflects actual execution rather than a post hoc summary.
 *
 * Steps produced (where applicable):
 *   1. Candidate Selection   — selectCandidateEntities
 *   2. Tag Filter            — filterEntitiesByTags
 *   3. Label Filter          — filterEntitiesByLabels
 *   4. Window Restriction    — restrictEntitiesByAnchorWindow
 *   5. Aggregation           — aggregateSelectedQuantity
 *   6. Threshold Comparison  — compare against threshold
 */

import type { OperandGraph, GraphNode } from "./operand_graph_types.ts";
import type { GraphConstraintSpec }     from "./graph_constraint_types.ts";
import type {
  GraphConstraintProofTrace,
  GraphProofStep,
} from "./graph_proof_types.ts";
import {
  selectCandidateEntities,
  filterEntitiesByTags,
  filterEntitiesByLabels,
  restrictEntitiesByAnchorWindow,
  aggregateSelectedQuantity,
} from "./graph_query_engine.ts";

/* =========================================================
   Internal helpers
   ========================================================= */

function nodeById(graph: OperandGraph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

function nodeLabel(graph: OperandGraph, id: string): string {
  return nodeById(graph, id)?.label ?? id;
}

/** Plural-aware "entity" / "entities". */
function entityWord(n: number): string {
  return n === 1 ? "entity" : "entities";
}

/** Comma-joined label list for a set of node IDs. */
function labelList(graph: OperandGraph, ids: string[]): string {
  if (ids.length === 0) return "(none)";
  return ids.map((id) => nodeLabel(graph, id)).join(", ");
}

/** Compare helper matching graph_constraint_executor logic. */
function compare(
  observed: number,
  operator: GraphConstraintSpec["operator"],
  threshold: number
): boolean {
  switch (operator) {
    case ">=": return observed >= threshold;
    case "<=": return observed <= threshold;
    case ">":  return observed >  threshold;
    case "<":  return observed <  threshold;
    case "==": return observed === threshold;
  }
}

/**
 * Find window node IDs connected to the surviving entity IDs that are
 * anchored to the given anchor label.
 */
function collectWindowNodeIds(
  graph:       OperandGraph,
  entityIds:   string[],
  anchorLabel: string | null | undefined
): string[] {
  const lowerAnchor = anchorLabel?.toLowerCase() ?? null;
  const result      = new Set<string>();
  const windowEdges = new Set(["BEFORE", "AFTER", "WITHIN", "BETWEEN"]);

  for (const entityId of entityIds) {
    const edges = graph.edges.filter(
      (e) => e.from === entityId && windowEdges.has(e.type)
    );
    for (const edge of edges) {
      const target = nodeById(graph, edge.to);
      if (!target || target.type !== "window") continue;

      if (lowerAnchor) {
        const anchorsTo = graph.edges.find(
          (e) => e.type === "ANCHORS_TO" && e.from === target.id
        );
        if (!anchorsTo) continue;
        const anchorNode = nodeById(graph, anchorsTo.to);
        if (anchorNode?.label.toLowerCase() !== lowerAnchor) continue;
      }

      result.add(target.id);
    }
  }
  return [...result];
}

/* =========================================================
   Public API
   ========================================================= */

/**
 * Build a graph-native proof trace for `spec` evaluated against `graph`.
 *
 * Runs the full query pipeline and records the differential (selected IDs,
 * excluded IDs) at each step so the UI can highlight nodes directly.
 */
export function buildConstraintProofTrace(
  graph: OperandGraph,
  spec:  GraphConstraintSpec
): GraphConstraintProofTrace {
  const steps:  GraphProofStep[] = [];
  let   stepN   = 1;
  const { selection, aggregation } = spec;

  // ── Step 1: Candidate Selection ───────────────────────────────────────────
  const initialNodes = selectCandidateEntities(graph, selection.candidateId);
  let   activeIds    = initialNodes.map((n) => n.id);

  {
    const desc = selection.candidateId
      ? `Selected ${activeIds.length} ${entityWord(activeIds.length)} belonging to candidate ${selection.candidateId}${activeIds.length > 0 ? ": " + labelList(graph, activeIds) : ""}.`
      : `Selected ${activeIds.length} ${entityWord(activeIds.length)} (all candidates)${activeIds.length > 0 ? ": " + labelList(graph, activeIds) : ""}.`;

    steps.push({
      stepNumber:     stepN++,
      label:          "Candidate Selection",
      description:    desc,
      selectedNodeIds: [...activeIds],
      excludedNodeIds: [],
      data:           { candidateId: selection.candidateId ?? null },
    });
  }

  // ── Step 2: Tag Filter ────────────────────────────────────────────────────
  const tags = selection.entityTags ?? [];
  if (tags.length > 0) {
    const prevIds = [...activeIds];
    activeIds     = filterEntitiesByTags(graph, activeIds, tags);
    const excluded = prevIds.filter((id) => !activeIds.includes(id));

    const tagDesc = tags.join(" + ");
    const excludedDesc = excluded.length > 0
      ? ` Excluded: ${labelList(graph, excluded)}.`
      : "";

    steps.push({
      stepNumber:      stepN++,
      label:           "Tag Filter",
      description:     `Filtered entities tagged ${tagDesc}. ${activeIds.length} qualified, ${excluded.length} excluded.${excludedDesc}`,
      selectedNodeIds: [...activeIds],
      excludedNodeIds: excluded,
      data:            { tags },
    });
  }

  // ── Step 3: Label Filter ──────────────────────────────────────────────────
  const entityLabels = selection.entityLabels ?? [];
  if (entityLabels.length > 0) {
    const prevIds = [...activeIds];
    activeIds     = filterEntitiesByLabels(graph, activeIds, entityLabels);
    const excluded = prevIds.filter((id) => !activeIds.includes(id));

    const excludedDesc = excluded.length > 0
      ? ` Excluded: ${labelList(graph, excluded)}.`
      : "";

    steps.push({
      stepNumber:      stepN++,
      label:           "Label Filter",
      description:     `Filtered by labels [${entityLabels.join(", ")}]. ${activeIds.length} qualified, ${excluded.length} excluded.${excludedDesc}`,
      selectedNodeIds: [...activeIds],
      excludedNodeIds: excluded,
      data:            { entityLabels },
    });
  }

  // ── Step 4: Window Restriction ────────────────────────────────────────────
  if (selection.anchorLabel || selection.relation || selection.windowMinutes != null) {
    const prevIds = [...activeIds];
    activeIds     = restrictEntitiesByAnchorWindow(
      graph,
      activeIds,
      selection.anchorLabel,
      selection.relation,
      selection.windowMinutes
    );
    const excluded     = prevIds.filter((id) => !activeIds.includes(id));
    const windowNodeIds = collectWindowNodeIds(graph, activeIds, selection.anchorLabel);

    const windowDesc  = selection.windowMinutes != null ? `${selection.windowMinutes} minutes ` : "";
    const relDesc     = selection.relation ?? "relative to";
    const anchorDesc  = selection.anchorLabel ?? "(any anchor)";
    const excludedDesc = excluded.length > 0
      ? ` Excluded: ${labelList(graph, excluded)}.`
      : "";

    steps.push({
      stepNumber:      stepN++,
      label:           "Window Restriction",
      description:     `Restricted entities to ${windowDesc}${relDesc} ${anchorDesc}. ${activeIds.length} qualified, ${excluded.length} excluded.${excludedDesc}`,
      selectedNodeIds: [...activeIds],
      excludedNodeIds: excluded,
      data:            {
        windowNodeIds,
        anchorLabel:    selection.anchorLabel ?? null,
        offsetMinutes:  selection.windowMinutes ?? null,
        relation:       selection.relation ?? null,
      },
    });
  }

  // ── Step 5: Aggregation ───────────────────────────────────────────────────
  const observed = aggregateSelectedQuantity(
    graph,
    activeIds,
    aggregation.quantityUnit,
    aggregation.aggregation
  );

  steps.push({
    stepNumber:      stepN++,
    label:           "Aggregation",
    description:     `Aggregated qualifying ${aggregation.quantityUnit} = ${observed}. (${aggregation.aggregation} over ${activeIds.length} ${entityWord(activeIds.length)})`,
    selectedNodeIds: [...activeIds],
    data:            {
      aggregate: observed,
      unit:      aggregation.quantityUnit,
      method:    aggregation.aggregation,
      count:     activeIds.length,
    },
  });

  // ── Step 6: Threshold Comparison ──────────────────────────────────────────
  const passed = compare(observed, spec.operator, spec.threshold);

  steps.push({
    stepNumber:  stepN++,
    label:       "Threshold Comparison",
    description: `Compared ${observed} ${spec.operator} ${spec.threshold} → ${passed ? "pass" : "fail"}.`,
    data:        {
      observed,
      operator:  spec.operator,
      threshold: spec.threshold,
      passed,
    },
  });

  return {
    constraintId:      spec.constraintId,
    label:             spec.label,
    candidateId:       selection.candidateId ?? null,
    steps,
    finalObservedValue: observed,
    operator:          spec.operator,
    threshold:         spec.threshold,
    passed,
  };
}
