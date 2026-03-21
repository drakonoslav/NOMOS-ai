/**
 * scenario_builder.ts
 *
 * Dashboard-side scenario registry.
 *
 * Returns structured descriptors for each deterministic demo scenario.
 * These are consumed by the UI (scenario selector cards, scenario context).
 * The actual runtime computation lives in the constitutional kernel.
 *
 * Separation principle:
 *   - Kernel:    computes the scenario (belief, verification, decision, audit)
 *   - Dashboard: describes the scenario (labels, teaching points, epistemic profile)
 */

import type { DemoScenario, ScenarioDescriptor } from "./scenario_types";
import { lawful_baseline } from "./lawful_baseline";
import { degraded_low_margin } from "./degraded_low_margin";
import { refused_infeasible } from "./refused_infeasible";

export const SCENARIO_DESCRIPTORS: ScenarioDescriptor[] = [
  lawful_baseline,
  degraded_low_margin,
  refused_infeasible,
];

export function getScenarioDescriptor(id: DemoScenario): ScenarioDescriptor {
  const found = SCENARIO_DESCRIPTORS.find((d) => d.id === id);
  if (!found) throw new Error(`Unknown scenario: ${id}`);
  return found;
}

export function buildScenarioRuntime(scenario: DemoScenario): {
  descriptor: ScenarioDescriptor;
} {
  return { descriptor: getScenarioDescriptor(scenario) };
}
