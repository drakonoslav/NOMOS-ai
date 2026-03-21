/**
 * HealthTracePanel.tsx
 *
 * Renders the full traceability record for a single health component or the
 * overall health index, showing exact raw inputs, the step-by-step formula
 * with actual values substituted, contributing record IDs, and explanation
 * lines.
 *
 * This panel is read-only and advisory.
 * It does not modify any score, record, or policy.
 * No LLM generation is used.
 */

import React from "react";
import type {
  HealthComponentTrace,
  EcosystemHealthTrace,
} from "../../../audit/health_trace_types";

/* =========================================================
   Helpers
   ========================================================= */

const COMPONENT_LABELS: Record<HealthComponentTrace["component"], string> = {
  stability:               "Stability",
  calibrationQuality:      "Calibration Quality",
  governanceEffectiveness: "Governance Effectiveness",
  policyChurn:             "Policy Churn",
};

const COMPONENT_WEIGHTS: Record<HealthComponentTrace["component"], number> = {
  stability:               0.35,
  calibrationQuality:      0.25,
  governanceEffectiveness: 0.25,
  policyChurn:             0.15,
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: "#9ca3af",
        marginBottom: 6,
        marginTop: 12,
      }}
    >
      {children}
    </div>
  );
}

function MonoBlock({ lines }: { lines: string[] }) {
  return (
    <div
      style={{
        background: "#f8f9fc",
        border: "1px solid #e5e7eb",
        borderRadius: 4,
        padding: "8px 10px",
      }}
    >
      {lines.map((l, i) => (
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

function InputTable({ inputs }: { inputs: Record<string, number | string | boolean | null> }) {
  const entries = Object.entries(inputs);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
      <tbody>
        {entries.map(([key, val]) => (
          <tr key={key} style={{ borderBottom: "1px solid #f3f4f6" }}>
            <td
              style={{
                padding: "3px 8px 3px 0",
                fontFamily: "monospace",
                color: "#6b7280",
                whiteSpace: "nowrap",
                verticalAlign: "top",
              }}
            >
              {key}
            </td>
            <td
              style={{
                padding: "3px 0",
                fontFamily: "monospace",
                fontWeight: 700,
                color: val === null ? "#9ca3af" : "#1f2937",
                fontStyle: val === null ? "italic" : "normal",
              }}
            >
              {val === null
                ? "null"
                : typeof val === "boolean"
                ? String(val)
                : typeof val === "number"
                ? String(val)
                : val}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* =========================================================
   ComponentTraceView
   ========================================================= */

interface ComponentTraceViewProps {
  trace: HealthComponentTrace;
}

export function ComponentTraceView({ trace }: ComponentTraceViewProps) {
  const label  = COMPONENT_LABELS[trace.component];
  const weight = COMPONENT_WEIGHTS[trace.component];

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        color: "var(--nm-text, #1a1a1a)",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: "var(--nm-lawful)",
            letterSpacing: "0.04em",
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>
          Weight: <span style={{ fontFamily: "monospace" }}>{weight}</span>
          &nbsp;·&nbsp;
          Weighted contribution:{" "}
          <span style={{ fontFamily: "monospace", fontWeight: 700 }}>
            {trace.weightedContribution}
          </span>
        </div>
      </div>

      {/* Raw inputs */}
      <SectionHeader>Raw Inputs</SectionHeader>
      <InputTable inputs={trace.rawInputs} />

      {/* Formula */}
      <SectionHeader>Formula (with actual values)</SectionHeader>
      <MonoBlock lines={trace.formulaLines} />

      {/* Contributing records */}
      <SectionHeader>Contributing Record IDs</SectionHeader>
      {trace.contributingRecordIds.length === 0 ? (
        <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
          No records contributed — this component scored at the baseline.
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {trace.contributingRecordIds.map((id) => (
            <span
              key={id}
              style={{
                fontSize: 10,
                fontFamily: "monospace",
                color: "#374151",
                background: "#f3f4f6",
                border: "1px solid #e5e7eb",
                padding: "2px 7px",
                borderRadius: 4,
              }}
            >
              {id}
            </span>
          ))}
        </div>
      )}

      {/* Explanation */}
      <SectionHeader>Explanation</SectionHeader>
      {trace.explanationLines.map((l, i) => (
        <div
          key={i}
          style={{
            fontSize: 12,
            color: "#4b5563",
            marginBottom: 4,
            paddingLeft: 8,
            borderLeft: "2px solid #e5e7eb",
            lineHeight: 1.5,
          }}
        >
          {l}
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   HealthTracePanel — full overall trace
   ========================================================= */

interface HealthTracePanelProps {
  trace: EcosystemHealthTrace;
}

export function HealthTracePanel({ trace }: HealthTracePanelProps) {
  const [openComponent, setOpenComponent] = React.useState<
    HealthComponentTrace["component"] | "overall" | null
  >(null);

  const COMP_ORDER: HealthComponentTrace["component"][] = [
    "stability",
    "calibrationQuality",
    "governanceEffectiveness",
    "policyChurn",
  ];

  const activeTrace =
    openComponent && openComponent !== "overall"
      ? trace.componentTraces.find((t) => t.component === openComponent) ?? null
      : null;

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
      <div style={{ marginBottom: 14 }}>
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
          HEALTH INDEX TRACEABILITY
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Click any component to inspect its exact inputs, formula, and contributing records.
        </div>
      </div>

      {/* Overall formula */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 14,
        }}
      >
        <button
          onClick={() =>
            setOpenComponent(openComponent === "overall" ? null : "overall")
          }
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "10px 14px",
            background: openComponent === "overall" ? "#f8f9fc" : "#fff",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span
            style={{ fontSize: 12, fontWeight: 700, color: "#1f2937", flex: 1 }}
          >
            Overall — weighted sum
          </span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 900,
              fontFamily: "monospace",
              color: "var(--nm-lawful)",
            }}
          >
            {trace.overallInputs.overall}
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>
            {openComponent === "overall" ? "▲" : "▼"}
          </span>
        </button>

        {openComponent === "overall" && (
          <div
            style={{
              borderTop: "1px solid #f3f4f6",
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
                marginBottom: 6,
              }}
            >
              FORMULA
            </div>
            <MonoBlock lines={trace.overallFormulaLines} />

            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "#9ca3af",
                marginBottom: 6,
                marginTop: 10,
              }}
            >
              COMPONENT VALUES
            </div>
            <InputTable
              inputs={Object.fromEntries(
                Object.entries(trace.overallInputs).map(([k, v]) => [k, v])
              )}
            />
          </div>
        )}
      </div>

      {/* Component rows */}
      {COMP_ORDER.map((comp) => {
        const ct   = trace.componentTraces.find((t) => t.component === comp);
        const open = openComponent === comp;
        if (!ct) return null;

        return (
          <div
            key={comp}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              overflow: "hidden",
              marginBottom: 10,
            }}
          >
            <button
              onClick={() => setOpenComponent(open ? null : comp)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "10px 14px",
                background: open ? "#f8f9fc" : "#fff",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#374151",
                  flex: 1,
                }}
              >
                {COMPONENT_LABELS[comp]}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "#9ca3af",
                  fontFamily: "monospace",
                }}
              >
                ×{COMPONENT_WEIGHTS[comp].toFixed(2)}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "#9ca3af",
                  marginLeft: 6,
                }}
              >
                contribution: {ct.weightedContribution}
              </span>
              <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>
                {open ? "▲" : "▼"}
              </span>
            </button>

            {open && (
              <div
                style={{
                  borderTop: "1px solid #f3f4f6",
                  padding: "14px 16px",
                }}
              >
                <ComponentTraceView trace={ct} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default HealthTracePanel;
