# `artifacts/mockup-sandbox` — Component Preview

## Role: `DEMO_ONLY`
## Canonical: NO
## Runtime-critical: NO
## Deployable: NO
## Status: NOT_STARTED by default

---

## WARNING — This Is NOT the Main Application

This folder is a **UI component prototyping sandbox**.
It is used during design iterations to preview isolated React components in an iframe.

It is **not** the NOMOS Dashboard.
It is **not** part of the production runtime.
It is **not** a backend service.

The main application is at `artifacts/nomos-dashboard`.
The main backend is at `artifacts/api-server`.

---

## What This Is

A local-only Vite server that renders individual UI components in isolation for design review.
Used via the canvas board during development.

Its workflow (`Component Preview (Demo Only)`) is `NOT_STARTED` by default and must be manually started if needed for design work.

---

## Allowed Dependencies

Nothing canonical. This sandbox imports only its own internal components and demo fixtures.

## Forbidden Dependencies

- `packages/constitutional-kernel` — kernel is server-only
- `lib/db` — database is server-only
- Any canonical production code that would make this sandbox a de facto dependency

---

## May Other Packages Import This?

NO. Nothing in the canonical runtime imports from this directory.
