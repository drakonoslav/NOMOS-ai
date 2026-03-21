# Asset Inventory — `attached_assets/`

> Inventory of all files in `attached_assets/`.
> This folder is NOT part of the production runtime.
> It is a collection of development context accumulated during the build.

See also: [CANONICAL_BUILD_MAP.md](../../CANONICAL_BUILD_MAP.md)

---

## What Is This Folder?

`attached_assets/` is an artifact of the development process.
It contains files that were uploaded or generated during conversations with the AI assistant:
- Design documents (`.docx`)
- Build prompts (`.txt` files starting with `Pasted-`)
- Source images (`.jpeg`, `.png`)
- Zip archives (`.zip`)
- A few source files (`.ts`, `.json`) that were uploaded as context

**None of these files are imported by the running application.**
The Vite config defines an `@assets` alias pointing here, but that alias is unused in any source file.

---

## File Count by Type

| Type | Count | Runtime-used? | Notes |
|------|-------|:---:|-------|
| `.txt` (Pasted-* prompt files) | ~155 | NO | AI prompt context — archival |
| `.docx` | 6 | NO | Design documents — archival |
| `.zip` | 2 | NO | Source archives — archival |
| `.jpeg` / `.png` | 5 | NO | Reference images — archival |
| `.ts` (source files) | 1 | NO | `main_*.ts` — uploaded context, not compiled |
| `.json` (package.json) | 1 | NO | `package_*.json` — uploaded context |

**Total: ~190 files. Zero runtime-used.**

---

## File Classification

### Runtime-Used
None. No file in `attached_assets/` is imported at runtime.

### Documentation-Only
- `MissionMathematics_Formal_*.docx` — formal specification document
- `Pasted-*.txt` files — contain prompts, implementation guidance, and architectural notes used during the build
- `info_*.docx`, `Info2_*.docx`, `Additional_*.docx`, `Main.ts_*.docx` — design and spec documents

### Archival Only
- `epistemic-ai_*.zip` — source code archives, likely early-stage or reference versions
- `*.jpeg`, `*.png` — reference screenshots or design images

### Potentially Duplicated
- `main_*.ts` and `package_*.json` — these are likely early uploaded source files. The production code has since been built elsewhere.

---

## Recommended Future Storage

| File Class | Recommended Location |
|------------|---------------------|
| Prompt / instruction `.txt` files | `/archive/build-prompts/` or delete after project completion |
| Design `.docx` files | `/archive/design-docs/` or external document store |
| Zip archives | `/archive/source-archives/` |
| Reference images | `/docs/assets/` if referenced in docs, otherwise archive |
| Uploaded `.ts` / `.json` context files | Delete if superseded by production code |

---

## Why It Cannot Be Safely Moved Right Now

The Vite config at `artifacts/nomos-dashboard/vite.config.ts` defines:

```typescript
"@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
```

While this alias is **currently unused** in any source file, removing the folder without first removing the alias would produce a Vite config warning. The safe sequence to clean this up is:

1. Remove the `@assets` alias from `vite.config.ts`
2. Move `attached_assets/` to `/archive/` or delete it

Neither action is required for the app to run correctly today.

---

## Note on `@assets` Vite Alias

The `@assets` alias in `vite.config.ts` is a dead alias — it resolves to `attached_assets/` but nothing in the codebase imports via `@assets`. It was likely added as scaffolding and never used. It can be safely removed in a future cleanup pass.
