# NOMOS Types Index

This file lists the most important canonical interfaces in NOMOS, grouped by layer.
Use this as a quick reference when tracing data across the pipeline.

See also: [ARCHITECTURE.md](ARCHITECTURE.md) · [MODULE_MAP.md](MODULE_MAP.md)

---

## Compiler Layer

| Interface | File | Description |
|-----------|------|-------------|
| `IntentType` | `src/compiler/intent_types.ts` | Domain classifier output: `NUTRITION_AUDIT \| TRAINING_AUDIT \| SCHEDULE_AUDIT \| GENERIC_CONSTRAINT_TASK` |
| `DomainTemplate` | `src/compiler/domain_templates.ts` | requiredFields[], optionalFields[], missingFieldHints |
| `ExtractedFields` | `src/compiler/field_extractor.ts` | All fields extracted from raw input (hasMealSystem, hasTargets, mealSystem, foodLabels, etc.) |
| `GapDetectionResult` | `src/compiler/gap_detector.ts` | missingRequiredFields[], missingOptionalFields[], isEvaluable |
| `StructuredDraft` | `src/compiler/auto_compiler.ts` | state[], constraints[], uncertainties[], candidates[], objective[], isEvaluable |
| `CompiledCandidate` | `src/compiler/auto_compiler.ts` | id, text — a single candidate option within a draft |
| `SerializedDraftRecord` | `src/compiler/draft_serializer.ts` | intent, title, isEvaluable, canonicalText (frozen) |

---

## Evaluation Layer

| Interface | File | Description |
|-----------|------|-------------|
| `AuditEvaluationResult` | `src/audit/audit_types.ts` | verdict, marginScore, decisiveVariable, failureMode, constraintTrace[] |
| `ConstraintTrace` | `src/audit/audit_types.ts` | constraintId, description, satisfied, margin, raw value |
| `AuditRecord` | `src/audit/audit_types.ts` | Full persisted decision: id, versionId, parentVersionId, canonicalDeclaration, evaluationResult |
| `AutoCompileResult` | `src/compiler/auto_compiler.ts` | intent, draft, gapResult — the output of `autoCompile()` |

---

## Trend + Prediction Layer

| Interface | File | Description |
|-----------|------|-------------|
| `DecisiveVariableTrendReport` | `src/audit/trend_types.ts` | mostFrequentFailureMode, mostRecentFailureMode, streaks[], trendLines[] |
| `TrendStreak` | `src/audit/trend_types.ts` | mode, count, isActive |
| `TrendLine` | `src/audit/trend_types.ts` | variable, direction (rising/falling/stable) |
| `FailurePrediction` | `src/audit/prediction_types.ts` | predictedFailureMode, confidence, riskDirection, topSignal, historySizeGuard |
| `PredictionCalibrationReport` | `src/audit/calibration_types.ts` | exactMatchRate, directionMatchRate, totalPredictions, resolvedPredictions |
| `RuleAdjustmentProposal` | `src/audit/rule_adjustment_types.ts` | confidenceBias, escalationThreshold, uncertaintyBias, calibrationWindow, adjustmentStrength |

---

## Policy + Governance Layer

| Interface | File | Description |
|-----------|------|-------------|
| `PolicyVersion` | `src/audit/policy_versioning_types.ts` | id (`pol-XXXXXXXX`), policy parameters, domain, createdAt (frozen) |
| `PredictionPolicySnapshot` | `src/audit/policy_governance_types.ts` | activeVersionId, activePolicy, candidateVersionId?, candidatePolicy? |
| `PolicyBenchReport` | `src/audit/policy_bench_types.ts` | metricsByPolicy (keyed by versionId), gainsByPolicy |
| `PolicyRecommendationReport` | `src/audit/policy_recommendation_types.ts` | recommendedVersionId, strength, confidence, expectedGains[], summaryLines[], candidatePolicyVersionIds |
| `PolicyRegimeComparison` | `src/audit/policy_regime_comparison_types.ts` | baselineMetrics, candidateMetrics, gainLines[], riskLines[], tradeoffLines[] |
| `GovernanceDecisionSupportReport` | `src/audit/governance_decision_support_types.ts` | suggestedAction, confidence, rationale[], risks[], tradeoffs[] |
| `GovernanceDeliberationSummary` | `src/audit/governance_deliberation_types.ts` | id (`dls-XXXXXXXX`), deliberationLines[], counterarguments[], finalRationale |
| `GovernanceAuditRecord` | `src/audit/governance_audit_types.ts` | id (`aud-XXXXXXXX`), action, domain, policyVersionId, rationale, timestamp |

---

## Audit Trail + Outcome Layer

