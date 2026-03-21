# NOMOS Architectural Changelog

This file documents the major architectural expansions since the original scaffold.
Each section represents a distinct capability layer added to the system.
Layers are independent — adding a layer does not restructure any prior layer.

---

## Layer 0 — Original Scaffold

**Constitutional AI Kernel + Compiler Pipeline**

- Intent detection (keyword scoring → domain template)
- Field extraction (regex + pattern matching)
- Gap detection (required vs extracted fields)
- Structured draft assembly (StructuredDraft)
- Draft patching (field-by-field, immutable)
- Canonical serialisation (frozen text block)
- Evaluation engine (four constitutional laws: feasibility, observability, constraint satisfaction, robustness)
- Verdict classes: LAWFUL / DEGRADED / INVALID
- Audit persistence (localStorage, version-linked AuditRecord)

---

## Layer 1 — Nutrition Structured Parser

**`src/compiler/nutrition_parser.ts`**

- Domain-specific parser for nutrition declarations
- Grounds meal macros against declared food labels
- Handles multi-meal systems, phase plans, macro targets
- Uncertainty tagging for non-grounded food sources

---

## Layer 2 — Typed Constraint Compiler

**`src/compiler/constraint_compiler.ts`, `constraint_normalizer.ts`, `constraint_dedupe.ts`**

- Typed constraint algebra replacing free-text constraints
- Normalisation of constraint expressions (units, comparators)
- Deduplication of structurally-equivalent constraints
- Constraint trace output enabling per-constraint pass/fail reporting

---

## Layer 3 — Formal Evaluation Schema

**`src/audit/audit_types.ts` (extended)**

- EvaluationReport with typed ConstraintTrace[]
- MarginScore, DecisiveVariable, FailureMode as explicit typed fields
- AuditEvaluationResult as structured summary alongside canonicalDeclaration

---

## Layer 4 — Diff / Proof Tracing

**`src/audit/trace_diff.ts`, `trace_diff_types.ts`**

- CandidateTrace: per-candidate constraint pass/fail record
- TraceDiff: structured diff between baseline and candidate trace
- Constraint-level change classification: newly_passing, newly_failing, unchanged
- VerdictChange, MarginDelta, DecisionVariableChange fields
- Enables auditor workflow: open candidate proof → compare with prior run

---

## Layer 5 — Audit Persistence (Extended)

**`src/audit/audit_store.ts`, `audit_versioning.ts` (extended)**

- Parent version chain (parentVersionId)
- Load-and-re-evaluate flow: new record linked to prior version
- Version lineage: audit_1234 → ver_def → ver_ghi (audit provenance chain)

---

## Layer 6 — Trend Tracking

**`src/audit/decisive_variable_trends.ts`, `trend_types.ts`**

- DecisiveVariableTrendReport: trajectory of failure modes across audit records
- Streak detection: recurring failure mode streaks with active/inactive state
- Most-frequent and most-recent failure mode identification
- TrendLine: variable + direction (rising / falling / stable)

---

## Layer 7 — Failure Prediction + Calibration + Bounded Adjustment

**`src/audit/failure_prediction.ts`, `prediction_calibration.ts`, `bounded_rule_adjustment.ts`**
**`src/audit/prediction_types.ts`, `calibration_types.ts`, `rule_adjustment_types.ts`**

- FailurePrediction: predicted mode, confidence, risk direction, top signal
- Shallow history guard: confidence suppression when record count is low
- PredictionCalibrationReport: exactMatchRate, directionMatchRate across resolved predictions
- Neutral baseline: 50 score when no predictions have been resolved
- RuleAdjustmentProposal: advisory parameter adjustments (confidenceBias, escalationThreshold, uncertaintyBias, calibrationWindow)
- All advisory — never auto-applied

---

## Layer 8 — Policy Freeze / Versioning

**`src/audit/policy_versioning.ts`, `policy_versioning_types.ts`**
**`src/audit/policy_governance.ts`, `policy_governance_types.ts`, `policy_governance_store.ts`**
**`src/audit/policy_router.ts`, `policy_replay.ts`, `policy_visibility.ts`**

