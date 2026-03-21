# NOMOS Architecture

This document describes the full pipeline, data contracts between modules, determinism boundaries, constraint enforcement, evaluation gating, and governance chain.

See also: [README.md](README.md) · [MODULE_MAP.md](MODULE_MAP.md) · [SYSTEM_RULES.md](SYSTEM_RULES.md) · [TYPES_INDEX.md](TYPES_INDEX.md)

---

## 1. Compiler Pipeline

```
Raw Input (natural language text)
    │
    ▼  intent_detector.ts
    │  keyword scoring → IntentType (NUTRITION_AUDIT | TRAINING_AUDIT | SCHEDULE_AUDIT | GENERIC)
    │
    ▼  domain_templates.ts
    │  IntentType → DomainTemplate (requiredFields, optionalFields, missingFieldHints)
    │
    ▼  field_extractor.ts
    │  DomainTemplate + raw text → ExtractedFields
    │  (meals, macros, food labels, constraints, candidates, objective)
    │
    ▼  gap_detector.ts
    │  ExtractedFields + DomainTemplate → GapDetectionResult
    │  (missingRequiredFields[], missingOptionalFields[], isEvaluable)
    │
    ▼  auto_compiler.ts
    │  → StructuredDraft (state[], constraints[], uncertainties[], candidates[], objective[])
    │
    ▼  draft_patcher.ts                    [iterative, user-driven]
    │  patchDraftField(draft, key, value)
    │  → patched StructuredDraft
    │  revalidateDraft(draft, intent) → updated isEvaluable
    │
    ▼  draft_serializer.ts
    │  serializeDraft(draft) → canonicalText (frozen string — single source of truth)
    │  buildSerializedDraftRecord() → SerializedDraftRecord
    │
    ▼  GATE: isEvaluable && isConfirmed && !isEvaluating
```

**Key invariant:** The Evaluate button is disabled until all three gate conditions are met.
Raw input is never sent to the evaluation engine.

---

## 2. Constraint Algebra

Three enforcement levels:

### 2a. Field-level (Gap Detector)
All required fields for the active domain must be present before a draft is evaluable.

```
NUTRITION_AUDIT required fields:
  meal_system_or_phase_plan
  target_macros_or_goal
  food_source_truth_or_labels
```

### 2b. Declaration-level (Confirmation Gate)
User must explicitly confirm a complete draft. `isConfirmed` must be `true`.

### 2c. Constitutional-level (Evaluation Engine)
Four laws enforced against every candidate:

| Law | Name | Meaning |
|-----|------|---------|
| I | Feasibility | The declared reality must be physically achievable |
| II | Observability | The decisive variable must be identifiable |
| III | Constraint Satisfaction | All declared constraints must be satisfied |
| IV | Robustness | Candidate must maintain sufficient margin above constraint boundary |

Verdict classes: `LAWFUL` (all four satisfied) · `DEGRADED` (partial satisfaction) · `INVALID` (hard violation)

---

## 3. Evaluation + Audit Persistence

```
SerializedDraftRecord
    │
    ▼  Evaluation Engine (API server / constitutional kernel)
    │  EvaluationReport {
    │    verdict: LAWFUL | DEGRADED | INVALID
    │    constraintTrace: ConstraintTrace[]
    │    marginScore: number
    │    decisiveVariable: string
    │    failureMode: string | null
    │  }
    │
    ▼  audit_store.ts
    │  AuditRecord {
    │    id, versionId, parentVersionId
    │    canonicalDeclaration (frozen)
    │    evaluationResult
    │    timestamp, intent, title
    │  }
    │  Storage: localStorage key nomos_audit_history_v1
```

**Immutability:** AuditRecord fields are never overwritten. Reloading a record
and re-evaluating produces a new record with `parentVersionId` linking to the origin.

---

## 4. Candidate-Local Trace Flow

