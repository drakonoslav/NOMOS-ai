# NOMOS System Rules

These are the constitutional rules of the NOMOS reasoning engine. They are not preferences. They are not guidelines. They are invariants that the system enforces at every stage.

---

## Rule 1: NOMOS never evaluates raw input.

Raw user input — no matter how well-structured it appears — is never passed directly to the evaluation engine.

All input must pass through:
1. Field extraction
2. Gap detection
3. Structured draft assembly
4. User confirmation

Only a confirmed `StructuredDraft` serialized into a `canonicalDeclaration` is sent for evaluation.

**Enforcement:** The Evaluate button is disabled until `isEvaluable && isConfirmed`. The API only receives the serialized canonical block.

---

## Rule 2: NOMOS only evaluates confirmed structured drafts.

A draft is not evaluable until:
- All required fields for the selected domain are present (`missingRequiredFields.length === 0`)
- The user has explicitly confirmed the draft (`isConfirmed === true`)

Confirmation is an explicit, intentional act — not automatic. The user must review the compiled draft and click Confirm before evaluation is permitted.

**Enforcement:** `handleAutoConfirm` checks `isEvaluable` before setting `isConfirmed`. `handleAutoEvaluate` checks both conditions before calling the API.

---

## Rule 3: Label truth overrides assumptions.

When food label data is declared, it takes precedence over estimated or assumed nutrient values.

- A declared whey label overrides any system-estimated whey macro
- A declared oat label overrides any generic oat database entry
- Estimated values (banana, egg) remain flagged as uncertain unless separately grounded by a label

This rule exists to prevent silent substitution of declared facts with probabilistic guesses.

**Enforcement:** `food_source_truth_or_labels` field triggers label-override constraints in STATE and CONSTRAINTS sections of the compiled draft. Uncertainties are recorded for non-grounded values.

---

## Rule 4: Minimal correction preferred over restructuring.

When the system detects a constraint violation or missing field:
- It corrects the smallest possible change
- It does not redesign, reorder, or restructure unrelated sections
- It does not suggest alternative meal plans or candidate sets

The user declares the structure. NOMOS enforces the constraints within that structure.

**Enforcement:** `draft_patcher.ts` patches exactly one field per call. Other sections are not touched. `FieldAwareEditor` editors produce values that patch a single field key only.

---

## Rule 5: Missing required fields block evaluation.

If any required field for the selected domain is absent from the compiled draft, evaluation is blocked. The system does not estimate, infer, or skip required fields.

The user is shown exactly which fields are missing, with Fix buttons to repair each field surgically through guided editors.

**Enforcement:** `isEvaluable` is set to `false` whenever `missingRequiredFields.length > 0`. `gap_detector.ts` determines required fields from the active domain template. `patchDraftField` removes a field from `missingRequiredFields` and recomputes `isEvaluable` after each patch.

---

## Rule 6: Canonical declaration is the single source of truth.

Once a draft is confirmed, the serialized canonical declaration — not the raw input, not the UI state — becomes the artifact used for:
- evaluation
- audit history storage
- version diffing
- re-loading past decisions

Raw input is discarded from the evaluation chain after compilation.

**Enforcement:** `buildSerializedDraftRecord(draft)` produces a deterministic canonical text block. Evaluation and audit persistence both use this artifact, not `rawInput`.

---

## Rule 7: Evaluation results do not modify the canonical declaration.

An evaluation result is stored alongside the canonical declaration in the audit record. It does not retroactively alter the declaration that was evaluated.

If the result prompts a new declaration, that declaration is a new record with a `parentVersionId` pointing to its origin.

**Enforcement:** `AuditRecord` stores `canonicalDeclaration` and `evaluationResult` as separate fields. Patching an evaluated draft creates a new `AuditRecord` rather than overwriting the previous one.

---

## Rule 8: All compiler and patch logic is deterministic.

No part of the compiler pipeline, field extraction, gap detection, draft patching, or serialization may use:
- LLM inference
- probabilistic scoring
- random selection

Only the evaluation backend (constitutional kernel) may use non-deterministic reasoning, and only after the deterministic pipeline has confirmed the input is complete.

**Enforcement:** All compiler modules use regex matching, set operations, and switch-case dispatch. No API calls are made during compilation or patching.
