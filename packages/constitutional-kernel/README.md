# NOMOS

**A constitutional system governing lawful action under reality.**

*Only the lawful may act.*

---

NOMOS does not begin from fluency.
It begins from law.
It does not assume that what is proposed may be done.
It does not assume that what is estimated is true.
It does not assume that what is optimal will survive.
It permits action only when feasibility, robustness, observability, and verification jointly hold.

---

This repository implements the NOMOS Core kernel — a formal reasoning substrate for AI systems
whose decisions are governed by explicit epistemic law. It is **not** an LLM chatbot, a
heuristic planner, or an unconstrained optimizer. It is a constitutional reasoning engine in
which every decision from belief formation through control actuation is subject to a strict ordering:

> **Feasibility → Robustness → Observability → Adaptation → Verification**

That ordering is not stylistic. It is structural. It encodes the principle:
a system must first be *possible*, then *stable*, then *knowable*, then *correctable* —
only then may it act.

---

## The Four Constitutional Laws

| Law | Name | Core Guarantee |
|-----|------|----------------|
| **I**   | Feasibility | No action may violate physical, logical, or resource constraints. If it cannot exist, it cannot be chosen. |
| **II**  | Robustness | A feasible plan must remain feasible under bounded perturbations. Nominal validity is insufficient; survival under disturbance is required. |
| **III** | Observability | The system must have sufficient information to estimate its own state. An estimate is not truth; unobservable systems cannot be controlled reliably. |
| **IV**  | Adaptive Correction | The system must continuously correct itself through feedback. Intelligence is not a single solution but a persistent re-solution process. |

**Supremacy Rule:** lower layers dominate higher layers.

```
Feasibility > Robustness > Observability > Adaptation > Optimization
```

No higher-layer objective may override a lower-layer violation.

---

## Package Layout

```
packages/constitutional-kernel/
├── src/
│   ├── belief_state.ts        # Law III: belief representation, uncertainty, provenance
│   ├── observer.ts            # Law III: measurement fusion, delay compensation, observability
│   ├── feasibility_engine.ts  # Law I:  constraint checking, stale-manifold invalidation
│   ├── robustness_analyzer.ts # Law II: epsilon radius, sensitivity spectrum, fragile dimensions
│   ├── decision_engine.ts     # Laws I+II: constitutional plan ranking and selection
│   ├── verification_kernel.ts # Law IV: cross-law synthesis, LAWFUL / DEGRADED / REFUSED
│   ├── model_registry.ts      # model lifecycle, confidence scoring, fallback switching
│   ├── constitution_guard.ts  # top-level constitutional gate: apply / degrade / refuse
│   ├── audit_log.ts           # tamper-evident full-trace decision record
│   ├── llm_proposer.ts        # proposal generation layer (non-authoritative)
│   ├── index.ts               # barrel re-export
│   └── main.ts                # end-to-end demo
├── package.json
├── tsconfig.json
└── README.md
```

---

## Quick Start

```bash
# From workspace root
pnpm install
pnpm --filter @nomos/core run start
pnpm --filter @nomos/core run check

# Or directly from the package directory
pnpm start          # tsx src/main.ts
pnpm check          # tsc --noEmit
pnpm test           # tsc --noEmit && tsx src/main.ts (smoke test)
```

> **Note:** This package uses pnpm `catalog:` dependency specifiers and must be run inside
> the pnpm workspace. To extract as a standalone package, replace the `catalog:` specifiers
> in `package.json` with concrete semver versions (`tsx@^4.x`, `@types/node@^22.x`).

---

## Runtime Chain

```
REAL WORLD
   │
   ▼
Measurement z(t)
   │
   ▼
[ OBSERVER ]
   │  produces
   ▼
Belief State b(t) = (x̂, θ̂, ε, identifiability)
   │
   ▼
[ MODEL REGISTRY ]
   │  provides ℳ, confidence, mismatch detection
   ▼
Model-conditioned belief
   │
   ▼
[ LLM PROPOSER ]
   │  generates candidate plans Π = {π₁, π₂, ...}
   │  lawful: false on every proposal
   ▼
Proposals (non-authoritative)
   │
   ▼
[ DECISION ENGINE ]
   │  filters via Law I + II
   │  ranking: feasibility > robustness > cost
   ▼
Feasible & robust candidate set Π*
   │
   ▼
[ VERIFICATION KERNEL ]
   │  enforces Law I–IV
   ▼
Verification status ∈ {LAWFUL, DEGRADED, INVALID}
   │
   ▼
[ CONSTITUTION GUARD ]
   │
   ├── APPLY
   ├── DEGRADE
   └── REFUSE
   ▼
Control u(t)
   │
   ▼
[ AUDIT LOG ]
   │
   ▼
REAL WORLD (state evolves)
```

