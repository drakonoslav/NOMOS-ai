/**
 * EcosystemCockpitPage.tsx
 *
 * Top-level NOMOS ecosystem cockpit / control board.
 *
 * Supports four role modes (Builder, Auditor, Governor, Operator) that change
 * card ordering, emphasis, and default expansion without altering underlying data.
 *
 * Layout:
 *   RoleModeSwitcher       — segmented mode pill control
 *   RoleWorkflowPanel      — collapsible guided workflow for the active mode
 *   Row 1 (top)            — CockpitHealthCard · CockpitTrendCard · CockpitPredictionCard
 *   Row 2 (middle)         — CockpitGovernanceCard · CockpitPolicyCard · CockpitDoctrineCard
 *   Row 3 (bottom)         — CockpitAttentionCard (full width)
 *
 * The cockpit is advisory only.
 * It does not execute any governance action or mutate any state.
 * Role mode is a view-layer concern only — same data, different emphasis.
 *
 * No LLM generation.
 */

import React, { useState } from "react";
import type { EcosystemCockpitSnapshot } from "../../audit/cockpit_types";
import type { CockpitRoleMode }          from "../cockpit/role_view_types";
import { getCockpitRoleViewConfig }      from "../cockpit/role_view_config";
import { getRoleWorkflow }               from "../cockpit/workflow_config";
import { RoleModeSwitcher }              from "../components/cockpit/RoleModeSwitcher";
import { RoleWorkflowPanel }             from "../components/cockpit/RoleWorkflowPanel";
import { CockpitHealthCard }             from "../components/cockpit/CockpitHealthCard";
import { CockpitTrendCard }              from "../components/cockpit/CockpitTrendCard";
import { CockpitPredictionCard }         from "../components/cockpit/CockpitPredictionCard";
import { CockpitGovernanceCard }         from "../components/cockpit/CockpitGovernanceCard";
import { CockpitPolicyCard }             from "../components/cockpit/CockpitPolicyCard";
import { CockpitDoctrineCard }           from "../components/cockpit/CockpitDoctrineCard";
import { CockpitAttentionCard }          from "../components/cockpit/CockpitAttentionCard";

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
  | "attention"
  | "traceability"
  | "audit-history"
  | "diff"
  | "recommendation"
  | "deliberation"
  | "audit";

/* =========================================================
   Role-aware card sizing
   ========================================================= */

function cardFlex(
  cardId: string,
  emphasizedCards: string[]
): string {
  return emphasizedCards.includes(cardId) ? "1 1 320px" : "1 1 260px";
}

/* =========================================================
   EcosystemCockpitPage
   ========================================================= */

interface EcosystemCockpitPageProps {
  snapshot: EcosystemCockpitSnapshot;
  onNavigate?: (section: CockpitSection) => void;
  initialRoleMode?: CockpitRoleMode;
}

