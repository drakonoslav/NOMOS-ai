# NOMOS System Rules

These are the constitutional rules of the NOMOS reasoning ecosystem.
They are not preferences. They are not guidelines. They are invariants that the system enforces at every stage.

See also: [ARCHITECTURE.md](ARCHITECTURE.md) · [MODULE_MAP.md](MODULE_MAP.md)

---

## Rule 1: NOMOS never evaluates raw input.

Raw user input — no matter how well-structured it appears — is never passed directly to the evaluation engine.

All input must pass through:
1. Field extraction
2. Gap detection
3. Structured draft assembly
4. User confirmation

Only a confirmed `StructuredDraft` serialised into a `canonicalDeclaration` is sent for evaluation.

**Enforcement:** The Evaluate button is disabled until `isEvaluable && isConfirmed`.
The API only receives the serialised canonical block, never raw input.

---

## Rule 2: NOMOS only evaluates confirmed structured drafts.

A draft is not evaluable until:
- All required fields for the selected domain are present (`missingRequiredFields.length === 0`)
- The user has explicitly confirmed the draft (`isConfirmed === true`)

Confirmation is an explicit, intentional act — not automatic.

**Enforcement:** `handleAutoConfirm` checks `isEvaluable` before setting `isConfirmed`.
`handleAutoEvaluate` checks both conditions before calling the API.

---

## Rule 3: Label truth overrides assumptions.

When food label data is declared, it takes precedence over estimated or assumed nutrient values.

- A declared label overrides any system-estimated value for that food
- Estimated values remain flagged as uncertain unless separately grounded by a label

This rule prevents silent substitution of declared facts with probabilistic guesses.

**Enforcement:** `food_source_truth_or_labels` field triggers label-override constraints in the
STATE and CONSTRAINTS sections of the compiled draft. Uncertainties are recorded for all
non-grounded values.

---

## Rule 4: Violation labels are reporting outputs, never comparison operands.

A violation label (e.g. `DEGRADED`, `INVALID`, a failure mode string) is the output of an evaluation.
It is never fed back as an input to a subsequent evaluation or used as a comparable value in a constraint.

**Enforcement:** Evaluation functions receive only the confirmed `canonicalDeclaration` and
the active policy. They produce an `EvaluationReport`. The report is stored alongside the declaration,
not substituted into it.

---

## Rule 5: Deterministic evaluation is separated from constraint satisfaction.

The deterministic evaluation path (keyword scoring, constraint algebra, margin scoring) is always
invoked independently of any LLM semantic path. The two paths are gated separately.

The deterministic path must always be able to produce a complete verdict without the LLM path.

**Enforcement:** `evaluation/deterministic_matcher.ts` runs independently of
`evaluation/llm_semantic_evaluator.ts`. The LLM path is a separate code gate,
not a fallback that silently replaces the deterministic path.

---

## Rule 6: Minimal correction preferred over restructuring.

When the system detects a constraint violation or missing field:
- It corrects the smallest possible change
- It does not redesign, reorder, or restructure unrelated sections
- It does not suggest alternative candidates

The user declares the structure. NOMOS enforces the constraints within that structure.

**Enforcement:** `draft_patcher.ts` patches exactly one field per call.
Other sections are not touched. Field editors produce values for a single field key only.

---

## Rule 7: Missing required fields block evaluation.

If any required field for the selected domain is absent, evaluation is blocked.
The system does not estimate, infer, or skip required fields.

The user is shown exactly which fields are missing, with targeted editors for each.

**Enforcement:** `isEvaluable` is `false` whenever `missingRequiredFields.length > 0`.
`patchDraftField` removes a field from `missingRequiredFields` and recomputes `isEvaluable` after each patch.

---

## Rule 8: Canonical declaration is the single source of truth.

Once a draft is confirmed, the serialised canonical declaration — not raw input, not UI state —
is the artifact used for:
- evaluation
- audit history storage
- version diffing
- re-loading past decisions

Raw input is discarded from the evaluation chain after compilation.

**Enforcement:** `buildSerializedDraftRecord(draft)` produces a deterministic canonical text block.
Both evaluation and audit persistence use this artifact exclusively.

---

## Rule 9: Evaluation results do not modify the canonical declaration.

An evaluation result is stored alongside the canonical declaration in the audit record.
It does not retroactively alter the declaration that was evaluated.

If the result prompts a new declaration, that declaration is a new record with a
`parentVersionId` pointing to its origin.

**Enforcement:** `AuditRecord` stores `canonicalDeclaration` and `evaluationResult` as separate fields.
Patching an evaluated draft creates a new `AuditRecord`, not an overwrite.

---

## Rule 10: All compiler and patch logic is deterministic.

No part of the compiler pipeline — field extraction, gap detection, draft patching, or serialisation —
may use LLM inference, probabilistic scoring, or random selection.

Only the constitutional evaluation engine may use non-deterministic reasoning,
and only after the deterministic pipeline has confirmed the input is complete.

**Enforcement:** All compiler modules use regex matching, set operations, and switch-case dispatch.
No API calls are made during compilation or patching.

---

## Rule 11: Governance is advisory until explicit human action.

Policy recommendation is not policy promotion.
Governance decision support, deliberation summaries, and playbook crosswalks are advisory outputs.
No automatic promotion, rollback, or adjustment ever occurs.

Only an explicit, recorded human governance action changes the active policy state.

**Enforcement:** `policy_recommendation.ts` produces a recommendation report.
`governance_audit_trail.ts` records the human action.
`policy_governance.ts` only advances the active policy when a human action is logged.
No function call in the governance pipeline auto-promotes or auto-rolls-back a policy.

---

## Rule 12: Historical records, frozen policy snapshots, and audit records are immutable.

Once written:
- `AuditRecord` fields are never overwritten
- `PolicyVersion` (frozen snapshot) is never modified
- `GovernanceAuditRecord` is never deleted or modified
- `PlaybookHeuristic` records retain their original source evidence

Reloading and re-evaluating produces a new record with `parentVersionId` linking to the origin.

**Enforcement:** `audit_store.ts` has no update operation — only save, load, delete (for UI cleanup),
and clear. `policy_versioning.ts` `freezePolicyVersion` returns a new immutable object.
Governance audit records are write-once.

---

## Rule 13: UI must never contradict canonical evaluation report fields.

The UI may summarise, emphasise, or de-emphasise evaluation output.
It may not invert, suppress, or reinterpret a verdict, margin score, or constraint trace.

**Enforcement:** All display components receive evaluation data as props.
No component recalculates or reinterprets a verdict. Cockpit cards display the values
from `EcosystemCockpitSnapshot` without modification.

---

## Rule 14: The session worklog records only explicit user actions.

The worklog layer does not infer what the user intended.
It does not synthesise steps that were not explicitly logged.
It does not auto-complete workflow steps on the user's behalf.

**Enforcement:** All `session_worklog.ts` functions require explicit call-site invocation.
`buildSessionNarrative` reconstructs only from the recorded event list.
No event is invented.
