/**
 * GraphProofTracePanel.tsx
 *
 * Displays a node-aware proof trace for a single graph-executed constraint.
 *
 * Shows:
 *   - Ordered proof steps (label + description + selected/excluded counts)
 *   - Aggregated observed value
 *   - Threshold comparison with operator
 *   - Pass / Fail badge
 *
 * The panel is read-only and deterministic — it renders whatever the executor
 * produced; it never modifies the trace.
 */

import React from "react";
import type { GraphConstraintProofTrace, GraphProofStep } from "../../../graph/graph_proof_types.ts";

/* =========================================================
   Props
   ========================================================= */

export interface GraphProofTracePanelProps {
  trace: GraphConstraintProofTrace;

  /**
   * Optional callback fired when the user clicks a step.
   * Receives the step so the caller can highlight its selectedNodeIds /
   * excludedNodeIds in the graph view.
   */
  onStepClick?: (step: GraphProofStep) => void;
}

/* =========================================================
   Step label → icon mapping
   ========================================================= */

const STEP_ICON: Record<string, string> = {
  "Candidate Selection": "⬡",
  "Tag Filter":          "⧫",
  "Label Filter":        "⊙",
  "Window Restriction":  "⧖",
  "Aggregation":         "∑",
  "Threshold Comparison": "≡",
};

function stepIcon(label: string): string {
  return STEP_ICON[label] ?? "·";
}

/* =========================================================
   Sub-components
   ========================================================= */

function StepRow({
  step,
  onClick,
}: {
  step:    GraphProofStep;
  onClick?: (step: GraphProofStep) => void;
}) {
  const hasExcluded    = (step.excludedNodeIds?.length ?? 0) > 0;
  const hasSelected    = (step.selectedNodeIds?.length ?? 0) > 0;
  const isComparison   = step.label === "Threshold Comparison";
  const passed         = isComparison ? (step.data?.passed as boolean | undefined) : undefined;

  return (
    <div
      className={`gpt-step${onClick ? " gpt-step--clickable" : ""}`}
      onClick={() => onClick?.(step)}
      title={onClick ? "Click to highlight nodes in graph view" : undefined}
    >
      <div className="gpt-step__header">
        <span className="gpt-step__icon">{stepIcon(step.label)}</span>
        <span className="gpt-step__number">Step {step.stepNumber}</span>
        <span className="gpt-step__label">{step.label}</span>
        {isComparison && passed !== undefined && (
          <span className={`gpt-step__badge gpt-step__badge--${passed ? "pass" : "fail"}`}>
            {passed ? "PASS" : "FAIL"}
          </span>
        )}
      </div>

      <div className="gpt-step__description">{step.description}</div>

      {(hasSelected || hasExcluded) && (
        <div className="gpt-step__node-counts">
          {hasSelected && (
            <span className="gpt-step__count gpt-step__count--selected">
              {step.selectedNodeIds!.length} selected
            </span>
          )}
          {hasExcluded && (
            <span className="gpt-step__count gpt-step__count--excluded">
              {step.excludedNodeIds!.length} excluded
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Panel
   ========================================================= */

export function GraphProofTracePanel({
  trace,
  onStepClick,
}: GraphProofTracePanelProps) {
  const { constraintId, label, candidateId, steps, finalObservedValue, operator, threshold, passed } = trace;

  return (
    <div className={`graph-proof-trace-panel graph-proof-trace-panel--${passed ? "pass" : "fail"}`}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="gpt-header">
        <div className="gpt-header__title">
          <span className="gpt-header__id">{constraintId}</span>
          <span className="gpt-header__label">{label}</span>
          {candidateId && (
            <span className="gpt-header__candidate">Candidate {candidateId}</span>
          )}
        </div>
        <div className={`gpt-header__verdict gpt-header__verdict--${passed ? "pass" : "fail"}`}>
          {passed ? "PASS" : "FAIL"}
        </div>
      </div>

      {/* ── Proof steps ───────────────────────────────────────────── */}
      <div className="gpt-steps">
        {steps.map((step) => (
          <StepRow
            key={step.stepNumber}
            step={step}
            onClick={onStepClick}
          />
        ))}
      </div>

      {/* ── Summary bar ───────────────────────────────────────────── */}
      <div className="gpt-summary">
        <span className="gpt-summary__label">Result</span>
        <span className="gpt-summary__comparison">
          {finalObservedValue}
          <span className="gpt-summary__operator"> {operator} </span>
          {threshold}
        </span>
        <span className={`gpt-summary__verdict gpt-summary__verdict--${passed ? "pass" : "fail"}`}>
          {passed ? "✓ Pass" : "✗ Fail"}
        </span>
      </div>
    </div>
  );
}

/* =========================================================
   Multi-trace panel (renders one panel per constraint)
   ========================================================= */

export interface GraphProofTracePanelSetProps {
  traces:      GraphConstraintProofTrace[];
  onStepClick?: (step: GraphProofStep) => void;
}

export function GraphProofTracePanelSet({
  traces,
  onStepClick,
}: GraphProofTracePanelSetProps) {
  if (traces.length === 0) return null;

  return (
    <div className="graph-proof-trace-panel-set">
      {traces.map((trace) => (
        <GraphProofTracePanel
          key={trace.constraintId}
          trace={trace}
          onStepClick={onStepClick}
        />
      ))}
    </div>
  );
}
