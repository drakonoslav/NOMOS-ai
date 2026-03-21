# NOMOS Runtime — Mermaid Diagrams

> Mermaid source for all runtime diagrams.
> Paste into any Mermaid renderer or GitHub markdown preview.

---

## Primary Runtime Architecture

```mermaid
graph TD
    User["👤 User (browser)"]

    subgraph RUNTIME["Production Runtime"]
        Dashboard["artifacts/nomos-dashboard<br/>React + Vite<br/>port 24280 → /"]
        API["artifacts/api-server<br/>Express<br/>port 8080 → /api"]
        Kernel["packages/constitutional-kernel<br/>Shared Library<br/>(bundled into API)"]
    end

    subgraph NONRUNTIME["Not Runtime"]
        MockupSandbox["artifacts/mockup-sandbox<br/>DEMO_ONLY<br/>NOT_STARTED"]
        AttachedAssets["attached_assets/<br/>ASSET_ONLY<br/>Archival"]
        Docs["docs/ + examples/<br/>DOCS_ONLY"]
    end

    subgraph GENERATED["Generated / Adapters"]
        APISpec["lib/api-spec<br/>OpenAPI SOURCE_OF_TRUTH"]
        APIClient["lib/api-client-react<br/>GENERATED hooks"]
        APIZod["lib/api-zod<br/>GENERATED schemas"]
        DB["lib/db<br/>Drizzle ADAPTER"]
    end

    User -->|"loads UI"| Dashboard
    Dashboard -->|"POST /api/nomos/query/parse"| API
    Dashboard -->|"POST /api/nomos/query/evaluate"| API
    Dashboard -->|"GET /api/nomos/state"| API
    Dashboard -->|"GET /api/healthz"| API
    API -->|"imports"| Kernel
    API -->|"imports"| DB
    Dashboard -.->|"imports (bundled)"| APIClient
    API -.->|"imports (bundled)"| APIZod
    APISpec -.->|"codegen"| APIClient
    APISpec -.->|"codegen"| APIZod
```

---

## Query Evaluate Flow

```mermaid
sequenceDiagram
    participant U as User
    participant D as nomos-dashboard
    participant A as api-server
    participant K as constitutional-kernel

    U->>D: types raw input
    D->>A: POST /api/nomos/query/parse
    A->>K: autoCompile(rawInput)
    K-->>A: StructuredDraft + GapDetectionResult
    A-->>D: { draft, gapResult }
    D->>U: render CompiledDraftPanel

    U->>D: confirms draft + clicks Evaluate
    D->>A: POST /api/nomos/query/evaluate
    A->>K: evaluate(canonicalDeclaration, policy)
    K->>K: Law I: Feasibility
    K->>K: Law II: Observability
    K->>K: Law III: Constraint satisfaction
    K->>K: Law IV: Robustness / margin
    K-->>A: AuditEvaluationResult { verdict, failureMode }
    A-->>D: EvaluationResult
    D->>D: saveAuditRecord (localStorage)
    D->>U: render verdict + trace
```

---

## Dependency Direction

```mermaid
graph LR
    APISpec["lib/api-spec<br/>(SOURCE_OF_TRUTH)"]
    APIClient["lib/api-client-react<br/>(GENERATED)"]
    APIZod["lib/api-zod<br/>(GENERATED)"]
    Dashboard["nomos-dashboard<br/>(RUNTIME_APP)"]
    API["api-server<br/>(RUNTIME_APP)"]
    Kernel["constitutional-kernel<br/>(SHARED_LIBRARY)"]
    DB["lib/db<br/>(ADAPTER)"]

    APISpec -->|codegen| APIClient
    APISpec -->|codegen| APIZod
    APIClient -->|import| Dashboard
    APIZod -->|import| API
    Dashboard -.->|HTTP /api/*| API
    API -->|import| Kernel
    API -->|import| DB
    API -->|import| APIZod
```

---

## Package Roles

```mermaid
graph TD
    subgraph CANONICAL["Canonical Runtime"]
        A["nomos-dashboard<br/>RUNTIME_APP + UI_LAYER"]
        B["api-server<br/>RUNTIME_APP"]
        C["constitutional-kernel<br/>SHARED_LIBRARY"]
        D["lib/db<br/>ADAPTER"]
        E["lib/api-spec<br/>SOURCE_OF_TRUTH"]
    end

    subgraph NONCANONICAL["Non-Canonical"]
        F["mockup-sandbox<br/>DEMO_ONLY"]
        G["attached_assets/<br/>ASSET_ONLY"]
        H["lib/api-client-react<br/>GENERATED"]
        I["lib/api-zod<br/>GENERATED"]
        J["docs/ + examples/<br/>DOCS_ONLY"]
        K["scripts/<br/>SCRIPTING"]
    end
```
