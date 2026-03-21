/**
 * CompilerDebugPanel.tsx
 *
 * Temporary debug panel that proves cross-mode compiler equivalence.
 * Displays per-pipeline-stage hashes and counts for all three input modes.
 *
 * Stages displayed:
 *   Auto-compile: raw_input → extracted_fields → structured_draft →
 *                 canonical_declaration → nomos_query → evaluation_request
 *   Guided / NL:  raw_input → canonical_declaration → nomos_query → evaluation_request
 *
 * A hash collision across modes at the same stage proves mode-invariant output.
 * Counts expose constraint / candidate / objective totals for quick sanity checking.
 *
 * Hashing: djb2 (32-bit, non-cryptographic, display-only).
 */

import React, { useState } from "react";
import { NomosQuery } from "../../../query/query_types";
import { StructuredDraft } from "../../../compiler/auto_compiler";
import { ExtractedFields } from "../../../compiler/field_extractor";

/* =========================================================
   Hash utility — djb2
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

export interface CompilerDebugPanelProps {
  mode: CompilerMode;

  rawInput?: string;
  extractedFields?: ExtractedFields | null;
  structuredDraft?: StructuredDraft | null;
  canonicalDeclaration?: string;
  evaluationRequest?: NomosQuery | null;
}

interface Row {
  stage: string;
  hash: string;
  counts: string;
  preview: string;
}

/* =========================================================
   Row builder
   ========================================================= */

function buildRows(props: CompilerDebugPanelProps): Row[] {
  const { mode, rawInput, extractedFields, structuredDraft, canonicalDeclaration, evaluationRequest } = props;
  const rows: Row[] = [];

  // raw_input
  if (rawInput !== undefined) {
    rows.push({
      stage: "raw_input",
      hash: hashText(rawInput),
      counts: `${rawInput.length} chars`,
      preview: rawInput.slice(0, 80).replace(/\n/g, "↵"),
    });
  }

  // extracted_fields (auto-compile only)
  if (mode === "auto" && extractedFields != null) {
    rows.push({
      stage: "extracted_fields",
      hash: hashJson(extractedFields),
      counts: `constraints:${extractedFields.constraints.length} candidates:${extractedFields.candidates.length}`,
      preview: `hasCandidates:${extractedFields.candidates.length > 0} hasConstraints:${extractedFields.constraints.length > 0}`,
    });
  }

  // structured_draft (auto-compile only)
  if (mode === "auto" && structuredDraft != null) {
    const evalKey = {
      constraints: structuredDraft.constraints,
      candidates:  structuredDraft.candidates,
      objective:   structuredDraft.objective,
    };
    rows.push({
      stage: "structured_draft",
      hash: hashJson(evalKey),
      counts: `constraints:${structuredDraft.constraints.length} candidates:${structuredDraft.candidates.length} objective:${structuredDraft.objective.length}`,
      preview: `evaluable:${structuredDraft.isEvaluable}`,
    });
  }

  // canonical_declaration — the exact text sent to kernel parser
  if (canonicalDeclaration !== undefined) {
    rows.push({
      stage: "canonical_declaration",
      hash: hashText(canonicalDeclaration),
      counts: `${canonicalDeclaration.length} chars`,
      preview: canonicalDeclaration.slice(0, 80).replace(/\n/g, "↵"),
    });
  }

  // nomos_query — kernel parser result
  if (evaluationRequest != null) {
    const qKey = {
      constraints: evaluationRequest.state.constraints,
      candidates:  evaluationRequest.candidates,
      objective:   evaluationRequest.objective,
      completeness: evaluationRequest.completeness,
    };
    const objCount = evaluationRequest.objective ? 1 : 0;
    rows.push({
      stage: "nomos_query",
      hash: hashJson(qKey),
      counts: `constraints:${evaluationRequest.state.constraints.length} candidates:${evaluationRequest.candidates.length} objectives:${objCount}`,
      preview: `completeness:${evaluationRequest.completeness} confidence:${evaluationRequest.parserConfidence}`,
    });

    // evaluation_request — the subset of NomosQuery that drives evaluation
    const evalReqKey = {
      constraints: evaluationRequest.state.constraints,
      candidates:  evaluationRequest.candidates,
    };
    rows.push({
      stage: "evaluation_request",
      hash: hashJson(evalReqKey),
      counts: `constraints:${evaluationRequest.state.constraints.length} candidates:${evaluationRequest.candidates.length}`,
      preview: evaluationRequest.state.constraints.slice(0, 1).map((c) => c.slice(0, 60)).join("") || "—",
    });
  }

  return rows;
}

/* =========================================================
   Component
   ========================================================= */

export function CompilerDebugPanel(props: CompilerDebugPanelProps) {
  const [open, setOpen] = useState(false);

  const rows = buildRows(props);
  const modeLabel =
    props.mode === "auto"    ? "Auto-compile"      :
    props.mode === "guided"  ? "Guided"            :
                               "Natural Language";

  return (
    <div className="compiler-debug-panel">
      <button
        type="button"
        className="compiler-debug-panel__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="compiler-debug-panel__badge">DEBUG</span>
        <span>Compiler Pipeline — {modeLabel}</span>
        <span className="compiler-debug-panel__chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="compiler-debug-panel__body">
          <p className="compiler-debug-panel__note">
            Matching hashes at <code>canonical_declaration</code>, <code>nomos_query</code>,
            and <code>evaluation_request</code> across all three modes proves mode-invariant
            compilation. Hashes: djb2 32-bit (display only, non-cryptographic).
          </p>

          <table className="compiler-debug-panel__table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Hash</th>
                <th>Counts</th>
                <th>Preview</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.stage} className={r.stage === "evaluation_request" ? "compiler-debug-panel__eval-row" : ""}>
                  <td className="compiler-debug-panel__stage">{r.stage}</td>
                  <td className="compiler-debug-panel__hash"><code>{r.hash}</code></td>
                  <td className="compiler-debug-panel__counts">{r.counts}</td>
                  <td className="compiler-debug-panel__preview">{r.preview}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="compiler-debug-panel__empty">
                    No pipeline data yet. Compile or parse to see stage hashes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {props.evaluationRequest && (
            <div className="compiler-debug-panel__counts-summary">
              <span>
                <strong>{props.evaluationRequest.state.constraints.length}</strong> constraints
              </span>
              <span>
                <strong>{props.evaluationRequest.candidates.length}</strong> candidates
              </span>
              <span>
                <strong>{props.evaluationRequest.objective ? 1 : 0}</strong> objectives
              </span>
              <span className="compiler-debug-panel__completeness">
                {props.evaluationRequest.completeness}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
