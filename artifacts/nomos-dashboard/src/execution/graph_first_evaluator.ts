/**
 * graph_first_evaluator.ts
 *
 * Graph-native constraint evaluation over the CanonicalGraph.
 *
 * This is the preferred execution path whenever a canonical graph is available.
 * It replaces event-array and raw-text execution for all constraint types that
 * can be expressed as entity selections + aggregations over the canonical graph.
 *
 * Evaluation pipeline (per constraint):
 *   1. Candidate selection  — entity/quantity nodes optionally scoped to candidateId
 *   2. Tag filter           — retain nodes whose tags include all required tags
 *   3. Label filter         — retain nodes whose label matches any required label
 *   4. Window restriction   — retain nodes with a matching temporal edge to anchor
 *   5. Aggregation          — sum/count/max/min of unit-matched measures
 *   6. Threshold comparison — produce pass/fail
 *   7. Proof trace          — graph-native step-by-step record with node IDs
 *   8. Diff                 — graph-native delta (what is missing/excess)
 *   9. Repair suggestions   — concrete graph transformations to fix failures
 *
 * Design invariants:
 *   I1: All proof steps reference actual CanonicalGraph node IDs.
 *   I2: Diff and repair never invent entity labels — they reference existing
 *       nodes or propose new ones with explicit labels.
 *   I3: No text re-parsing or LLM calls — purely graph queries.
 *   I4: Execution warnings (missing candidateId, missing anchor) are surfaced
 *       in trace.notes — not silently swallowed.
 */

import type { CanonicalGraph, CanonicalGraphNode, CanonicalGraphEdge } from "../graph/canonical_graph_types.ts";
import type { GraphConstraintSpec } from "../graph/graph_constraint_types.ts";
import type {
  GraphConstraintProofTrace,
  GraphProofStep,
} from "../graph/graph_proof_types.ts";
import type {
  GraphFirstConstraintResult,
  GraphFirstEvaluationResult,
  GraphNativeDiff,
  GraphNativeRepair,
  GraphRepairSuggestion,
  ExecutionRoutingDecision,
} from "./execution_route_types.ts";
import { buildGraphFirstTrace } from "./execution_trace.ts";

/* =========================================================
   Internal types
   ========================================================= */

interface MeasureRecord {
  amount: number;
  unit: string;
  unitNormalized?: string;
  dimension?: string;
}

/* =========================================================
   Graph query helpers (canonical graph native)
   ========================================================= */

function getEntityNodes(graph: CanonicalGraph): CanonicalGraphNode[] {
  return graph.nodes.filter(
    (n) => n.kind === "entity" || n.kind === "quantity"
  );
}

function findAnchorNode(graph: CanonicalGraph, label: string): CanonicalGraphNode | undefined {
  const lower = label.toLowerCase();
  return graph.nodes.find(
    (n) => n.kind === "anchor" && n.label.toLowerCase() === lower
  );
}

function getNodeMeasures(node: CanonicalGraphNode): MeasureRecord[] {
  const raw = node.data?.measures;
  if (!Array.isArray(raw)) return [];
  return raw as MeasureRecord[];
}

function getNodeTags(node: CanonicalGraphNode): string[] {
  const raw = node.data?.tags;
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).map(String).map((t) => t.toLowerCase());
}

function offsetToMinutes(amount: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === "min" || u === "minutes" || u === "minute" || u === "m") return amount;
  if (u === "h"   || u === "hr" || u === "hrs" || u === "hour" || u === "hours") return amount * 60;
  if (u === "s"   || u === "sec" || u === "second" || u === "seconds") return amount / 60;
  return amount;
}

function getEdgeOffsetMinutes(edge: CanonicalGraphEdge): number | null {
  const offset = edge.data?.offset as { amount?: number; unit?: string } | undefined;
  if (!offset || offset.amount == null) return null;
  const unit = offset.unit ?? "min";
  return offsetToMinutes(offset.amount, unit);
}

