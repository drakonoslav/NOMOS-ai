# Example: Policy Versioning + Replay

This example shows the policy versioning system: frozen policy snapshots,
the active/candidate state, and how policy replay reconstructs historical
policy state at a given point in time.

## Files in This Example

| File | Stage | Description |
|------|-------|-------------|
| `baseline_policy.json` | Version 1 | The original frozen policy snapshot (pol-aabbccdd) |
| `candidate_policy.json` | Version 2 | The candidate policy under evaluation (pol-11223344) |
| `policy_snapshot.json` | Active state | PredictionPolicySnapshot: active + candidate version |
| `regime_comparison.json` | Comparison | Baseline vs candidate metric comparison |
| `policy_replay_output.json` | Replay | Reconstructed policy state at a historical point |

## Key Concepts

### Policy Versioning

Every policy change produces a new frozen `PolicyVersion` — it is never modified after creation.
IDs follow the format `pol-XXXXXXXX` (djb2 hash of policy parameters + domain + timestamp).

```
pol-aabbccdd   ← active (baseline)
pol-11223344   ← candidate (under evaluation)
```

### Policy Snapshot

`PredictionPolicySnapshot` tracks the current active and optional candidate version:

```json
{
  "activeVersionId": "pol-aabbccdd",
  "candidateVersionId": "pol-11223344"
}
```

### Policy Replay

Policy replay allows reconstructing which policy was active at any historical audit record.
This is essential for the counterfactual bench: "what would this record have looked like
under the candidate policy?"

## Key Invariant

A frozen policy version is immutable.
`freezePolicyVersion()` returns a new object — it never modifies an existing version.
The policy replay reconstructs from write-once snapshots, not from mutable state.