```
EvaluationReport
    │
    ▼  trace_diff.ts
    │  buildCandidateTrace(report) → CandidateTrace
    │  diffCandidateTraces(baseline, candidate) → TraceDiff
    │  (constraintChanges[], verdictChange, marginDelta, decisionVariableChange)
    │
    ▼  AuditDiffPanel.tsx (UI)
    │  Renders TraceDiff — which constraints passed/failed in each run
```

Trace diff is used by the auditor workflow and the policy bench to compare candidate vs baseline.

---

## 5. Trend Tracking + Prediction + Calibration

```
AuditRecord[] (historical)
    │
    ▼  decisive_variable_trends.ts
    │  buildDecisiveVariableTrendReport(records)
    │  → DecisiveVariableTrendReport {
    │    mostFrequentFailureMode, mostRecentFailureMode
    │    streaks: { mode, count, isActive }[]
    │    trendLines: { variable, direction }[]
    │  }
    │
    ▼  failure_prediction.ts
    │  buildFailurePrediction(trendReport, calibration?)
    │  → FailurePrediction {
    │    predictedFailureMode, confidence, riskDirection
    │    topSignal, historySizeGuard
    │  }
    │
    ▼  prediction_calibration.ts
    │  buildPredictionCalibration(predictions, resolutions)
    │  → PredictionCalibrationReport {
    │    exactMatchRate, directionMatchRate
    │    totalPredictions, resolvedPredictions
    │  }
    │
    ▼  bounded_rule_adjustment.ts
    │  buildBoundedRuleAdjustment(calibration, policy)
    │  → RuleAdjustmentProposal {
    │    confidenceBias, escalationThreshold, uncertaintyBias
    │    calibrationWindow, adjustmentStrength
    │  }
    │  (advisory only — never auto-applied)
```

---

## 6. Policy Versioning + Governance

```
RuleAdjustmentProposal (advisory)
    │
    ▼  policy_versioning.ts
    │  freezePolicyVersion(policy) → PolicyVersion (immutable snapshot)
    │  buildVersionedPolicyId() → "pol-XXXXXXXX"
    │
    ▼  policy_governance.ts
    │  PredictionPolicySnapshot {
    │    activeVersionId, candidateVersionId?
    │    activePolicy, candidatePolicy?
    │  }
    │
    ▼  counterfactual_policy_bench.ts
    │  runPolicyBench(records, candidatePolicy, baselinePolicy)
    │  → PolicyBenchReport { metricsByPolicy, gainsByPolicy }
    │
    ▼  policy_recommendation.ts
    │  buildPolicyRecommendationReport(bench, snapshot)
    │  → PolicyRecommendationReport {
    │    recommendedVersionId, strength, confidence
    │    expectedGains[], summaryLines[]
    │    candidatePolicyVersionIds (ranked)
    │  }
    │
    ▼  policy_regime_comparison.ts
    │  buildPolicyRegimeComparison(bench, baseline, candidate)
    │  → PolicyRegimeComparison {
    │    baselineMetrics, candidateMetrics
    │    gainLines[], riskLines[], tradeoffLines[]
    │  }
    │
    ▼  governance_decision_support.ts
    │  buildGovernanceDecisionSupportReport(recommendation, comparison, auditRecords)
    │  → GovernanceDecisionSupportReport {
    │    suggestedAction: promote | rollback | hold
    │    confidence, rationale[], risks[], tradeoffs[]
    │  }
    │
    ▼  governance_deliberation_summary.ts
    │  buildGovernanceDeliberationSummary(decisionSupport, recommendation)
    │  → GovernanceDeliberationSummary {
    │    id: "dls-XXXXXXXX"
    │    deliberationLines[], counterarguments[], finalRationale
    │  }
    │
    ▼  HUMAN GOVERNANCE ACTION (promote / rollback / hold)
    │  governance_audit_trail.ts
    │  recordGovernanceAction(action) → GovernanceAuditRecord {
    │    id: "aud-XXXXXXXX"
    │    action, domain, policyVersionId
    │    rationale, timestamp (immutable)
    │  }
```