| Interface | File | Description |
|-----------|------|-------------|
| `GovernanceOutcomeReviewReport` | `src/audit/post_governance_review_types.ts` | outcomeClass, expectedGains[], observedChanges[], verdict |
| `GovernanceLearningReport` | `src/audit/governance_learning_types.ts` | metRate, partialRate, notMetRate, patternLines[], lessonsLearned[] |
| `PlaybookHeuristic` | `src/audit/governance_playbook_types.ts` | id (`ph-XXXXXXXX`), heuristicText, supportingEvidence[], classification |
| `PlaybookDecisionCrosswalk` | `src/audit/playbook_crosswalk_types.ts` | alignedHeuristics[], conflictingHeuristics[], crosswalkSummaryLines[] |
| `DecisionOutcomeLinkageReport` | `src/audit/decision_outcome_link_types.ts` | decisionId (`dec-XXXXXXXX`), outcomeClass, causalChainLines[], linkageStrength |
| `EcosystemLoopSummary` | `src/audit/ecosystem_loop_types.ts` | totalLoops, metCount, partialCount, notMetCount, driftState, recurringViolationStreak, summaryLines[] |

---

## Health Index Layer

| Interface | File | Description |
|-----------|------|-------------|
| `EcosystemHealthIndex` | `src/audit/ecosystem_health_types.ts` | score (0–100), band, components (stability, calibrationQuality, governanceEffectiveness, policyChurn) |
| `HealthComponent` | `src/audit/ecosystem_health_types.ts` | score, weight, label |
| `EcosystemHealthBand` | `src/audit/ecosystem_health_types.ts` | `'poor' \| 'fragile' \| 'stable' \| 'strong'` |
| `EcosystemHealthTrace` | `src/audit/health_trace_types.ts` | components: { stability, calibrationQuality, governanceEffectiveness, policyChurn } → ComponentTrace |
| `ComponentTrace` | `src/audit/health_trace_types.ts` | formula, weight, score, sourceRecordIds[] |

---

## Cockpit Layer

| Interface | File | Description |
|-----------|------|-------------|
| `EcosystemCockpitSnapshot` | `src/audit/cockpit_types.ts` | 7 blocks: health, trends, prediction, governance, policy, doctrine, attention |
| `CockpitHealthBlock` | `src/audit/cockpit_types.ts` | score, band, weakestComponent, componentSummary[] |
| `CockpitTrendBlock` | `src/audit/cockpit_types.ts` | driftState, mostFrequent, mostRecent, streak, streakWarning |
| `CockpitPredictionBlock` | `src/audit/cockpit_types.ts` | predictedMode, confidence, riskDirection, topSignal |
| `CockpitGovernanceBlock` | `src/audit/cockpit_types.ts` | activeVersionId, latestAction, latestOutcomeClass, recentActionCount |
| `CockpitPolicyBlock` | `src/audit/cockpit_types.ts` | activeVersionId, adjustmentState (confidence/escalation/uncertainty/calibrationWindow) |
| `CockpitDoctrineBlock` | `src/audit/cockpit_types.ts` | supportingCount, cautiousCount, cautiousExceedsSupporting, mostRelevantHeuristic |
| `CockpitAttentionBlock` | `src/audit/cockpit_types.ts` | alerts[], alertCount |
| `CockpitAttentionAlert` | `src/audit/cockpit_types.ts` | id, message, severity, sourceComponent |

---

## Role View + Workflow Layer

| Interface | File | Description |
|-----------|------|-------------|
| `CockpitRoleMode` | `src/ui/cockpit/role_view_types.ts` | `'builder' \| 'auditor' \| 'governor' \| 'operator'` |
| `CockpitRoleViewConfig` | `src/ui/cockpit/role_view_types.ts` | mode, label, description, visibleCards[], emphasizedCards[], defaultExpandedCards[], summaryPriority[] |
| `WorkflowStep` | `src/ui/cockpit/workflow_types.ts` | id, title, description, targetCardId |
| `RoleWorkflow` | `src/ui/cockpit/workflow_types.ts` | mode, title, summary, steps: WorkflowStep[] |

---

## Worklog + Replay Layer

| Interface | File | Description |
|-----------|------|-------------|
| `WorklogEvent` | `src/worklog/worklog_types.ts` | eventId (`wev-XXXXXXXX`), timestamp, sessionId, roleMode, eventType, targetId, payload |
| `SessionWorklog` | `src/worklog/worklog_types.ts` | sessionId, startedAt, roleMode, events[], finalDecision, acceptedRationales[], rejectedRationales[], notes[] |
| `SessionReplayStep` | `src/worklog/session_replay_types.ts` | stepNumber, timestamp, eventType, title, description, targetId |
| `SessionNarrative` | `src/worklog/session_replay_types.ts` | sessionId, roleMode, startedAt, finalDecision, orderedSteps[], acceptedRationales[], rejectedRationales[], notes[], summaryLines[] |

---

## ID Format Reference

| Prefix | Format | Source |
|--------|--------|--------|
| `aud-` | `aud-XXXXXXXX` | djb2(timestamp + domain + action + ...) — GovernanceAuditRecord |
| `pol-` | `pol-XXXXXXXX` | djb2(domain + parameters + ...) — PolicyVersion |
| `ph-`  | `ph-XXXXXXXX`  | djb2(heuristicText + ...) — PlaybookHeuristic |
| `dls-` | `dls-XXXXXXXX` | djb2(deliberationId + ...) — GovernanceDeliberationSummary |
| `dec-` | `dec-XXXXXXXX` | djb2(decisionId + ...) — DecisionOutcomeLinkageReport |
| `wev-` | `wev-XXXXXXXX` | djb2(sessionId + eventType + targetId + timestamp) — WorklogEvent |
