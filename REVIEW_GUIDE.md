# NOMOS Review Guide

This guide tells an external reviewer exactly how to inspect the NOMOS project.
It describes the recommended inspection order, identifies sources of truth vs view layers,
and flags likely weak points.

See also: [README.md](README.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [MODULE_MAP.md](MODULE_MAP.md)

---

## 15-Minute Inspection

If you only have 15 minutes, read these files in order:

| # | File | What it tells you |
|---|------|-------------------|
| 1 | `SYSTEM_RULES.md` | The non-negotiable invariants of the system |
| 2 | `artifacts/nomos-dashboard/src/audit/audit_types.ts` | The canonical evaluation and audit record types |
| 3 | `artifacts/nomos-dashboard/src/audit/ecosystem_health_index.ts` | How the weighted health score is computed |
| 4 | `artifacts/nomos-dashboard/src/audit/governance_audit_trail.ts` | How governance actions are recorded |
| 5 | `artifacts/nomos-dashboard/src/worklog/session_worklog.ts` | The human operational trace layer |
| 6 | `examples/governance_recommendation/` | A complete worked governance example |
| 7 | `examples/ecosystem_cockpit_snapshot/` | What the cockpit surface looks like |

---

## Full Inspection Order

### 1. Start Here
- [README.md](README.md) — overview, pipeline, subsystem table, how to run
- [MODULE_MAP.md](MODULE_MAP.md) — one-line description of every layer and file

### 2. Understand the Rules
- [SYSTEM_RULES.md](SYSTEM_RULES.md) — 14 constitutional invariants

### 3. Trace the Architecture
- [ARCHITECTURE.md](ARCHITECTURE.md) — full pipeline with data contracts and determinism boundaries

### 4. Find the Types
- [TYPES_INDEX.md](TYPES_INDEX.md) — canonical interface index grouped by layer
- `src/audit/audit_types.ts` — EvaluationReport, AuditRecord, ConstraintTrace
- `src/audit/cockpit_types.ts` — EcosystemCockpitSnapshot and all 7 blocks
- `src/worklog/worklog_types.ts` — WorklogEvent, SessionWorklog

### 5. Read the Examples

| Example | What it shows |
|---------|---------------|
| [examples/nutrition_meal_audit/](examples/nutrition_meal_audit/) | Full compiler pipeline: raw input → compiled draft → evaluation |
| [examples/governance_recommendation/](examples/governance_recommendation/) | Governance pipeline: bench → recommendation → deliberation → crosswalk |
| [examples/policy_replay/](examples/policy_replay/) | Policy versioning: frozen snapshot → replay → regime comparison |
| [examples/ecosystem_cockpit_snapshot/](examples/ecosystem_cockpit_snapshot/) | Health index → cockpit snapshot → attention alerts |

### 6. Inspect the Evaluation Pipeline

```
src/compiler/auto_compiler.ts        Entry point for compilation
src/compiler/draft_patcher.ts        Field patching (immutable, surgical)
src/compiler/draft_serializer.ts     Canonical serialisation
src/audit/audit_store.ts             Immutable persistence
```

### 7. Inspect the Governance Pipeline

```
src/audit/counterfactual_policy_bench.ts    Bench runner
src/audit/policy_recommendation.ts          Recommendation (advisory)
src/audit/governance_decision_support.ts    Decision support (advisory)
src/audit/governance_deliberation_summary.ts Narrative deliberation
src/audit/governance_audit_trail.ts          Human action record (immutable)
src/audit/post_governance_outcome_review.ts  Retrospective review
```

### 8. Inspect the Health + Cockpit Layer

```
src/audit/ecosystem_health_index.ts         4-component weighted score
src/audit/health_index_traceability.ts      Per-component source record trace
src/audit/ecosystem_cockpit.ts              Full snapshot composition
src/audit/cockpit_types.ts                  EcosystemCockpitSnapshot type
```

### 9. Inspect Role Views + Guided Workflows

```
src/ui/cockpit/role_view_config.ts   getCockpitRoleViewConfig(mode)
src/ui/cockpit/workflow_config.ts    getRoleWorkflow(mode)
src/ui/pages/EcosystemCockpitPage.tsx  Role-aware page assembly
```

### 10. Inspect the Worklog + Replay Layer

```
src/worklog/worklog_types.ts         WorklogEvent, SessionWorklog
src/worklog/session_worklog.ts       10 pure immutable functions
src/worklog/session_replay.ts        buildSessionNarrative (reconstruction)
```

---

## Sources of Truth vs View Layer

| Category | Files | Notes |
|----------|-------|-------|
| **Source of truth (canonical types)** | `src/audit/audit_types.ts`, `cockpit_types.ts`, `worklog_types.ts`, `role_view_types.ts`, `workflow_types.ts` | These define the system's type contracts |
| **Source of truth (engine functions)** | `ecosystem_health_index.ts`, `governance_audit_trail.ts`, `session_worklog.ts`, `ecosystem_cockpit.ts` | Deterministic, immutable-output functions |
| **Derived (views and summaries)** | `session_replay.ts`, `governance_learning_summary.ts`, `governance_deliberation_summary.ts` | Build readable outputs from source records |
| **View layer only** | All `*.tsx` files, `role_view_config.ts`, `workflow_config.ts` | Presentation emphasis only — no truth modification |
| **Advisory outputs** | `policy_recommendation.ts`, `governance_decision_support.ts`, `bounded_rule_adjustment.ts` | Never auto-applied or self-executing |

---

## Where to Find Current Likely Weak Points

| Area | What to look for |
|------|-----------------|
| **Prediction shallow history** | `buildFailurePrediction` includes a `historySizeGuard` flag. When the audit record count is low, confidence is deliberately suppressed. Check this logic in `failure_prediction.ts`. |
| **Calibration neutral baseline** | When `totalPredictions === 0 && resolvedPredictions === 0 && exactMatchRate === null`, calibration returns a neutral 50. This is documented but worth verifying in `prediction_calibration.ts`. |
| **Governance effectiveness neutral** | `scoreGovernanceEffectiveness` returns 50 (no actions) or 40 (actions but no reviews). These baseline values drive the health index. Verify in `ecosystem_health_index.ts`. |
| **Policy churn drift states** | Drift state is `driftState` from `EcosystemLoopSummary`. Priority order: stabilizing → overcorrecting → drifting → stable. Verify in `ecosystem_cockpit.ts`. |
| **Attention alert thresholds** | 7 alert rules, all hard-coded thresholds (e.g. unresolved rate > 30%, streak ≥ 3). Review in `ecosystem_cockpit.ts`. |
| **Session worklog immutability** | All 10 worklog functions must return new objects, never mutate. Verify spread operators in `session_worklog.ts`. |
| **Role mode view isolation** | Role mode must not change the underlying snapshot. Verify that `EcosystemCockpitPage` passes the same `snapshot` regardless of active mode. |

---

## Test Suite Entry Point

```bash
pnpm --filter @workspace/nomos-dashboard run test
```

**1549 tests, 38 files.** All deterministic. No LLM generation in tests.

Each test file name maps directly to the module it covers:
- `audit_types_test.ts` → `audit/audit_types.ts`
- `ecosystem_health_index_test.ts` → `audit/ecosystem_health_index.ts`
- `session_worklog_test.ts` → `worklog/session_worklog.ts`
- `role_view_config_test.ts` → `ui/cockpit/role_view_config.ts`
- etc.

---

## Git History and Checkpoints

Architectural progression is documented in [CHANGELOG_ARCHITECTURE.md](CHANGELOG_ARCHITECTURE.md).
Each major architectural layer was added in sequence, with no structural re-writes of earlier layers.

---

## Cross-Document Links

- Pipeline detail → [ARCHITECTURE.md](ARCHITECTURE.md)
- Type interfaces → [TYPES_INDEX.md](TYPES_INDEX.md)
- Constitutional rules → [SYSTEM_RULES.md](SYSTEM_RULES.md)
- All layers at a glance → [MODULE_MAP.md](MODULE_MAP.md)
- Worked examples → [examples/](examples/)
