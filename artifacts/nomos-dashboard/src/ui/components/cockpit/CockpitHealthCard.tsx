/**
 * CockpitHealthCard.tsx
 *
 * Displays the composite ecosystem health score and per-component breakdown.
 * Part of the NOMOS ecosystem cockpit top row.
 *
 * Read-only and advisory. No LLM generation.
 */

import React from "react";
import type { EcosystemCockpitSnapshot } from "../../../audit/cockpit_types";

const BAND_COLOR: Record<EcosystemCockpitSnapshot["health"]["band"], string> = {
  poor:    "var(--nm-invalid)",
  fragile: "var(--nm-degraded)",
  stable:  "var(--nm-lawful)",
  strong:  "var(--nm-lawful)",
};

const BAND_BG: Record<EcosystemCockpitSnapshot["health"]["band"], string> = {
  poor:    "#7a2e2e14",
  fragile: "#a56a1e14",
  stable:  "#2e6a4f14",
  strong:  "#2e6a4f22",
};

function scoreColor(n: number): string {
  if (n < 25) return "var(--nm-invalid)";
  if (n < 50) return "var(--nm-degraded)";
  if (n < 75) return "#4b5563";
  return "var(--nm-lawful)";
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ height: 3, background: "#e5e7eb", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 2 }} />
    </div>
  );
}

interface CockpitHealthCardProps {
  health: EcosystemCockpitSnapshot["health"];
  onViewDetails?: () => void;
}

const COMPONENTS: {
  key: keyof Omit<EcosystemCockpitSnapshot["health"], "overall" | "band">;
  label: string;
  weight: string;
}[] = [
  { key: "stability",               label: "Stability",         weight: "×0.35" },
  { key: "calibrationQuality",      label: "Calibration",       weight: "×0.25" },
  { key: "governanceEffectiveness", label: "Governance",        weight: "×0.25" },
  { key: "policyChurn",             label: "Policy Churn",      weight: "×0.15" },
];

export function CockpitHealthCard({ health, onViewDetails }: CockpitHealthCardProps) {
  const bandColor = BAND_COLOR[health.band];
  const bandBg    = BAND_BG[health.band];

  return (
    <div
      style={{
        background: bandBg,
        border: `1px solid ${bandColor}44`,
        borderLeft: `4px solid ${bandColor}`,
        borderRadius: 8,
        padding: "16px 18px",
        fontFamily: "system-ui, sans-serif",
        flex: 1,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 8 }}>
        Ecosystem Health
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 52, fontWeight: 900, fontFamily: "monospace", color: bandColor, lineHeight: 1 }}>
          {health.overall}
        </div>
        <div style={{ paddingBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: bandColor, letterSpacing: "0.06em" }}>
            {health.band.toUpperCase()}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>/ 100</div>
        </div>
      </div>

      {COMPONENTS.map(({ key, label, weight }) => {
        const val   = health[key] as number;
        const color = scoreColor(val);
        return (
          <div key={key} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#6b7280", flex: 1 }}>{label}</span>
              <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>{weight}</span>
              <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "monospace", color, minWidth: 26, textAlign: "right" }}>{val}</span>
            </div>
            <MiniBar value={val} color={color} />
          </div>
        );
      })}

      {onViewDetails && (
        <button
          onClick={onViewDetails}
          style={{ marginTop: 10, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: bandColor, padding: 0, textDecoration: "underline" }}
        >
          View health detail →
        </button>
      )}
    </div>
  );
}

export default CockpitHealthCard;
