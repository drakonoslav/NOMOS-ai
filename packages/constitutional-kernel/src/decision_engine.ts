/**
 * decision_engine.ts
 *
 * Constitutional role:
 * Implements the Decision Layer.
 *
 * This engine enforces the lawful ranking:
 *   1. reject infeasible plans
 *   2. reject stale plans
 *   3. reject non-conservative plans
 *   4. reject insufficiently robust plans
 *   5. rank remaining plans by robustness first, cost second
 *
 * Source alignment:
 *   - Law I: feasibility precedes optimization
 *   - T1.1 / L1.2: stale manifold invalidity
 *   - T1.3: lawful workflow requires explicit checks
 *   - Law II / T2.5: robustness dominates cost
 */

import { FeasibilityEngine, FeasibilityReport } from "./feasibility_engine.js";
import { RobustnessAnalyzer, CandidatePlan as RACandidatePlan, RobustnessConfig, RobustnessReport } from "./robustness_analyzer.js";

export interface CandidatePlan extends RACandidatePlan {
  controlSequence: number[][];
  robustnessConfig: RobustnessConfig;
}

export interface RejectedPlanRecord {
  id: string;
  reasons: string[];
}

export interface DecisionResult {
  lawful: boolean;
  selectedPlan?: CandidatePlan;
  rejectedPlans: RejectedPlanRecord[];
  reason?: string;
  feasibility?: FeasibilityReport;
  robustness?: RobustnessReport;
  ranking?: Array<{
    id: string;
    expectedCost: number;
    epsilon: number;
    feasible: boolean;
  }>;
}

export class DecisionEngine {
  constructor(
    private readonly feasibilityEngine = new FeasibilityEngine(),
    private readonly robustnessAnalyzer = new RobustnessAnalyzer(feasibilityEngine)
  ) {}

  public decide(candidates: CandidatePlan[]): DecisionResult {
    if (candidates.length === 0) {
      return {
        lawful: false,
        rejectedPlans: [],
        reason: "No candidate plans were supplied.",
      };
    }

    const rejectedPlans: RejectedPlanRecord[] = [];
    const survivors: Array<{
      plan: CandidatePlan;
      feasibility: FeasibilityReport;
      robustness: RobustnessReport;
      feasible: boolean;
    }> = [];

    for (const plan of candidates) {
      const feasibility = this.feasibilityEngine.evaluate(plan.feasibilityInput);
      const planReasons: string[] = [...feasibility.reasons];

      if (!feasibility.feasible) {
        rejectedPlans.push({
          id: plan.id,
          reasons: planReasons.length > 0 ? planReasons : ["Plan is infeasible."],
        });
        continue;
      }

      const robustness = this.robustnessAnalyzer.analyzePlan(plan, {
        ...plan.robustnessConfig,
        nominalFeasibility: feasibility,
      });

      if (robustness.epsilon < robustness.epsilonMin) {
        rejectedPlans.push({
          id: plan.id,
          reasons: [
            ...planReasons,
            ...robustness.reasons,
            "Plan rejected: robustness radius below constitutional minimum.",
          ],
        });
        continue;
      }

      if (!robustness.delayConsistent) {
        rejectedPlans.push({
          id: plan.id,
          reasons: [
            ...planReasons,
            ...robustness.reasons,
            "Plan rejected: delay-inconsistent robustness certificate.",
          ],
        });
        continue;
      }

      if (!robustness.bounded) {
        rejectedPlans.push({
          id: plan.id,
          reasons: [
            ...planReasons,
            ...robustness.reasons,
            "Plan rejected: no finite horizon-wide bound.",
          ],
        });
        continue;
      }

      survivors.push({
        plan,
        feasibility,
        robustness,
        feasible: true,
      });
    }

    if (survivors.length === 0) {
      return {
        lawful: false,
        rejectedPlans,
        reason: "All candidate plans were constitutionally screened out.",
      };
    }

    const ranked = this.robustnessAnalyzer.rankByRobustnessThenCost(survivors);
    const winner = ranked[0];

    if (!winner) {
      return {
        lawful: false,
        rejectedPlans,
        reason: "Ranking produced no winner.",
      };
    }

    return {
      lawful: true,
      selectedPlan: winner.plan,
      rejectedPlans,
      feasibility: winner.feasibility,
      robustness: winner.robustness,
      ranking: ranked.map((entry) => ({
        id: entry.plan.id,
        expectedCost: entry.plan.expectedCost,
        epsilon: entry.robustness.epsilon,
        feasible: entry.feasible,
      })),
    };
  }

  /**
   * Utility for explicit infeasibility declaration:
   * constitutionally preferable to silent fabrication.
   */
  public declareInfeasible(reason: string, rejectedPlans: RejectedPlanRecord[] = []): DecisionResult {
    return {
      lawful: false,
      rejectedPlans,
      reason,
    };
  }
}
