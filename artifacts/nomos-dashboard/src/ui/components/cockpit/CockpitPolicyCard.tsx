/**
 * CockpitPolicyCard.tsx
 *
 * Displays the active policy version and its bounded adjustment state:
 * confidence bias, escalation bias, uncertainty bias, calibration window.
 * Part of the NOMOS ecosystem cockpit middle row.
 *
 * Read-only and advisory. No LLM generation.
 */

import React from "react";
import type { EcosystemCockpitSnapshot } from "../../../audit/cockpit_types";

interface CockpitPolicyCardProps {
  policy: EcosystemCockpitSnapshot["policy"];
  onViewDetails?: () => void;
}

function BiasRow({ label, value }: { label: string; value: number }) {
  const color =
    value > 0.05  ? "var(--nm-lawful)"   :
    value < -0.05 ? "var(--nm-degraded)" :
    "#4b5563";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
      <span style={{ fontSize: 11, color: "#6b7280", flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color }}>
        {value >= 0 ? "+" : ""}{value.toFixed(3)}
      </span>
    </div>
  );
}

export function CockpitPolicyCard({ policy, onViewDetails }: CockpitPolicyCardProps) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderTop: "3px solid #4b5563",
        borderRadius: 8,
        padding: "16px 18px",
        fontFamily: "system-ui, sans-serif",
        flex: 1,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 14 }}>
        Policy State
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2, fontWeight: 600 }}>ACTIVE VERSION</div>
        <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: policy.policyVersionId ? "#1f2937" : "#9ca3af", fontStyle: policy.policyVersionId ? "normal" : "italic" }}>
          {policy.policyVersionId ?? "none"}
        </div>
      </div>

      <div
        style={{
          background: "#f8f9fc",
          border: "1px solid #e5e7eb",
          borderRadius: 4,
          padding: "10px 12px",
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, marginBottom: 8, letterSpacing: "0.05em" }}>BOUNDED ADJUSTMENT STATE</div>
        <BiasRow label="Confidence bias"   value={policy.confidenceBias}  />
        <BiasRow label="Escalation bias"   value={policy.escalationBias}  />
        <BiasRow label="Uncertainty bias"  value={policy.uncertaintyBias} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, borderTop: "1px solid #e5e7eb", paddingTop: 7, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: "#6b7280", flex: 1 }}>Calibration window</span>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: "#374151" }}>
            {policy.calibrationWindow} runs
          </span>
        </div>
      </div>

      {onViewDetails && (
        <button
          onClick={onViewDetails}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#4b5563", padding: 0, textDecoration: "underline" }}
        >
          View policy detail →
        </button>
      )}
    </div>
  );
}

export default CockpitPolicyCard;
