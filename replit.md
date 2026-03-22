# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

### `packages/constitutional-kernel` (`nomos-core`)

**NOMOS** — a constitutional system governing lawful action under reality. *Only the lawful may act.*

Implements four Constitutional Laws (Feasibility, Robustness, Observability, Adaptive Correction) for mission-critical autonomous decision-making. This is **not** an LLM chatbot; it is a typed, testable constitutional reasoning engine with an integrated LLM proposal layer.

- Package name: `nomos-core` (workspace:*)
- Module resolution: NodeNext (ESM)
- Build: `tsc` → `dist/` (required before api-server imports it)
- Run demo: `pnpm --filter nomos-core run start`
- Typecheck: `pnpm --filter nomos-core run check`
- Build: `pnpm --filter nomos-core run build`
- NOMOS modules: `belief_state`, `observer`, `feasibility_engine`, `robustness_analyzer`, `verification_kernel`, `model_registry`, `decision_engine`, `constitution_guard`, `audit_log`, `llm_proposer`, `kernel_runner`
- Constitutional chain: belief → observer → model → llm_proposer → decision_engine → verification_kernel → constitution_guard → audit_log
- `kernel_runner.ts` — exports `runKernelOnce()` which runs the full chain and returns typed `KernelRunResult` JSON for the API
- LLM proposer uses OpenAI (gpt-4o by default); falls back to deterministic proposals if `OPENAI_API_KEY` is absent

### `artifacts/nomos-dashboard` (`@workspace/nomos-dashboard`)

**NOMOS Dashboard** — constitutional AI kernel monitoring interface. *Severe, austere, authority-first UI.*

React + Vite SPA at previewPath `/`. Dark theme, monospace data display, status colors only for LAWFUL/DEGRADED/INVALID.

- 7 pages: Overview, Verification, Proposals, Belief, Decision, Audit, **Query Builder** (`/query`)
- API client: uses generated React Query hooks from `lib/api-client-react`
- Endpoint: `GET /api/nomos/state` → runs kernel once, returns full `NomosState`
- Auto-refreshes every 10 seconds
- All proposals display `LAWFUL: FALSE` / `NON-AUTHORITATIVE` badge (constitutional rule: LLM is proposer only)

#### NOMOS Query System

Strict 4-step interaction model:
1. User provides input (guided structured form OR natural language textarea)
2. User clicks "Parse Submission" — extracts canonical `NomosQuery`
3. User reviews parsed preview and checks confirmation checkbox
4. Evaluate becomes available only after confirmation + completeness ≥ PARTIAL

**Architecture:**
- `src/query/query_types.ts` — frontend types (`NomosQuery`, `GuidedQueryDraft`, `draftToQuery()`)
- `src/query/query_api.ts` — `parseQuery()` + `evaluateQuery()` fetch wrappers
- `src/pages/query.tsx` — `QueryBuilderPage` (owns all page state)
- `src/components/query/` — all sub-components

**Completeness states:** COMPLETE / PARTIAL / INSUFFICIENT (separate from LAWFUL/DEGRADED/INVALID)
**Constitutional rule:** parser confidence is extraction quality only, never lawfulness.

#### NOMOS Canonical Entity Schema (`src/compiler/canonical_*` + `tag_registry.ts`)

The domain-agnostic measurable entity substrate used by all downstream systems.

- `canonical_entity_types.ts` — full schema: `CanonicalEntity`, `TagRecord`, `MeasureRecord`, `NormalizationRecord`, `EntityCategory`, `TagProvenance`, `MeasureDimension`, `EntityRole`
- `tag_registry.ts` — rich canonical tag registry (TagRecord[] per entry, with confidence 0–1 and sourceRegistryId); `lookupCanonicalTags()` with 3-tier lookup
- `canonical_entity_normalizer.ts` — `normalizeEntities(rawText)` → `CanonicalEntity[]`; `normalizeEntitiesStable()` for ID-stable calls; `normalizeSpan()` for pre-extracted spans
- `unit_registry.ts` — extended with `"energy"` and `"rate"` UnitCategory + units (kcal, cal, kj, bpm, rpm, mph, kph)

