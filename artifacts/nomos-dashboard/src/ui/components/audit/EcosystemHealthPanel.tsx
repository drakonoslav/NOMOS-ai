/**
 * EcosystemHealthPanel.tsx
 *
 * Displays the NOMOS ecosystem health index — a bounded composite score
 * (0–100) across four dimensions: stability, calibration quality,
 * governance effectiveness, and policy churn.
 *
 * When an optional EcosystemHealthTrace is provided, clicking the overall
 * score or any component score opens an inline trace view showing:
 *   - exact raw inputs
 *   - formula with actual values substituted
 *   - contributing record IDs
 *   - explanation lines
 *
 * This panel is advisory and read-only.
 * It does not suppress or replace the underlying audit views.
 * No LLM generation is used.
 */

import React, { useState } from "react";
import type { EcosystemHealthIndex } from "../../../audit/ecosystem_health_types";
import type {
  EcosystemHealthTrace,
  HealthComponentTrace,
} from "../../../audit/health_trace_types";
import { ComponentTraceView } from "./HealthTracePanel";

/* =========================================================
   Constants
   ========================================================= */

const WEIGHTS = {
  stability:               0.35,
  calibrationQuality:      0.25,
  governanceEffectiveness: 0.25,
  policyChurn:             0.15,
} as const;

const BAND_CONFIG: Record<
  EcosystemHealthIndex["band"],
  { color: string; label: string; bg: string; range: string }
> = {
  poor:    { color: "var(--nm-invalid)",  label: "POOR",    bg: "#7a2e2e14", range: "0–24"   },
  fragile: { color: "var(--nm-degraded)", label: "FRAGILE", bg: "#a56a1e14", range: "25–49"  },
  stable:  { color: "var(--nm-lawful)",   label: "STABLE",  bg: "#2e6a4f14", range: "50–74"  },
  strong:  { color: "var(--nm-lawful)",   label: "STRONG",  bg: "#2e6a4f22", range: "75–100" },
};

const COMPONENT_DEFS: {
  key: keyof typeof WEIGHTS;
  label: string;
}[] = [
  { key: "stability",               label: "Stability"                        },
  { key: "calibrationQuality",      label: "Calibration Quality"              },
  { key: "governanceEffectiveness", label: "Governance Effectiveness"         },
  { key: "policyChurn",             label: "Policy Churn (lower = higher score)" },
];

type TraceTarget = HealthComponentTrace["component"] | "overall" | null;

/* =========================================================
   Helpers
   ========================================================= */

function componentColor(score: number): string {
  if (score < 25) return "var(--nm-invalid)";
  if (score < 50) return "var(--nm-degraded)";
  if (score < 75) return "#4b5563";
  return "var(--nm-lawful)";
}

