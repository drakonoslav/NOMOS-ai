/**
 * RoleModeSwitcher.tsx
 *
 * A segmented pill control that allows the user to switch between the four
 * NOMOS cockpit role modes: Builder, Auditor, Governor, Operator.
 *
 * Role modes change only presentation emphasis — they do not change data,
 * evaluation results, or governance state.
 *
 * Read-only and advisory. No LLM generation. No state mutation.
 */

import React from "react";
import type { CockpitRoleMode } from "../../cockpit/role_view_types";
import { getAllRoleViewConfigs } from "../../cockpit/role_view_config";

interface RoleModeSwitcherProps {
  activeMode: CockpitRoleMode;
  onModeChange: (mode: CockpitRoleMode) => void;
}

const MODE_COLOR: Record<CockpitRoleMode, string> = {
  builder:  "#374151",
  auditor:  "var(--nm-degraded)",
  governor: "var(--nm-lawful)",
  operator: "#1d4ed8",
};

export function RoleModeSwitcher({ activeMode, onModeChange }: RoleModeSwitcherProps) {
  const configs = getAllRoleViewConfigs();
  const activeConfig = configs.find((c) => c.mode === activeMode);

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        marginBottom: 20,
      }}
    >
      {/* Pill group */}
      <div
        style={{
          display: "inline-flex",
          background: "#f3f4f6",
          borderRadius: 8,
          padding: 4,
          gap: 2,
          border: "1px solid #e5e7eb",
        }}
      >
        {configs.map((cfg) => {
          const isActive = cfg.mode === activeMode;
          const color    = MODE_COLOR[cfg.mode];
          return (
            <button
              key={cfg.mode}
              onClick={() => onModeChange(cfg.mode)}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: isActive ? `1px solid ${color}55` : "1px solid transparent",
                background: isActive ? "#fff" : "transparent",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: isActive ? 800 : 500,
                color: isActive ? color : "#6b7280",
                letterSpacing: isActive ? "0.03em" : 0,
                transition: "all 0.15s ease",
                boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Mode description */}
      {activeConfig && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "#6b7280",
            paddingLeft: 2,
          }}
        >
          <span style={{ fontWeight: 700, color: MODE_COLOR[activeMode] }}>
            {activeConfig.label} mode
          </span>
          {" — "}
          {activeConfig.description}
          {" "}
          <span style={{ color: "#9ca3af", fontStyle: "italic" }}>
            (same data, different emphasis)
          </span>
        </div>
      )}
    </div>
  );
}

export default RoleModeSwitcher;