function compareValues(
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

function unitMatches(measureUnit: string, targetUnit: string): boolean {
  return measureUnit.toLowerCase() === targetUnit.toLowerCase();
}

/* =========================================================
   Step 1: Candidate selection
   ========================================================= */

function selectCandidateNodes(
  graph: CanonicalGraph,
  spec: GraphConstraintSpec,
  warnings: string[]
): { nodes: CanonicalGraphNode[]; step: GraphProofStep } {
  const all = getEntityNodes(graph);
  let selected = all;

  if (spec.selection.candidateId) {
    const cid = spec.selection.candidateId;
    const filtered = all.filter((n) => {
      const ncid = n.data?.candidateId;
      return ncid != null && String(ncid) === cid;
    });
    if (filtered.length === 0) {
      warnings.push(
        `candidateId '${cid}' not found in any entity node data; using all ${all.length} entity node(s)`
      );
    } else {
      selected = filtered;
    }
  }

  const desc =
    spec.selection.candidateId
      ? selected.length === all.length
        ? `all ${selected.length} entity node(s) (candidateId '${spec.selection.candidateId}' not found in graph)`
        : `selected ${selected.length} entity node(s) for candidate '${spec.selection.candidateId}'`
      : `selected all ${selected.length} entity node(s) (no candidate restriction)`;

  return {
    nodes: selected,
    step: {
      stepNumber:      1,
      label:           "Candidate Selection",
      description:     desc,
      selectedNodeIds: selected.map((n) => n.id),
      data:            { candidateId: spec.selection.candidateId ?? null },
    },
  };
}

/* =========================================================
   Step 2: Tag filter
   ========================================================= */

function filterByTags(
  nodes: CanonicalGraphNode[],
  spec: GraphConstraintSpec
): { nodes: CanonicalGraphNode[]; step: GraphProofStep } {
  const tags = spec.selection.entityTags ?? [];
  if (tags.length === 0) {
    return {
      nodes,
      step: {
        stepNumber:      2,
        label:           "Tag Filter",
        description:     "no tag restriction — all nodes pass",
        selectedNodeIds: nodes.map((n) => n.id),
        excludedNodeIds: [],
        data:            { tags: [] },
      },
    };
  }

  const lowerTags = tags.map((t) => t.toLowerCase());
  const passing   = nodes.filter((n) => {
    const nodeTags = getNodeTags(n);
    return lowerTags.every((t) => nodeTags.includes(t));
  });
  const excluded = nodes.filter((n) => !passing.includes(n));

  return {
    nodes: passing,
    step: {
      stepNumber:      2,
      label:           "Tag Filter",
      description:     `filtered by tags [${tags.join(", ")}]: ${passing.length} qualified, ${excluded.length} excluded`,
      selectedNodeIds: passing.map((n) => n.id),
      excludedNodeIds: excluded.map((n) => n.id),
      data:            { tags },
    },
  };
}

/* =========================================================
   Step 3: Label filter
   ========================================================= */

function filterByLabels(
  nodes: CanonicalGraphNode[],
  spec: GraphConstraintSpec
): { nodes: CanonicalGraphNode[]; step: GraphProofStep } {
  const labels = spec.selection.entityLabels ?? [];
  if (labels.length === 0) {
    return {
      nodes,
      step: {
        stepNumber:      3,
        label:           "Label Filter",
        description:     "no label restriction — all nodes pass",
        selectedNodeIds: nodes.map((n) => n.id),
        excludedNodeIds: [],
        data:            { labels: [] },
      },
    };
  }

  const lowerLabels = labels.map((l) => l.toLowerCase());
  const passing   = nodes.filter((n) => lowerLabels.includes(n.label.toLowerCase()));
  const excluded  = nodes.filter((n) => !passing.includes(n));

  return {
    nodes: passing,
    step: {
      stepNumber:      3,
      label:           "Label Filter",
      description:     `filtered by labels [${labels.join(", ")}]: ${passing.length} qualified, ${excluded.length} excluded`,
      selectedNodeIds: passing.map((n) => n.id),
      excludedNodeIds: excluded.map((n) => n.id),
      data:            { labels },
    },
  };
}

/* =========================================================
   Step 4: Window restriction
   ========================================================= */

function restrictByAnchorWindow(
  graph: CanonicalGraph,
  nodes: CanonicalGraphNode[],
  spec: GraphConstraintSpec,
  warnings: string[]
): { nodes: CanonicalGraphNode[]; step: GraphProofStep; anchorNodeIds: string[] } {
  const { anchorLabel, relation, windowMinutes } = spec.selection;

  if (!anchorLabel && !relation) {
    return {
      nodes,
      step: {
        stepNumber:      4,
        label:           "Window Restriction",
        description:     "no anchor/window restriction — all nodes pass",
        selectedNodeIds: nodes.map((n) => n.id),
        excludedNodeIds: [],
        anchorNodeIds:   [],
        data:            { anchorLabel: null, relation: null, windowMinutes: null },
      },
      anchorNodeIds: [],
    };
  }

  const anchorNode = anchorLabel ? findAnchorNode(graph, anchorLabel) : undefined;
  if (anchorLabel && !anchorNode) {
    warnings.push(`anchor '${anchorLabel}' not found in graph; window restriction skipped`);
    return {
      nodes,
      step: {
        stepNumber:      4,
        label:           "Window Restriction",
        description:     `anchor '${anchorLabel}' not found in graph — window restriction skipped`,
        selectedNodeIds: nodes.map((n) => n.id),
        excludedNodeIds: [],
        anchorNodeIds:   [],
        data:            { anchorLabel, relation, windowMinutes, warning: "anchor not found" },
      },
      anchorNodeIds: [],
    };
  }

  const anchorId = anchorNode?.id ?? null;
  const relKind  = relation?.toLowerCase() ?? null;

  const passing  = nodes.filter((n) => {
    const outEdges = graph.edges.filter((e) => e.from === n.id);
    return outEdges.some((e) => {
      const kindMatch = relKind ? e.kind.toLowerCase() === relKind : true;
      const toMatch   = anchorId ? e.to === anchorId : true;
      if (!kindMatch || !toMatch) return false;
      if (windowMinutes == null) return true;
      const offsetMin = getEdgeOffsetMinutes(e);
      if (offsetMin == null) return true;
      return offsetMin <= windowMinutes;
    });
  });
  const excluded = nodes.filter((n) => !passing.includes(n));

  const anchorDesc  = anchorLabel  ? `anchor='${anchorLabel}'` : "any anchor";
  const relDesc     = relation     ? `relation='${relation}'`  : "any relation";
  const windowDesc  = windowMinutes != null ? `, window=${windowMinutes}min` : "";

  return {
    nodes: passing,
    step: {
      stepNumber:      4,
      label:           "Window Restriction",
      description:     `restricted to ${relDesc} to ${anchorDesc}${windowDesc}: ${passing.length} qualify, ${excluded.length} excluded`,
      selectedNodeIds: passing.map((n) => n.id),
      excludedNodeIds: excluded.map((n) => n.id),
      anchorNodeIds:   anchorNode ? [anchorNode.id] : [],
      data:            { anchorLabel, relation, windowMinutes, anchorNodeId: anchorId },
    },
    anchorNodeIds: anchorNode ? [anchorNode.id] : [],
  };
}

/* =========================================================
   Step 5: Aggregation
   ========================================================= */

function aggregateNodes(
  nodes: CanonicalGraphNode[],
  spec: GraphConstraintSpec
): { observed: number; sourceNodeIds: string[]; step: GraphProofStep } {
  const { quantityUnit, aggregation } = spec.aggregation;

  const amounts: Array<{ nodeId: string; amount: number }> = [];
  for (const node of nodes) {
    const measures = getNodeMeasures(node);
    for (const m of measures) {
      const uMatch =
        unitMatches(m.unit, quantityUnit) ||
        (m.unitNormalized != null && unitMatches(m.unitNormalized, quantityUnit));
      if (uMatch) {
        amounts.push({ nodeId: node.id, amount: m.amount });
      }
    }
  }

  const sourceNodeIds = [...new Set(amounts.map((a) => a.nodeId))];

  let observed = 0;
  if (amounts.length > 0) {
    switch (aggregation) {
      case "sum":
        observed = amounts.reduce((acc, a) => acc + a.amount, 0);
        break;
      case "count":
        observed = amounts.length;
        break;
      case "max":
        observed = Math.max(...amounts.map((a) => a.amount));
        break;
      case "min":
        observed = Math.min(...amounts.map((a) => a.amount));
        break;
    }
  }

  return {
    observed,
    sourceNodeIds,
    step: {
      stepNumber:            5,
      label:                 "Aggregation",
      description:           `aggregated ${aggregation}(${quantityUnit}) = ${observed} from ${sourceNodeIds.length} source node(s)`,
      selectedNodeIds:       nodes.map((n) => n.id),
      aggregateSourceNodeIds: sourceNodeIds,
      data:                  { aggregate: observed, unit: quantityUnit, method: aggregation, sourceCount: amounts.length },
    },
  };
}

/* =========================================================
   Step 6: Threshold comparison
   ========================================================= */

function buildComparisonStep(
  observed: number,
  spec: GraphConstraintSpec,
  passed: boolean,
  sourceNodeIds: string[]
): GraphProofStep {
  return {
    stepNumber:            6,
    label:                 "Threshold Comparison",
    description:           `compared ${observed} ${spec.operator} ${spec.threshold} → ${passed ? "pass" : "fail"}`,
    selectedNodeIds:       [],
    aggregateSourceNodeIds: sourceNodeIds,
    data:                  {
      observed,
      operator:  spec.operator,
      threshold: spec.threshold,
      passed,
    },
  };
}

/* =========================================================
   Proof trace builder
   ========================================================= */

function buildProofTrace(opts: {
  spec: GraphConstraintSpec;
  steps: GraphProofStep[];
  observed: number;
  passed: boolean;
}): GraphConstraintProofTrace {
  return {
    constraintId:       opts.spec.constraintId,
    label:              opts.spec.label,
    candidateId:        opts.spec.selection.candidateId ?? null,
    steps:              opts.steps,
    finalObservedValue: opts.observed,
    operator:           opts.spec.operator,
    threshold:          opts.spec.threshold,
    passed:             opts.passed,
  };
}

/* =========================================================
   Diff builder
   ========================================================= */

function buildDiff(opts: {
  spec: GraphConstraintSpec;
  observed: number;
  passed: boolean;
  selectedNodeIds: string[];
}): GraphNativeDiff {
  const { spec, observed, passed, selectedNodeIds } = opts;
  const unit = spec.aggregation.quantityUnit;

  if (passed) {
    return {
      constraintId:   spec.constraintId,
      deltaRequired:  0,
      alreadyPassing: true,
      unit,
      targetNodeIds:  [],
      summary:        `constraint '${spec.label}' already passing (observed=${observed} ${spec.operator} ${spec.threshold})`,
    };
  }

  let delta = 0;
  switch (spec.operator) {
    case ">=":
    case ">":
      delta = spec.threshold - observed;
      break;
    case "<=":
    case "<":
      delta = observed - spec.threshold;
      break;
    case "==":
      delta = Math.abs(observed - spec.threshold);
      break;
  }

  const direction =
    (spec.operator === ">=" || spec.operator === ">")
      ? "more"
      : "less";

  return {
    constraintId:   spec.constraintId,
    deltaRequired:  delta,
    alreadyPassing: false,
    unit,
    targetNodeIds:  selectedNodeIds,
    summary:        `need ${delta}${unit} ${direction} to satisfy '${spec.label}' (observed=${observed}, threshold=${spec.threshold})`,
  };
}

/* =========================================================
   Repair builder
   ========================================================= */

function buildRepair(opts: {
  spec: GraphConstraintSpec;
  observed: number;
  passed: boolean;
  diff: GraphNativeDiff;
  graph: CanonicalGraph;
  selectedNodeIds: string[];
  anchorNodeIds: string[];
}): GraphNativeRepair {
  const { spec, passed, diff, selectedNodeIds, anchorNodeIds } = opts;

  if (passed) {
    return {
      constraintId:   spec.constraintId,
      alreadyPassing: true,
      suggestions:    [],
    };
  }

  const suggestions: GraphRepairSuggestion[] = [];
  const delta = diff.deltaRequired;
  const unit  = diff.unit;
  const isIncrease = spec.operator === ">=" || spec.operator === ">";

  if (isIncrease) {
    if (selectedNodeIds.length > 0) {
      suggestions.push({
        kind:          "adjust_quantity_edge",
        description:   `increase quantity on an existing entity node by ${delta}${unit}`,
        targetNodeId:  selectedNodeIds[0],
        proposedValue: opts.observed + delta,
        proposedUnit:  unit,
        data:          { delta, direction: "increase" },
      });
    }

    const anchorLabel = spec.selection.anchorLabel;
    const relation    = spec.selection.relation;
    suggestions.push({
      kind:          "add_entity_node",
      description:   `add a new entity node with ${delta}${unit}${anchorLabel ? ` ${relation ?? "before"} ${anchorLabel}` : ""}`,
      proposedValue: delta,
      proposedUnit:  unit,
      proposedLabel: `supplemental-${unit}-source`,
      data:          { delta, anchorLabel: anchorLabel ?? null, relation: relation ?? null },
    });

    if (anchorNodeIds.length > 0 && spec.selection.windowMinutes != null) {
      suggestions.push({
        kind:          "adjust_window_edge",
        description:   `widen the temporal window from ${spec.selection.windowMinutes}min to include more entities`,
        targetNodeId:  anchorNodeIds[0],
        proposedValue: (spec.selection.windowMinutes ?? 0) + 30,
        proposedUnit:  "min",
        data:          {
          currentWindowMinutes: spec.selection.windowMinutes,
          proposedWindowMinutes: (spec.selection.windowMinutes ?? 0) + 30,
        },
      });
    }
  } else {
    if (selectedNodeIds.length > 0) {
      suggestions.push({
        kind:          "adjust_quantity_edge",
        description:   `reduce quantity on an existing entity node by ${delta}${unit}`,
        targetNodeId:  selectedNodeIds[0],
        proposedValue: Math.max(0, opts.observed - delta),
        proposedUnit:  unit,
        data:          { delta, direction: "decrease" },
      });
    }
  }

  return {
    constraintId:   spec.constraintId,
    alreadyPassing: false,
    suggestions,
  };
}

/* =========================================================
   Single constraint evaluator
   ========================================================= */

function evaluateOneConstraint(
  graph: CanonicalGraph,
  spec: GraphConstraintSpec,
  warnings: string[]
): GraphFirstConstraintResult {
  const steps: GraphProofStep[] = [];

  const s1 = selectCandidateNodes(graph, spec, warnings);
  steps.push(s1.step);

  const s2 = filterByTags(s1.nodes, spec);
  steps.push(s2.step);

  const s3 = filterByLabels(s2.nodes, spec);
  steps.push(s3.step);

  const s4 = restrictByAnchorWindow(graph, s3.nodes, spec, warnings);
  steps.push(s4.step);

  const s5 = aggregateNodes(s4.nodes, spec);
  steps.push(s5.step);

  const passed = compareValues(s5.observed, spec.operator, spec.threshold);
  steps.push(buildComparisonStep(s5.observed, spec, passed, s5.sourceNodeIds));

  const selectedNodeIds = s4.nodes.map((n) => n.id);

  const proof  = buildProofTrace({ spec, steps, observed: s5.observed, passed });
  const diff   = buildDiff({ spec, observed: s5.observed, passed, selectedNodeIds });
  const repair = buildRepair({
    spec,
    observed:       s5.observed,
    passed,
    diff,
    graph,
    selectedNodeIds,
    anchorNodeIds:  s4.anchorNodeIds,
  });

  const explanationLines = steps.map((s) => s.description);

  return {
    constraintId:    spec.constraintId,
    label:           spec.label,
    passed,
    observedValue:   s5.observed,
    operator:        spec.operator,
    threshold:       spec.threshold,
    selectedNodeIds,
    explanationLines,
    proof,
    diff,
    repair,
  };
}

/* =========================================================
   Graph-first evaluator (public entry point)
   ========================================================= */

/**
 * Evaluate a set of GraphConstraintSpec[] over a CanonicalGraph.
 *
 * This is the primary entry point for graph_first evaluation.
 * It produces a GraphFirstEvaluationResult containing:
 *   - one ExecutionTrace (route="graph_first")
 *   - one GraphFirstConstraintResult per constraint
 *   - graph-native proof, diff, and repair for each result
 */
export function evaluateGraphFirst(opts: {
  graph: CanonicalGraph;
  constraints: GraphConstraintSpec[];
  routingDecision: ExecutionRoutingDecision;
}): GraphFirstEvaluationResult {
  const { graph, constraints, routingDecision } = opts;
  const warnings: string[] = [];

  const constraintResults = constraints.map((spec) =>
    evaluateOneConstraint(graph, spec, warnings)
  );

  const passCount = constraintResults.filter((r) => r.passed).length;
  const failCount = constraintResults.length - passCount;

  const trace = buildGraphFirstTrace({
    routingReason: routingDecision.reason,
    constraintIds: constraints.map((c) => c.constraintId),
    notes: warnings,
  });

  return {
    route: "graph_first",
    trace,
    routingDecision,
    constraintResults,
    allPassed: failCount === 0,
    passCount,
    failCount,
  };
}