**Key invariant:** Policy recommendation is NOT policy promotion.
No automatic promotion ever occurs.

---

## 7. Post-Governance Outcome Review

```
GovernanceAuditRecord + AuditRecord[] (post-action)
    │
    ▼  post_governance_outcome_review.ts
    │  buildGovernanceOutcomeReviewReport(auditRecord, postRecords)
    │  → GovernanceOutcomeReviewReport {
    │    outcomeClass: met | partially_met | not_met | inconclusive
    │    expectedGains[], observedChanges[], verdict
    │  }
    │
    ▼  governance_learning_summary.ts
    │  buildGovernanceLearningReport(reviews[])
    │  → GovernanceLearningReport {
    │    metRate, partialRate, notMetRate
    │    patternLines[], lessonsLearned[]
    │  }
    │
    ▼  governance_playbook_extraction.ts
    │  extractPlaybookHeuristics(learningReport)
    │  → PlaybookHeuristic[] {
    │    id: "ph-XXXXXXXX"
    │    heuristicText, supportingEvidence[]
    │    classification: supporting | cautioning | neutral
    │  }
    │
    ▼  playbook_to_decision_crosswalk.ts
    │  buildPlaybookDecisionCrosswalk(heuristics, decisionReport)
    │  → PlaybookDecisionCrosswalk {
    │    alignedHeuristics[], conflictingHeuristics[]
    │    crosswalkSummaryLines[]
    │  }
```

---

## 8. Decision → Outcome Linkage

```
GovernanceAuditRecord + PostGovernanceOutcomeReviewReport
    │
    ▼  decision_outcome_linkage.ts
    │  buildDecisionOutcomeLinkageReport(auditRecord, outcomeReview)
    │  → DecisionOutcomeLinkageReport {
    │    decisionId: "dec-XXXXXXXX"
    │    outcomeClass, causalChainLines[]
    │    linkageStrength: strong | moderate | weak | inconclusive
    │  }
    │
    ▼  ecosystem_loop_summary.ts
    │  buildEcosystemLoopSummary(linkageReports[])
    │  → EcosystemLoopSummary {
    │    totalLoops, metCount, partialCount, notMetCount
    │    driftState: stabilizing | drifting | overcorrecting | stable
    │    recurringViolationStreak: number
    │    summaryLines[]
    │  }
```

---

## 9. Ecosystem Health Index

```
EcosystemLoopSummary + AuditRecord[] + GovernanceLearningReport + PredictionCalibrationReport
    │
    ▼  ecosystem_health_index.ts
    │  buildEcosystemHealthIndex(inputs) → EcosystemHealthIndex {
    │    score: 0–100
    │    band: poor | fragile | stable | strong
    │    components: {
    │      stability:             { score, weight: 0.35 }
    │      calibrationQuality:    { score, weight: 0.25 }
    │      governanceEffectiveness: { score, weight: 0.25 }
    │      policyChurn:           { score, weight: 0.15 }
    │    }
    │  }
    │
    ▼  health_index_traceability.ts
    │  buildEcosystemHealthTrace(healthIndex, sourceInputs)
    │  → EcosystemHealthTrace {
    │    components: {
    │      stability:             ComponentTrace (formula, sourceRecordIds[])
    │      calibrationQuality:    ComponentTrace
    │      governanceEffectiveness: ComponentTrace
    │      policyChurn:           ComponentTrace
    │    }
    │  }
```

Health index component scoring:

| Component | Formula |
|-----------|---------|
| Stability | `100 − (failureRate × 100) + streakModifier` |
| Calibration | `(exactMatchRate ?? 0.5) × 50 + (directionMatchRate ?? 0.5) × 25 − penalties` |
| Gov. effectiveness | `100 × metRate + 50 × partialRate` (or 50 baseline, 40 if actions but no reviews) |
| Policy churn | `clamp(100 − n×8, 0, 100) + 15 (stabilizing) − 25 (overcorrecting) − 15 (drifting)` |

