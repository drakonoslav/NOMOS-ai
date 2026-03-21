# NOMOS — Constitutional AI Reasoning Ecosystem

NOMOS is a deterministic, constraint-based reasoning ecosystem built in TypeScript.
It transforms unstructured input into constrained, evaluable declarations and enforces constitutional laws before evaluation is permitted.

It is not a chatbot and not a freeform planner.
It is a structured reasoning system with immutable audit history, explicit governance boundaries, and traceable decision support.

---

## Canonical Runtime

NOMOS has one canonical runtime path:

| Role | Location |
|------|----------|
| **Frontend** | `artifacts/nomos-dashboard` — React + Vite UI (port 24280) |
| **Backend** | `artifacts/api-server` — Express API (port 8080, routes at `/api/*`) |
| **Shared reasoning library** | `packages/constitutional-kernel` — library only, bundled into api-server |

Non-canonical or non-runtime:

| Location | Status |
|----------|--------|
| `artifacts/mockup-sandbox` | Demo-only — not started by default, not production runtime |
| `attached_assets/` | Support and archival materials — not source-of-truth runtime code |

The workspace root coordinates the dashboard and API server.
The root must not boot directly into the kernel package.
The kernel is a library. It is executed only by the API server.

---

## Quick Start

```bash
pnpm install
pnpm run dev
```

Expected result:

- the dashboard runs as the main app at the root path
- the API server responds at `/api/*`
- the kernel is executed by the API server — not as a root process

---

## Production Runtime Path

```
User
  → artifacts/nomos-dashboard   (React frontend)
  → artifacts/api-server        (Express backend)
  → packages/constitutional-kernel  (reasoning library, bundled)
```

Core API routes:

| Route | Purpose |
|-------|---------|
| `GET /api/healthz` | Health probe |
| `GET /api/nomos/state` | Current ecosystem state |
| `POST /api/nomos/query/parse` | Raw input → structured draft |
| `POST /api/nomos/query/evaluate` | Evaluate a confirmed canonical declaration |

---

## Repo Map

| Location | Role | Runtime? |
|----------|------|:---:|
| `artifacts/nomos-dashboard` | Canonical frontend — UI, cockpit, role views | YES |
| `artifacts/api-server` | Canonical backend — API surface, kernel execution | YES |
| `packages/constitutional-kernel` | Shared deterministic reasoning library | YES (bundled) |
| `lib/api-spec` | OpenAPI contract — source of truth for all API shapes | build only |
| `lib/api-client-react` | Generated React Query hooks (from api-spec) | bundled |
| `lib/api-zod` | Generated Zod schemas (from api-spec) | bundled |
| `lib/db` | Drizzle database adapter | bundled |
| `artifacts/mockup-sandbox` | Demo-only component sandbox | NO |
| `scripts/` | Workspace maintenance scripts | NO |
| `docs/` | Inspection and architecture documentation | NO |
| `examples/` | Worked pipeline examples | NO |
| `attached_assets/` | Support and archival assets — not canonical runtime source | NO |

See also:

