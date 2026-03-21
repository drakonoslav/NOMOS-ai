# NOMOS — Constitutional AI Reasoning Ecosystem

> **For new reviewers: start here.**
>
> | | |
> |---|---|
> | **Canonical frontend** | `artifacts/nomos-dashboard` — React + Vite UI (port 24280) |
> | **Canonical backend** | `artifacts/api-server` — Express API (port 8080, routes at `/api/*`) |
> | **Shared kernel** | `packages/constitutional-kernel` — library only, bundled into api-server |
> | **NOT the main app** | `artifacts/mockup-sandbox` — demo sandbox, not started by default |
> | **NOT source code** | `attached_assets/` — development context files, archival only |
>
> **How to run:**
> ```bash
> pnpm install
> pnpm run dev   # starts dashboard + api-server in parallel
> ```
>
> **Key inspection docs:**
> - [CANONICAL_BUILD_MAP.md](CANONICAL_BUILD_MAP.md) — role classification of every folder
> - [DEPENDENCY_RULES.md](DEPENDENCY_RULES.md) — allowed import directions
> - [docs/generated/runtime-diagram.md](docs/generated/runtime-diagram.md) — live runtime flow
> - [docs/generated/runtime-mermaid.md](docs/generated/runtime-mermaid.md) — Mermaid diagrams
> - [docs/generated/repo-topology.md](docs/generated/repo-topology.md) — runtime vs build vs docs vs archival

---

NOMOS is a deterministic, constraint-based reasoning engine built in TypeScript.
It converts unstructured user input into constrained, evaluable declarations and enforces four constitutional laws before any evaluation is permitted.

It is not a chatbot. It is not a planner.
It is a structured reasoning system that enforces constitutional rules, preserves an immutable audit chain, and routes governance decisions through an explicit evidence-and-deliberation pipeline before any human action is taken.

---

## What NOMOS Is

NOMOS is a **Constitutional AI Kernel** — a reasoning ecosystem that:

- extracts structured facts from raw, unformatted input
- detects gaps between what is declared and what is required for evaluation
- allows surgical field-by-field repair of incomplete declarations
- serialises confirmed declarations into canonical, stable, version-linked artifacts
- evaluates only confirmed complete structured drafts against typed constraints
- persists an immutable audit history of every confirmed decision and its trace
- tracks decisive variable trends and generates failure predictions with calibration feedback
- produces policy recommendations, governance deliberation summaries, and decision-to-outcome linkages
- computes an ecosystem health index with full traceability to source records
- presents all of this through a role-aware cockpit with guided workflows and session-level audit trail

The system operates under four constitutional laws that gate every evaluation.
No candidate is permitted to act until all laws are satisfied.

---

## Four Constitutional Laws

| Law | Invariant |
|-----|-----------|
| **I** | NOMOS never evaluates raw input |
| **II** | Only a confirmed `canonicalDeclaration` may be submitted for evaluation |
| **III** | Governance is advisory until explicit human action |
| **IV** | Historical records, frozen policy snapshots, and audit records are immutable |

---

## End-to-End Pipeline

```
Raw Input (natural language)
    │
    ▼  Intent detection → domain template selection
    ▼  Field extraction → ExtractedFields
    ▼  Gap detection → missingRequired / isEvaluable
    ▼  Structured draft assembly → StructuredDraft
    ▼  User-confirmed field patching
    ▼  Canonical declaration serialisation → canonicalDeclaration (frozen)
    ▼  Constraint evaluation → EvaluationReport + ConstraintTrace
    ▼  Audit record persistence → AuditRecord (immutable, version-linked)
    ▼  Decisive variable trend tracking → DecisiveVariableTrendReport
    ▼  Failure prediction → FailurePrediction + calibration + bounded adjustment
    ▼  Policy bench → recommendation → regime comparison
    ▼  Governance decision support → deliberation summary
    ▼  Human governance action (promote / rollback / hold)
    ▼  GovernanceAuditRecord (immutable)
    ▼  Post-governance outcome review → GovernanceOutcomeReviewReport
    ▼  Governance learning summary → playbook extraction → crosswalk
    ▼  Decision → outcome linkage → DecisionOutcomeLinkageReport
    ▼  Ecosystem loop summary → EcosystemLoopSummary
    ▼  Ecosystem health index → EcosystemHealthIndex (4-component weighted score)
    ▼  Health index traceability → EcosystemHealthTrace (formula + source IDs)
    ▼  Ecosystem cockpit → EcosystemCockpitSnapshot (7 blocks)
    ▼  Role-aware cockpit UI (builder / auditor / governor / operator)
    ▼  Session worklog → SessionWorklog (immutable human operational trace)
    ▼  Session replay → SessionNarrative (deterministic reconstruction)
```