export function EcosystemCockpitPage({
  snapshot,
  onNavigate,
  initialRoleMode = "operator",
}: EcosystemCockpitPageProps) {
  const [roleMode, setRoleMode] = useState<CockpitRoleMode>(initialRoleMode);

  const roleConfig = getCockpitRoleViewConfig(roleMode);
  const workflow   = getRoleWorkflow(roleMode);

  const { health, trends, prediction, governance, policy, doctrine, attention } = snapshot;

  const isVisible    = (id: string) => roleConfig.visibleCards.includes(id);
  const isEmphasized = (ids: string[]) => ids.some((id) => roleConfig.emphasizedCards.includes(id));

  /* Row card sets are re-ordered by summaryPriority for the active mode.
     Cards not in the priority list are appended in their natural order. */
  const row1Cards = ["health", "trends", "prediction"].filter(isVisible);
  const row2Cards = ["governance", "policy", "doctrine"].filter(isVisible);

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
      <div style={{ marginBottom: 18 }}>
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

      {/* ── Role Mode Switcher ──────────────────────────────────────────────── */}
      <RoleModeSwitcher activeMode={roleMode} onModeChange={setRoleMode} />

      {/* ── Guided Workflow ─────────────────────────────────────────────────── */}
      <RoleWorkflowPanel workflow={workflow} onNavigate={onNavigate} />

      {/* ── Row 1: Health · Trends · Prediction ────────────────────────────── */}
      {row1Cards.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 16,
            flexWrap: "wrap",
            order: roleConfig.summaryPriority.indexOf("health") < roleConfig.summaryPriority.indexOf("governance") ? 0 : 1,
          }}
        >
          {row1Cards.includes("health") && (
            <div style={{ flex: cardFlex("health", roleConfig.emphasizedCards) }}>
              <CockpitHealthCard
                health={health}
                onViewDetails={onNavigate ? () => onNavigate("health") : undefined}
              />
            </div>
          )}
          {row1Cards.includes("trends") && (
            <div style={{ flex: cardFlex("trends", roleConfig.emphasizedCards) }}>
              <CockpitTrendCard
                trends={trends}
                onViewDetails={onNavigate ? () => onNavigate("trends") : undefined}
              />
            </div>
          )}
          {row1Cards.includes("prediction") && (
            <div style={{ flex: cardFlex("prediction", roleConfig.emphasizedCards) }}>
              <CockpitPredictionCard
                prediction={prediction}
                onViewDetails={onNavigate ? () => onNavigate("prediction") : undefined}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Row 2: Governance · Policy · Doctrine ──────────────────────────── */}
      {row2Cards.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          {row2Cards.includes("governance") && (
            <div style={{ flex: cardFlex("governance", roleConfig.emphasizedCards) }}>
              <CockpitGovernanceCard
                governance={governance}
                onViewDetails={onNavigate ? () => onNavigate("governance") : undefined}
              />
            </div>
          )}
          {row2Cards.includes("policy") && (
            <div style={{ flex: cardFlex("policy", roleConfig.emphasizedCards) }}>
              <CockpitPolicyCard
                policy={policy}
                onViewDetails={onNavigate ? () => onNavigate("policy") : undefined}
              />
            </div>
          )}
          {row2Cards.includes("doctrine") && (
            <div style={{ flex: cardFlex("doctrine", roleConfig.emphasizedCards) }}>
              <CockpitDoctrineCard
                doctrine={doctrine}
                onViewDetails={onNavigate ? () => onNavigate("doctrine") : undefined}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Row 3: Attention ───────────────────────────────────────────────── */}
      {isVisible("attention") && (
        <CockpitAttentionCard
          attention={attention}
          onViewDetails={onNavigate ? () => onNavigate("audit") : undefined}
        />
      )}

      {/* ── Governor mode: extra emphasis on recommendation + deliberation ─── */}
      {roleMode === "governor" && isEmphasized(["recommendation", "deliberation"]) && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            background: "#f0faf5",
            border: "1px solid #2e6a4f22",
            borderRadius: 6,
            fontSize: 11,
            color: "var(--nm-lawful)",
          }}
        >
          <span style={{ fontWeight: 800 }}>Governor mode: </span>
          Navigate to Recommendation and Deliberation panels for full governance review.
          These panels provide the recommendation rationale, doctrine crosswalk, and deliberation summary.
        </div>
      )}

      {/* ── Builder mode: traceability and diff foregrounded notice ────────── */}
      {roleMode === "builder" && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            background: "#f8f9fc",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            fontSize: 11,
            color: "#374151",
          }}
        >
          <span style={{ fontWeight: 800 }}>Builder mode: </span>
          Traceability and Diff panels are foregrounded. Use the workflow above to navigate from
          attention alerts to proof sources and invariant traces.
        </div>
      )}

      {/* ── Auditor mode: proof-oriented notice ────────────────────────────── */}
      {roleMode === "auditor" && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            background: "#faf8f0",
            border: "1px solid #a56a1e22",
            borderRadius: 6,
            fontSize: 11,
            color: "var(--nm-degraded)",
          }}
        >
          <span style={{ fontWeight: 800 }}>Auditor mode: </span>
          Proof traces and audit history are foregrounded. Follow the auditor workflow to verify
          candidate health traces and validate verdict consistency.
        </div>
      )}

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
        NOMOS cockpit is advisory only. Role modes change emphasis only — not data, evaluation, or governance state.
        All signals are deterministic and traceable to source records.
      </div>
    </div>
  );
}

export default EcosystemCockpitPage;
