/**
 * OperandGraphView.tsx
 *
 * SVG-based renderer for an OperandGraph with:
 *   - Proof-step highlighting (highlightState → node roles via getNodeHighlightRole)
 *   - Node click → fires onNodeClick(nodeId)
 *   - Active node indicator (thick gold ring on clicked node)
 *
 * Layout:
 *   Nodes are arranged in horizontal rows by type group:
 *     Row 0 (top)    — anchor nodes
 *     Row 1          — window nodes
 *     Row 2          — entity / constraint / candidate / objective / relation nodes
 *     Row 3          — quantity nodes
 *     Row 4 (bottom) — unit nodes
 *
 * Edges are drawn as SVG lines with type-specific dash patterns and arrow tips.
 */

import React, { useMemo } from "react";
import type { OperandGraph, GraphNode, GraphEdge } from "../../../graph/operand_graph_types.ts";
import type { GraphHighlightState }                from "../../graph/graph_highlight_types.ts";
import { getNodeHighlightRole }                     from "../../graph/graph_highlight_state.ts";

/* =========================================================
   Layout constants
   ========================================================= */

const NODE_WIDTH  = 110;
const NODE_HEIGHT = 36;
const H_GAP       = 24;
const V_GAP       = 56;
const PADDING     = 32;

type RowKey = "anchor" | "window" | "main" | "quantity" | "unit";
const ROW_ORDER: RowKey[] = ["anchor", "window", "main", "quantity", "unit"];

function rowKeyForNode(node: GraphNode): RowKey {
  switch (node.type) {
    case "anchor":   return "anchor";
    case "window":   return "window";
    case "quantity": return "quantity";
    case "unit":     return "unit";
    default:         return "main";
  }
}

/* =========================================================
   Node position computation
   ========================================================= */

interface NodePos { id: string; x: number; y: number; cx: number; cy: number; }

function computeLayout(nodes: GraphNode[]): Map<string, NodePos> {
  const rows: Map<RowKey, GraphNode[]> = new Map(ROW_ORDER.map((k) => [k, []]));
  for (const node of nodes) rows.get(rowKeyForNode(node))!.push(node);

  const posMap = new Map<string, NodePos>();
  ROW_ORDER.forEach((rowKey, rowIndex) => {
    const rowNodes = rows.get(rowKey)!;
    const y = PADDING + rowIndex * (NODE_HEIGHT + V_GAP);
    rowNodes.forEach((node, colIndex) => {
      const x = PADDING + colIndex * (NODE_WIDTH + H_GAP);
      posMap.set(node.id, { id: node.id, x, y, cx: x + NODE_WIDTH / 2, cy: y + NODE_HEIGHT / 2 });
    });
  });
  return posMap;
}

/* =========================================================
   Node type → base fill color
   ========================================================= */

const NODE_BASE_FILL: Record<string, string> = {
  entity:     "#dbeafe",
  quantity:   "#fef9c3",
  unit:       "#f0fdf4",
  anchor:     "#ede9fe",
  window:     "#fef3c7",
  constraint: "#fee2e2",
  candidate:  "#e0f2fe",
  objective:  "#dcfce7",
  relation:   "#f1f5f9",
};

function baseFill(type: string): string {
  return NODE_BASE_FILL[type] ?? "#f8fafc";
}

/* =========================================================
   Highlight role → stroke / fill overrides
   ========================================================= */

interface HighlightStyle { stroke: string; strokeWidth: number; fillOverride?: string; opacity: number; }

const ROLE_STYLE: Record<string, HighlightStyle> = {
  "excluded":         { stroke: "#ef4444", strokeWidth: 2.5, fillOverride: "#fee2e2", opacity: 0.85 },
  "aggregate-source": { stroke: "#16a34a", strokeWidth: 2.5, fillOverride: "#dcfce7", opacity: 1.0  },
  "selected":         { stroke: "#2563eb", strokeWidth: 2.5, opacity: 1.0 },
  "window":           { stroke: "#d97706", strokeWidth: 2.0, fillOverride: "#fef3c7", opacity: 1.0  },
  "anchor":           { stroke: "#7c3aed", strokeWidth: 2.0, fillOverride: "#ede9fe", opacity: 1.0  },
  "inactive":         { stroke: "#cbd5e1", strokeWidth: 1.0, opacity: 0.45 },
};

function highlightStyle(node: GraphNode, hs: GraphHighlightState | null): HighlightStyle {
  if (!hs || hs.activeProofStepId === null) return { stroke: "#94a3b8", strokeWidth: 1.2, opacity: 1.0 };
  const role = getNodeHighlightRole(node.id, hs);
  return ROLE_STYLE[role] ?? ROLE_STYLE["inactive"];
}

/* =========================================================
   Edge dash patterns
   ========================================================= */

const EDGE_TYPE_DASH: Record<string, string> = {
  "HAS_QUANTITY":         "none",
  "HAS_UNIT":             "3,2",
  "BEFORE":               "none",
  "AFTER":                "none",
  "WITHIN":               "none",
  "BETWEEN":              "none",
  "ANCHORS_TO":           "5,3",
  "CONSTRAINS":           "none",
  "RELATIVE_TO":          "4,2",
  "BELONGS_TO_CANDIDATE": "3,3",
  "BELONGS_TO_OBJECTIVE": "3,3",
};

