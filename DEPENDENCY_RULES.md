# DEPENDENCY RULES

> Defines the allowed and forbidden import directions in this repo.
> Enforced by convention. Not yet enforced by tooling (future: eslint-plugin-import boundaries).

See also: [CANONICAL_BUILD_MAP.md](CANONICAL_BUILD_MAP.md)

---

## Allowed Dependency Directions

```
nomos-dashboard
    │
    ├── lib/api-client-react    (generated API hooks)
    ├── lib/api-zod             (generated validation schemas)
    └── [HTTP only] → api-server

api-server
    │
    ├── packages/constitutional-kernel   (kernel execution)
    ├── lib/db                           (database)
    ├── lib/api-zod                      (request validation)
    └── lib/api-spec                     (contract reference)

packages/constitutional-kernel
    └── (self-contained — no workspace imports)

lib/api-client-react
    └── lib/api-spec   (generated from spec)

lib/api-zod
    └── lib/api-spec   (generated from spec)

lib/db
    └── (self-contained — external database only)
```

---

## Rule Table

| From | May depend on | May NOT depend on |
|------|--------------|-------------------|
| `artifacts/nomos-dashboard` | `lib/api-client-react`, `lib/api-zod`, API contracts | `packages/constitutional-kernel` directly, `lib/db`, `attached_assets/` |
| `artifacts/api-server` | `packages/constitutional-kernel`, `lib/db`, `lib/api-zod`, `lib/api-spec` | `artifacts/nomos-dashboard`, `artifacts/mockup-sandbox` |
| `packages/constitutional-kernel` | nothing in this repo | any artifact, any lib |
| `lib/api-client-react` | `lib/api-spec` | runtime apps, kernel, db |
| `lib/api-zod` | `lib/api-spec` | runtime apps, kernel, db |
| `lib/db` | external database | runtime apps, kernel |
| `artifacts/mockup-sandbox` | (demo only — isolated) | anything canonical |
| `scripts/` | workspace tools | runtime app code |

---

## Forbidden Dependency Directions

| Rule | Reason |
|------|--------|
| `nomos-dashboard` MUST NOT import `constitutional-kernel` directly | Kernel runs on the server only. All kernel execution goes through the API. |
| `nomos-dashboard` MUST NOT import `lib/db` | Database access is a backend concern. |
| `constitutional-kernel` MUST NOT import any artifact | It is a self-contained library. Circular deps would be catastrophic. |
| `mockup-sandbox` MUST NOT be imported by canonical runtime | It is a demo sandbox and may contain experimental or broken code. |
| `attached_assets/` MUST NOT become a source-of-truth location | It is an archival/asset folder. No canonical code should live there. |
| Any package MUST NOT have `api-server` as a dependency | The API server is a runtime service, not a library. |

---

## Who Executes the Kernel

Only `artifacts/api-server` may call functions from `packages/constitutional-kernel`.

The kernel is:
- imported as a library in `artifacts/api-server`
- called from route handlers at `/api/nomos/query/evaluate` and `/api/nomos/query/parse`
- never executed from the dashboard directly
- never executed from `scripts/` or `lib/`

---

## Who Renders UI

Only `artifacts/nomos-dashboard` renders user-facing UI.

The dashboard:
- receives evaluation results as JSON from the API
- renders the cockpit, worklog, governance views, and query interface
- calls the API at `/api/*` via HTTP fetch

The kernel has no UI. The api-server has no UI. The mockup-sandbox renders isolated component previews for design iteration only.

---

## Docs and Assets Are Not Import Roots

| Folder | Rule |
|--------|------|
| `attached_assets/` | Not an import root. No canonical code lives here. |
| `docs/` | Not importable. Documentation only. |
| `examples/` | Not importable. Worked examples only. |
| Root `*.md` files | Not importable. Documentation only. |

---

## Dependency Direction Diagram

```
         ┌───────────────────────────────┐
         │   attached_assets/ (ASSET)    │
         │   docs/ (DOCS)                │
         │   examples/ (DOCS)            │
         │   scripts/ (SCRIPTING)        │
         └───────────────────────────────┘
                  (no imports in/out)

lib/api-spec (SOURCE_OF_TRUTH)
    │
    ├──▶  lib/api-client-react (GENERATED)
    │         │
    │         └──▶  nomos-dashboard (RUNTIME_APP/UI_LAYER)
    │                   │
    │                   └──[HTTP /api/*]──▶  api-server (RUNTIME_APP)
    │                                             │
    └──▶  lib/api-zod (GENERATED)                ├──▶  constitutional-kernel (SHARED_LIB)
               │                                 │
               └──▶  api-server (RUNTIME_APP)    └──▶  lib/db (ADAPTER)
```
