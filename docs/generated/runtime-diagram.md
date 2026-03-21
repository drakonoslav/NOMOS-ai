# NOMOS Runtime Diagram

> Auto-generated documentation of the live runtime execution path.
> See also: [runtime-mermaid.md](runtime-mermaid.md) for Mermaid source.

---

## Plain-English Runtime Description

NOMOS has two running services in production:

**Frontend** (`artifacts/nomos-dashboard`)
- A React + Vite single-page application
- Served as static files at path `/`
- The user opens this in their browser
- Makes HTTP calls to the backend at `/api/*`
- Renders the cockpit, governance views, query interface, audit history, worklog, and session replay

**Backend** (`artifacts/api-server`)
- An Express server listening at `/api`
- Receives structured requests from the dashboard
- Executes the constitutional kernel for evaluation and parsing
- Returns JSON responses

**Shared Library** (`packages/constitutional-kernel`)
- Imported by the api-server as a Node.js library
- Contains the four constitutional laws, constraint algebra, feasibility engine, decision engine, and scoring functions
- Not a running service — it is code, not a process

---

## Primary Request Flows

### 1. Query Parse

```
User (browser)
    │ types raw input in QueryBuilderPage
    ▼
nomos-dashboard (React)
    │ POST /api/nomos/query/parse { rawInput }
    ▼
api-server (Express /api/nomos/query/parse)
    │ calls autoCompile(rawInput)
    ▼
constitutional-kernel (compiler pipeline)
    │ intent detection → field extraction → gap detection → StructuredDraft
    ▼
api-server
    │ returns { draft, gapResult, intent }
    ▼
nomos-dashboard
    │ renders CompiledDraftPanel with missing field editors
    ▼
User sees compiled draft + missing fields
```

### 2. Query Evaluate

```
User (browser)
    │ confirms draft, clicks Evaluate
    ▼
nomos-dashboard (React)
    │ POST /api/nomos/query/evaluate { canonicalDeclaration, intent }
    ▼
api-server (Express /api/nomos/query/evaluate)
    │ calls evaluation pipeline
    ▼
constitutional-kernel
    │ Law I  — Feasibility check
    │ Law II — Observability check
    │ Law III — Constraint satisfaction
    │ Law IV — Robustness / margin check
    │ → verdict: LAWFUL | DEGRADED | INVALID
    │ → AuditEvaluationResult { verdict, failureMode, ... }
    ▼
api-server
    │ returns EvaluationResult
    ▼
nomos-dashboard
    │ saves to AuditStore (localStorage)
    │ renders verdict + constraint trace
    ▼
User sees evaluation result
```

### 3. Nomos State

```
User / dashboard initialization
    │
    ▼
nomos-dashboard
    │ GET /api/nomos/state
    ▼
api-server (Express /api/nomos/state)
    │ reads current policy snapshot, audit store summary, health index
    ▼
api-server
    │ returns NomosStateResponse
    ▼
nomos-dashboard
    │ populates EcosystemCockpitPage initial state
    ▼
User sees current ecosystem health + governance state
```

### 4. Health Check

```
Deployment health probe (or developer curl)
    │
    ▼
api-server (Express /api/healthz)
    │ returns { status: "ok" }
    ▼
200 OK
```

### 5. Audit / Worklog / Replay (client-side)

```
User takes governance actions in cockpit
    │
    ▼
nomos-dashboard (session_worklog.ts)
    │ records WorklogEvent (pure in-memory + localStorage)
    │ buildSessionNarrative(worklog) → SessionNarrative
    ▼
nomos-dashboard (SessionWorklogPanel / SessionReplayPanel)
    │ displays human operational trace
    │ no API call — client-side only
    ▼
User sees worklog and replay
```

---

## How to Inspect the Live Runtime Path

1. **Open the dashboard** — Navigate to the root URL. This is `artifacts/nomos-dashboard`.

2. **Open browser network tab** — Every call to `/api/*` is routed by Replit's proxy to `artifacts/api-server` (port 8080). You can see this routing in action.

3. **Check API health**:
   ```bash
   curl https://<your-replit-domain>/api/healthz
   # Expected: {"status":"ok"}
   ```

4. **Check NOMOS state**:
   ```bash
   curl https://<your-replit-domain>/api/nomos/state
   ```

5. **Read workflow logs** — The dashboard runs as a Vite dev server. The API server runs Node.js. Both logs are available in the Replit workspace.

6. **Trace a request** — In `artifacts/api-server/src/routes/query.ts`, add a `console.log` to follow the exact execution path from HTTP request to kernel evaluation to response.

---

## What Is NOT in the Runtime Path

| Item | Status |
|------|--------|
| `artifacts/mockup-sandbox` | NOT running (demo only, workflow NOT_STARTED) |
| `attached_assets/` | NOT in runtime (archival files only) |
| `docs/` | NOT in runtime (documentation only) |
| `lib/api-client-react/dist/` | Bundled into dashboard at build time |
| `lib/api-zod/dist/` | Bundled into api-server at build time |
| `packages/constitutional-kernel` | Bundled into api-server (not a separate process) |
