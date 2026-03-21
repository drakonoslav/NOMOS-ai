/**
 * operand_graph_builder.ts
 *
 * Builds an OperandGraph from a BindingResult (the output of relation_binder).
 *
 * Algorithm:
 *
 *   For each MeasuredEntitySpan:
 *     - If label != "" → entity node + quantity node + unit node
 *                        + HAS_QUANTITY + HAS_UNIT edges
 *     - If label == "" → quantity node + unit node only
 *                        (bare time/distance measurements used as offsets)
 *
 *   For each AnchorReference:
 *     - anchor node
 *
 *   For each RelationBinding:
 *     - Map relation type → GraphEdgeType
 *     - Quantitative bindings (at least / no more than / …) → constraint node +
 *       CONSTRAINS edge
 *     - Temporal/spatial bindings with offset → window node +
 *       BEFORE/AFTER/WITHIN edge from entity to window +
 *       ANCHORS_TO edge from window to anchor
 *     - All other bindings → direct relational edge (RELATIVE_TO / WITHIN / …)
 *
 * Unit nodes are deduplicated: one node per canonical unit string.
 */

import type { BindingResult, MeasuredEntitySpan } from "../compiler/measured_entity_types.ts";
import type { RelationType }                       from "../compiler/relation_lexicon.ts";
import type {
  OperandGraph,
  GraphNode,
  GraphEdge,
  GraphEdgeType,
} from "./operand_graph_types.ts";

/* =========================================================
   Relation-type → edge-type mapping
   ========================================================= */

function relToEdgeType(rel: RelationType): GraphEdgeType {
  switch (rel) {
    case "before":  return "BEFORE";
    case "after":   return "AFTER";
    case "within":  return "WITHIN";
    case "between": return "BETWEEN";

    case "at least":
    case "no less than":
    case "greater than":
    case "at most":
    case "no more than":
    case "less than":
    case "equal to":
    case "exactly":
    case "approximately":
      return "CONSTRAINS";

    default:
      return "RELATIVE_TO";
  }
}

function constraintThreshold(rel: RelationType): "minimum" | "maximum" | "exact" | "approximate" {
  switch (rel) {
    case "at least": case "no less than": case "greater than": return "minimum";
    case "at most":  case "no more than": case "less than":    return "maximum";
    case "exactly":                                            return "exact";
    default:                                                   return "approximate";
  }
}

/* =========================================================
   Node / edge ID counters
   ========================================================= */

class IdFactory {
  private counters: Map<string, number> = new Map();

  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0);
    this.counters.set(prefix, n + 1);
    return `${prefix}_${n}`;
  }
}

/* =========================================================
   Builder
   ========================================================= */