- PolicyVersion: frozen, immutable policy snapshot (ID: `pol-XXXXXXXX`)
- PredictionPolicySnapshot: active + optional candidate version
- Policy routing by domain
- Policy replay: reconstruct historical policy state at any point in time
- Policy visibility: filter and present policy history

---

## Layer 9 — Governance Recommendation + Regime Comparison + Deliberation

**`src/audit/counterfactual_policy_bench.ts`, `policy_bench_types.ts`**
**`src/audit/policy_recommendation.ts`, `policy_recommendation_types.ts`**
**`src/audit/policy_regime_comparison.ts`, `policy_regime_comparison_types.ts`**
**`src/audit/governance_decision_support.ts`, `governance_decision_support_types.ts`**
**`src/audit/governance_deliberation_summary.ts`, `governance_deliberation_types.ts`**

- Counterfactual bench: candidate policy evaluated against historical records
- PolicyRecommendationReport: ranked candidates, expectedGains, confidence, summaryLines
- PolicyRegimeComparison: gainLines, riskLines, tradeoffLines (baseline vs candidate)
- GovernanceDecisionSupportReport: suggestedAction with rationale[], risks[], tradeoffs[]
- GovernanceDeliberationSummary (ID: `dls-XXXXXXXX`): deliberation narrative, counterarguments, finalRationale
- All advisory — no auto-promotion

---

## Layer 10 — Governance Audit Trail + Human Action Record

**`src/audit/governance_audit_trail.ts`, `governance_audit_types.ts`**

- GovernanceAuditRecord (ID: `aud-XXXXXXXX`): immutable, write-once
- Records: action (promote/rollback/hold), domain, policyVersionId, rationale, timestamp
- djb2 hash-based ID: deterministic given same inputs

---

## Layer 11 — Post-Governance Outcome Review

**`src/audit/post_governance_outcome_review.ts`, `post_governance_review_types.ts`**

- GovernanceOutcomeReviewReport: retrospective classification (met/partially_met/not_met/inconclusive)
- expectedGains vs observedChanges comparison
- Verdict: improvement / no_change / degradation / mixed / unknown

---

## Layer 12 — Governance Learning Summary + Playbook Extraction

**`src/audit/governance_learning_summary.ts`, `governance_learning_types.ts`**
**`src/audit/governance_playbook_extraction.ts`, `governance_playbook_types.ts`**

- GovernanceLearningReport: metRate, partialRate, notMetRate, patternLines[], lessonsLearned[]
- PlaybookHeuristic (ID: `ph-XXXXXXXX`): distilled heuristic text, supporting evidence, classification (supporting/cautioning/neutral)

---

## Layer 13 — Playbook-to-Decision Crosswalk

**`src/audit/playbook_to_decision_crosswalk.ts`, `playbook_crosswalk_types.ts`**

- PlaybookDecisionCrosswalk: aligns playbook heuristics against current governance decision
- alignedHeuristics[], conflictingHeuristics[], crosswalkSummaryLines[]
- Used by governor workflow: inspect doctrine alignment before deciding

---

## Layer 14 — Decision → Outcome Linkage + Ecosystem Loop Summary

**`src/audit/decision_outcome_linkage.ts`, `decision_outcome_link_types.ts`**
**`src/audit/ecosystem_loop_summary.ts`, `ecosystem_loop_types.ts`**

- DecisionOutcomeLinkageReport (ID: `dec-XXXXXXXX`): causal chain from decision to observed outcome
- LinkageStrength: strong / moderate / weak / inconclusive
- EcosystemLoopSummary: totalLoops, metCount, partialCount, notMetCount
- DriftState: stabilizing / overcorrecting / drifting / stable (priority order)
- RecurringViolationStreak, summaryLines[]

---

## Layer 15 — Ecosystem Health Index

**`src/audit/ecosystem_health_index.ts`, `ecosystem_health_types.ts`**

