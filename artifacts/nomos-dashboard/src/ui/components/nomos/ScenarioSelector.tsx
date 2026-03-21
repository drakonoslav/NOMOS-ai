import React from "react";
import type { DemoScenario } from "../../demo/scenario_builder";

export interface ScenarioSelectorProps {
  value: DemoScenario;
  onChange: (scenario: DemoScenario) => void;
}

const SCENARIOS: { id: DemoScenario; label: string; short: string }[] = [
  { id: "lawful_baseline",     label: "Lawful Baseline",      short: "LAWFUL"   },
  { id: "degraded_low_margin", label: "Degraded Low Margin",  short: "DEGRADED" },
  { id: "refused_infeasible",  label: "Refused Infeasible",   short: "INVALID"  },
];

export function ScenarioSelector({ value, onChange }: ScenarioSelectorProps) {
  return (
    <div className="scenario-selector">
      <div className="scenario-selector__label">Scenario</div>
      <div className="scenario-selector__group">
        {SCENARIOS.map((s) => {
          const isActive = value === s.id;
          return (
            <button
              key={s.id}
              className={[
                "scenario-selector__button",
                `scenario-selector__button--${statusClass(s.id)}`,
                isActive ? "is-active" : "",
              ].join(" ")}
              onClick={() => onChange(s.id)}
            >
              <span className="scenario-selector__short">{s.short}</span>
              <span className="scenario-selector__name">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function statusClass(s: DemoScenario): "lawful" | "degraded" | "invalid" {
  if (s === "lawful_baseline")     return "lawful";
  if (s === "degraded_low_margin") return "degraded";
  return "invalid";
}