export function buildOperandGraph(result: BindingResult): OperandGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const ids   = new IdFactory();

  // ── Maps for resolving IDs during binding phase ──────────────────────────
  // entityId (me_X)   → graph node id of the entity or quantity node
  const entityNodeId  = new Map<string, string>();
  // anchorId (anc_X)  → graph node id of the anchor node
  const anchorNodeId  = new Map<string, string>();
  // normalizedUnit    → graph node id of the shared unit node
  const unitNodeId    = new Map<string, string>();

  // ── Helper: get-or-create a shared unit node ──────────────────────────────
  function getOrCreateUnitNode(
    normalizedUnit: string,
    unitCategory:  string | null
  ): string {
    const key = normalizedUnit;
    if (unitNodeId.has(key)) return unitNodeId.get(key)!;
    const id: string = ids.next("gn_unit");
    nodes.push({
      id,
      type:  "unit",
      label: normalizedUnit,
      data:  {
        normalizedUnit,               // explicit — avoids label-parse fallback
        category: unitCategory ?? "unknown",
      },
    });
    unitNodeId.set(key, id);
    return id;
  }

  // ── Phase 1: entity spans → nodes ────────────────────────────────────────
  for (const span of result.entities) {
    const qtyId: string = ids.next("gn_qty");
    nodes.push({
      id:    qtyId,
      type:  "quantity",
      label: String(span.amount ?? ""),
      data:  { amount: span.amount },
    });

    const unitId = getOrCreateUnitNode(
      span.normalizedUnit ?? span.unit ?? "?",
      span.unitCategory
    );

    if (span.label !== "") {
      // Named entity: create entity node + HAS_QUANTITY + HAS_UNIT
      const entId: string = ids.next("gn_entity");
      nodes.push({
        id:    entId,
        type:  "entity",
        label: span.label,
        data:  {
          entityId:        span.id,
          category:        span.category,
          role:            span.role,
          confidence:      span.confidence,
          normalizedLabel: span.normalizedLabel,
          // tags and tagProvenance are assigned once by entity_tag_enricher.ts
          // during extraction and propagated here verbatim.  Never recomputed.
          tags:            span.tags,
          tagProvenance:   span.tagProvenance,
        },
      });

      edges.push({
        id:   ids.next("ge"),
        from: entId,
        to:   qtyId,
        type: "HAS_QUANTITY",
      });
      edges.push({
        id:   ids.next("ge"),
        from: entId,
        to:   unitId,
        type: "HAS_UNIT",
      });

      entityNodeId.set(span.id, entId);
    } else {
      // Bare measurement (e.g. "30 minutes" offset) — expose the qty node
      entityNodeId.set(span.id, qtyId);

      // Still wire quantity → unit
      edges.push({
        id:   ids.next("ge"),
        from: qtyId,
        to:   unitId,
        type: "HAS_UNIT",
      });
    }
  }

  // ── Phase 2: anchors → nodes ──────────────────────────────────────────────
  for (const anchor of result.anchors) {
    const id: string = ids.next("gn_anchor");
    nodes.push({
      id,
      type:  "anchor",
      label: anchor.label,
      data:  { anchorId: anchor.id, isKnownAnchor: anchor.isKnownAnchor },
    });
    anchorNodeId.set(anchor.id, id);
  }

  // ── Phase 3: bindings → edges / window nodes / constraint nodes ───────────
  for (const binding of result.bindings) {
    const subjectGnId = entityNodeId.get(binding.subjectId);
    if (!subjectGnId) continue;

    const edgeType = relToEdgeType(binding.relation);

    // ── Quantitative constraint (at least, no more than, …) ────────────────
    if (edgeType === "CONSTRAINS") {
      const constraintId: string = ids.next("gn_constraint");
      nodes.push({
        id:    constraintId,
        type:  "constraint",
        label: binding.relation,
        data:  {
          relation:  binding.relation,
          threshold: constraintThreshold(binding.relation),
          bindingId: binding.id,
        },
      });
      edges.push({
        id:   ids.next("ge"),
        from: constraintId,
        to:   subjectGnId,
        type: "CONSTRAINS",
        data: { rawText: binding.rawText },
      });
      continue;
    }

    // ── Temporal binding with offset → window node ──────────────────────────
    if (
      (edgeType === "BEFORE" || edgeType === "AFTER" || edgeType === "WITHIN") &&
      binding.offsetAmount !== null &&
      binding.objectIsAnchor === true &&
      binding.objectId !== null
    ) {
      const objectAnchorGnId = anchorNodeId.get(binding.objectId);
      if (!objectAnchorGnId) continue;

      const windowId: string = ids.next("gn_window");
      const anchorLabel = result.anchors.find((a) => a.id === binding.objectId)?.label ?? "";
      const windowLabel = `${binding.offsetAmount}${binding.offsetUnit ?? ""} ${binding.relation} ${anchorLabel}`.trim();

      nodes.push({
        id:    windowId,
        type:  "window",
        label: windowLabel,
        data:  {
          offsetAmount: binding.offsetAmount,
          offsetUnit:   binding.offsetUnit,
          relation:     binding.relation,
          anchorLabel,
          bindingId:    binding.id,
        },
      });

      // entity → BEFORE/AFTER/WITHIN → window
      edges.push({
        id:   ids.next("ge"),
        from: subjectGnId,
        to:   windowId,
        type: edgeType,
        data: { offsetAmount: binding.offsetAmount, offsetUnit: binding.offsetUnit },
      });

      // window → ANCHORS_TO → anchor
      edges.push({
        id:   ids.next("ge"),
        from: windowId,
        to:   objectAnchorGnId,
        type: "ANCHORS_TO",
      });

      continue;
    }

    // ── Direct relational edge ───────────────────────────────────────────────
    let targetGnId: string | undefined;
    if (binding.objectIsAnchor === true && binding.objectId) {
      targetGnId = anchorNodeId.get(binding.objectId);
    } else if (binding.objectIsAnchor === false && binding.objectId) {
      targetGnId = entityNodeId.get(binding.objectId);
    }

    if (targetGnId) {
      edges.push({
        id:   ids.next("ge"),
        from: subjectGnId,
        to:   targetGnId,
        type: edgeType,
        data: { rawText: binding.rawText },
      });
    }
  }

  return { nodes, edges };
}
