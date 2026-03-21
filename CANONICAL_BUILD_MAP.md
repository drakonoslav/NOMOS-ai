# CANONICAL BUILD MAP

> Classification of every major package, app, and folder in this repo.
> Use this as the first document when inspecting the codebase.

---

## Role Labels

| Label | Meaning |
|-------|---------|
| `RUNTIME_APP` | A deployable service or UI that runs in production |
| `SHARED_LIBRARY` | A library package imported by runtime apps; not a standalone entrypoint |
| `UI_LAYER` | Frontend only; no business logic |
| `ADAPTER` | Glue between systems (generated clients, ORM schema) |
| `SOURCE_OF_TRUTH` | Defines contracts that other layers must conform to |
| `GENERATED` | Machine-generated from a source of truth; do not edit directly |
| `DEMO_ONLY` | Exists for prototyping or demonstration; not production runtime |
| `SCRIPTING` | Automation scripts; not runtime code |
| `DOCS_ONLY` | Documentation; not importable or executable |
| `ASSET_ONLY` | Binary or text assets; not source code |

---

## Package / Folder Classification

### `artifacts/nomos-dashboard`

| Property | Value |
|----------|-------|
| **Role** | `RUNTIME_APP` + `UI_LAYER` |
| **Canonical** | YES — this is the primary user-facing application |
| **Production runtime** | YES |
| **Safe to edit** | YES |
| **Depends on** | `lib/api-spec` (for API contracts), `packages/constitutional-kernel` (indirectly via API) |
| **Depended on by** | nothing (leaf node) |
| **May be imported by others** | NO |
| **Deployed** | YES |

The canonical frontend. Renders the NOMOS reasoning interface, cockpit, governance views, session worklog, and role-aware dashboards. Calls the API server at `/api/*`. Never directly executes the constitutional kernel.

---

### `artifacts/api-server`

| Property | Value |
|----------|-------|
| **Role** | `RUNTIME_APP` |
| **Canonical** | YES — this is the primary backend service |
| **Production runtime** | YES |
| **Safe to edit** | YES |
| **Depends on** | `packages/constitutional-kernel`, `lib/db` (database), `lib/api-spec` (contracts) |
| **Depended on by** | `artifacts/nomos-dashboard` (via HTTP at `/api/*`) |
| **May be imported by others** | NO |
| **Deployed** | YES |

The canonical backend. Serves `/api/healthz`, `/api/nomos/state`, `/api/nomos/query/parse`, `/api/nomos/query/evaluate`. The only place the constitutional kernel is executed.

---

### `artifacts/mockup-sandbox`

| Property | Value |
|----------|-------|
| **Role** | `DEMO_ONLY` |
| **Canonical** | NO |
| **Production runtime** | NO |
| **Safe to edit** | YES (but changes have no production effect) |
| **Depends on** | nothing runtime-critical |
| **Depended on by** | nothing |
| **May be imported by others** | NO |
| **Deployed** | NO |

A local-only UI prototyping sandbox. Used during design iterations. Not part of the production runtime. Its workflow is `NOT_STARTED` by default. Do not confuse this with the main application.

---

### `packages/constitutional-kernel`

| Property | Value |
|----------|-------|
| **Role** | `SHARED_LIBRARY` |
| **Canonical** | YES — canonical implementation of the four constitutional laws |
| **Production runtime** | YES (via api-server) |
| **Safe to edit** | YES — but changes affect evaluation behaviour |
| **Depends on** | nothing in this repo (self-contained) |
| **Depended on by** | `artifacts/api-server` |
| **May be imported by others** | YES — but only by `artifacts/api-server`. The dashboard must never import it directly. |
| **Deployed** | NO (library; bundled into api-server) |

The constraint evaluation engine. Implements the four constitutional laws, feasibility engine, decision engine, constitution guard, and belief state. Named `nomos-core` in its package.json. **Not a root entrypoint. Not a CLI app.** Execute only through `artifacts/api-server`.

---

### `lib/api-spec`

| Property | Value |
|----------|-------|
| **Role** | `SOURCE_OF_TRUTH` |
| **Canonical** | YES — single source of truth for all API contracts |
| **Production runtime** | NO (contract definition only) |
| **Safe to edit** | YES — but triggers need for codegen re-run |
| **Depends on** | nothing |
| **Depended on by** | `lib/api-client-react`, `lib/api-zod`, `artifacts/api-server`, `artifacts/nomos-dashboard` |
| **May be imported by others** | YES (as contract reference) |
| **Deployed** | NO |

The OpenAPI 3.1 specification (`openapi.yaml`). Defines all endpoint contracts. Changing this file requires re-running codegen and updating route handlers.

---

### `lib/api-client-react`

| Property | Value |
|----------|-------|
| **Role** | `GENERATED` + `ADAPTER` |
| **Canonical** | NO — generated from `lib/api-spec` |
| **Production runtime** | Conditionally (if imported by dashboard) |
| **Safe to edit** | NO — generated files are overwritten by codegen |
| **Depends on** | `lib/api-spec` |
| **Depended on by** | `artifacts/nomos-dashboard` (if used) |
| **May be imported by others** | YES — by dashboard only |
| **Deployed** | NO (bundled into dashboard) |

Auto-generated React Query hooks from the OpenAPI spec via Orval. Do not edit directly.

---

### `lib/api-zod`

