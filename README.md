# NOMOS — Constitutional AI Reasoning Engine

NOMOS is a deterministic, constraint-based reasoning engine built in TypeScript. It converts messy, unstructured user input into constrained, evaluable declarations — and enforces constitutional rules before any evaluation is permitted.

It is not a chatbot. It is not a planner. It is a structured decision system that enforces laws before it permits action.

---

## What NOMOS Is

NOMOS is a **Constitutional AI Kernel** — a reasoning engine that:

- extracts structured facts from raw, unformatted input
- detects gaps between what is declared and what is required for evaluation
- allows surgical field-by-field repair of incomplete declarations
- serializes confirmed declarations into a canonical, stable artifact
- evaluates only confirmed, complete structured drafts
- persists a version-linked audit history of every confirmed decision

The system operates under four constitutional laws that gate every evaluation. No candidate is permitted to act until all laws are satisfied.

---

## Pipeline

```
raw input
    │
    ▼
Intent Detection          (keyword-scoring classifier → domain template selection)
    │
    ▼
Field Extraction          (deterministic extraction of meals, macros, labels, constraints)
    │
    ▼
Gap Detection             (compare extracted fields against domain template requirements)
    │
    ▼
Structured Draft          (state / constraints / uncertainties / candidates / objective)
    │
    ▼
Field Patching            (field-aware editors repair missing fields surgically)
    │
    ▼
Canonical Serialization   (deterministic text block — single source of truth)
    │
    ▼
Evaluation                (constraint-based scoring, margin evaluation, lawfulness verdict)
    │
    ▼
Audit History             (versioned persistence of canonical declaration + result)
```

---

## Core Design Principles

| Principle | Meaning |
|---|---|
| **Deterministic over probabilistic** | Every pipeline stage produces the same output for the same input. No stochastic behavior. |
| **Constraints before evaluation** | A declaration cannot be evaluated until all required fields are present and confirmed. |
| **Label-grounded truth** | For nutrition domains, food-label data overrides estimated values. |
| **Minimal correction over redesign** | The system corrects the smallest possible change. It does not redesign. |
| **Canonical declaration as source of truth** | Evaluation runs against the serialized canonical block, not raw input. |
| **Field-local repair** | Missing fields are fixed one at a time. Unrelated sections are not touched. |

---

## Key Modules

### Compiler (`src/compiler/`)

| File | Responsibility |
|---|---|
| `domain_templates.ts` | Defines 4 domain templates (Nutrition Audit, Training Audit, Schedule Audit, Generic). Each template declares required fields, optional fields, and missing-field hints. |
| `intent_types.ts` | Re-exports `IntentType` as a union of domain template keys. |
| `intent_detector.ts` | Deterministic keyword-scoring classifier. Scores raw input against each domain and returns the highest-confidence match. |
| `field_extractor.ts` | Extracts meal systems, macro targets, food labels, constraints, candidates, and objective from raw text using pattern matching. |
| `gap_detector.ts` | Compares extracted fields against the selected template. Returns `missingRequiredFields`, `missingOptionalFields`, warnings, notes, and `isEvaluable`. |
| `auto_compiler.ts` | Orchestrates detection → extraction → gap detection → `StructuredDraft`. |
| `draft_patcher.ts` | `patchDraftField(draft, fieldKey, value)` applies a surgical field patch. `revalidateDraft` recomputes `isEvaluable`. |
| `draft_serializer.ts` | `serializeDraft(draft)` emits a canonical text block. `buildSerializedDraftRecord` returns the storable artifact. |

### Audit (`src/audit/`)

| File | Responsibility |
|---|---|
| `audit_types.ts` | `AuditRecord` — full schema for a persisted decision, including versionId, parentVersionId, canonicalDeclaration, compileResult, patchedDraft, and evaluationResult. |
| `audit_versioning.ts` | `buildAuditId()` and `buildVersionId()` — timestamp + random suffix identifiers. |
| `audit_store.ts` | `saveAuditRecord`, `listAuditRecords`, `getAuditRecord`, `deleteAuditRecord`, `clearAuditRecords` — localStorage-backed persistence under key `nomos_audit_history_v1`. |

### Nutrition (`src/nutrition/`)

| File | Responsibility |
|---|---|
| `food_primitive.ts` | `FoodPrimitive` registry — deterministic nutrient database for declared foods. |
| `meal_types.ts` | `MealBlock`, `MealSystem` types and builders. |
| `macro_engine.ts` | `computeMealMacros`, `computeSystemMacros` — deterministic macro summation. |
| `correction_engine.ts` | `correction_rules`, `correct_meal`, `audit_meal` — constraint-driven correction logic. |

### UI (`src/ui/`)

| Path | Responsibility |
|---|---|
| `components/compiler/CompiledDraftPanel.tsx` | Renders compiled draft sections with Fix buttons on missing fields. |
| `components/compiler/FieldPatchPanel.tsx` | Hosts the active field editor. |
| `components/compiler/FieldAwareEditor.tsx` | Routes field keys to dedicated editors or generic textarea fallback. |
| `components/compiler/editors/` | TargetMacrosEditor, CorrectionModeEditor, FoodSourceTruthEditor, LockedPlacementsEditor. |
| `components/audit/AuditHistoryPanel.tsx` | Lists persisted records with load, delete, and clear actions. |
| `pages/query/QueryBuilderPage.tsx` | Full auto-compile pipeline: compile → patch → confirm → serialize → evaluate → audit. |

---

## Domain Templates

NOMOS ships with four built-in domain templates:

| Intent | Description |
|---|---|
| `NUTRITION_AUDIT` | Constrained macro audit with food-label truth, meal system, and correction mode. |
| `TRAINING_AUDIT` | Training load and progression constraint evaluation. |
| `SCHEDULE_AUDIT` | Time-block and anchor constraint evaluation. |
| `GENERIC_CONSTRAINT_TASK` | General constraint satisfaction and candidate evaluation. |

---

## Tech Stack

- **Language:** TypeScript
- **UI:** React + Vite
- **Styling:** CSS custom properties, NOMOS design token system
- **Persistence:** localStorage (audit history), in-memory (draft state)
- **Evaluation backend:** Node.js / Express API server

---

## Repository Structure

```
artifacts/
  nomos-dashboard/
    src/
      compiler/         # Intent detection, field extraction, gap detection, patching, serialization
      audit/            # Audit types, versioning, localStorage persistence
      nutrition/        # Food primitives, meal types, macro engine, correction engine
      ui/
        components/
          compiler/     # CompiledDraftPanel, FieldPatchPanel, FieldAwareEditor, editors/
          audit/        # AuditHistoryPanel
        pages/
          query/        # QueryBuilderPage — full auto-compile pipeline
        styles/         # nomos.css — NOMOS design token system
  api-server/           # Express evaluation backend
```

---

## Running Locally

```bash
pnpm install
pnpm --filter @workspace/nomos-dashboard run dev   # Dashboard on port 24280
pnpm --filter @workspace/api-server run dev        # API server on port 8080
```

Navigate to `/query` and select **Auto-Compile** mode to use the full pipeline.
