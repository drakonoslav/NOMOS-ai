/**
 * GraphNodeDetailPanel.tsx
 *
 * Shows the complete back-propagation record for a selected graph node.
 *
 * Sections:
 *   - Node identity (id, label, type)
 *   - Summary lines
 *   - Candidate memberships
 *   - Constraints touched
 *   - Proof step references (role in each step)
 *
 * Designed to be placed next to the GraphProofTracePanel so the user can
 * see both proof-step → node (panel highlights graph) and
 * node → proof-steps (this panel) simultaneously.
 */

import React from "react";
import type { GraphNodeBackpropRecord, NodeRoleInStep } from "../../graph/graph_backprop_types.ts";
import type { OperandGraph }                            from "../../../graph/operand_graph_types.ts";

/* =========================================================
   Role badge
   ========================================================= */

const ROLE_LABEL: Record<NodeRoleInStep, string> = {
  selected:         "Selected",
  excluded:         "Excluded",
  anchor:           "Anchor",
  window:           "Window",
  aggregate_source: "Aggregate Source",
};

const ROLE_COLOR: Record<NodeRoleInStep, string> = {
  selected:         "#2563eb",
  excluded:         "#ef4444",
  anchor:           "#7c3aed",
  window:           "#d97706",
  aggregate_source: "#16a34a",
};

function RoleBadge({ role }: { role: NodeRoleInStep }) {
  return (
    <span
      className={`gnp-role-badge gnp-role-badge--${role.replace("_", "-")}`}
      style={{
        color:       ROLE_COLOR[role],
        border:      `1px solid ${ROLE_COLOR[role]}`,
        padding:     "1px 6px",
        borderRadius: 3,
        fontSize:    10,
        fontFamily:  "monospace",
        marginLeft:  6,
      }}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

/* =========================================================
   Props
   ========================================================= */

export interface GraphNodeDetailPanelProps {
  /** The back-prop record for the selected node. */
  record: GraphNodeBackpropRecord;

  /** The full graph — used to look up node type and label. */
  graph: OperandGraph;

  /**
   * Optional: called when the user clicks a proof step reference.
   * The caller can use this to activate that step in the proof panel.
   */
  onProofStepSelect?: (proofStepId: string, constraintId: string) => void;

  /** Optional CSS class for the outer container. */
  className?: string;
}

/* =========================================================
   Component
   ========================================================= */

export function GraphNodeDetailPanel({
  record,
  graph,
  onProofStepSelect,
  className = "",
}: GraphNodeDetailPanelProps) {
  const node = graph.nodes.find((n) => n.id === record.nodeId);
  const nodeLabel = node?.label ?? record.nodeId;
  const nodeType  = node?.type  ?? "unknown";

  const hasProofRefs     = record.proofReferences.length > 0;
  const hasCandidates    = record.candidateReferences.length > 0;
  const hasConstraints   = record.constraintReferences.length > 0;

  return (
    <div className={`graph-node-detail-panel ${className}`.trim()}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="gnp-header">
        <div className="gnp-header__type">{nodeType}</div>
        <div className="gnp-header__label">{nodeLabel}</div>
        <div className="gnp-header__id">{record.nodeId}</div>
      </div>

      {/* ── Summary lines ─────────────────────────────────────────── */}
      {record.summaryLines.length > 0 && (
        <div className="gnp-section gnp-section--summary">
          {record.summaryLines.map((line, i) => (
            <div key={i} className="gnp-summary-line">{line}</div>
          ))}
        </div>
      )}

      {/* ── Candidate memberships ─────────────────────────────────── */}
      {hasCandidates && (
        <div className="gnp-section">
          <div className="gnp-section__heading">Candidate Memberships</div>
          {record.candidateReferences.map((c) => (
            <div key={c.candidateId} className="gnp-candidate-row">
              <span className="gnp-candidate-label">{c.candidateLabel}</span>
              <span className="gnp-candidate-id"> ({c.candidateId})</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Constraints touched ───────────────────────────────────── */}
      {hasConstraints && (
        <div className="gnp-section">
          <div className="gnp-section__heading">Constraints Touched</div>
          {record.constraintReferences.map((c) => (
            <div key={c.constraintId} className="gnp-constraint-row">
              <span className="gnp-constraint-id">{c.constraintId}</span>
              <span className="gnp-constraint-label"> — {c.constraintLabel}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Proof step references ─────────────────────────────────── */}
      {hasProofRefs ? (
        <div className="gnp-section">
          <div className="gnp-section__heading">Proof Step References</div>
          {record.proofReferences.map((ref) => (
            <div
              key={ref.proofStepId}
              className={[
                "gnp-proof-ref",
                onProofStepSelect ? "gnp-proof-ref--clickable" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => onProofStepSelect?.(ref.proofStepId, ref.constraintId)}
              role={onProofStepSelect ? "button" : undefined}
              tabIndex={onProofStepSelect ? 0 : undefined}
              onKeyDown={(e) => {
                if (onProofStepSelect && (e.key === "Enter" || e.key === " ")) {
                  onProofStepSelect(ref.proofStepId, ref.constraintId);
                }
              }}
            >
              <span className="gnp-proof-ref__step-label">{ref.proofStepLabel}</span>
              <RoleBadge role={ref.roleInStep} />
              <span className="gnp-proof-ref__constraint"> [{ref.constraintId}]</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="gnp-section gnp-section--empty">
          <div className="gnp-empty">No proof step references.</div>
        </div>
      )}
    </div>
  );
}
