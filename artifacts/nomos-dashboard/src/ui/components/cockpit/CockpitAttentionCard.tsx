/**
 * CockpitAttentionCard.tsx
 *
 * Displays deterministic attention alerts for the operator.
 * Each alert is a plain-language sentence derived from the ecosystem state.
 * Part of the NOMOS ecosystem cockpit bottom row.
 *
 * Read-only and advisory. The cockpit does not execute any action.
 * No LLM generation.
 */

import React from "react";
import type { EcosystemCockpitSnapshot } from "../../../audit/cockpit_types";

interface CockpitAttentionCardProps {
  attention: EcosystemCockpitSnapshot["attention"];
  onViewDetails?: () => void;
}

export function CockpitAttentionCard({ attention, onViewDetails }: CockpitAttentionCardProps) {
  const { alerts } = attention;
  const hasAlerts = alerts.length > 0;

  return (
    <div
      style={{
        background: hasAlerts ? "#7a2e2e08" : "#2e6a4f08",
        border: `1px solid ${hasAlerts ? "var(--nm-invalid)" : "var(--nm-lawful)"}44`,
        borderLeft: `4px solid ${hasAlerts ? "var(--nm-invalid)" : "var(--nm-lawful)"}`,
        borderRadius: 8,
        padding: "16px 20px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "#9ca3af", textTransform: "uppercase", flex: 1 }}>
          Attention
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: hasAlerts ? "var(--nm-invalid)" : "var(--nm-lawful)",
            background: hasAlerts ? "#7a2e2e14" : "#2e6a4f14",
            border: `1px solid ${hasAlerts ? "var(--nm-invalid)" : "var(--nm-lawful)"}44`,
            padding: "2px 10px",
            borderRadius: 4,
            letterSpacing: "0.06em",
          }}
        >
          {hasAlerts ? `${alerts.length} ISSUE${alerts.length === 1 ? "" : "S"}` : "ALL CLEAR"}
        </div>
      </div>

      {hasAlerts ? (
        <div>
          {alerts.map((alert, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "8px 12px",
                background: "#fff",
                border: "1px solid var(--nm-invalid)22",
                borderRadius: 6,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--nm-invalid)",
                  flexShrink: 0,
                  marginTop: 4,
                }}
              />
              <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, flex: 1 }}>
                {alert}
              </div>
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
            These alerts are advisory. The cockpit does not execute any action.
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--nm-lawful)", fontWeight: 600 }}>
          No issues detected — ecosystem state is within expected parameters.
        </div>
      )}

      {onViewDetails && hasAlerts && (
        <button
          onClick={onViewDetails}
          style={{ marginTop: 10, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--nm-invalid)", padding: 0, textDecoration: "underline" }}
        >
          View audit trail →
        </button>
      )}
    </div>
  );
}

export default CockpitAttentionCard;
