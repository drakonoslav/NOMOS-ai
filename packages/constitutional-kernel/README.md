# Mission Mathematics — Constitutional AI Kernel

A formal reasoning substrate for mission-critical autonomous systems, implemented in TypeScript.
This is **not** an LLM chatbot. It is a constitutional reasoning engine grounded in four Laws
that govern every decision from belief formation through control actuation.

## The Four Laws

| Law | Name | Core Guarantee |
|-----|------|----------------|
| I   | Feasibility | A plan is only considered if it satisfies all constraints. Stale solutions are rejected before evaluation begins. |
| II  | Robustness | Among feasible plans, robustness radius dominates cost. No cost-optimal but fragile plan is selected. |
| III | Observability | Beliefs are tracked with explicit uncertainty bounds. Unobservable or unidentifiable states are flagged, never silently ignored. |
| IV  | Adaptive Correction | When models degrade or objectives drift, the kernel degrades gracefully and triggers recomputation rather than applying corrupted control. |

## Package Layout

```
packages/constitutional-kernel/
├── src/
│   ├── belief_state.ts        # Law III: belief representation with uncertainty
│   ├── observer.ts            # Law III: measurement fusion, delay compensation
│   ├── feasibility_engine.ts  # Law I:  constraint checking, stale-manifold invalidation
│   ├── robustness_analyzer.ts # Law II: epsilon radius, sensitivity, fragile dimensions
│   ├── decision_engine.ts     # Laws I+II: constitutional plan ranking and selection
│   ├── verification_kernel.ts # Law IV: cross-law synthesis, DEGRADED/REFUSED gates
│   ├── model_registry.ts      # model lifecycle, confidence scoring, fallback switching
│   ├── constitution_guard.ts  # top-level constitutional gate (wraps all laws)
│   ├── audit_log.ts           # tamper-evident decision record
│   ├── index.ts               # barrel re-export
│   └── main.ts                # end-to-end demo
├── package.json
├── tsconfig.json
└── README.md
```

## Quick Start

```bash
# From workspace root
pnpm install

# Run the demo
pnpm --filter @workspace/constitutional-kernel exec tsx src/main.ts

# Typecheck
pnpm --filter @workspace/constitutional-kernel exec tsc --noEmit
```

The demo exercises the full constitutional chain:

1. **Belief / Observer** — a simulated sensor measurement with 40 ms delay is fused into a belief state with covariance-tracked uncertainty.
2. **Model Registry** — the primary model is scored; a degraded residual triggers fallback selection.
3. **Decision Engine** — two candidate plans are evaluated: plan-A (higher cost, larger robustness radius) and plan-B (lower cost, tighter margin). Law II selects plan-A.
4. **Verification Kernel** — cross-law consistency is checked. Staleness and model degradation produce a `DEGRADED` status rather than `LAWFUL`.
5. **Constitution Guard** — the guard applies the degraded control and records the outcome.
6. **Audit Log** — a tamper-evident record is appended with the full decision trail.

## Demo Output Summary

```
[decision] selected plan: plan-A          ← robustness (ε=0.20) beats cost (plan-B cost=0.95)
[verification] status: DEGRADED           ← stale belief + degraded model = gated output
[actuation] APPLY DEGRADED control: [0.1]
Audit outcome: DEGRADED_ACTION_APPLIED
```

## Constitutional Chain

```
Sensor measurement
      │
      ▼
┌──────────────┐   Law III
│   Observer   │  uncertainty, delay compensation
└──────┬───────┘
       │ BeliefState
       ▼
┌──────────────────┐   Law I
│FeasibilityEngine │  equality / inequality / resource / terminal / staleness
└──────┬───────────┘
       │ FeasibilityReport
       ▼
┌───────────────────┐   Law II
│RobustnessAnalyzer │  epsilon radius, sensitivity spectrum, horizon bound
└──────┬────────────┘
       │ RobustnessReport
       ▼
┌───────────────┐   Laws I+II
│DecisionEngine │  constitutional ranking: feasibility > robustness > cost
└──────┬────────┘
       │ DecisionResult (selectedPlan)
       ▼
┌──────────────────────┐   Law IV
│VerificationKernel    │  cross-law synthesis → LAWFUL / DEGRADED / REFUSED
└──────┬───────────────┘
       │ VerificationReport
       ▼
┌─────────────────┐
│ConstitutionGuard│  apply / gate / recompute
└──────┬──────────┘
       │
       ▼
┌──────────┐
│ AuditLog │  tamper-evident append
└──────────┘
```

## Key Design Decisions

- **No silent fallbacks.** Every failure path surfaces an explicit reason string and a structured report.
- **Equality ≠ slack.** `computeMinimumMargin` excludes equality/conservation constraints from the robustness radius — their binary tolerance is not a meaningful safety margin.
- **Generic ranking.** `rankByRobustnessThenCost<P extends CandidatePlan>` preserves the full extended plan type through the ranking step.
- **Delay-consistent robustness.** The robustness certificate is only valid if `analyzedOnDelayedModel` matches `delayPresent`.
- **Provenance tracking.** Every belief carries a `provenance` string array recording each transformation step.