---

## Major Subsystems

| Subsystem | Location | Responsibility |
|-----------|----------|----------------|
| **Compiler** | `src/compiler/` | Raw input → canonical declaration |
| **Evaluation core** | `src/audit/audit_types.ts` | EvaluationReport, ConstraintTrace, verdict |
| **Audit persistence** | `src/audit/audit_store.ts`, `audit_versioning.ts` | Immutable versioned audit record storage |
| **Diff / trace** | `src/audit/trace_diff.ts` | Cross-run constraint trace comparison |
| **Trend tracking** | `src/audit/decisive_variable_trends.ts` | Variable trajectory + streak detection |
| **Prediction & calibration** | `src/audit/failure_prediction.ts`, `prediction_calibration.ts` | Failure mode prediction + calibration |
| **Bounded adjustment** | `src/audit/bounded_rule_adjustment.ts` | Constrained policy parameter updates |
| **Policy versioning** | `src/audit/policy_versioning.ts` | Frozen versioned policy snapshots |
| **Policy governance** | `src/audit/policy_governance.ts` | Active/candidate policy state |
| **Bench + recommendation** | `src/audit/counterfactual_policy_bench.ts`, `policy_recommendation.ts` | Candidate bench + recommendation |
| **Regime comparison** | `src/audit/policy_regime_comparison.ts` | Baseline vs candidate comparison |
| **Governance decision support** | `src/audit/governance_decision_support.ts` | Decision support (promote/rollback/hold) |
| **Governance audit trail** | `src/audit/governance_audit_trail.ts` | Immutable governance action records |
| **Deliberation summary** | `src/audit/governance_deliberation_summary.ts` | Narrative deliberation for governor |
| **Post-governance review** | `src/audit/post_governance_outcome_review.ts` | Retrospective outcome classification |
| **Learning summary** | `src/audit/governance_learning_summary.ts` | Cross-session governance pattern analysis |
| **Playbook extraction** | `src/audit/governance_playbook_extraction.ts` | Distilled heuristics from history |
| **Playbook crosswalk** | `src/audit/playbook_to_decision_crosswalk.ts` | Heuristic ↔ decision alignment |
| **Decision → outcome** | `src/audit/decision_outcome_linkage.ts` | Causal linkage: decision → observed outcome |
| **Ecosystem loop** | `src/audit/ecosystem_loop_summary.ts` | Full-loop summary across governance cycles |
| **Ecosystem health index** | `src/audit/ecosystem_health_index.ts` | Weighted composite health score |
| **Health traceability** | `src/audit/health_index_traceability.ts` | Per-component formula + source record trace |
| **Cockpit** | `src/audit/ecosystem_cockpit.ts` | Aggregate cockpit snapshot (7 blocks) |
| **Role views** | `src/ui/cockpit/role_view_config.ts` | Per-role card emphasis and ordering |
| **Guided workflows** | `src/ui/cockpit/workflow_config.ts` | Deterministic per-role navigation sequences |
| **Session worklog** | `src/worklog/session_worklog.ts` | Immutable human operational trace |
| **Session replay** | `src/worklog/session_replay.ts` | Narrative reconstruction from worklog |

---

## Health Index

Four weighted components, all deterministic:

| Component | Weight | Scoring summary |
|-----------|--------|-----------------|
| Stability | 35% | Failure rate + streak modifiers |
| Calibration quality | 25% | (exactMatch × 50) + (directionMatch × 25) − penalties |
| Governance effectiveness | 25% | 100×metRate + 50×partialRate (50/40 neutral baselines) |
| Policy churn | 15% | clamp(100 − n×8, 0, 100) ± drift state modifier |

Bands: `poor` (0–24) · `fragile` (25–49) · `stable` (50–74) · `strong` (75–100)

---

## How to Run

```bash
# Install dependencies
pnpm install

# Run the dashboard (port set by PORT env var)
pnpm --filter @workspace/nomos-dashboard run dev

# Run the API server
pnpm --filter @workspace/api-server run dev

# Run all tests (1549 tests, 38 files)
pnpm --filter @workspace/nomos-dashboard run test
```

---

## How to Inspect

1. **[REVIEW_GUIDE.md](REVIEW_GUIDE.md)** — curated inspection path for external reviewers
2. **[ARCHITECTURE.md](ARCHITECTURE.md)** — full pipeline with module linkage and data contracts
3. **[MODULE_MAP.md](MODULE_MAP.md)** — fast layer-by-layer inspection table
4. **[SYSTEM_RULES.md](SYSTEM_RULES.md)** — constitutional invariants (non-negotiable)
5. **[TYPES_INDEX.md](TYPES_INDEX.md)** — canonical interface index by layer
6. **[CHANGELOG_ARCHITECTURE.md](CHANGELOG_ARCHITECTURE.md)** — architectural progression log
7. **[examples/](examples/)** — worked examples with full input → output chain

---

## If You Only Have 15 Minutes

See **[REVIEW_GUIDE.md § 15-Minute Inspection](REVIEW_GUIDE.md#15-minute-inspection)**.

---

## Project Structure

```
artifacts/nomos-dashboard/src/
├── compiler/          Raw input → canonical declaration (8 modules)
├── audit/             All audit, governance, prediction, health, cockpit (40+ files)
│   ├── audit_types.ts              Canonical evaluation + audit record types
│   ├── governance_audit_trail.ts   Immutable governance records
│   ├── ecosystem_health_index.ts   Weighted health composite
│   └── ecosystem_cockpit.ts        Full cockpit snapshot composition
├── worklog/           Session worklog and replay (4 files)
├── ui/
│   ├── cockpit/       Role view configs + workflow configs
│   ├── components/    All UI card and panel components
│   └── pages/         EcosystemCockpitPage (role-aware, 4 modes)
└── tests/             1549 regression tests across 38 test files

examples/
├── nutrition_meal_audit/          Compiler + evaluation worked example
├── governance_recommendation/     Governance pipeline worked example
├── policy_replay/                 Policy versioning + replay worked example
└── ecosystem_cockpit_snapshot/    Health index + cockpit snapshot example
```

---

## Test Coverage

**1549 tests across 38 test files.** All deterministic. No mocks, no LLM generation in tests.

```bash
pnpm --filter @workspace/nomos-dashboard run test
```

---

## What NOMOS Is Not

- Not a chatbot or language model
- Not an auto-promotion engine (governance is always advisory until explicit human action)
- Not a self-modifying system (evaluation functions are never rewritten at runtime)
- Not a black box (every score is traceable to source record IDs and formula steps)
- Not a wizard or automation system (guided workflows are navigation, not execution)

---

## Cross-Document Links

- Architecture detail → [ARCHITECTURE.md](ARCHITECTURE.md)
- Constitutional invariants → [SYSTEM_RULES.md](SYSTEM_RULES.md)
- Layer-by-layer inspection → [MODULE_MAP.md](MODULE_MAP.md)
- Type interfaces → [TYPES_INDEX.md](TYPES_INDEX.md)
- External reviewer path → [REVIEW_GUIDE.md](REVIEW_GUIDE.md)
- Worked examples → [examples/](examples/)