---

## Layer-by-Layer Description

### NOMOS Belief (`belief_state.ts`)

Maintains the explicit epistemic state:
- `x̂(t)` — state estimate
- `θ̂` — parameter belief with identifiability flags
- `εₓ` — uncertainty bound such that `‖x(t) − x̂(t)‖ ≤ ε(t)`
- staleness, confidence band, provenance chain

Uncertainty is explicit here, not implicit. An unobservable or stale belief is flagged,
never silently treated as ground truth.

### NOMOS Observer (`observer.ts`)

Transforms bounded measurements into updated belief:
- checks innovation residuals
- compensates for measurement delay
- enforces observability conditions
- evaluates information sufficiency
- tracks false-legibility risk

Prevents: false certainty, stale inference, unobservable control.

### NOMOS Model (`model_registry.ts`)

Maintains:
- active model class ℳ and its measurement map
- parameter belief
- model confidence scoring
- mismatch detection via residual norms
- constitutional fallback switching

The model is not assumed correct — it is continuously evaluated.

### NOMOS Proposer (`llm_proposer.ts`)

Generates candidate proposals. This stage is **non-authoritative**.

It may produce:
- `CONTROL_PLAN` — a candidate control sequence
- `STATE_HYPOTHESIS` — an alternative state estimate
- `PARAMETER_HYPOTHESIS` — a candidate parameter vector
- `RECOVERY_ACTION` — a suggested recovery sketch
- `OBJECTIVE_REFRAME` — a candidate objective restatement

It may **not**:
- certify feasibility
- certify robustness
- certify observability
- authorize action
- bypass verification

Every `LLMProposal` is constructed with:

```typescript
lawful: false
```

This is not cosmetic. It encodes the constitutional fact that *proposal is not authorization*.

#### LLM Containment Boundary

```
                ┌───────────────────────┐
                │     LLM PROPOSER      │
                │  (non-authoritative)  │
                └─────────┬─────────────┘
                          │ proposals only
                          ▼
                ┌───────────────────────┐
                │   DECISION ENGINE     │
                └─────────┬─────────────┘
                          ▼
                ┌───────────────────────┐
                │ VERIFICATION KERNEL   │
                └─────────┬─────────────┘
                          ▼
                ┌───────────────────────┐
                │ CONSTITUTION GUARD    │
                └───────────────────────┘

Hard rule: the LLM cannot cross the verification boundary.
```

### NOMOS Decision (`decision_engine.ts`)

Converts screened proposals into lawful candidates and applies the constitutional ranking:

```
Candidate Plan π
    │
    ▼
[ Feasibility Check ]  (Law I)
    │
    ├── FAIL → REJECT
    ▼
[ Freshness + Conservation Check ]
    │
    ├── FAIL → REJECT
    ▼
[ Robustness Check ]   (Law II)
    │
    ├── FAIL → REJECT
    ▼
[ Rank Survivors ]
    │
    ├── Primary:   robustness margin ε
    └── Secondary: cost J
```

Robustness dominates cost. This is where most fragile or infeasible proposals are rejected.

### NOMOS Verifier (`verification_kernel.ts`)

Final cross-layer authority. Checks all four laws simultaneously:
- feasibility (Law I)
- robustness (Law II)
- observability, identifiability (Law III)
- model validity, objective drift, adaptation integrity (Law IV)

Outputs exactly one of: `LAWFUL` | `DEGRADED` | `INVALID`

No action may bypass this stage.

### NOMOS Guard (`constitution_guard.ts`)

Translates verification status into runtime authority:
- `mayAct` → apply the selected control
- `mustDegrade` → apply a safe degraded action
- `mustRefuse` → refuse entirely

This is the enforcement boundary.

### NOMOS Audit (`audit_log.ts`)

Records the full system trace:
- measurement snapshot
- belief state
- model signature and confidence
- proposal bundle
- feasibility and robustness reports
- verification result
- final control action and outcome

Ensures reproducibility, diagnosability, and accountability.

---

## Law Hierarchy

