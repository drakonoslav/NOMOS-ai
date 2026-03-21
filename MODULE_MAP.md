# MODULE_MAP

> One-table reference for every layer of the NOMOS system.
> Reading time: ~45 seconds.

---

| Layer | Files | Responsibility | Deterministic |
|---|---|---|:---:|
| **Compiler** | `src/compiler/intent_types.ts`<br>`src/compiler/intent_detector.ts`<br>`src/compiler/domain_templates.ts`<br>`src/compiler/field_extractor.ts`<br>`src/compiler/gap_detector.ts`<br>`src/compiler/auto_compiler.ts`<br>`src/compiler/draft_patcher.ts`<br>`src/compiler/draft_serializer.ts` | Converts raw text into a structured, evaluable declaration. Detects intent → extracts fields → detects gaps → builds draft → applies patches → emits canonical text. No LLM calls. | **Y** |
| **Nutrition Engine** | `nutrition/food_registry.ts`<br>`nutrition/food_primitive.ts`<br>`nutrition/label_parser.ts`<br>`nutrition/macro_engine.ts`<br>`nutrition/meal_plan_parser.ts`<br>`nutrition/meal_audit_pipeline.ts`<br>`nutrition/audit_engine.ts`<br>`nutrition/correction_engine.ts`<br>`nutrition/correction_constraints.ts`<br>`nutrition/correction_rules.ts`<br>`nutrition/meal_types.ts`<br>`nutrition/phase_registry.ts` | Grounds food macros against declared labels. Computes totals per meal and per day. Identifies macro drift. Produces the smallest structure-preserving correction that closes the drift. Food registry is the single source of truth for all macro values. | **Y** |
| **Constitutional Kernel** | `constitutional-kernel/decision_engine.ts`<br>`constitutional-kernel/feasibility_engine.ts`<br>`constitutional-kernel/constitution_guard.ts`<br>`constitutional-kernel/belief_state.ts`<br>`constitutional-kernel/kernel_runner.ts`<br>`evaluation/deterministic_matcher.ts`<br>`evaluation/candidate_scoring.ts`<br>`evaluation/margin_scorer.ts`<br>`evaluation/constraint_normalizer.ts`<br>`evaluation/windowed_aggregator.ts` | Enforces the four constitutional laws against every candidate. Classifies each candidate as LAWFUL, DEGRADED, or INVALID. Computes margin scores. Blocks any output that violates a hard constraint. Deterministic path runs without LLM; LLM path is gated separately. | **Y** ¹ |
| **Audit System** | `src/audit/audit_types.ts`<br>`src/audit/audit_versioning.ts`<br>`src/audit/audit_store.ts` | Persists every evaluation result with a version ID and parent chain. Supports load, delete, and clear. Backed by localStorage under key `nomos_audit_history_v1`. All read/write operations are synchronous and produce stable output for the same inputs. | **Y** |
| **UI Bridge** | `ui/components/compiler/CompiledDraftPanel.tsx`<br>`ui/components/compiler/FieldPatchPanel.tsx`<br>`ui/components/compiler/FieldAwareEditor.tsx`<br>`ui/components/compiler/MissingFieldEditor.tsx`<br>`ui/components/compiler/editors/TargetMacrosEditor.tsx`<br>`ui/components/compiler/editors/FoodSourceTruthEditor.tsx`<br>`ui/components/compiler/editors/CorrectionModeEditor.tsx`<br>`ui/components/compiler/editors/LockedPlacementsEditor.tsx`<br>`ui/components/audit/AuditHistoryPanel.tsx` | Renders the compiled draft and surfaces each missing required field with a targeted editor. Accepts patches from the user, applies them via `patchDraftField`, and gates the Evaluate button behind three conditions: `isEvaluable && isConfirmed && !isEvaluating`. Saves results to the audit store on every evaluation. | **N** ² |

---

**Notes**

¹ The deterministic matcher (`evaluation/deterministic_matcher.ts`) runs without any LLM call and is fully reproducible. The LLM semantic evaluator (`evaluation/llm_semantic_evaluator.ts`) is a separate path gated by query type and is not deterministic.

² React components are driven by user interaction and local state. The underlying operations they invoke — `autoCompile`, `patchDraftField`, `serializeDraft`, `detectGaps` — are each deterministic. Non-determinism in this layer is UI-only.

---

**All source paths above are relative to their package root:**

- Compiler and audit layers → `artifacts/nomos-dashboard/`
- Nutrition engine and constitutional kernel → `packages/constitutional-kernel/src/`
- UI bridge → `artifacts/nomos-dashboard/src/`