| Property | Value |
|----------|-------|
| **Role** | `GENERATED` |
| **Canonical** | NO — generated from `lib/api-spec` |
| **Production runtime** | Conditionally (if imported by api-server or dashboard) |
| **Safe to edit** | NO — generated |
| **Depends on** | `lib/api-spec` |
| **Depended on by** | `artifacts/api-server`, `artifacts/nomos-dashboard` (validation) |
| **May be imported by others** | YES — by runtime apps only |
| **Deployed** | NO (bundled) |

Auto-generated Zod validation schemas. Do not edit directly.

---

### `lib/db`

| Property | Value |
|----------|-------|
| **Role** | `ADAPTER` |
| **Canonical** | YES — canonical database schema |
| **Production runtime** | YES (via api-server) |
| **Safe to edit** | YES — with caution; schema changes need migration |
| **Depends on** | database (PostgreSQL) |
| **Depended on by** | `artifacts/api-server` |
| **May be imported by others** | YES — by `artifacts/api-server` only |
| **Deployed** | NO (bundled into api-server) |

Drizzle ORM schema and database client. Canonical definition of the database structure.

---

### `scripts/`

| Property | Value |
|----------|-------|
| **Role** | `SCRIPTING` |
| **Canonical** | Supporting only |
| **Production runtime** | NO |
| **Safe to edit** | YES |
| **Depends on** | workspace packages (for post-merge) |
| **Depended on by** | Replit (post-merge hook) |
| **May be imported by others** | NO |
| **Deployed** | NO |

Contains `post-merge.sh` (runs `pnpm install` + database push after task-agent merges) and utility scripts. Automation only.

---

### `attached_assets/`

| Property | Value |
|----------|-------|
| **Role** | `ASSET_ONLY` |
| **Canonical** | NO |
| **Production runtime** | NO |
| **Safe to edit** | YES |
| **Depends on** | nothing |
| **Depended on by** | nothing at runtime (`@assets` alias in vite.config is defined but unused) |
| **May be imported by others** | NO |
| **Deployed** | NO |

Contains ~190 files: uploaded documents, prompt text files, images, and zips accumulated during development. These are development-context artifacts, not source code. The `@assets` Vite alias points here but is not used in any source file. Safe to treat as archival. See `/docs/assets-reference/ASSET_INVENTORY.md`.

---

### Root config and doc files

| File | Role | Notes |
|------|------|-------|
| `README.md` | `DOCS_ONLY` | Primary inspection entry point |
| `ARCHITECTURE.md` | `DOCS_ONLY` | Full pipeline documentation |
| `SYSTEM_RULES.md` | `DOCS_ONLY` | Constitutional invariants |
| `MODULE_MAP.md` | `DOCS_ONLY` | Layer-by-layer module reference |
| `TYPES_INDEX.md` | `DOCS_ONLY` | Canonical type interface index |
| `REVIEW_GUIDE.md` | `DOCS_ONLY` | External reviewer inspection path |
| `CHANGELOG_ARCHITECTURE.md` | `DOCS_ONLY` | Architectural progression log |
| `CANONICAL_BUILD_MAP.md` | `DOCS_ONLY` | This file |
| `DEPENDENCY_RULES.md` | `DOCS_ONLY` | Allowed dependency directions |
| `package.json` | `SOURCE_OF_TRUTH` | Workspace root; defines workspace dev/build scripts |
| `pnpm-workspace.yaml` | `SOURCE_OF_TRUTH` | Defines workspace package roots |
| `tsconfig.json` / `tsconfig.base.json` | `SOURCE_OF_TRUTH` | TypeScript project references |
| `replit.md` | `DOCS_ONLY` | Replit environment notes |
| `examples/` | `DOCS_ONLY` | Worked pipeline examples |

---

## Authoritative Runtime Path

**Plain English:**

1. **Frontend entrypoint**: `artifacts/nomos-dashboard/src/main.tsx`
   - Served by Vite dev server on `PORT` (default: 24280)
   - In production: static build at `artifacts/nomos-dashboard/dist/public/`
   - Routed at path `/` (root)

2. **Backend entrypoint**: `artifacts/api-server/src/index.ts`
   - Express server on `PORT` (default: 8080)
   - In production: built to `artifacts/api-server/dist/index.mjs`
   - Routes at `/api/*`

3. **Shared kernel dependency**: `packages/constitutional-kernel`
   - Imported by `artifacts/api-server` only
   - Package name: `nomos-core`
   - Never executed directly; never imported by the frontend

4. **Not part of production runtime**:
   - `attached_assets/` — development context files
   - `artifacts/mockup-sandbox/` — UI prototype sandbox (demo only)
   - `lib/api-client-react/` — generated, bundled at build time
   - `lib/api-zod/` — generated, bundled at build time
   - `scripts/` — automation tooling only
   - `docs/` — documentation only

---

## Migration Notes

**`packages/constitutional-kernel` package name is `nomos-core`**
The directory is `packages/constitutional-kernel` but the `package.json` `name` field is `nomos-core`. This can cause confusion when reading `pnpm --filter nomos-core` commands vs directory paths. Both refer to the same package. No action required — but worth noting for new readers.

**`attached_assets/` contains mixed content**
This folder accumulated development context during the build (uploaded prompt docs, images, zip files). Nothing in the production runtime imports from it. The `@assets` Vite alias exists but is unused. This folder should eventually be moved to `/archive/` or removed during a cleanup pass. It does not need to remain at the root. See `ASSET_INVENTORY.md`.

**`lib/api-client-react/` and `lib/api-zod/` are generated**
These are Orval-generated files from the OpenAPI spec. They must not be edited directly. If they appear stale, re-run: `pnpm run --filter @workspace/api-spec codegen`.
