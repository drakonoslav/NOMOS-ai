/**
 * graph_proof_trace.ts
 *
 * Builds a GraphConstraintProofTrace from a graph and a constraint spec.
 *
 * The trace captures every query step that the constraint executor runs,
 * recording which node IDs survived and which were excluded at each stage.
 *
 * New fields populated on each step:
 *   anchorNodeIds        — anchor nodes referenced (Window Restriction step)
 *   windowNodeIds        — window nodes applied   (Window Restriction step)
 *   aggregateSourceNodeIds — entities that contributed to the aggregate
 *                           (Aggregation + Threshold Comparison steps)
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
import { resolveUnit } from "../compiler/unit_registry.ts";

/* =========================================================
   Internal helpers
   ========================================================= */

function nodeById(graph: OperandGraph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

function nodeLabel(graph: OperandGraph, id: string): string {
  return nodeById(graph, id)?.label ?? id;
}

function entityWord(n: number): string {
  return n === 1 ? "entity" : "entities";
}

function labelList(graph: OperandGraph, ids: string[]): string {
  if (ids.length === 0) return "(none)";
  return ids.map((id) => nodeLabel(graph, id)).join(", ");
}

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

/* ─── New: collect window node IDs ────────────────────────────────────────── */

function collectWindowNodeIds(
  graph:       OperandGraph,
  entityIds:   string[],
  anchorLabel: string | null | undefined
): string[] {
  const lowerAnchor = anchorLabel?.toLowerCase() ?? null;
  const result      = new Set<string>();
  const windowEdges = new Set(["BEFORE", "AFTER", "WITHIN", "BETWEEN"]);

  for (const entityId of entityIds) {
    for (const edge of graph.edges) {
      if (edge.from !== entityId || !windowEdges.has(edge.type)) continue;
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

/* ─── New: collect anchor node IDs ────────────────────────────────────────── */

function collectAnchorNodeIds(
  graph:       OperandGraph,
  anchorLabel: string | null | undefined
): string[] {
  if (!anchorLabel) return [];
  const lower = anchorLabel.toLowerCase();
  return graph.nodes
    .filter((n) => n.type === "anchor" && n.label.toLowerCase() === lower)
    .map((n) => n.id);
}

/* ─── New: compute aggregate-source node IDs ─────────────────────────────── */

/**
 * Return the entity node IDs from `entityIds` whose HAS_UNIT resolves to the
 * target canonical unit — i.e. the entities that actually contributed a value
 * to the aggregate (unit-mismatched entities contribute 0 and are excluded).
 */
function computeAggregateSourceNodeIds(
  graph:        OperandGraph,
  entityIds:    string[],
  quantityUnit: string
): string[] {
  const targetCanonical =
    resolveUnit(quantityUnit)?.canonical ?? quantityUnit.toLowerCase();

  return entityIds.filter((entityId) => {
    const unitEdge = graph.edges.find(
      (e) => e.type === "HAS_UNIT" && e.from === entityId
    );
    if (!unitEdge) return false;
    const unitNode = nodeById(graph, unitEdge.to);
    if (!unitNode) return false;
    const unitCanonical =
      (unitNode.data?.normalizedUnit as string | undefined) ??
      resolveUnit(unitNode.label)?.canonical ??
      unitNode.label.toLowerCase();
    return unitCanonical === targetCanonical;
  });
}

/* =========================================================
   Public API
   ========================================================= */

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
      stepNumber:      stepN++,
      label:           "Candidate Selection",
      description:     desc,
      selectedNodeIds: [...activeIds],
      excludedNodeIds: [],
      anchorNodeIds:   [],
      windowNodeIds:   [],
      aggregateSourceNodeIds: [],
      data:            { candidateId: selection.candidateId ?? null },
    });
  }

  // ── Step 2: Tag Filter ────────────────────────────────────────────────────
  const tags = selection.entityTags ?? [];
  if (tags.length > 0) {
    const prevIds  = [...activeIds];
    activeIds      = filterEntitiesByTags(graph, activeIds, tags);
    const excluded = prevIds.filter((id) => !activeIds.includes(id));

    const tagDesc      = tags.join(" + ");
    const excludedDesc = excluded.length > 0
      ? ` Excluded: ${labelList(graph, excluded)}.`
      : "";

    steps.push({
      stepNumber:      stepN++,
      label:           "Tag Filter",
      description:     `Filtered entities tagged ${tagDesc}. ${activeIds.length} qualified, ${excluded.length} excluded.${excludedDesc}`,
      selectedNodeIds: [...activeIds],
      excludedNodeIds: excluded,
      anchorNodeIds:   [],
      windowNodeIds:   [],
      aggregateSourceNodeIds: [],
      data:            { tags },
    });
  }

  // ── Step 3: Label Filter ──────────────────────────────────────────────────
  const entityLabels = selection.entityLabels ?? [];
  if (entityLabels.length > 0) {
    const prevIds  = [...activeIds];
    activeIds      = filterEntitiesByLabels(graph, activeIds, entityLabels);
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
      anchorNodeIds:   [],
      windowNodeIds:   [],
      aggregateSourceNodeIds: [],
      data:            { entityLabels },
    });
  }

  // ── Step 4: Window Restriction ────────────────────────────────────────────
  if (selection.anchorLabel || selection.relation || selection.windowMinutes != null) {
    const prevIds      = [...activeIds];
    activeIds          = restrictEntitiesByAnchorWindow(
      graph, activeIds, selection.anchorLabel, selection.relation, selection.windowMinutes
    );
    const excluded     = prevIds.filter((id) => !activeIds.includes(id));
    const windowNodeIds = collectWindowNodeIds(graph, activeIds, selection.anchorLabel);
    const anchorNodeIds = collectAnchorNodeIds(graph, selection.anchorLabel);

    const windowDesc   = selection.windowMinutes != null ? `${selection.windowMinutes} minutes ` : "";
    const relDesc      = selection.relation ?? "relative to";
    const anchorDesc   = selection.anchorLabel ?? "(any anchor)";
    const excludedDesc = excluded.length > 0
      ? ` Excluded: ${labelList(graph, excluded)}.`
      : "";

    steps.push({
      stepNumber:      stepN++,
      label:           "Window Restriction",
      description:     `Restricted entities to ${windowDesc}${relDesc} ${anchorDesc}. ${activeIds.length} qualified, ${excluded.length} excluded.${excludedDesc}`,
      selectedNodeIds: [...activeIds],
      excludedNodeIds: excluded,
      anchorNodeIds,
      windowNodeIds,
      aggregateSourceNodeIds: [],
      data:            {
        windowNodeIds,
        anchorNodeIds,
        anchorLabel:   selection.anchorLabel ?? null,
        offsetMinutes: selection.windowMinutes ?? null,
        relation:      selection.relation ?? null,
      },
    });
  }

  // ── Step 5: Aggregation ───────────────────────────────────────────────────
  const observed            = aggregateSelectedQuantity(
    graph, activeIds, aggregation.quantityUnit, aggregation.aggregation
  );
  const aggregateSourceNodeIds = computeAggregateSourceNodeIds(
    graph, activeIds, aggregation.quantityUnit
  );

  steps.push({
    stepNumber:      stepN++,
    label:           "Aggregation",
    description:     `Aggregated qualifying ${aggregation.quantityUnit} = ${observed}. (${aggregation.aggregation} over ${activeIds.length} ${entityWord(activeIds.length)})`,
    selectedNodeIds: [...activeIds],
    excludedNodeIds: [],
    anchorNodeIds:   [],
    windowNodeIds:   [],
    aggregateSourceNodeIds,
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
    stepNumber:      stepN++,
    label:           "Threshold Comparison",
    description:     `Compared ${observed} ${spec.operator} ${spec.threshold} → ${passed ? "pass" : "fail"}.`,
    selectedNodeIds: [],
    excludedNodeIds: [],
    anchorNodeIds:   [],
    windowNodeIds:   [],
    // Carry aggregate source through so UI can still highlight contributing nodes
    aggregateSourceNodeIds,
    data:            {
      observed,
      operator:  spec.operator,
      threshold: spec.threshold,
      passed,
    },
  });

  return {
    constraintId:       spec.constraintId,
    label:              spec.label,
    candidateId:        selection.candidateId ?? null,
    steps,
    finalObservedValue: observed,
    operator:           spec.operator,
    threshold:          spec.threshold,
    passed,
  };
}
