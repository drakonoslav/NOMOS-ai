# LLM BOUNDARY

> Defines where LLM is allowed, where it is forbidden, and how LLM outputs
> are normalized before machine use.

---

## Core Principle

The LLM is an **adapter**, not a reasoning machine.

In NOMOS:
- The LLM may **extract, propose, and suggest**
- The LLM may **never certify constitutional status**
- Every final machine verdict comes from typed, deterministic kernel pathways

---

## Where LLM Is Allowed

All LLM modules live in `packages/constitutional-kernel`. They run server-side only (Node.js, via `artifacts/api-server`). The browser/dashboard never calls an LLM directly.

### 1. Query Extraction

**File:** `packages/constitutional-kernel/src/query/llm_query_parser.ts`

**Role:** Converts natural language into structured `NomosQuery`.

**Constitutional boundary:**
- Does NOT assign lawfulness, authority, or constitutional status
- `parserConfidence` is extraction quality, not lawfulness
- The extracted query must pass through the deterministic evaluation pipeline before any verdict is possible
- If the LLM is unavailable, falls back to the rule-based parser

### 2. Semantic Evaluation (UNKNOWN constraints only)

**File:** `packages/constitutional-kernel/src/evaluation/llm_semantic_evaluator.ts`

**Role:** Secondary evaluator used only when the deterministic matcher returns `null` (i.e., the constraint kind is `UNKNOWN`).

**Constitutional boundary:**
- Does NOT override deterministic results
- Called only after the deterministic matcher has confirmed it cannot classify the constraint
- Produces `CandidateEvaluationDraft` using the same typed contract as the deterministic matcher
- Falls back to `DEGRADED` with `confidence: "low"` if OpenAI is unavailable
- Deterministic results always take precedence

### 3. Proposal Generation

**File:** `packages/constitutional-kernel/src/llm_proposer.ts`

**Role:** Generates candidate plans and hypotheses as proposals.

**Constitutional boundary:**
- Every proposal carries `lawful: false` — this is structural, not cosmetic
- The LLM is subordinate to: `feasibility_engine` (Law I), `robustness_analyzer` (Law II), `verification_kernel` (Laws I–IV), `constitution_guard` (enforcement)
- Proposals are inputs to the evaluation pipeline, not outputs of it

### 4. OpenAI Transport

**File:** `packages/constitutional-kernel/src/llm/openai_client.ts`

**Role:** Transport only. Sends structured prompts, receives structured responses.

**Constitutional boundary:**
- "Transport only. Does NOT certify feasibility, robustness, observability, or authority."
- API key read from `process.env` only — never from client code or env vars passed to the browser
- Returns raw bundle that `llm_proposer.ts` maps into typed NOMOS objects

### 5. Dashboard Conversation Suggestions (advisory only)

**File:** `artifacts/nomos-dashboard/src/ui/conversation/llm_refiner.ts`

**Role:** Calls `POST /nomos/conversation/suggest` for optional guided refinement suggestions in the UI.

**Constitutional boundary:**
- Advisory only — does not trigger evaluation or governance actions
- Calls the API server endpoint; does not hold an OpenAI key in the browser
- Suggestions are displayed, not executed

---

## Where LLM Is Forbidden

| Context | Why Forbidden |
|---------|---------------|
| Final evaluation verdict | Verdict must come from the deterministic pipeline (Laws I–IV) |
| Constraint satisfaction determination (when deterministic result is available) | Deterministic result always takes precedence |
| Governance action decisions | Human action required (Law III) |
| Audit record content | Audit records are produced from typed pipeline outputs, not LLM text |
| Health index computation | All health index math is deterministic formula-based |
| Policy version creation | Policy snapshots are typed and frozen by deterministic functions |
| Browser/client-side | No OpenAI key is ever in the browser. All LLM calls are server-side only. |

---

## How LLM Outputs Are Normalized Before Machine Use

```
LLM raw output (JSON schema structured)
    │
    ▼ Parsed by OpenAI SDK Structured Outputs (strict: true)
    ▼ Validated against TypeScript interface
    │
    ▼ For query parsing:
    │   LLM → NomosQuery shape → validated fields → passed to evaluator
    │
    ▼ For semantic evaluation:
    │   LLM → CandidateEvaluationDraft → same typed contract as deterministic matcher
    │   → margin_scorer assigns marginScore and marginLabel
    │
    ▼ For proposals:
    │   LLM → OpenAIProposal → mapped to CandidatePlan with lawful: false
    │   → submitted to feasibility_engine for Law I check
    │
    ▼ In all cases:
        Final machine state comes from typed deterministic pipeline
        LLM output is an input to that pipeline, not its output
```

---

## Environment Variable Requirements

| Variable | Where read | Purpose |
|----------|-----------|---------|
| `OPENAI_API_KEY` | `packages/constitutional-kernel` (server-side only) | OpenAI authentication |
| `OPENAI_MODEL` | `packages/constitutional-kernel` (server-side only) | Model selection (default: `gpt-4.1`) |

Neither variable is read in the dashboard or exposed to the browser.

---

## Fallback Behavior When LLM Is Unavailable

| Module | Fallback |
|--------|---------|
| `llm_query_parser.ts` | Falls back to rule-based parser (`query_parser_rule_based.ts`) |
| `llm_semantic_evaluator.ts` | Returns `DEGRADED` with `confidence: "low"` and explicit clarification suggestion |
| `llm_proposer.ts` | Caller receives an error; no phantom proposals created |
| `llm_refiner.ts` (dashboard) | Suggestion panel shows no suggestions; evaluation proceeds normally |

---

## Traceability

Every `CandidateEvaluation` produced by an LLM path carries:
- `confidence: "low"` (LLM result) vs `"moderate"` or `"high"` (deterministic)
- `reason` string sourced from typed structured output, not raw text generation
- Deterministic margin scoring applied after — LLM does not determine `marginScore`
