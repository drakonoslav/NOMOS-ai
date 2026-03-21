/**
 * ConstraintTracePanel.tsx
 *
 * Expandable proof trace section for a candidate evaluation card.
 *
 * Collapsed by default — the user clicks "View proof trace" to expand.
 *
 * When expanded, shows:
 *   - Baseline state (readable structured form)
 *   - Candidate state (readable structured form)
 *   - Diff summary (one sentence from the diff engine)
 *   - Proof lines (explicit logical steps)
 *   - Suggested repair (when violated)
 *
 * Baseline and candidate states are rendered in readable structured form.
 * ProteinPlacementMap is rendered as "Meal X: food1, food2" lists.
 * String arrays are rendered as ordered lists.
 * Scalars are rendered as plain text.
 * Unknown shapes fall back to indented JSON (not raw single-line dumps).
 *
 * Architecture:
 *   ConstraintTrace (from baseline_trace.ts) → ConstraintTracePanel (display only)
 */

import React, { useState } from "react";
import type { ConstraintTrace } from "../../evaluation/eval_types";

export interface ConstraintTracePanelProps {
  trace: ConstraintTrace;
}

export function ConstraintTracePanel({ trace }: ConstraintTracePanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="constraint-trace-panel">
      <button
        className="constraint-trace-panel__toggle"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        type="button"
      >
        <span className="constraint-trace-panel__toggle-icon">
          {expanded ? "▲" : "▼"}
        </span>
        {expanded ? "Hide proof trace" : "View proof trace"}
      </button>

      {expanded && (
        <div className="constraint-trace-panel__content">

          {/* Baseline state */}
          <div className="constraint-trace-panel__section">
            <div className="constraint-trace-panel__section-label">Baseline state</div>
            <StateRenderer state={trace.baselineState} />
          </div>

          {/* Candidate state */}
          <div className="constraint-trace-panel__section">
            <div className="constraint-trace-panel__section-label">Candidate state</div>
            <StateRenderer state={trace.candidateState} />
          </div>

          {/* Diff */}
          <div className="constraint-trace-panel__section">
            <div className="constraint-trace-panel__section-label">Diff</div>
            <ul className="constraint-trace-panel__list">
              {trace.diffSummary.split(". ").filter(Boolean).map((sentence, i) => (
                <li key={i}>
                  {sentence.endsWith(".") ? sentence : `${sentence}.`}
                </li>
              ))}
            </ul>
          </div>

          {/* Proof lines */}
          <div className="constraint-trace-panel__section">
            <div className="constraint-trace-panel__section-label">Proof</div>
            <ul className="constraint-trace-panel__list constraint-trace-panel__list--proof">
              {trace.proofLines.map((line, i) => {
                const isConclusion =
                  line.startsWith("Therefore") ||
                  line.includes("is violated") ||
                  line.includes("is satisfied") ||
                  line.startsWith("No violation");
                return (
                  <li
                    key={i}
                    className={
                      isConclusion
                        ? "constraint-trace-panel__proof-conclusion"
                        : undefined
                    }
                  >
                    {line}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Suggested repair */}
          {trace.suggestedRepair && (
            <div className="constraint-trace-panel__section">
              <div className="constraint-trace-panel__section-label">Suggested repair</div>
              <ul className="constraint-trace-panel__list">
                {trace.suggestedRepair.split(". ").filter(Boolean).map((sentence, i) => (
                  <li key={i}>
                    {sentence.endsWith(".") ? sentence : `${sentence}.`}
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

/* =========================================================
   State renderer — readable structured form
   Never dumps raw single-line JSON
   ========================================================= */

function StateRenderer({ state }: { state: unknown }) {
  // ProteinPlacementMap: Record<string, string[]> (object with array values)
  if (isProteinPlacementMap(state)) {
    const entries = Object.entries(state as Record<string, string[]>).sort(
      ([a], [b]) => numericCompare(a, b)
    );
    return (
      <ul className="constraint-trace-panel__list constraint-trace-panel__list--state">
        {entries.map(([meal, foods]) => (
          <li key={meal}>
            <span className="constraint-trace-panel__meal-label">Meal {meal}:</span>{" "}
            {foods.length > 0 ? foods.join(", ") : <em className="constraint-trace-panel__none">none</em>}
          </li>
        ))}
      </ul>
    );
  }

  // string[] — ordered list
  if (Array.isArray(state)) {
    const items = state as string[];
    if (items.length === 0) {
      return <span className="constraint-trace-panel__scalar constraint-trace-panel__none">(empty)</span>;
    }
    return (
      <ul className="constraint-trace-panel__list constraint-trace-panel__list--state">
        {items.map((item, i) => (
          <li key={i}>{String(item)}</li>
        ))}
      </ul>
    );
  }

  // number or string — scalar
  if (typeof state === "number" || typeof state === "string") {
    return (
      <span className="constraint-trace-panel__scalar">
        {String(state)}
      </span>
    );
  }

  // Fallback — indented JSON, not raw single-line
  return (
    <pre className="constraint-trace-panel__json">
      {JSON.stringify(state, null, 2)}
    </pre>
  );
}

/* =========================================================
   Type guard: ProteinPlacementMap = Record<string, string[]>
   ========================================================= */

function isProteinPlacementMap(value: unknown): value is Record<string, string[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value as object).every((v) => Array.isArray(v));
}

function numericCompare(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}