/* =========================================================
   NodeRect sub-component
   ========================================================= */

function NodeRect({
  node,
  pos,
  hs,
  isActiveNode,
  onClick,
}: {
  node:         GraphNode;
  pos:          NodePos;
  hs:           GraphHighlightState | null;
  isActiveNode: boolean;
  onClick:      (nodeId: string) => void;
}) {
  const style = highlightStyle(node, hs);
  const fill  = style.fillOverride ?? baseFill(node.type);

  const maxChars = 14;
  const label    = node.label.length > maxChars ? node.label.slice(0, maxChars - 1) + "…" : node.label;

  // Active node gets a gold outer ring
  const stroke      = isActiveNode ? "#f59e0b" : style.stroke;
  const strokeWidth = isActiveNode ? 3.0       : style.strokeWidth;

  return (
    <g
      className={`gv-node gv-node--${node.type}${isActiveNode ? " gv-node--active" : ""}`}
      onClick={() => onClick(node.id)}
      style={{ cursor: "pointer" }}
    >
      {/* Outer glow for active node */}
      {isActiveNode && (
        <rect
          x={pos.x - 3}
          y={pos.y - 3}
          width={NODE_WIDTH  + 6}
          height={NODE_HEIGHT + 6}
          rx={7}
          ry={7}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={2}
          opacity={0.5}
        />
      )}
      <rect
        x={pos.x}
        y={pos.y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={5}
        ry={5}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={style.opacity}
      />
      <text
        x={pos.cx}
        y={pos.cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={10}
        fill="#1e293b"
        opacity={style.opacity}
        style={{ fontFamily: "monospace", pointerEvents: "none", userSelect: "none" }}
      >
        {label}
      </text>
      <text
        x={pos.x + 4}
        y={pos.y + 9}
        fontSize={7}
        fill="#64748b"
        opacity={style.opacity}
        style={{ fontFamily: "sans-serif", pointerEvents: "none", userSelect: "none" }}
      >
        {node.type}
      </text>
    </g>
  );
}

/* =========================================================
   EdgeLine sub-component
   ========================================================= */

function EdgeLine({ edge, posMap }: { edge: GraphEdge; posMap: Map<string, NodePos> }) {
  const fromPos = posMap.get(edge.from);
  const toPos   = posMap.get(edge.to);
  if (!fromPos || !toPos) return null;
  return (
    <line
      key={edge.id}
      x1={fromPos.cx} y1={fromPos.cy}
      x2={toPos.cx}   y2={toPos.cy}
      stroke="#94a3b8"
      strokeWidth={1}
      strokeDasharray={EDGE_TYPE_DASH[edge.type] ?? "none"}
      opacity={0.6}
      markerEnd="url(#arrow)"
    />
  );
}

/* =========================================================
   Main component
   ========================================================= */

export interface OperandGraphViewProps {
  graph:          OperandGraph;
  highlightState: GraphHighlightState | null;

  /**
   * Currently selected node ID (e.g. from clicking a node or from the back-prop
   * panel cross-referencing a step).  When set, that node gets a gold glow ring.
   */
  activeNodeId?:  string | null;

  /**
   * Called when the user clicks a node.  The caller should update `activeNodeId`
   * and use the back-prop index to open `GraphNodeDetailPanel`.
   */
  onNodeClick?:   (nodeId: string) => void;

  className?:     string;
}

export function OperandGraphView({
  graph,
  highlightState,
  activeNodeId  = null,
  onNodeClick,
  className = "",
}: OperandGraphViewProps) {
  const posMap = useMemo(() => computeLayout(graph.nodes), [graph.nodes]);

  let maxX = 0, maxY = 0;
  for (const pos of posMap.values()) {
    maxX = Math.max(maxX, pos.x + NODE_WIDTH  + PADDING);
    maxY = Math.max(maxY, pos.y + NODE_HEIGHT + PADDING);
  }
  const svgWidth  = Math.max(maxX, 400);
  const svgHeight = Math.max(maxY, 300);

  const handleNodeClick = (nodeId: string) => {
    onNodeClick?.(nodeId);
  };

  return (
    <div className={`operand-graph-view ${className}`.trim()}>
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>

        <g className="gv-edges">
          {graph.edges.map((edge) => (
            <EdgeLine key={edge.id} edge={edge} posMap={posMap} />
          ))}
        </g>

        <g className="gv-nodes">
          {graph.nodes.map((node) => {
            const pos = posMap.get(node.id);
            if (!pos) return null;
            return (
              <NodeRect
                key={node.id}
                node={node}
                pos={pos}
                hs={highlightState}
                isActiveNode={node.id === activeNodeId}
                onClick={handleNodeClick}
              />
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="gv-legend">
        {([
          ["selected",         "#2563eb", "Survived filters"],
          ["excluded",         "#ef4444", "Filtered out"],
          ["aggregate-source", "#16a34a", "Contributed to aggregate"],
          ["window",           "#d97706", "Temporal window"],
          ["anchor",           "#7c3aed", "Reference anchor"],
          ["inactive",         "#94a3b8", "Not involved"],
          ["active-node",      "#f59e0b", "Selected node"],
        ] as const).map(([role, color, label]) => (
          <span key={role} className="gv-legend__item">
            <span className="gv-legend__swatch" style={{ background: color, display: "inline-block", width: 10, height: 10, borderRadius: 2, marginRight: 4 }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
