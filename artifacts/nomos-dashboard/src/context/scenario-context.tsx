/**
 * scenario-context.tsx
 *
 * Provides the selected demo scenario to all components.
 * The scenario is a function of user intent, not epistemic state —
 * it selects WHICH constitutional path to demonstrate.
 *
 * Scenarios: lawful_baseline | refused_infeasible
 */

import React, { createContext, useContext, useState } from "react";

export type DemoScenario = "lawful_baseline" | "refused_infeasible";

interface ScenarioContextValue {
  scenario: DemoScenario;
  setScenario: (s: DemoScenario) => void;
}

const ScenarioContext = createContext<ScenarioContextValue>({
  scenario: "lawful_baseline",
  setScenario: () => {},
});

export function ScenarioProvider({ children }: { children: React.ReactNode }) {
  const [scenario, setScenario] = useState<DemoScenario>("lawful_baseline");
  return (
    <ScenarioContext.Provider value={{ scenario, setScenario }}>
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario(): ScenarioContextValue {
  return useContext(ScenarioContext);
}
