/**
 * GraphProofTracePanel.tsx
 *
 * Displays a node-aware proof trace for a single graph-executed constraint.
 *
 * Shows:
 *   - Ordered proof steps (label + description + selected/excluded counts)
 *   - Active step highlight (clicking a step selects it and emits highlight state)
 *   - Aggregated observed value
 *   - Threshold comparison with operator
 *   - Pass / Fail badge
 *
 * Highlighting is driven by GraphHighlightState produced from the active step.
 * The parent receives the state via `onHighlightChange` and can pass it to
 * OperandGraphView to highlight the corresponding nodes.
 */

import React, { useState, useCallback } from "react";
import type { GraphConstraintProofTrace, GraphProofStep } from "../../../graph/graph_proof_types.ts";
import type { GraphHighlightState }                       from "../../graph/graph_highlight_types.ts";
import { buildHighlightStateFromProofStep, isStepActive } from "../../graph/graph_highlight_state.ts";

/* =========================================================
   Props
   ========================================================= */

export interface GraphProofTracePanelProps {
  trace: GraphConstraintProofTrace;

  /**
   * Called when the user clicks a step or clicks the active step again
   * to deselect (state = null on deselect).
   */
  onHighlightChange?: (state: GraphHighlightState | null) => void;

  /**
   * Legacy callback — called in addition to onHighlightChange.
   * Receives the raw step for callers that need it directly.
   */
  onStepClick?: (step: GraphProofStep, highlightState: GraphHighlightState) => void;
}

/* =========================================================
   Step icon mapping
   ========================================================= */

const STEP_ICON: Record<string, string> = {
  "Candidate Selection":  "⬡",
  "Tag Filter":           "⧫",
  "Label Filter":         "⊙",
  "Window Restriction":   "⧖",
  "Aggregation":          "∑",
  "Threshold Comparison": "≡",
};

function stepIcon(label: string): string {
  return STEP_ICON[label] ?? "·";
}

function makeStepId(constraintId: string, stepNumber: number): string {
  return `${constraintId}-step-${stepNumber}`;
}

/* =========================================================
   StepRow
   ========================================================= */

function StepRow({
  step,
  stepId,
  active,
  onClick,
}: {
  step:    GraphProofStep;
  stepId:  string;
  active:  boolean;
  onClick: (step: GraphProofStep, stepId: string) => void;
}) {
  const hasExcluded  = (step.excludedNodeIds?.length ?? 0) > 0;
  const hasSelected  = (step.selectedNodeIds?.length ?? 0) > 0;
  const isComparison = step.label === "Threshold Comparison";
  const passed       = isComparison ? (step.data?.passed as boolean | undefined) : undefined;

  return (
    <div
      className={[
        "gpt-step",
        "gpt-step--clickable",
        active ? "gpt-step--active" : "",
      ].filter(Boolean).join(" ")}
      role="button"
      aria-pressed={active}
      tabIndex={0}
      onClick={() => onClick(step, stepId)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(step, stepId); }}
    >
      <div className="gpt-step__header">
        <span className="gpt-step__icon">{stepIcon(step.label)}</span>
        <span className="gpt-step__number">Step {step.stepNumber}</span>
        <span className="gpt-step__label">{step.label}</span>
        {active && <span className="gpt-step__active-marker">▶</span>}
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
          {(step.anchorNodeIds?.length ?? 0) > 0 && (
            <span className="gpt-step__count gpt-step__count--anchor">
              {step.anchorNodeIds!.length} anchor
            </span>
          )}
          {(step.windowNodeIds?.length ?? 0) > 0 && (
            <span className="gpt-step__count gpt-step__count--window">
              {step.windowNodeIds!.length} window
            </span>
          )}
          {(step.aggregateSourceNodeIds?.length ?? 0) > 0 && (
            <span className="gpt-step__count gpt-step__count--aggregate">
              {step.aggregateSourceNodeIds!.length} contributing
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
  onHighlightChange,
  onStepClick,
}: GraphProofTracePanelProps) {
  const [activeStepId, setActiveStepId] = useState<string | null>(null);

  const handleStepClick = useCallback(
    (step: GraphProofStep, stepId: string) => {
      if (activeStepId === stepId) {
        // Clicking the active step deselects it
        setActiveStepId(null);
        onHighlightChange?.(null);
      } else {
        setActiveStepId(stepId);
        const hs = buildHighlightStateFromProofStep(step, stepId);
        onHighlightChange?.(hs);
        onStepClick?.(step, hs);
      }
    },
    [activeStepId, onHighlightChange, onStepClick]
  );

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
        {steps.map((step) => {
          const sid = makeStepId(constraintId, step.stepNumber);
          return (
            <StepRow
              key={sid}
              step={step}
              stepId={sid}
              active={activeStepId === sid}
              onClick={handleStepClick}
            />
          );
        })}
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
  traces:             GraphConstraintProofTrace[];
  onHighlightChange?: (state: GraphHighlightState | null) => void;
  onStepClick?:       (step: GraphProofStep, highlightState: GraphHighlightState) => void;
}

export function GraphProofTracePanelSet({
  traces,
  onHighlightChange,
  onStepClick,
}: GraphProofTracePanelSetProps) {
  if (traces.length === 0) return null;

  return (
    <div className="graph-proof-trace-panel-set">
      {traces.map((trace) => (
        <GraphProofTracePanel
          key={trace.constraintId}
          trace={trace}
          onHighlightChange={onHighlightChange}
          onStepClick={onStepClick}
        />
      ))}
    </div>
  );
}