---

## 10. Ecosystem Cockpit

```
All subsystems above
    │
    ▼  ecosystem_cockpit.ts
    │  buildEcosystemCockpitSnapshot(all inputs)
    │  → EcosystemCockpitSnapshot {
    │    health:      { score, band, components }
    │    trends:      { driftState, mostFrequent, mostRecent, streak, streakWarning }
    │    prediction:  { predictedMode, confidence, riskDirection, topSignal }
    │    governance:  { activeVersionId, latestAction, latestOutcomeClass }
    │    policy:      { activeVersionId, adjustmentState }
    │    doctrine:    { supportingCount, cautiousCount, mostRelevantHeuristic }
    │    attention:   { alerts[], alertCount }
    │  }
```

Attention alerts (7 deterministic rules): health component poor/fragile, low prediction confidence,
rising risk direction, streak ≥ 3, governance overcorrection, cautions > supporting doctrine,
unresolved prediction rate > 30%.

---

## 11. Role Views + Guided Workflows

```
EcosystemCockpitSnapshot (unchanged — same truth)
    │
    ▼  role_view_config.ts
    │  getCockpitRoleViewConfig(mode: builder | auditor | governor | operator)
    │  → CockpitRoleViewConfig {
    │    visibleCards[], emphasizedCards[]
    │    defaultExpandedCards[], summaryPriority[]
    │  }
    │
    ▼  workflow_config.ts
    │  getRoleWorkflow(mode)
    │  → RoleWorkflow { title, summary, steps: WorkflowStep[] }
    │  Each step: { id, title, description, targetCardId }
    │
    ▼  EcosystemCockpitPage.tsx
    │  role mode state via useState()
    │  RoleModeSwitcher (pill control)
    │  RoleWorkflowPanel (collapsible guided steps)
    │  7 cockpit card components (flex layout, emphasis by role)
```

Role modes change only presentation — not data, evaluation, or governance state.

---

## 12. Session Worklog + Session Replay

```
User actions in EcosystemCockpitPage
    │
    ▼  session_worklog.ts (pure immutable functions)
    │  createSessionWorklog → SessionWorklog
    │  recordWorkflowStart, recordPanelOpened, recordDecision, etc.
    │  → new SessionWorklog (never mutates input)
    │  Event IDs: "wev-XXXXXXXX" (djb2 hash)
    │
    ▼  session_replay.ts
    │  sortSessionEvents(events) → sorted by timestamp
    │  buildSessionReplaySteps(worklog) → SessionReplayStep[]
    │  buildSessionNarrative(worklog) → SessionNarrative {
    │    orderedSteps[], summaryLines[]
    │    acceptedRationales[], rejectedRationales[]
    │  }
```

The session worklog is the **human operational trace** layered on top of the machine trace.
Together they provide a full accountability chain: machine computation + human reasoning path.

---

## Determinism Boundary Summary

| Layer | Deterministic | Notes |
|-------|:---:|-------|
| Compiler (all modules) | **Y** | Regex, set ops, switch dispatch only |
| Evaluation engine (deterministic path) | **Y** | No LLM calls in deterministic matcher |
| Evaluation engine (LLM path) | N | Gated separately, edge cases only |
| Audit persistence | **Y** | Pure read/write |
| Trend tracking | **Y** | Aggregation over sorted records |
| Prediction + calibration | **Y** | Deterministic formula |
| Policy bench + recommendation | **Y** | Pure aggregation |
| Governance audit trail | **Y** | djb2 ID, timestamp |
| Health index + traceability | **Y** | Explicit formula with documented weights |
| Cockpit snapshot | **Y** | Composition of deterministic subsystems |
| Role view config | **Y** | Static lookup |
| Guided workflows | **Y** | Static definition |
| Session worklog | **Y** | Pure immutable functions |
| Session replay | **Y** | Sort + map over recorded events |
| UI components | N | React state, user interaction |
