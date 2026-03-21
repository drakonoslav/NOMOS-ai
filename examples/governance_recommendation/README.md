# Example: Governance Recommendation Pipeline

This example shows the complete governance pipeline from policy bench through
recommendation, deliberation summary, and playbook crosswalk.

## Files in This Example

| File | Stage | Description |
|------|-------|-------------|
| `audit_records.json` | Input | Historical audit records used as bench input |
| `policy_bench_report.json` | Bench | Counterfactual policy bench result (metrics per policy version) |
| `recommendation_report.json` | Recommendation | PolicyRecommendationReport (advisory — not a promotion) |
| `regime_comparison.json` | Comparison | Baseline vs candidate regime comparison |
| `decision_support.json` | Decision support | GovernanceDecisionSupportReport (promote/rollback/hold) |
| `deliberation_summary.json` | Deliberation | Narrative deliberation for governor review |
| `playbook_crosswalk.json` | Doctrine | Playbook heuristic alignment against the recommendation |
| `governance_audit_record.json` | Human action | GovernanceAuditRecord (immutable, written after human decision) |

## Pipeline Flow

```
audit_records.json (historical AuditRecord[])
    │
    ▼  counterfactual_policy_bench.ts
    │  policy_bench_report.json
    │
    ▼  policy_recommendation.ts
    │  recommendation_report.json
    │
    ▼  policy_regime_comparison.ts
    │  regime_comparison.json
    │
    ▼  governance_decision_support.ts
    │  decision_support.json
    │
    ▼  governance_deliberation_summary.ts
    │  deliberation_summary.json
    │
    ▼  playbook_to_decision_crosswalk.ts
    │  playbook_crosswalk.json
    │
    ▼  HUMAN DECISION (governor reviews all of the above)
    │
    ▼  governance_audit_trail.ts
       governance_audit_record.json (immutable)
```

## Key Invariant

At no point does any function in this pipeline auto-promote or auto-roll-back a policy.
`recommendation_report.json` is advisory.
`decision_support.json` is advisory.
`deliberation_summary.json` is advisory.

Only the human action recorded in `governance_audit_record.json` changes the active policy.
