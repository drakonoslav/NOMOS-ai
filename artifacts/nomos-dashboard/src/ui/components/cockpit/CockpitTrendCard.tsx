/**
 * CockpitTrendCard.tsx
 *
 * Displays decisive-variable trend state: most frequent, most recent,
 * dominant streak, and drift/stabilization signal.
 * Part of the NOMOS ecosystem cockpit top row.
 *
 * Read-only and advisory. No LLM generation.
 */

import React from "react";
import type { EcosystemCockpitSnapshot } from "../../../audit/cockpit_types";

const DRIFT_CONFIG: Record<
  EcosystemCockpitSnapshot["trends"]["driftState"],
  { label: string; color: string; bg: string; dot: string }
> = {
  stabilizing:   { label: "STABILIZING",    color: "var(--nm-lawful)",   bg: "#2e6a4f18", dot: "var(--nm-lawful)"  },
  stable:        { label: "STABLE",         color: "#4b5563",             bg: "#f3f4f6",   dot: "#9ca3af"           },
  drifting:      { label: "DRIFTING",       color: "var(--nm-degraded)", bg: "#a56a1e14", dot: "var(--nm-degraded)"},
  overcorrecting:{ label: "OVERCORRECTING", color: "var(--nm-invalid)",  bg: "#7a2e2e14", dot: "var(--nm-invalid)" },
};

interface CockpitTrendCardProps {
  trends: EcosystemCockpitSnapshot["trends"];
  onViewDetails?: () => void;
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 7 }}>
      <span style={{ fontSize: 10, color: "#9ca3af", minWidth: 90 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: value ? "#1f2937" : "#9ca3af", fontStyle: value ? "normal" : "italic", fontFamily: "monospace" }}>
        {value ?? "none"}
      </span>
    </div>
  );
}

export function CockpitTrendCard({ trends, onViewDetails }: CockpitTrendCardProps) {
  const dc = DRIFT_CONFIG[trends.driftState];

  return (
    <div
      style={{
        background: dc.bg,
        border: `1px solid ${dc.color}33`,
        borderLeft: `4px solid ${dc.color}`,
        borderRadius: 8,
        padding: "16px 18px",
        fontFamily: "system-ui, sans-serif",
        flex: 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "#9ca3af", textTransform: "uppercase", flex: 1 }}>
          Trend State
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: dc.dot }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: dc.color, letterSpacing: "0.06em" }}>{dc.label}</span>
        </div>
      </div>

      <Row label="Most frequent"  value={trends.mostFrequentVariable} />
      <Row label="Most recent"    value={trends.mostRecentVariable} />
      <Row label="Active streak"  value={trends.currentDominantStreak} />

      {trends.currentDominantStreak && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--nm-degraded)", background: "#a56a1e10", borderRadius: 4, padding: "6px 8px" }}>
          "{trends.currentDominantStreak}" is in an active streak — monitor for escalation.
        </div>
      )}

      {onViewDetails && (
        <button
          onClick={onViewDetails}
          style={{ marginTop: 12, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: dc.color, padding: 0, textDecoration: "underline" }}
        >
          View trend detail →
        </button>
      )}
    </div>
  );
}

export default CockpitTrendCard;
