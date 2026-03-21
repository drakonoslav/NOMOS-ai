# MODULE_MAP

> One-table reference for every layer of the NOMOS system.
> Reading time: ~90 seconds.

See also: [ARCHITECTURE.md](ARCHITECTURE.md) · [TYPES_INDEX.md](TYPES_INDEX.md)

---

| Layer | Key Files | Responsibility | Det? | Notes |
|-------|-----------|---------------|:----:|-------|
| **Compiler** | `src/compiler/intent_detector.ts`<br>`src/compiler/domain_templates.ts`<br>`src/compiler/field_extractor.ts`<br>`src/compiler/gap_detector.ts`<br>`src/compiler/auto_compiler.ts`<br>`src/compiler/draft_patcher.ts`<br>`src/compiler/draft_serializer.ts`<br>`src/compiler/constraint_compiler.ts` | Converts raw text into a structured, evaluable declaration. Intent detection → field extraction → gap detection → draft assembly → field patching → canonical serialisation. No LLM calls. | **Y** | Entry: `auto_compiler.ts` |
| **Nutrition Engine** | `packages/constitutional-kernel/src/nutrition/` | Grounds food macros against declared labels. Computes per-meal and per-day totals. Identifies macro drift. Produces minimal structure-preserving corrections. Food registry is the single source of truth. | **Y** | Label truth overrides estimates |
| **Constitutional Kernel** | `packages/constitutional-kernel/src/`<br>`evaluation/deterministic_matcher.ts`<br>`evaluation/candidate_scoring.ts`<br>`evaluation/margin_scorer.ts`<br>`evaluation/constraint_normalizer.ts` | Enforces four constitutional laws against every candidate. Classifies as LAWFUL / DEGRADED / INVALID. Deterministic path runs without LLM. | **Y** ¹ | LLM path gated separately |
| **Audit Persistence** | `src/audit/audit_types.ts`<br>`src/audit/audit_versioning.ts`<br>`src/audit/audit_store.ts` | Persists every evaluation result with a version ID and parent chain. Immutable write-once records. Backed by localStorage. | **Y** | Key: `nomos_audit_history_v1` |
| **Diff / Trace** | `src/audit/trace_diff.ts`<br>`src/audit/trace_diff_types.ts` | Cross-run constraint trace comparison. Builds per-candidate trace, diffs baseline vs candidate. Used by auditor workflow and policy bench. | **Y** | TraceDiff, CandidateTrace |
| **Trend Tracking** | `src/audit/decisive_variable_trends.ts`<br>`src/audit/trend_types.ts` | Tracks decisive variable trajectories across audit records. Detects recurring failure mode streaks. | **Y** | DecisiveVariableTrendReport |
| **Prediction & Calibration** | `src/audit/failure_prediction.ts`<br>`src/audit/prediction_calibration.ts`<br>`src/audit/prediction_types.ts`<br>`src/audit/calibration_types.ts` | Failure mode prediction from trend data. Calibration feedback: exact-match rate, direction-match rate. Shallow history guard. | **Y** | FailurePrediction, PredictionCalibrationReport |
| **Bounded Adjustment** | `src/audit/bounded_rule_adjustment.ts`<br>`src/audit/rule_adjustment_types.ts` | Produces advisory parameter adjustment proposals from calibration data. Never auto-applied. | **Y** | RuleAdjustmentProposal |
| **Policy Versioning** | `src/audit/policy_versioning.ts`<br>`src/audit/policy_versioning_types.ts` | Frozen versioned policy snapshots. IDs: `pol-XXXXXXXX`. Immutable once created. | **Y** | PolicyVersion (frozen) |
| **Policy Governance** | `src/audit/policy_governance.ts`<br>`src/audit/policy_governance_types.ts`<br>`src/audit/policy_governance_store.ts` | Active/candidate policy state. Policy routing by domain. Policy visibility and replay. | **Y** | PredictionPolicySnapshot |
| **Policy Bench** | `src/audit/counterfactual_policy_bench.ts`<br>`src/audit/policy_bench_types.ts` | Counterfactual bench: runs candidate policy against historical records. Produces per-policy metrics and gain delta. | **Y** | PolicyBenchReport |
| **Policy Recommendation** | `src/audit/policy_recommendation.ts`<br>`src/audit/policy_recommendation_types.ts` | Builds recommendation report from bench result. Ranks candidates. Advisory — not promotion. | **Y** | PolicyRecommendationReport |
| **Regime Comparison** | `src/audit/policy_regime_comparison.ts`<br>`src/audit/policy_regime_comparison_types.ts` | Compares baseline vs candidate policy metrics. Gain lines, risk lines, tradeoff lines. | **Y** | PolicyRegimeComparison |
| **Governance Decision Support** | `src/audit/governance_decision_support.ts`<br>`src/audit/governance_decision_support_types.ts` | Builds structured decision support report. Suggests promote/rollback/hold with rationale. Advisory. | **Y** | GovernanceDecisionSupportReport |
| **Governance Audit Trail** | `src/audit/governance_audit_trail.ts`<br>`src/audit/governance_audit_types.ts` | Records human governance actions. IDs: `aud-XXXXXXXX`. Immutable write-once. | **Y** | GovernanceAuditRecord |
| **Deliberation Summary** | `src/audit/governance_deliberation_summary.ts`<br>`src/audit/governance_deliberation_types.ts` | Narrative deliberation summary for governor review. IDs: `dls-XXXXXXXX`. | **Y** | GovernanceDeliberationSummary |
| **Post-Governance Review** | `src/audit/post_governance_outcome_review.ts`<br>`src/audit/post_governance_review_types.ts` | Retrospective outcome classification: met / partially_met / not_met / inconclusive. | **Y** | GovernanceOutcomeReviewReport |
| **Governance Learning** | `src/audit/governance_learning_summary.ts`<br>`src/audit/governance_learning_types.ts` | Cross-session governance pattern analysis. metRate, partialRate, notMetRate, lessonsLearned[]. | **Y** | GovernanceLearningReport |
| **Playbook Extraction** | `src/audit/governance_playbook_extraction.ts`<br>`src/audit/governance_playbook_types.ts` | Distills heuristics from governance history. IDs: `ph-XXXXXXXX`. | **Y** | PlaybookHeuristic[] |
| **Playbook Crosswalk** | `src/audit/playbook_to_decision_crosswalk.ts`<br>`src/audit/playbook_crosswalk_types.ts` | Aligns playbook heuristics against current decision. Supporting vs cautioning. | **Y** | PlaybookDecisionCrosswalk |
| **Decision → Outcome Linkage** | `src/audit/decision_outcome_linkage.ts`<br>`src/audit/decision_outcome_link_types.ts` | Causal linkage from governance decision to observed outcome. IDs: `dec-XXXXXXXX`. | **Y** | DecisionOutcomeLinkageReport |
| **Ecosystem Loop Summary** | `src/audit/ecosystem_loop_summary.ts`<br>`src/audit/ecosystem_loop_types.ts` | Full-loop summary across all governance cycles. Drift state, streak, totals. | **Y** | EcosystemLoopSummary |
| **Ecosystem Health Index** | `src/audit/ecosystem_health_index.ts`<br>`src/audit/ecosystem_health_types.ts` | 4-component weighted composite score. Bands: poor/fragile/stable/strong. | **Y** | EcosystemHealthIndex |
| **Health Traceability** | `src/audit/health_index_traceability.ts`<br>`src/audit/health_trace_types.ts` | Per-component trace: formula, sourceRecordIds[], weight, score. | **Y** | EcosystemHealthTrace |
| **Cockpit** | `src/audit/ecosystem_cockpit.ts`<br>`src/audit/cockpit_types.ts` | Aggregates all 8 subsystems into EcosystemCockpitSnapshot (7 blocks). | **Y** | Single composition function |
| **Role Views** | `src/ui/cockpit/role_view_types.ts`<br>`src/ui/cockpit/role_view_config.ts` | 4 role modes (builder/auditor/governor/operator). Per-role: visibleCards, emphasizedCards, summaryPriority. View-layer only. | **Y** | CockpitRoleViewConfig |
| **Guided Workflows** | `src/ui/cockpit/workflow_types.ts`<br>`src/ui/cockpit/workflow_config.ts` | Per-role ordered navigation sequences (4–5 steps each). Guidance only, not automation. | **Y** | RoleWorkflow |
| **Session Worklog** | `src/worklog/worklog_types.ts`<br>`src/worklog/session_worklog.ts` | Immutable human operational trace. 10 pure functions. IDs: `wev-XXXXXXXX`. | **Y** | SessionWorklog |
| **Session Replay** | `src/worklog/session_replay_types.ts`<br>`src/worklog/session_replay.ts` | Deterministic narrative reconstruction from worklog. Only recorded events. | **Y** | SessionNarrative |
| **Cockpit UI** | `src/ui/pages/EcosystemCockpitPage.tsx`<br>`src/ui/components/cockpit/` (7 cards) | Role-aware cockpit page. Mode switcher, workflow panel, 7 card components in 3-row layout. | N ² | React state |
| **Worklog UI** | `src/ui/components/worklog/SessionWorklogPanel.tsx`<br>`src/ui/components/worklog/SessionReplayPanel.tsx` | Displays human operational trace and session narrative. Read-only. | N ² | React display |
| **UI Bridge (Compiler)** | `src/ui/components/compiler/`<br>`src/ui/pages/query/QueryBuilderPage.tsx` | Renders compiled draft, field patch editors, Evaluate button, audit history. Gates Evaluate on isEvaluable && isConfirmed. | N ² | React state |

---

**Notes**

¹ The deterministic evaluation path (`evaluation/deterministic_matcher.ts`) runs without any LLM call.
The LLM semantic evaluator is a separate path gated by query type. The deterministic path always
produces a complete verdict independently.

² React components drive user interaction and local UI state. The underlying operations they invoke —
`autoCompile`, `patchDraftField`, `serializeDraft`, `buildEcosystemCockpitSnapshot`, etc. —
are each fully deterministic. Non-determinism in this layer is UI-only.

---

**All source paths relative to `artifacts/nomos-dashboard/` unless otherwise noted.**
