# NOMOS Repo Topology

> Describes the difference between the runtime path, build path, documentation path,
> and archival / non-runtime materials.

See also: [runtime-diagram.md](runtime-diagram.md) · [../assets-reference/ASSET_INVENTORY.md](../assets-reference/ASSET_INVENTORY.md)

---

## The Four Topology Layers

### 1. Runtime Path

What runs in production and in the Replit dev environment.

```
artifacts/nomos-dashboard/     → Frontend (Vite, React)
artifacts/api-server/          → Backend (Express, Node.js)
packages/constitutional-kernel → Kernel library (bundled into API server)
lib/db/                        → Database adapter (used by API server)
```

These four locations produce the running application.
When you `pnpm run dev`, these are the only things that start.

**Runtime processes:**
- `vite --config vite.config.ts --host 0.0.0.0` (dashboard, port 24280)
- `node ./dist/index.mjs` (api-server, port 8080)

---

### 2. Build Path

What must be compiled or generated before the runtime path is complete.

```
lib/api-spec/openapi.yaml     → OpenAPI spec (source of truth for API contracts)
lib/api-client-react/         → Generated React Query hooks (from api-spec)
lib/api-zod/                  → Generated Zod schemas (from api-spec)
tsconfig.json + tsconfig.base → TypeScript project references
```

**Build sequence:**
```
1. pnpm run typecheck:libs     → compile TypeScript project references
2. pnpm codegen (api-spec)     → regenerate api-client-react + api-zod
3. pnpm --filter @workspace/api-server run build     → bundle API server
4. pnpm --filter @workspace/nomos-dashboard run build → bundle dashboard
```

The build path produces static artifacts for production deployment.
In development (Vite HMR + ts-node/esbuild), this is handled automatically.

---

### 3. Documentation Path

Files that describe the system but are not importable or executable.

```
README.md                    → Primary entry point for reviewers
ARCHITECTURE.md              → Full pipeline documentation
SYSTEM_RULES.md              → Constitutional invariants
MODULE_MAP.md                → Layer-by-layer module reference
TYPES_INDEX.md               → Canonical type interface index
REVIEW_GUIDE.md              → External reviewer inspection path
CHANGELOG_ARCHITECTURE.md   → Architectural progression log
CANONICAL_BUILD_MAP.md       → Role classification of every folder
DEPENDENCY_RULES.md          → Allowed import directions
docs/generated/              → Generated runtime and topology docs
examples/                    → Worked pipeline examples
replit.md                    → Replit environment notes
```

These files are documentation only. They are never imported. Changes here have no effect on the running application.

---

### 4. Archival / Non-Runtime Materials

Files and folders that are not part of the product, not importable, and not documentation.

```
attached_assets/             → Development context files (prompts, images, uploads)
artifacts/mockup-sandbox/    → UI prototype sandbox (demo only, not started)
lib/api-client-react/dist/   → Generated output (not edited directly)
lib/api-zod/dist/            → Generated output (not edited directly)
scripts/src/hello.ts         → Placeholder script
```

These can be inspected without affecting the runtime.

---

## Topology Summary Table

| Location | Layer | Running in prod? | Editable? | Purpose |
|----------|-------|:---:|:---:|---------|
| `artifacts/nomos-dashboard` | Runtime | YES | YES | Frontend UI |
| `artifacts/api-server` | Runtime | YES | YES | Backend API |
| `packages/constitutional-kernel` | Runtime (bundled) | YES | YES | Evaluation engine |
| `lib/db` | Runtime (bundled) | YES | YES | Database schema |
| `lib/api-spec` | Build | NO | YES | API contract definition |
| `lib/api-client-react` | Build (generated) | NO | NO | Generated hooks |
| `lib/api-zod` | Build (generated) | NO | NO | Generated schemas |
| Root `*.md` files | Docs | NO | YES | Documentation |
| `docs/` | Docs | NO | YES | Generated docs |
| `examples/` | Docs | NO | YES | Worked examples |
| `attached_assets/` | Archival | NO | YES | Dev context files |
| `artifacts/mockup-sandbox` | Non-runtime | NO | YES | UI demo sandbox |
| `scripts/` | Build tooling | NO | YES | Automation |

---

## How the Paths Relate

```
Source code (runtime path)
    │
    ▼ (build path)
Compiled + bundled artifacts
    │
    ▼ (deployment)
Running production services
    │
    ▼ (observed by)
Documentation path (describes what's running)
    │
    ▼ (supplements)
Archival materials (context for how it was built)
```

---

## Common Confusion Points

| Question | Answer |
|----------|--------|
| Is `packages/constitutional-kernel` running? | Not as a separate process. It is bundled into `api-server`. |
| Is `lib/api-client-react` running? | Not as a separate process. It is bundled into the dashboard at build time. |
| Is `attached_assets/` source code? | No. It is development context (uploaded files). |
| Is `artifacts/mockup-sandbox` the main app? | No. It is a demo sandbox, NOT_STARTED by default. |
| Can I edit `lib/api-zod/` directly? | No. It is generated. Run codegen to update it. |
| Where does the app start? | `artifacts/nomos-dashboard` (frontend) + `artifacts/api-server` (backend). These are the two entry points. |