- EcosystemHealthIndex: composite score 0–100, band (poor/fragile/stable/strong)
- 4 components: stability (0.35), calibrationQuality (0.25), governanceEffectiveness (0.25), policyChurn (0.15)
- All scoring functions documented with explicit formulas
- Neutral baselines: calibration returns 50 with null inputs; governance returns 50 with no actions

---

## Layer 16 — Health Index Traceability

**`src/audit/health_index_traceability.ts`, `health_trace_types.ts`**

- EcosystemHealthTrace: per-component trace
- Each ComponentTrace: formula string, weight, score, sourceRecordIds[]
- buildStabilityTrace, buildCalibrationQualityTrace, buildGovernanceEffectivenessTrace, buildPolicyChurnTrace, buildEcosystemHealthTrace
- HealthTracePanel.tsx: click-to-expand inline trace per component in UI

---

## Layer 17 — Ecosystem Cockpit

**`src/audit/ecosystem_cockpit.ts`, `cockpit_types.ts`**
**`src/ui/components/cockpit/` (7 card components)**
**`src/ui/pages/EcosystemCockpitPage.tsx`**

- EcosystemCockpitSnapshot: 7 blocks (health, trends, prediction, governance, policy, doctrine, attention)
- buildEcosystemCockpitSnapshot: single composition function reading all 8 subsystems
- 7 attention alert rules (all deterministic)
- 7 cockpit card components (CockpitHealthCard, CockpitTrendCard, CockpitPredictionCard, CockpitGovernanceCard, CockpitPolicyCard, CockpitDoctrineCard, CockpitAttentionCard)
- EcosystemCockpitPage: 3-row layout with onNavigate routing

---

## Layer 18 — Role Views + Guided Workflows

**`src/ui/cockpit/role_view_types.ts`, `role_view_config.ts`**
**`src/ui/cockpit/workflow_types.ts`, `workflow_config.ts`**
**`src/ui/components/cockpit/RoleModeSwitcher.tsx`, `RoleWorkflowPanel.tsx`**

- CockpitRoleMode: builder / auditor / governor / operator
- CockpitRoleViewConfig: visibleCards, emphasizedCards, defaultExpandedCards, summaryPriority
- getCockpitRoleViewConfig(mode): deterministic static lookup
- RoleWorkflow: ordered WorkflowStep[] (4–5 steps per mode)
- getRoleWorkflow(mode): deterministic static definition
- Same underlying snapshot for all modes — view-layer concern only
- RoleModeSwitcher: segmented pill control in EcosystemCockpitPage
- RoleWorkflowPanel: collapsible guided steps with panel navigation

---

## Layer 19 — Session Worklog + Session Replay

**`src/worklog/worklog_types.ts`, `session_worklog.ts`**
**`src/worklog/session_replay_types.ts`, `session_replay.ts`**
**`src/ui/components/worklog/SessionWorklogPanel.tsx`, `SessionReplayPanel.tsx`**

- WorklogEvent: typed event record (8 event types)
- SessionWorklog: ordered event log with finalDecision, acceptedRationales, rejectedRationales, notes
- 10 pure immutable worklog functions (createSessionWorklog, appendWorklogEvent, recordWorkflowStart, etc.)
- Event IDs: `wev-XXXXXXXX` (djb2 hash of sessionId + eventType + targetId + timestamp)
- SessionReplayStep, SessionNarrative: human-readable reconstruction types
- sortSessionEvents, buildSessionReplaySteps, buildSessionNarrative (deterministic reconstruction)
- Only records explicit user actions — no intent inference
- SessionWorklogPanel, SessionReplayPanel: read-only display components

---

## Test Coverage by Layer

| Layer | Tests added | Cumulative total |
|-------|------------|-----------------|
| 0 (Original scaffold) | — | — |
| 1–8 | ~700 | ~700 |
| 9–14 | ~400 | ~1100 |
| 15 (Health index) | ~100 | ~1200 |
| 16 (Traceability) | ~100 (est.) | ~1300 |
| 17 (Cockpit) | 33 | 1429 |
| 18 (Role views + workflows) | 60 | 1489 |
| 19 (Worklog + replay) | 60 | 1549 |

**Current: 1549 tests across 38 test files. All passing.**
