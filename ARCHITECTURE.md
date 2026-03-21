# NOMOS Architecture

This document describes the full pipeline flow, data contracts between modules, determinism boundaries, constraint enforcement, and evaluation gating.

---

## Pipeline Flow

```
User Input (raw text)
        │
        ▼
┌─────────────────────────────┐
│     Intent Detector          │  intent_detector.ts
│  keyword scoring → IntentType│
└─────────────┬───────────────┘
              │ IntentType
              ▼
┌─────────────────────────────┐
│     Domain Template          │  domain_templates.ts
│  requiredFields              │
│  optionalFields              │
│  missingFieldHints           │
└─────────────┬───────────────┘
              │ DomainTemplate
              ▼
┌─────────────────────────────┐
│     Field Extractor          │  field_extractor.ts
│  ExtractedFields             │
│  meals, macros, labels,      │
│  constraints, candidates,    │
│  objective                   │
└─────────────┬───────────────┘
              │ ExtractedFields
              ▼
┌─────────────────────────────┐
│     Gap Detector             │  gap_detector.ts
│  GapDetectionResult          │
│  missingRequiredFields[]     │
│  missingOptionalFields[]     │
│  warnings[], notes[]         │
│  isEvaluable: boolean        │
└─────────────┬───────────────┘
              │ GapDetectionResult
              ▼
┌─────────────────────────────┐
│     Auto Compiler            │  auto_compiler.ts
│  StructuredDraft             │
│  state[], constraints[],     │
│  uncertainties[],            │
│  candidates[], objective[]   │
└─────────────┬───────────────┘
              │ StructuredDraft
              ▼
┌─────────────────────────────┐
│     Draft Patcher            │  draft_patcher.ts
│  patchDraftField(draft,      │
│    fieldKey, value)          │
│  revalidateDraft(draft,      │
│    intent)                   │
│  → updated StructuredDraft   │
└─────────────┬───────────────┘
              │ StructuredDraft (patched)
              ▼
┌─────────────────────────────┐
│     Draft Serializer         │  draft_serializer.ts
│  serializeDraft(draft)       │
│  → canonical text block      │
│  buildSerializedDraftRecord  │
│  → SerializedDraftRecord     │
└─────────────┬───────────────┘
              │ SerializedDraftRecord
              ▼
┌─────────────────────────────┐
│     Evaluation Engine        │  API server / nomos-core
│  (only runs when             │
│   isEvaluable && isConfirmed)│
│  → EvaluationResult          │
└─────────────┬───────────────┘
              │ EvaluationResult
              ▼
┌─────────────────────────────┐
│     Audit Store              │  audit_store.ts
│  saveAuditRecord(record)     │
│  AuditRecord {               │
│    canonicalDeclaration,     │
│    compileResult,            │
│    patchedDraft,             │
│    evaluationResult,         │
│    versionId,                │
│    parentVersionId           │
│  }                           │
└─────────────────────────────┘
```

---

## Data Contracts

### `ExtractedFields` (field_extractor.ts → gap_detector.ts)

```typescript
interface ExtractedFields {
  hasMealSystem: boolean;
  hasTargets: boolean;
  hasFoodLabels: boolean;
  hasCorrectionMode: boolean;
  hasLockedPlacements: boolean;
  hasConstraints: boolean;
  hasCandidates: boolean;
  hasObjective: boolean;
  hasSchedule: boolean;

  mealSystem: string | null;
  macroTargetString: string | null;
  foodLabels: string[];
  constraintLines: string[];
  candidateLines: { id: string; text: string }[];
  objectiveLine: string | null;
}
```

### `GapDetectionResult` (gap_detector.ts → auto_compiler.ts)

```typescript
interface GapDetectionResult {
  missingRequiredFields: string[];
  missingOptionalFields: string[];
  warnings: string[];
  notes: string[];
  isEvaluable: boolean;
}
```

### `StructuredDraft` (auto_compiler.ts → everywhere)

```typescript
interface StructuredDraft {
  intent: IntentType;
  title: string;

  state: string[];
  constraints: string[];
  uncertainties: string[];
  candidates: CompiledCandidate[];
  objective: string[];

  missingRequiredFields: string[];
  missingOptionalFields: string[];
  warnings: string[];
  notes: string[];

  isEvaluable: boolean;
}
```

