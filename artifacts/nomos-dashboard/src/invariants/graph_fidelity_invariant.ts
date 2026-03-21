/**
 * graph_fidelity_invariant.ts
 *
 * Graph Fidelity Invariant
 * ────────────────────────
 * Every measured entity extracted from a declaration must map to exactly one
 * entity node in the OperandGraph.  No entity may be duplicated or missing.
 *
 * Rules enforced:
 *   GF-01  Every named entity span (label !== "") has a corresponding entity
 *          node in the graph (data.entityId === span.id).
 *   GF-02  No entity span maps to more than one entity node (no duplication).
 *   GF-03  Every entity node in the graph has a corresponding entity span in
 *          the BindingResult (no orphan nodes).
 *   GF-04  Entity node count in graph equals named span count in binding.
 *   GF-05  No two entity nodes share the same data.entityId.
 */

import type { BindingResult } from "../compiler/measured_entity_types.ts";
import type { OperandGraph }  from "../graph/operand_graph_types.ts";
import type { InvariantResult, InvariantViolation } from "./invariant_types.ts";

const NAME = "GraphFidelity" as const;
const DESC = "Every measured entity maps to exactly one graph node; no duplication.";

export function checkGraphFidelity(
  binding: BindingResult,
  graph:   OperandGraph
): InvariantResult {
  const violations: InvariantViolation[] = [];

  // All entity nodes in the graph
  const entityNodes = graph.nodes.filter((n) => n.type === "entity");

  // Build index: entityId → list of entity nodes with that entityId
  const entityIdToNodes = new Map<string, string[]>();
  for (const node of entityNodes) {
    const eid = node.data?.entityId as string | undefined;
    if (!eid) {
      violations.push({
        invariant: NAME,
        rule:      "ENTITY_NODE_MISSING_ID",
        message:   `Entity node "${node.id}" (label: "${node.label}") has no data.entityId.`,
        detail:    { nodeId: node.id, label: node.label },
      });
      continue;
    }
    if (!entityIdToNodes.has(eid)) entityIdToNodes.set(eid, []);
    entityIdToNodes.get(eid)!.push(node.id);
  }

  // Named entity spans (label !== "") from the BindingResult
  const namedSpans = binding.entities.filter((e) => e.label !== "");

  // GF-01: every named span has at least one entity node
  for (const span of namedSpans) {
    if (!entityIdToNodes.has(span.id)) {
      violations.push({
        invariant: NAME,
        rule:      "ENTITY_NOT_IN_GRAPH",
        message:   `Entity span "${span.id}" (label: "${span.label}") has no entity node in the graph.`,
        detail:    { spanId: span.id, spanLabel: span.label },
      });
    }
  }

  // GF-02: no entity span maps to more than one entity node
  for (const span of namedSpans) {
    const nodes = entityIdToNodes.get(span.id) ?? [];
    if (nodes.length > 1) {
      violations.push({
        invariant: NAME,
        rule:      "ENTITY_DUPLICATED_IN_GRAPH",
        message:   `Entity span "${span.id}" maps to ${nodes.length} entity nodes: [${nodes.join(", ")}].`,
        detail:    { spanId: span.id, nodeIds: nodes },
      });
    }
  }

  // GF-03: every entity node's entityId refers to a real span
  const spanIds = new Set(namedSpans.map((e) => e.id));
  for (const [eid, nodeIds] of entityIdToNodes) {
    if (!spanIds.has(eid)) {
      violations.push({
        invariant: NAME,
        rule:      "ORPHAN_ENTITY_NODE",
        message:   `Entity node(s) [${nodeIds.join(", ")}] reference entityId "${eid}" which does not exist in the BindingResult.`,
        detail:    { entityId: eid, nodeIds },
      });
    }
  }

  // GF-04: entity node count equals named span count
  if (entityNodes.length !== namedSpans.length) {
    violations.push({
      invariant: NAME,
      rule:      "ENTITY_COUNT_MISMATCH",
      message:   `Graph has ${entityNodes.length} entity node(s), but BindingResult has ${namedSpans.length} named entity span(s).`,
      detail:    { graphEntityCount: entityNodes.length, spanCount: namedSpans.length },
    });
  }

  // GF-05: no two entity nodes share the same entityId
  for (const [eid, nodeIds] of entityIdToNodes) {
    if (nodeIds.length > 1) {
      violations.push({
        invariant: NAME,
        rule:      "DUPLICATE_ENTITY_ID",
        message:   `entityId "${eid}" is shared by ${nodeIds.length} nodes: [${nodeIds.join(", ")}].`,
        detail:    { entityId: eid, nodeIds },
      });
    }
  }

  return {
    invariant:  NAME,
    description: DESC,
    passed:     violations.length === 0,
    violations,
  };
}