```
        ┌──────────────────────────────┐
        │        Law IV: Adaptation     │
        └────────────▲─────────────────┘
                     │ depends on
        ┌────────────┴─────────────────┐
        │      Law III: Observability   │
        └────────────▲─────────────────┘
                     │ depends on
        ┌────────────┴─────────────────┐
        │       Law II: Robustness      │
        └────────────▲─────────────────┘
                     │ depends on
        ┌────────────┴─────────────────┐
        │       Law I: Feasibility      │
        └──────────────────────────────┘
```

You cannot observe what is not feasible.
You cannot adapt what you cannot observe.
You cannot optimize what cannot survive perturbation.

---

## Formal Theorems

**Theorem I — Primacy of Feasibility**
If a trajectory violates feasibility, no optimization, learning, or inference can render it valid.

**Theorem II — Necessity of Robustness**
A feasible trajectory without robustness is not operationally valid under perturbation.

**Theorem III — Observability Constraint**
No control law can guarantee correct behavior when the system state is not identifiable
within bounded uncertainty.

**Theorem IV — Adaptive Necessity**
A system that does not continuously re-solve its control problem will diverge under disturbance.

**Theorem V — LLM Integration**
Let Π_LLM be proposals generated by a language model. Then:

```
Π_LLM ⊂ Π_candidate    (proposals enter the candidate pool)
Π_LLM ⊄ Π_lawful       (proposals are not self-authorizing)
```

LLM outputs must be filtered through Laws I–IV before action.

---

## Six-Layer Architecture

| Layer | Name | Responsibility | Source Files | Law |
|-------|------|----------------|--------------|-----|
| 1 | **Ontology** | Define the universe: states, controls, resources, constraints, dependency stamps. Shared vocabulary for all layers. | `feasibility_engine.ts` (type exports) | — |
| 2 | **Epistemic** | Maintain beliefs with explicit uncertainty. Detect measurement delays; propagate covariance; track provenance. Flag low-confidence or unidentifiable states. | `belief_state.ts`, `observer.ts` | III |
| 3 | **Model** | Register, score, and switch dynamical models. Compute residuals, prediction errors, invariant violations. Fall back constitutionally when all primaries are degraded. | `model_registry.ts` | IV |
| 4 | **Proposal** | Generate candidate plans and hypotheses (non-authoritative). All proposals marked `lawful: false`. Deterministic fallback available; swap for live LLM call. | `llm_proposer.ts` | — |
| 5 | **Decision** | Enforce constitutional plan-selection order: reject infeasible → reject non-robust → rank by robustness then cost. Simulate nominal trajectories from proposals. | `feasibility_engine.ts`, `robustness_analyzer.ts`, `decision_engine.ts` | I, II |
| 6 | **Verification + Control** | Cross-law synthesis gate → LAWFUL / DEGRADED / REFUSED. Apply or refuse action. Append tamper-evident audit record. | `verification_kernel.ts`, `constitution_guard.ts`, `audit_log.ts` | I, II, III, IV |

### Layer Interaction Contract

```
Layer 2 (Epistemic)   →  BeliefState
Layer 3 (Model)       →  ModelSignature + ModelConfidence
Layer 4 (Proposal)    →  ProposalBundle { proposals: LLMProposal[] }
Layer 5 (Decision)    →  DecisionResult { selectedPlan, feasibility, robustness }
Layer 6 (Verification)→  VerificationReport { status: LAWFUL | DEGRADED | REFUSED }
Layer 6 (Control)     →  AuditRecord { outcome: APPLIED | DEGRADED_ACTION_APPLIED | REFUSED }
```

Each arrow is a named TypeScript interface. No layer produces untyped outputs or swallows errors silently.

---

## Demo Output

The demo exercises the full constitutional chain end-to-end:

```
[observer]       observable: true | identifiability: FULL | innovation norm: 0.105650
[model]          switched to fallback model: mock-fallback
[llm_proposer]   generated proposals: 2
[llm_proposer]   notes: No parseable live LLM response; deterministic fallback generated.
[planner]        candidate plans from proposer: 2
[decision]       selected plan: candidate-from-llm-plan-<id>
[verification]   status: DEGRADED
[actuation]      APPLY DEGRADED control: [0.1]
[audit]          outcome: DEGRADED_ACTION_APPLIED

--- Constitutional Demo Summary ---
LLM proposals             : 2
Selected plan             : candidate-from-llm-plan-<id>
Robustness epsilon        : 0.354260
Verification status       : DEGRADED
Audit outcome             : DEGRADED_ACTION_APPLIED
```

