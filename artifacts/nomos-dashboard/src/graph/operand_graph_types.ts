/**
 * operand_graph_types.ts
 *
 * Canonical types for the NOMOS operand / relation graph.
 *
 * The graph sits beneath domain routing and above evaluation.
 * It represents parsed measurable entities, anchors, relations,
 * windows, and constraints as a reusable symbolic structure.
 *
 * Design principles:
 *   - Open-vocabulary: entity labels are never restricted to a closed list.
 *   - Deterministic: same input always produces the same graph.
 *   - No LLM generation.
 *   - Known domain tags may appear in node.data but are never required.
 */

/* =========================================================
   Node types
   ========================================================= */

export type GraphNodeType =
  | "entity"      // a measurable noun phrase (cyclic dextrin, magnesium, …)
  | "quantity"    // a numeric amount (80, 30, 60, …)
  | "unit"        // a measurement unit (g, min, rep, …)
  | "anchor"      // a named reference point (lifting, dinner, bed, …)
  | "relation"    // a named relation (before, after, within, …) — when reified as a node
  | "window"      // a temporal or spatial window (30 min before lifting)
  | "constraint"  // a quantitative threshold or rule (at least, no more than, …)
  | "candidate"   // a candidate option in a multi-candidate query
  | "objective";  // the optimization objective

export interface GraphNode {
  id:    string;
  type:  GraphNodeType;
  label: string;

  /**
   * Arbitrary structured metadata.
   * Examples:
   *   entity node:   { category, confidence, role, entityId }
   *   quantity node: { amount }
   *   unit node:     { category: UnitCategory, normalizedUnit }
   *   window node:   { offsetAmount, offsetUnit, anchorLabel, relation }
   *   constraint:    { threshold: "minimum" | "maximum" | "exact", relation }
   */
  data?: Record<string, unknown>;
}

/* =========================================================
   Edge types
   ========================================================= */

export type GraphEdgeType =
  | "HAS_QUANTITY"          // entity → quantity
  | "HAS_UNIT"              // entity | quantity → unit
  | "MODIFIES"              // modifier → entity
  | "RELATIVE_TO"           // entity → anchor | entity (generic spatial/accompaniment)
  | "BEFORE"                // entity → window | anchor (temporal ordering)
  | "AFTER"                 // entity → window | anchor (temporal ordering)
  | "WITHIN"                // entity → window  (temporal containment)
  | "BETWEEN"               // entity → anchor (spatial or temporal range)
  | "CONSTRAINS"            // constraint → entity (quantitative threshold)
  | "BELONGS_TO_CANDIDATE"  // entity → candidate (multi-candidate membership)
  | "BELONGS_TO_OBJECTIVE"  // entity → objective
  | "CLASSIFIED_AS"         // entity → tag / category node
  | "AGGREGATES_OVER"       // constraint → window (applies aggregate over a window)
  | "ANCHORS_TO";           // window | relation → anchor

export interface GraphEdge {
  id:   string;
  from: string;   // node id
  to:   string;   // node id
  type: GraphEdgeType;

  /**
   * Arbitrary edge metadata.
   * Examples:
   *   BEFORE edge: { offsetAmount, offsetUnit }
   *   CONSTRAINS:  { threshold: "minimum", amount: 60, unit: "g" }
   */
  data?: Record<string, unknown>;
}

/* =========================================================
   Graph
   ========================================================= */

export interface OperandGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
