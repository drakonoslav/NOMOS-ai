/**
 * CockpitGovernanceCard.tsx
 *
 * Displays the active governance state: policy domain, latest recommendation,
 * recent governance action, and last outcome class.
 * Part of the NOMOS ecosystem cockpit middle row.
 *
 * Read-only and advisory. No LLM generation.
 */

import React from "react";
import type { EcosystemCockpitSnapshot } from "../../../audit/cockpit_types";

const OUTCOME_CONFIG: Record<string, { color: string; label: string }> = {
  met_expectations:    { color: "var(--nm-lawful)",   label: "Met expectations"    },
  partially_met:       { color: "var(--nm-degraded)", label: "Partially met"       },
  did_not_meet:        { color: "var(--nm-invalid)",  label: "Did not meet"        },
  insufficient_followup: { color: "#9ca3af",           label: "Insufficient data"   },
};

const ACTION_COLOR: Record<string, string> = {
  promote:  "var(--nm-lawful)",
  rollback: "var(--nm-degraded)",
};

interface CockpitGovernanceCardProps {
  governance: EcosystemCockpitSnapshot["governance"];
  onViewDetails?: () => void;
}

function Field({ label, value, mono = false, color }: { label: string; value: string | null; mono?: boolean; color?: string }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2, fontWeight: 600, letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: color ?? (value ? "#1f2937" : "#9ca3af"), fontFamily: mono ? "monospace" : undefined, fontStyle: value ? "normal" : "italic" }}>
        {value ?? "none"}
      </div>
    </div>
  );
}

export function CockpitGovernanceCard({ governance, onViewDetails }: CockpitGovernanceCardProps) {
  const outcomeConf = governance.latestOutcomeClass
    ? (OUTCOME_CONFIG[governance.latestOutcomeClass] ?? { color: "#9ca3af", label: governance.latestOutcomeClass })
    : null;

  const actionColor = governance.recentGovernanceAction
    ? (ACTION_COLOR[governance.recentGovernanceAction] ?? "#4b5563")
    : undefined;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderTop: "3px solid var(--nm-lawful)",
        borderRadius: 8,
        padding: "16px 18px",
        fontFamily: "system-ui, sans-serif",
        flex: 1,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 14 }}>
        Governance State
      </div>

      <Field label="ACTIVE POLICY"         value={governance.activeDomainPolicy}     mono />
      <Field label="LATEST RECOMMENDATION" value={governance.latestRecommendation}   mono />
      <Field label="RECENT ACTION"         value={governance.recentGovernanceAction  ? governance.recentGovernanceAction.toUpperCase() : null} color={actionColor} />

      <div style={{ marginBottom: 9 }}>
        <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2, fontWeight: 600, letterSpacing: "0.05em" }}>LATEST OUTCOME</div>
        {outcomeConf ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: outcomeConf.color }}>{outcomeConf.label}</div>
        ) : (
          <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>none</div>
        )}
      </div>

      {onViewDetails && (
        <button
          onClick={onViewDetails}
          style={{ marginTop: 4, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--nm-lawful)", padding: 0, textDecoration: "underline" }}
        >
          View governance detail →
        </button>
      )}
    </div>
  );
}

export default CockpitGovernanceCard;
