/**
 * EcosystemCockpitPage.tsx
 *
 * Top-level NOMOS ecosystem cockpit / control board.
 *
 * Layout:
 *   Row 1 (top)    — CockpitHealthCard · CockpitTrendCard · CockpitPredictionCard
 *   Row 2 (middle) — CockpitGovernanceCard · CockpitPolicyCard · CockpitDoctrineCard
 *   Row 3 (bottom) — CockpitAttentionCard (full width)
 *
 * The cockpit is a read-first operational view.
 * It summarises the current ecosystem state and routes to deeper panels.
 * It does not execute any governance action or mutate any state.
 *
 * Usage:
 *   <EcosystemCockpitPage snapshot={snapshot} onNavigate={(section) => ...} />
 *
 * No LLM generation. All data is supplied by buildEcosystemCockpitSnapshot.
 */

import React from "react";
import type { EcosystemCockpitSnapshot } from "../../audit/cockpit_types";
import { CockpitHealthCard }      from "../components/cockpit/CockpitHealthCard";
import { CockpitTrendCard }       from "../components/cockpit/CockpitTrendCard";
import { CockpitPredictionCard }  from "../components/cockpit/CockpitPredictionCard";
import { CockpitGovernanceCard }  from "../components/cockpit/CockpitGovernanceCard";
import { CockpitPolicyCard }      from "../components/cockpit/CockpitPolicyCard";
import { CockpitDoctrineCard }    from "../components/cockpit/CockpitDoctrineCard";
import { CockpitAttentionCard }   from "../components/cockpit/CockpitAttentionCard";

/* =========================================================
   Section keys for navigation callbacks
   ========================================================= */

export type CockpitSection =
  | "health"
  | "trends"
  | "prediction"
  | "governance"
  | "policy"
  | "doctrine"
  | "audit";

/* =========================================================
   EcosystemCockpitPage
   ========================================================= */

interface EcosystemCockpitPageProps {
  snapshot: EcosystemCockpitSnapshot;
  onNavigate?: (section: CockpitSection) => void;
}

export function EcosystemCockpitPage({
  snapshot,
  onNavigate,
}: EcosystemCockpitPageProps) {
  const { health, trends, prediction, governance, policy, doctrine, attention } = snapshot;

  return (
    <div
      className="nm-gov"
      style={{
        fontFamily: "system-ui, sans-serif",
        color: "var(--nm-text, #1a1a1a)",
        padding: "20px 24px",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--nm-lawful)",
            marginBottom: 4,
          }}
        >
          NOMOS Ecosystem Cockpit
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Read-first operational view — current state of the full NOMOS reasoning ecosystem.
          This panel summarises and routes. It does not execute governance actions.
        </div>
      </div>

      {/* ── Row 1: Health · Trends · Prediction ────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <CockpitHealthCard
          health={health}
          onViewDetails={onNavigate ? () => onNavigate("health") : undefined}
        />
        <CockpitTrendCard
          trends={trends}
          onViewDetails={onNavigate ? () => onNavigate("trends") : undefined}
        />
        <CockpitPredictionCard
          prediction={prediction}
          onViewDetails={onNavigate ? () => onNavigate("prediction") : undefined}
        />
      </div>

      {/* ── Row 2: Governance · Policy · Doctrine ──────────────────────────── */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <CockpitGovernanceCard
          governance={governance}
          onViewDetails={onNavigate ? () => onNavigate("governance") : undefined}
        />
        <CockpitPolicyCard
          policy={policy}
          onViewDetails={onNavigate ? () => onNavigate("policy") : undefined}
        />
        <CockpitDoctrineCard
          doctrine={doctrine}
          onViewDetails={onNavigate ? () => onNavigate("doctrine") : undefined}
        />
      </div>

      {/* ── Row 3: Attention ───────────────────────────────────────────────── */}
      <CockpitAttentionCard
        attention={attention}
        onViewDetails={onNavigate ? () => onNavigate("audit") : undefined}
      />

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: 20,
          fontSize: 11,
          color: "#9ca3af",
          fontStyle: "italic",
          textAlign: "center",
          borderTop: "1px solid #f3f4f6",
          paddingTop: 12,
        }}
      >
        NOMOS cockpit is advisory only. All signals are deterministic and traceable to source records.
        The cockpit does not suppress or replace any underlying audit data.
      </div>
    </div>
  );
}

export default EcosystemCockpitPage;