- [CANONICAL_BUILD_MAP.md](CANONICAL_BUILD_MAP.md) — full role classification of every folder
- [DEPENDENCY_RULES.md](DEPENDENCY_RULES.md) — allowed and forbidden import directions
- [docs/generated/runtime-diagram.md](docs/generated/runtime-diagram.md) — live runtime request flows
- [docs/generated/runtime-mermaid.md](docs/generated/runtime-mermaid.md) — Mermaid architecture diagrams
- [docs/generated/repo-topology.md](docs/generated/repo-topology.md) — runtime vs build vs docs vs archival

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
- records session worklog and replay as a deterministic human operational trace

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
    ▼  Decision → outcome linkage → DecisionOutcomeLinkReport
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
| **Dashboard UI** | `artifacts/nomos-dashboard/src/ui/` | Cockpit, role views, workflow navigation, page composition |
| **Compiler** | `artifacts/nomos-dashboard/src/compiler/` | Raw input → canonical declaration (8 modules) |
| **Evaluation core** | `artifacts/nomos-dashboard/src/audit/audit_types.ts` | EvaluationReport, ConstraintTrace, verdict |
| **Audit persistence** | `artifacts/nomos-dashboard/src/audit/audit_store.ts` | Immutable versioned audit record storage |
| **Diff / trace** | `artifacts/nomos-dashboard/src/audit/trace_diff.ts` | Cross-run constraint trace comparison |
| **Trend tracking** | `artifacts/nomos-dashboard/src/audit/decisive_variable_trends.ts` | Variable trajectory + streak detection |
| **Prediction & calibration** | `artifacts/nomos-dashboard/src/audit/failure_prediction.ts` | Failure mode prediction + calibration |
| **Bounded adjustment** | `artifacts/nomos-dashboard/src/audit/bounded_rule_adjustment.ts` | Constrained policy parameter updates |
| **Policy versioning** | `artifacts/nomos-dashboard/src/audit/policy_versioning.ts` | Frozen versioned policy snapshots |
| **Policy governance** | `artifacts/nomos-dashboard/src/audit/policy_governance.ts` | Active/candidate policy state |
| **Bench + recommendation** | `artifacts/nomos-dashboard/src/audit/counterfactual_policy_bench.ts` | Candidate bench + recommendation |
| **Regime comparison** | `artifacts/nomos-dashboard/src/audit/policy_regime_comparison.ts` | Baseline vs candidate comparison |
| **Governance decision support** | `artifacts/nomos-dashboard/src/audit/governance_decision_support.ts` | Decision support (promote/rollback/hold) |
| **Governance audit trail** | `artifacts/nomos-dashboard/src/audit/governance_audit_trail.ts` | Immutable governance action records |
| **Deliberation summary** | `artifacts/nomos-dashboard/src/audit/governance_deliberation_summary.ts` | Narrative deliberation for governor |
| **Post-governance review** | `artifacts/nomos-dashboard/src/audit/post_governance_outcome_review.ts` | Retrospective outcome classification |
| **Learning summary** | `artifacts/nomos-dashboard/src/audit/governance_learning_summary.ts` | Cross-session governance pattern analysis |
| **Playbook extraction** | `artifacts/nomos-dashboard/src/audit/governance_playbook_extraction.ts` | Distilled heuristics from history |
| **Playbook crosswalk** | `artifacts/nomos-dashboard/src/audit/playbook_to_decision_crosswalk.ts` | Heuristic ↔ decision alignment |
| **Decision → outcome** | `artifacts/nomos-dashboard/src/audit/decision_outcome_linkage.ts` | Causal linkage: decision → observed outcome |
| **Ecosystem loop** | `artifacts/nomos-dashboard/src/audit/ecosystem_loop_summary.ts` | Full-loop summary across governance cycles |
| **Ecosystem health index** | `artifacts/nomos-dashboard/src/audit/ecosystem_health_index.ts` | Weighted composite health score |
| **Health traceability** | `artifacts/nomos-dashboard/src/audit/health_index_traceability.ts` | Per-component formula + source record trace |
| **Cockpit** | `artifacts/nomos-dashboard/src/audit/ecosystem_cockpit.ts` | Aggregate cockpit snapshot (7 blocks) |
| **Role views** | `artifacts/nomos-dashboard/src/ui/cockpit/role_view_config.ts` | Per-role card emphasis and ordering |
| **Guided workflows** | `artifacts/nomos-dashboard/src/ui/cockpit/workflow_config.ts` | Deterministic per-role navigation sequences |
| **Session worklog** | `artifacts/nomos-dashboard/src/worklog/session_worklog.ts` | Immutable human operational trace |
| **Session replay** | `artifacts/nomos-dashboard/src/worklog/session_replay.ts` | Narrative reconstruction from worklog |
| **API server** | `artifacts/api-server/src/` | Runtime backend, `/api/*` surface, kernel execution |
| **Kernel** | `packages/constitutional-kernel/src/` | Deterministic reasoning library used only by backend |

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

## How to Inspect

Start here in order:

1. **[REVIEW_GUIDE.md](REVIEW_GUIDE.md)** — curated inspection path for external reviewers
2. **[CANONICAL_BUILD_MAP.md](CANONICAL_BUILD_MAP.md)** — role classification of every folder
3. **[ARCHITECTURE.md](ARCHITECTURE.md)** — full pipeline with module linkage and data contracts
4. **[MODULE_MAP.md](MODULE_MAP.md)** — fast layer-by-layer inspection table
5. **[DEPENDENCY_RULES.md](DEPENDENCY_RULES.md)** — allowed and forbidden import directions
6. **[SYSTEM_RULES.md](SYSTEM_RULES.md)** — constitutional invariants (non-negotiable)
7. **[TYPES_INDEX.md](TYPES_INDEX.md)** — canonical interface index by layer
8. **[docs/generated/runtime-diagram.md](docs/generated/runtime-diagram.md)** — live runtime request flows
9. **[CHANGELOG_ARCHITECTURE.md](CHANGELOG_ARCHITECTURE.md)** — architectural progression log
10. **[examples/](examples/)** — worked examples with full input → output chain

If you only have 15 minutes, use the inspection path in **[REVIEW_GUIDE.md](REVIEW_GUIDE.md)**.

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

artifacts/api-server/src/
├── index.ts           Express server bootstrap (PORT default: 8080)
└── routes/            /api/healthz, /api/nomos/state, /api/nomos/query/*

packages/constitutional-kernel/src/
├── constitution_guard.ts
├── feasibility_engine.ts
├── decision_engine.ts
├── evaluation/
└── (full reasoning library — never run as standalone process)

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
- Not an auto-promotion engine — governance is always advisory until explicit human action
- Not a self-modifying system — evaluation functions are never rewritten at runtime
- Not a black box — every score is traceable to source record IDs and formula steps
- Not a wizard or automation system — guided workflows are navigation, not execution

Guided workflows are navigation and inspection aids, not autonomous action.

---

## Cross-Document Links

- Canonical role classification → [CANONICAL_BUILD_MAP.md](CANONICAL_BUILD_MAP.md)
- Import direction rules → [DEPENDENCY_RULES.md](DEPENDENCY_RULES.md)
- Architecture detail → [ARCHITECTURE.md](ARCHITECTURE.md)
- Constitutional invariants → [SYSTEM_RULES.md](SYSTEM_RULES.md)
- Layer-by-layer inspection → [MODULE_MAP.md](MODULE_MAP.md)
- Type interfaces → [TYPES_INDEX.md](TYPES_INDEX.md)
- External reviewer path → [REVIEW_GUIDE.md](REVIEW_GUIDE.md)
- Runtime flows → [docs/generated/runtime-diagram.md](docs/generated/runtime-diagram.md)
- Worked examples → [examples/](examples/)
