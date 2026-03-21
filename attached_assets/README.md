# `attached_assets/` — Development Context Files

## Role: `ASSET_ONLY`
## Canonical: NO
## Runtime-critical: NO
## Deployable: NO
## Importable: NO

---

## What This Is

This folder contains files that were **uploaded during the development process**.
These are not source code. They are not part of the production application.

Contents (~190 files):
- `.txt` files — prompt and instruction text from the build (archival)
- `.docx` files — design documents and specification notes
- `.zip` files — early-stage source archives
- `.jpeg` / `.png` — reference images used during design
- `main_*.ts`, `package_*.json` — uploaded source context files (not compiled)

---

## Is Anything in the Runtime Using This?

No. The Vite config at `artifacts/nomos-dashboard/vite.config.ts` defines an `@assets` alias pointing here, but **that alias is unused in any source file**. The running application does not read from this folder.

---

## May Other Packages Import This?

No. This folder must not become a source-of-truth location for any code.
If you find runtime imports pointing here, that is a bug and must be corrected.

---

## What Should Happen to This Folder?

This folder can be safely archived. The recommended future action is:

1. Remove the `@assets` alias from `artifacts/nomos-dashboard/vite.config.ts`
2. Move this folder to `/archive/attached_assets_raw/` or delete it

Neither step is required today. The app runs correctly without any change here.

See `/docs/assets-reference/ASSET_INVENTORY.md` for a full file classification.
