# `artifacts/nomos-dashboard` — NOMOS Dashboard

## Role: `RUNTIME_APP` + `UI_LAYER`
## Canonical: YES
## Runtime-critical: YES
## Deployable: YES

---

## What This Is

This is the **primary user-facing application** for NOMOS-ai.

It is a React + Vite single-page application that renders:
- The Ecosystem Cockpit — health index, governance state, trend blocks
- Query Builder — user input → compiled draft → evaluation result
- Governance views — bench, recommendation, decision support, audit trail
- Governance deliberation summary, playbook, decision-outcome linkage
- Session Worklog and Session Replay — full operational trace
- Role views (governor, auditor, analyst, observer)

It communicates with the backend exclusively over HTTP at `/api/*`.
It **never** imports or directly executes the constitutional kernel.

---

## Runtime Entrypoint

```
src/main.tsx          → Vite entry
src/AppShell.tsx      → Root layout + routing
```

## Dev Server

```bash
pnpm --filter @workspace/nomos-dashboard run dev
# Starts Vite on PORT (default: 24280)
```

## Environment Variables

| Variable | Default | Required |
|----------|---------|:---:|
| `PORT` | `24280` | NO |
| `BASE_PATH` | `/` | NO |

---

## Allowed Dependencies

- `lib/api-client-react` — generated React Query API hooks
- `lib/api-zod` — generated Zod response schemas
- HTTP calls to `artifacts/api-server` (never imported directly)

## Forbidden Dependencies

- `packages/constitutional-kernel` — kernel runs server-side only
- `lib/db` — database is a backend concern
- `artifacts/mockup-sandbox` — demo sandbox, not a shared library

---

## Is This the Main App?

YES. This is the canonical production frontend. If you see other UI-related directories (e.g., `artifacts/mockup-sandbox`), those are NOT this application. The mockup sandbox is a demo-only component preview tool.
