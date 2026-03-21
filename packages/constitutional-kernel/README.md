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
# From workspace root (pnpm monorepo)
pnpm install
pnpm --filter @workspace/constitutional-kernel run start
pnpm --filter @workspace/constitutional-kernel run check

# Or directly from the package directory
pnpm start
pnpm check
pnpm test          # typecheck + demo in one pass

# Standalone (npm — if extracted outside the monorepo)
npm install
npm run start      # tsx src/main.ts
npm run check      # tsc --noEmit
npm test           # tsc --noEmit && tsx src/main.ts
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

## Six-Layer Architecture

The kernel is structured as six ordered layers. Each layer has a single constitutional responsibility and hands a typed report to the next layer. No layer may bypass or short-circuit a lower-numbered layer.

| Layer | Name | Responsibility | Source Files | Law |
|-------|------|----------------|--------------|-----|
| 1 | **Ontology** | Define the universe: states, controls, resources, constraints, dependency stamps. Provides the shared vocabulary all layers speak. | `feasibility_engine.ts` (type exports: `FeasibilityInput`, `ConstraintDefinition`, `DependencyStamp`, …) | — |
| 2 | **Epistemic** | Maintain beliefs about the world with explicit uncertainty quantification. Detect measurement delays; propagate covariance; track provenance. Flag low-confidence or unidentifiable states rather than silently hiding them. | `belief_state.ts`, `observer.ts` | III |
| 3 | **Model** | Register, score, and switch between dynamical models. Compute residuals, prediction errors, and invariant violations. Select the best-scoring non-degraded model; fall back constitutionally when all primaries are degraded. | `model_registry.ts` | IV (partial) |
| 4 | **Decision** | Enforce the constitutional plan-selection order: (i) reject infeasible plans (Law I), (ii) reject plans below the minimum robustness radius (Law II), (iii) rank survivors by robustness first, cost second (Law II, T2.5). Return an explicit `DecisionResult` — never silently coerce an infeasible plan into a lawful one. | `feasibility_engine.ts`, `robustness_analyzer.ts`, `decision_engine.ts` | I, II |
| 5 | **Verification** | Cross-law synthesis gate. Aggregates Law I (feasibility), Law II (robustness), Law III (observability, identifiability), and Law IV (model confidence, objective drift) into a single `VerificationReport`. Outputs `LAWFUL`, `DEGRADED`, or `REFUSED` — never a silent pass on a multi-law violation. | `verification_kernel.ts` | I, II, III, IV |
| 6 | **Control / Audit** | Apply or refuse the verified control action. Append a tamper-evident audit record containing the full decision trail (belief, model, feasibility, robustness, verification, outcome). Provide summary statistics for post-hoc constitutional review. | `constitution_guard.ts`, `audit_log.ts` | IV |

### Layer Interaction Contract

```
Layer 2 (Epistemic)   →  BeliefState
Layer 3 (Model)       →  ModelSignature + ModelConfidence
Layer 4 (Decision)    →  DecisionResult { selectedPlan, feasibility, robustness }
Layer 5 (Verification)→  VerificationReport { status: LAWFUL | DEGRADED | REFUSED }
Layer 6 (Control)     →  AuditRecord { outcome: APPLIED | DEGRADED_ACTION_APPLIED | REFUSED }
```

Each arrow is a named TypeScript interface. No layer produces untyped outputs or swallows errors silently.

## Key Design Decisions

- **No silent fallbacks.** Every failure path surfaces an explicit reason string and a structured report.
- **Equality ≠ slack.** `computeMinimumMargin` excludes equality/conservation constraints from the robustness radius — their binary tolerance is not a meaningful safety margin.
- **Generic ranking.** `rankByRobustnessThenCost<P extends CandidatePlan>` preserves the full extended plan type through the ranking step.
- **Delay-consistent robustness.** The robustness certificate is only valid if `analyzedOnDelayedModel` matches `delayPresent`.
- **Provenance tracking.** Every belief carries a `provenance` string array recording each transformation step.