The system reaches `DEGRADED` (not `LAWFUL`) because: measurement delay is 40 ms,
model residual exceeds tolerance, and objective drift is 0.975 which exceeds the 0.90 threshold.
This is the correct constitutional response — the system flags its own limitations rather than
silently claiming lawful authority.

---

## Using the LLM Proposer

```typescript
import { LLMProposer, MissionContext } from "@nomos/core";

const proposer = new LLMProposer();

// Swap rawLLMResponse for a live API call when ready.
// deterministicFallback keeps the system runnable without an API key.
const bundle = proposer.propose({
  missionContext,
  belief: updatedBelief,
  modelSignature: modelRegistry.getActiveSignature(),
  operatorHints: ["prefer conservative actuation"],
  deterministicFallback: true,
  // rawLLMResponse: await callYourLLM(prompt),
});

// Only CONTROL_PLAN proposals become candidate plans
const candidatePlans = bundle.proposals
  .filter((p) => p.kind === "CONTROL_PLAN" && !!p.planSketch)
  .map((proposal) => {
    const nominal = simulateNominalPlan(...);
    return proposer.toCandidatePlan({
      proposal,
      nominalX: nominal.nominalX,
      nominalU: nominal.nominalU,
      nominalR: nominal.nominalR,
      feasibilityInput: makeFeasibilityInput(...),
      robustnessConfig: { epsilonMin: 0.03, ... },
    });
  });

const decision = decisionEngine.decide(candidatePlans);
const verification = verificationKernel.verify(...);
const authority = decideAuthority(verification);
```

### Plugging in a Real LLM

The raw LLM response parser accepts blocks in this format:

```
CONTROL_PLAN:
[[0.25],[0.25],[0.25],[0.25]]
RATIONALE: Conservative corrective thrust toward target.
ASSUMPTIONS: state estimate usable; fuel margin positive

STATE_HYPOTHESIS:
[0.45, 0.88]
RATIONALE: Alternative state based on secondary sensor.
```

Unknown blocks are collected in `bundle.rejectedFragments` with reasons — never silently dropped.

---

## Key Design Decisions

- **No silent fallbacks.** Every failure path surfaces an explicit reason string and a structured report.
- **Equality ≠ slack.** `computeMinimumMargin` excludes equality/conservation constraints from the robustness radius — their binary tolerance is not a meaningful safety margin.
- **Generic ranking.** `rankByRobustnessThenCost<P extends CandidatePlan>` preserves the full extended plan type through ranking.
- **Delay-consistent robustness.** The robustness certificate is only valid if `analyzedOnDelayedModel` matches `delayPresent`.
- **Sensitivity-scaled proposals.** In the demo, sensitivity matrices are scaled with max control magnitude — aggressive proposals earn a larger sensitivity matrix and therefore a smaller robustness radius. Constitutional penalty, not just cost penalty.
- **Provenance tracking.** Every belief carries a `provenance` string array recording each transformation step.
- **`lawful: false` is structural.** It is not a comment or convention. It encodes the constitutional fact that proposal is not authorization, and is enforced at the TypeScript type level.

---

## What This Is (and Is Not)

**This is:**
- a constitutional AI architecture
- a control-theoretic epistemic system
- a failure-aware decision kernel
- a foundation for non-hallucinating AI

**This is not:**
- a chatbot
- a pure ML model
- a heuristic planner
- an unconstrained optimizer

---

## Design Philosophy

Most AI systems fail because they implicitly assume:
- that proposed actions are feasible
- that models are correct
- that observations are sufficient
- that optimization is safe

This kernel removes those assumptions. Every stage is made explicit, bounded, and
continuously checked. The most important property of this system is not performance.

**It is refusal.**

The system must be able to say: *"No lawful action exists."*

That is what separates systems that optimize from systems that survive reality.

---

## Current State

- All layers implemented and typecheck-clean
- Full chain runs end-to-end with `tsx src/main.ts`
- LLM proposer integrated with deterministic fallback
- Simple mock system used for demonstration

## Planned Extensions

1. **Real LLM Integration** — structured prompting, constrained decoding, schema-bound outputs
2. **MPC Controller** — replace simple rollout with horizon optimization; integrate constraints into solver
3. **Belief Refinement** — full covariance propagation, Bayesian filtering, multi-hypothesis tracking
4. **Model Learning** — online parameter estimation, model class switching, uncertainty-aware dynamics
5. **Verification Expansion** — formal invariants, safety proofs, adversarial stress testing