**Canonical schema contract:**
- `category` = broad structural type (food/supplement/fluid/load/duration/substance/unknown/…)  
- `tags: TagRecord[]` = semantic properties with per-tag `provenance`, `confidence`, `sourceRegistryId`
- `TagProvenance` = `"explicit" | "registry" | "normalized" | "inferred" | "fallback"`
- `measures: MeasureRecord[]` = amount + unitRaw + unitNormalized + dimension
- `normalizationHistory: NormalizationRecord[]` = auditable log of every transformation step
- `categoryConfidence` = 0.15–0.95 based on registry hit + extraction confidence

**All downstream systems consume CanonicalEntity, not raw text.**

#### NOMOS Compiler Layer (`src/compiler/`)

The compiler layer runs before domain routing. All types are domain-agnostic.

- `measured_entity_types.ts` — `MeasuredEntity` (with `tags`, `tagProvenance`), `MeasuredEntitySpan`, `BindingResult`
- `measured_entity_extractor.ts` — extracts quantity+unit+label spans; calls tag enricher for every span
- `entity_tag_registry.ts` — canonical label→tag registry (80+ entries: fast/slow carbs, proteins, fats, fluids, supplements, minerals, vegetables); `lookupEntityTags()` with 3-tier lookup (exact→containment→token); longest-key-first for specificity
- `entity_tag_enricher.ts` — `enrichEntityTags(label, category, unitCategory)` → `{tags, tagProvenance}`; 3-tier: registry → category-inferred → unit-fallback; single classification point for the entire pipeline
- `TagProvenanceSource` type: `"explicit" | "registry" | "inferred" | "fallback"` — every tag has a traceable origin

**Tag classification contract:**
1. Registry lookup (provenance="registry") — most entities (cyclic dextrin→["fast","carb"], oats→["slow","carb"], etc.)
2. Category-inferred tag (provenance="inferred") — coarse domain category added if not already in registry result
3. Unit-category fallback (provenance="fallback") — last resort for unknown entities with no category

#### NOMOS Graph Layer (`src/graph/`)

- `operand_graph_builder.ts` — propagates `tags` and `tagProvenance` verbatim from spans to entity node `data`; never recomputes tags
- `graph_query_engine.ts` — `filterEntitiesByTags(graph, ids, tags)` works on real pipeline data now that tags are populated by enricher
- `graph_constraint_executor.ts` — constraint pipeline: candidate→tag filter→label filter→window→aggregate→compare→proof
- `graph_constraint_types.ts` — `GraphConstraintSpec`, `GraphConstraintExecutionResult` (with proof trace)

**Test suite:** 50 test files, 1996 tests (all passing)
- `invariants_test.ts` — 52 tests (4 invariants: GF/ED/PI/MI)
- `candidate_graph_test.ts` — 52 tests (candidate blocks, multi-candidate graph, ownership, objective, bare measurements)
- `tag_provenance_test.ts` — 28 tests (registry lookup, enricher, graph propagation, real pipeline tag filtering)
- `canonical_entity_schema_test.ts` — 34 tests (schema structure, normalizer correctness, tag registry, normalization history, dimension mapping)

**API endpoints (api-server routes/query.ts):**
- `POST /api/nomos/query/parse` — hybrid parser (LLM → rule-based fallback)
- `POST /api/nomos/query/evaluate` — LLM-based semantic evaluation

**nomos-core query module** (`packages/constitutional-kernel/src/query/`):
- `query_types.ts` — canonical `NomosQuery` type
- `query_response_types.ts` — `NomosQueryResponse` type
- `query_parser_rule_based.ts` — deterministic regex parser (fallback)
- `llm_query_parser.ts` — OpenAI Responses API + JSON Schema extraction
- `query_parser.ts` — `HybridNomosQueryParser` (LLM → fallback wrapper)
- `query_evaluator.ts` — `NomosQueryEvaluator` (LLM semantic classification)