### `SerializedDraftRecord` (draft_serializer.ts → audit_store.ts)

```typescript
interface SerializedDraftRecord {
  intent: string;
  title: string;
  isEvaluable: boolean;
  canonicalText: string;  // single source of truth for evaluation
}
```

### `AuditRecord` (audit_store.ts)

```typescript
interface AuditRecord {
  id: string;
  versionId: string;
  parentVersionId?: string | null;
  timestamp: string;
  intent: string;
  title: string;
  isEvaluable: boolean;
  isConfirmed: boolean;
  canonicalDeclaration: string;
  compileResult: AutoCompileResult | null;
  patchedDraft: StructuredDraft | null;
  evaluationResult: AuditEvaluationResult | null;
}
```

---

## Determinism Boundaries

### Fully Deterministic

| Module | Why |
|---|---|
| `intent_detector.ts` | Keyword scoring against fixed vocabulary — same input → same intent |
| `field_extractor.ts` | Regex and string matching only — no probability |
| `gap_detector.ts` | Set comparison between extracted fields and template requirements |
| `draft_patcher.ts` | Fixed switch-case dispatch — no branching uncertainty |
| `draft_serializer.ts` | Fixed section order, deduplication, whitespace normalization |
| `audit_store.ts` | Pure read/write to localStorage |
| `audit_versioning.ts` | Timestamp + Math.random — deterministic enough for version IDs |
| All editors (TargetMacrosEditor, etc.) | User-provided values with no inference |

### Flexible / Non-Deterministic

| Module | Why |
|---|---|
| Evaluation API | Calls the NOMOS constitutional kernel, which may use LLM reasoning for edge cases |
| `query_parser.ts` | HybridNomosQueryParser may use LLM fallback when parsing is ambiguous |

---

## Constraint Enforcement

Constraints are enforced at three levels:

### 1. Field-Level (Gap Detector)

Before a draft is evaluable, all required fields for the selected domain must be present. `gap_detector.ts` checks each required field against the extracted data and returns `isEvaluable: false` if any are missing.

```
NUTRITION_AUDIT required fields:
  meal_system_or_phase_plan
  target_macros_or_goal
  food_source_truth_or_labels
```

### 2. Declaration-Level (Confirmation Gate)

The user must explicitly confirm a complete draft before evaluation is permitted. The UI blocks the Evaluate button until both `isEvaluable === true` and `isConfirmed === true`.

### 3. Constitutional-Level (Evaluation Engine)

The evaluation backend enforces four constitutional laws against every candidate:

- **Law I — Feasibility:** The declared reality must be physically achievable.
- **Law II — Observability:** The system must be able to identify the decisive variable.
- **Law III — Constraint Satisfaction:** All declared constraints must be satisfied.
- **Law IV — Robustness:** The chosen candidate must maintain a sufficient margin above the constraint boundary.

Any violation blocks the verdict. `LAWFUL` requires all four laws satisfied.

---

## Evaluation Gating

Evaluation is gated by a three-condition lock:

```
isEvaluable    = missingRequiredFields.length === 0
isConfirmed    = user has clicked "Confirm Draft"
not evaluating = no active evaluation request

EVALUATE button enabled only when:
  isEvaluable && isConfirmed && !isEvaluating
```

The serialized canonical declaration — not the raw input — is what the evaluation engine receives. This ensures evaluation always runs against a stable, normalized, human-confirmed artifact.

---

## Audit Version Lineage

Every save creates a new `versionId`. When a record is reloaded and re-confirmed, the new record stores `parentVersionId` pointing to its origin. This creates a chain:

```
audit_1234_abc  (initial compile + confirm)
      │
      └── ver_1234_def  (first version)
              │
              └── ver_5678_ghi  (after field patch + re-confirm, parent = ver_1234_def)
                      │
                      └── ver_9012_jkl  (after evaluation, parent = ver_5678_ghi)
```

This lineage supports future diff views comparing canonical declarations across versions.