/* =========================================================
   ScoreBar
   ========================================================= */

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div
      style={{
        height: 4,
        background: "#e5e7eb",
        borderRadius: 2,
        overflow: "hidden",
        marginTop: 4,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${score}%`,
          background: color,
          borderRadius: 2,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

/* =========================================================
   OverallTraceBlock — inline overall formula
   ========================================================= */

function OverallTraceBlock({ trace }: { trace: EcosystemHealthTrace }) {
  return (
    <div
      style={{
        borderTop: "1px solid #f3f4f6",
        padding: "12px 16px",
        background: "#fafafa",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.07em",
          color: "#9ca3af",
          marginBottom: 6,
        }}
      >
        OVERALL FORMULA
      </div>
      {trace.overallFormulaLines.map((l, i) => (
        <div
          key={i}
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            color: "#374151",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {l}
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   EcosystemHealthPanel
   ========================================================= */

interface EcosystemHealthPanelProps {
  index: EcosystemHealthIndex;
  trace?: EcosystemHealthTrace | null;
}

export function EcosystemHealthPanel({
  index,
  trace = null,
}: EcosystemHealthPanelProps) {
  const { overall, band, components, explanationLines, cautionLines } = index;
  const bandConf = BAND_CONFIG[band];

  const [activeTrace, setActiveTrace] = useState<TraceTarget>(null);
  const [weightsOpen, setWeightsOpen] = useState(false);

  function toggleTrace(target: Exclude<TraceTarget, null>) {
    setActiveTrace((prev) => (prev === target ? null : target));
  }

  const hasTrace = trace !== null;

  return (
    <div
      className="nm-gov"
      style={{
        fontFamily: "system-ui, sans-serif",
        color: "var(--nm-text, #1a1a1a)",
        padding: 20,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--nm-lawful)",
            marginBottom: 4,
          }}
        >
          ECOSYSTEM HEALTH INDEX
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Bounded composite score — fully decomposable into four explicitly weighted dimensions.
          {hasTrace && (
            <span style={{ marginLeft: 6, color: "var(--nm-lawful)", fontWeight: 600 }}>
              Click any score to trace its inputs.
            </span>
          )}
        </div>
      </div>

      {/* Overall score */}
      <div
        style={{
          border: `1px solid ${bandConf.color}44`,
          borderLeft: `4px solid ${bandConf.color}`,
          borderRadius: 6,
          marginBottom: 18,
          overflow: "hidden",
          background: bandConf.bg,
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 20,
            cursor: hasTrace ? "pointer" : "default",
          }}
          onClick={() => hasTrace && toggleTrace("overall")}
          role={hasTrace ? "button" : undefined}
          aria-expanded={activeTrace === "overall"}
        >
          {/* Dial */}
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div
              style={{
                fontSize: 44,
                fontWeight: 900,
                fontFamily: "monospace",
                color: bandConf.color,
                lineHeight: 1,
              }}
            >
              {overall}
            </div>
            <div style={{ fontSize: 10, color: "#9ca3af", letterSpacing: "0.04em", marginTop: 2 }}>
              / 100
            </div>
          </div>

          {/* Band + bar */}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: bandConf.color,
                  background: bandConf.bg,
                  border: `1px solid ${bandConf.color}55`,
                  padding: "2px 8px",
                  borderRadius: 4,
                  letterSpacing: "0.06em",
                }}
              >
                {bandConf.label}
              </span>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{bandConf.range}</span>
            </div>
            <ScoreBar score={overall} color={bandConf.color} />
          </div>

          {hasTrace && (
            <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
              {activeTrace === "overall" ? "▲ hide trace" : "▼ trace"}
            </span>
          )}
        </div>

        {activeTrace === "overall" && trace && <OverallTraceBlock trace={trace} />}
      </div>

      {/* Component scores */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          marginBottom: 18,
          background: "#fff",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 16px 4px",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "#9ca3af",
          }}
        >
          COMPONENT SCORES
        </div>

        {COMPONENT_DEFS.map(({ key, label }) => {
          const score      = components[key as keyof typeof components];
          const color      = componentColor(score);
          const isOpen     = activeTrace === key;
          const compTrace  = trace?.componentTraces.find((t) => t.component === key);

          return (
            <div key={key}>
              <div
                style={{
                  padding: "10px 16px",
                  cursor: hasTrace && compTrace ? "pointer" : "default",
                  background: isOpen ? "#f8f9fc" : "transparent",
                  borderTop: "1px solid #f3f4f6",
                }}
                onClick={() => hasTrace && compTrace && toggleTrace(key)}
                role={hasTrace && compTrace ? "button" : undefined}
                aria-expanded={isOpen}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, color: "#4b5563", flex: 1 }}>{label}</span>
                  <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>
                    ×{WEIGHTS[key].toFixed(2)}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      fontFamily: "monospace",
                      color,
                      minWidth: 28,
                      textAlign: "right",
                    }}
                  >
                    {score}
                  </span>
                  {hasTrace && compTrace && (
                    <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 4 }}>
                      {isOpen ? "▲" : "▼"}
                    </span>
                  )}
                </div>
                <ScoreBar score={score} color={color} />
              </div>

              {isOpen && compTrace && (
                <div
                  style={{
                    padding: "14px 16px",
                    borderTop: "1px solid #e5e7eb",
                    background: "#f8f9fc",
                  }}
                >
                  <ComponentTraceView trace={compTrace} />
                </div>
              )}
            </div>
          );
        })}

        {/* Formula footnote */}
        <div style={{ padding: "10px 16px", borderTop: "1px solid #f3f4f6" }}>
          <button
            onClick={() => setWeightsOpen((v) => !v)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              color: "#9ca3af",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            {weightsOpen ? "Hide formula" : "Show formula"}
          </button>
          {weightsOpen && (
            <div
              style={{
                marginTop: 8,
                background: "#f8f9fc",
                borderRadius: 4,
                padding: "8px 10px",
                fontSize: 11,
                fontFamily: "monospace",
                color: "#4b5563",
                lineHeight: 1.7,
              }}
            >
              overall = stability × 0.35<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ calibrationQuality × 0.25<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ governanceEffectiveness × 0.25<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ policyChurn × 0.15<br />
              Clamped to [0, 100]. All scores are integers.
            </div>
          )}
        </div>
      </div>

      {/* Caution lines */}
      {cautionLines.length > 0 && (
        <div
          style={{
            background: "#7a2e2e10",
            border: "1px solid var(--nm-invalid)44",
            borderLeft: "4px solid var(--nm-invalid)",
            borderRadius: 6,
            padding: "10px 14px",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              color: "var(--nm-invalid)",
              marginBottom: 6,
              textTransform: "uppercase",
            }}
          >
            CAUTIONS
          </div>
          {cautionLines.map((line, i) => (
            <div key={i} style={{ fontSize: 12, color: "#4b5563", marginBottom: 4 }}>
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Explanation lines */}
      <div
        style={{
          background: "#f8f9fc",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          padding: "12px 14px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "#9ca3af",
            marginBottom: 8,
          }}
        >
          EXPLANATION
        </div>
        {explanationLines.map((line, i) => (
          <div
            key={i}
            style={{
              fontSize: 12,
              color: "#4b5563",
              marginBottom: 5,
              lineHeight: 1.5,
              paddingLeft: 8,
              borderLeft: "2px solid #e5e7eb",
            }}
          >
            {line}
          </div>
        ))}
        <div style={{ marginTop: 10, fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
          This score is advisory only. It does not suppress or replace the underlying audit data.
        </div>
      </div>
    </div>
  );
}

export default EcosystemHealthPanel;
