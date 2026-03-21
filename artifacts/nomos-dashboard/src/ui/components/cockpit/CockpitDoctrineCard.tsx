/**
 * CockpitDoctrineCard.tsx
 *
 * Displays the doctrine / playbook crosswalk summary:
 * supporting vs cautioning heuristic counts and most relevant doctrine.
 * Part of the NOMOS ecosystem cockpit middle row.
 *
 * Read-only and advisory. No LLM generation.
 */

import React from "react";
import type { EcosystemCockpitSnapshot } from "../../../audit/cockpit_types";

interface CockpitDoctrineCardProps {
  doctrine: EcosystemCockpitSnapshot["doctrine"];
  onViewDetails?: () => void;
}

export function CockpitDoctrineCard({ doctrine, onViewDetails }: CockpitDoctrineCardProps) {
  const total = doctrine.supportingCount + doctrine.cautioningCount;
  const cautionsExceed = doctrine.cautioningCount > doctrine.supportingCount && total > 0;

  const borderColor = total === 0
    ? "#e5e7eb"
    : cautionsExceed
    ? "var(--nm-degraded)"
    : "var(--nm-lawful)";

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderTop: `3px solid ${borderColor}`,
        borderRadius: 8,
        padding: "16px 18px",
        fontFamily: "system-ui, sans-serif",
        flex: 1,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 14 }}>
        Doctrine Crosswalk
      </div>

      {/* Count bars */}
      <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
        <div style={{ flex: 1, textAlign: "center", background: "#2e6a4f12", borderRadius: 6, padding: "10px 8px", border: "1px solid #2e6a4f33" }}>
          <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "monospace", color: "var(--nm-lawful)", lineHeight: 1 }}>
            {doctrine.supportingCount}
          </div>
          <div style={{ fontSize: 10, color: "var(--nm-lawful)", fontWeight: 700, marginTop: 3 }}>SUPPORTING</div>
        </div>
        <div style={{ flex: 1, textAlign: "center", background: cautionsExceed ? "#a56a1e14" : "#f3f4f6", borderRadius: 6, padding: "10px 8px", border: `1px solid ${cautionsExceed ? "#a56a1e44" : "#e5e7eb"}` }}>
          <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "monospace", color: cautionsExceed ? "var(--nm-degraded)" : "#6b7280", lineHeight: 1 }}>
            {doctrine.cautioningCount}
          </div>
          <div style={{ fontSize: 10, color: cautionsExceed ? "var(--nm-degraded)" : "#9ca3af", fontWeight: 700, marginTop: 3 }}>CAUTIONING</div>
        </div>
      </div>

      {cautionsExceed && (
        <div style={{ fontSize: 11, color: "var(--nm-degraded)", background: "#a56a1e10", borderRadius: 4, padding: "6px 8px", marginBottom: 10, lineHeight: 1.4 }}>
          Cautions outweigh supporting heuristics — review doctrine alignment.
        </div>
      )}

      {total === 0 && (
        <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic", marginBottom: 10 }}>
          No doctrine crosswalk available for the current context.
        </div>
      )}

      {doctrine.mostRelevantHeuristic && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 3, fontWeight: 600 }}>MOST RELEVANT HEURISTIC</div>
          <div style={{ fontSize: 12, color: "#374151", fontStyle: "italic", lineHeight: 1.4 }}>
            "{doctrine.mostRelevantHeuristic}"
          </div>
        </div>
      )}

      {onViewDetails && (
        <button
          onClick={onViewDetails}
          style={{ marginTop: 6, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: borderColor === "#e5e7eb" ? "#6b7280" : borderColor, padding: 0, textDecoration: "underline" }}
        >
          View doctrine detail →
        </button>
      )}
    </div>
  );
}

export default CockpitDoctrineCard;
