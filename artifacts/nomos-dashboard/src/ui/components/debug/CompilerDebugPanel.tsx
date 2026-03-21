/**
 * CompilerDebugPanel.tsx
 *
 * Temporary debug panel that proves cross-mode compiler equivalence.
 * Displays per-pipeline-stage hashes for:
 *
 *   Auto-compile: extractedFields → structuredDraft → canonicalDeclaration → evaluationRequest
 *   Guided / NL:  rawInput → canonicalDeclaration → evaluationRequest
 *
 * A hash collision across modes means the stages produced identical output —
 * proving the mode-invariance law is satisfied.
 *
 * This panel is intentionally temporary (debug only) and should be removed
 * once operational cross-mode equivalence is confirmed.
 */

import React, { useState } from "react";
import { NomosQuery } from "../../../query/query_types";
import { StructuredDraft } from "../../../compiler/auto_compiler";
import { ExtractedFields } from "../../../compiler/field_extractor";

/* =========================================================
   Hash utility (djb2 — non-cryptographic, for display only)
   ========================================================= */

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function hashJson(value: unknown): string {
  return djb2(JSON.stringify(value) ?? "null");
}

function hashText(s: string): string {
  return djb2(s);
}

/* =========================================================
   Types
   ========================================================= */

export type CompilerMode = "auto" | "guided" | "natural";

export interface CompilerDebugEntry {
  label: string;
  hashHex: string;
  preview?: string;
}

export interface CompilerDebugPanelProps {
  mode: CompilerMode;

  rawInput?: string;
  extractedFields?: ExtractedFields | null;
  structuredDraft?: StructuredDraft | null;
  canonicalDeclaration?: string;
  evaluationRequest?: NomosQuery | null;
}

/* =========================================================
   Component
   ========================================================= */

export function CompilerDebugPanel({
  mode,
  rawInput,
  extractedFields,
  structuredDraft,
  canonicalDeclaration,
  evaluationRequest,
}: CompilerDebugPanelProps) {
  const [open, setOpen] = useState(false);

  const entries: CompilerDebugEntry[] = [];

  if (rawInput !== undefined) {
    entries.push({
      label: "raw_input",
      hashHex: hashText(rawInput),
      preview: rawInput.slice(0, 80).replace(/\n/g, "↵"),
    });
  }

  if (mode === "auto" && extractedFields !== null && extractedFields !== undefined) {
    entries.push({
      label: "extracted_fields",
      hashHex: hashJson(extractedFields),
      preview: `constraints:${extractedFields.constraints.length} candidates:${extractedFields.candidates.length}`,
    });
  }

  if (mode === "auto" && structuredDraft !== null && structuredDraft !== undefined) {
    entries.push({
      label: "structured_draft",
      hashHex: hashJson({
        constraints: structuredDraft.constraints,
        candidates: structuredDraft.candidates,
        objective: structuredDraft.objective,
      }),
      preview: `constraints:${structuredDraft.constraints.length} candidates:${structuredDraft.candidates.length}`,
    });
  }

  if (canonicalDeclaration !== undefined) {
    entries.push({
      label: "canonical_declaration",
      hashHex: hashText(canonicalDeclaration),
      preview: canonicalDeclaration.slice(0, 80).replace(/\n/g, "↵"),
    });
  }

  if (evaluationRequest !== null && evaluationRequest !== undefined) {
    const evalKey = {
      constraints: evaluationRequest.state.constraints,
      candidates: evaluationRequest.candidates,
      objective: evaluationRequest.objective,
    };
    entries.push({
      label: "evaluation_request",
      hashHex: hashJson(evalKey),
      preview: `constraints:${evaluationRequest.state.constraints.length} candidates:${evaluationRequest.candidates.length}`,
    });
  }

  const modeLabel = mode === "auto" ? "Auto-compile" : mode === "guided" ? "Guided" : "Natural Language";

  return (
    <div className="compiler-debug-panel">
      <button
        type="button"
        className="compiler-debug-panel__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="compiler-debug-panel__badge">DEBUG</span>
        <span>Compiler Pipeline Hashes — {modeLabel}</span>
        <span className="compiler-debug-panel__chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="compiler-debug-panel__body">
          <p className="compiler-debug-panel__note">
            Matching hashes at the same stage across modes prove mode-invariant compilation.
            Hashes are non-cryptographic (djb2, 32-bit) — for display only.
          </p>
          <table className="compiler-debug-panel__table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Hash</th>
                <th>Preview</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.label}>
                  <td className="compiler-debug-panel__stage">{e.label}</td>
                  <td className="compiler-debug-panel__hash">
                    <code>{e.hashHex}</code>
                  </td>
                  <td className="compiler-debug-panel__preview">{e.preview ?? "—"}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={3} className="compiler-debug-panel__empty">
                    No pipeline data yet. Run a compile or parse to see hashes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
