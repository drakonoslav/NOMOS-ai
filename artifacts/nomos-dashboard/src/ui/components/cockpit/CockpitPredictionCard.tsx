/**
 * CockpitPredictionCard.tsx
 *
 * Displays the current failure prediction posture: predicted variable,
 * confidence, risk direction, and top supporting signal.
 * Part of the NOMOS ecosystem cockpit top row.
 *
 * Read-only and advisory. No LLM generation.
 */

import React from "react";
import type { EcosystemCockpitSnapshot } from "../../../audit/cockpit_types";

const DIRECTION_CONFIG: Record<
  EcosystemCockpitSnapshot["prediction"]["riskDirection"],
  { label: string; color: string; icon: string }
> = {
  decreasing: { label: "Decreasing", color: "var(--nm-lawful)",   icon: "↓" },
  stable:     { label: "Stable",     color: "#4b5563",             icon: "→" },
  rising:     { label: "Rising",     color: "var(--nm-invalid)",  icon: "↑" },
};

const CONFIDENCE_COLOR: Record<EcosystemCockpitSnapshot["prediction"]["confidence"], string> = {
  low:      "var(--nm-invalid)",
  moderate: "var(--nm-degraded)",
  high:     "var(--nm-lawful)",
};

interface CockpitPredictionCardProps {
  prediction: EcosystemCockpitSnapshot["prediction"];
  onViewDetails?: () => void;
}

export function CockpitPredictionCard({ prediction, onViewDetails }: CockpitPredictionCardProps) {
  const dc = DIRECTION_CONFIG[prediction.riskDirection];
  const confColor = CONFIDENCE_COLOR[prediction.confidence];

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderLeft: `4px solid ${confColor}`,
        borderRadius: 8,
        padding: "16px 18px",
        fontFamily: "system-ui, sans-serif",
        flex: 1,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 14 }}>
        Failure Prediction
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 3 }}>PREDICTED MODE</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: prediction.predictedVariable ? "#1f2937" : "#9ca3af", fontFamily: "monospace", fontStyle: prediction.predictedVariable ? "normal" : "italic" }}>
          {prediction.predictedVariable ?? "none"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>CONFIDENCE</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: confColor }}>
            {prediction.confidence.toUpperCase()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>RISK DIRECTION</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: dc.color, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 14 }}>{dc.icon}</span>
            {dc.label}
          </div>
        </div>
      </div>

      {prediction.topSignal && (
        <div style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", borderRadius: 4, padding: "6px 8px", lineHeight: 1.4, marginBottom: 6 }}>
          <span style={{ fontWeight: 700, color: "#374151" }}>Signal: </span>
          {prediction.topSignal}
        </div>
      )}

      {onViewDetails && (
        <button
          onClick={onViewDetails}
          style={{ marginTop: 8, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: confColor, padding: 0, textDecoration: "underline" }}
        >
          View prediction detail →
        </button>
      )}
    </div>
  );
}

export default CockpitPredictionCard;
