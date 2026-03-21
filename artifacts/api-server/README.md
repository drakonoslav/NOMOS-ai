# `artifacts/api-server` — NOMOS API Server

## Role: `RUNTIME_APP`
## Canonical: YES
## Runtime-critical: YES
## Deployable: YES

---

## What This Is

This is the **primary backend service** for NOMOS-ai.

It is an Express + Node.js server that:
- Executes the constitutional kernel in response to dashboard requests
- Serves the JSON API consumed by `artifacts/nomos-dashboard`
- Handles database reads/writes via `lib/db` (Drizzle ORM)

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/healthz` | Health probe |
| `GET` | `/api/nomos/state` | Current ecosystem state snapshot |
| `POST` | `/api/nomos/query/parse` | Parse raw input → StructuredDraft |
| `POST` | `/api/nomos/query/evaluate` | Evaluate a canonical declaration |

All routes are prefixed `/api` and routed by Replit's path proxy from the dashboard.

---

## Runtime Entrypoint

```
src/index.ts     → Express server bootstrap
src/routes/      → Route handlers
```

## Dev Server

```bash
pnpm --filter @workspace/api-server run dev
# Builds to dist/index.mjs, starts Node on PORT (default: 8080)
```

## Environment Variables

| Variable | Default | Required |
|----------|---------|:---:|
| `PORT` | `8080` | NO |

---

## Allowed Dependencies

- `packages/constitutional-kernel` — the evaluation engine (imported as library)
- `lib/db` — database adapter (Drizzle + PostgreSQL)
- `lib/api-zod` — generated request/response schemas for validation

## Forbidden Dependencies

- `artifacts/nomos-dashboard` — dashboard is a consumer, not a dependency
- `artifacts/mockup-sandbox` — demo sandbox
- Any UI rendering library

---

## Who May Call This?

Only `artifacts/nomos-dashboard` calls this API at runtime.
The constitutional kernel is never executed directly from the dashboard.
