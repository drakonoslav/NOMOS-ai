import React, { useMemo, useState } from "react";

import { HybridNomosQueryParser } from "../../../query/query_parser";
import { NomosQuery } from "../../../query/query_types";
import { EvaluationResult } from "../../evaluation/eval_types";
import { useScenario } from "@/context/scenario-context";

import { QueryPageHeader } from "../../components/query/QueryPageHeader";
import { QueryModeSwitcher } from "../../components/query/QueryModeSwitcher";
import { GuidedQueryForm } from "../../components/query/GuidedQueryForm";
import { NaturalLanguageForm } from "../../components/query/NaturalLanguageForm";
import { ParsePreviewPanel } from "../../components/query/ParsePreviewPanel";
import { MissingInfoPanel } from "../../components/query/MissingInfoPanel";
import { EvaluationLaunchPanel } from "../../components/query/EvaluationLaunchPanel";
import { EvaluationResultPanel } from "../../components/evaluation/EvaluationResultPanel";
import { CompiledDraftPanel } from "../../components/compiler/CompiledDraftPanel";

import { autoCompile, StructuredDraft } from "../../../compiler/auto_compiler";
import { IntentType } from "../../../compiler/domain_templates";
import { detectIntent } from "../../../compiler/intent_detector";

import "./query-builder.css";

/* =========================================================
   Types
   ========================================================= */

export type QueryMode = "guided" | "natural" | "auto";

export interface GuidedCandidateDraft {
  id: string;
  description: string;
  notes?: string;
}

export interface GuidedQueryDraft {
  situation: string;
  facts: string[];
  constraints: string[];
  uncertainties: string[];
  candidates: GuidedCandidateDraft[];
  objective: string;
}

export interface QueryBuilderPageState {
  mode: QueryMode;
  rawInput: string;
  guidedDraft: GuidedQueryDraft;

  parsedQuery?: NomosQuery;
  parseErrors: string[];
  parseWarnings: string[];

  isParsing: boolean;
  isEvaluating: boolean;

  previewAccepted: boolean;

  evaluationResult?: EvaluationResult;
}

/* =========================================================
   Auto-compile state
   ========================================================= */

interface AutoCompileState {
  rawInput: string;
  intent: IntentType;
  hasCompiled: boolean;
  isConfirmed: boolean;
  draft: StructuredDraft | null;
  isEvaluating: boolean;
  evaluationResult?: EvaluationResult;
  evaluationError?: string;
}

function buildEmptyAutoState(): AutoCompileState {
  return {
    rawInput: "",
    intent: "NUTRITION_AUDIT",
    hasCompiled: false,
    isConfirmed: false,
    draft: null,
    isEvaluating: false,
    evaluationResult: undefined,
    evaluationError: undefined,
  };
}

/* =========================================================
   Local helpers
   ========================================================= */

function buildEmptyGuidedDraft(): GuidedQueryDraft {
  return {
    situation: "",
    facts: [""],
    constraints: [""],
    uncertainties: [""],
    candidates: [
      { id: "A", description: "" },
      { id: "B", description: "" },
    ],
    objective: "",
  };
}

function cleanList(values: string[]): string[] {
  return values.map((v) => v.trim()).filter(Boolean);
}

function buildRawInputFromGuidedDraft(draft: GuidedQueryDraft): string {
  const facts = cleanList(draft.facts);
  const constraints = cleanList(draft.constraints);
  const uncertainties = cleanList(draft.uncertainties);
  const candidates = draft.candidates
    .map((c) => ({ id: c.id.trim(), description: c.description.trim() }))
    .filter((c) => c.id && c.description);

  const sections: string[] = [];

  if (draft.situation.trim()) {
    sections.push(`STATE:\n${draft.situation.trim()}`);
  }
  if (facts.length > 0) {
    sections.push(`FACTS:\n${facts.map((x) => `- ${x}`).join("\n")}`);
  }
  if (constraints.length > 0) {
    sections.push(
      `CONSTRAINTS:\n${constraints.map((x) => `- ${x}`).join("\n")}`
    );
  }
  if (uncertainties.length > 0) {
    sections.push(
      `UNCERTAINTIES:\n${uncertainties.map((x) => `- ${x}`).join("\n")}`
    );
  }
  if (candidates.length > 0) {
    sections.push(
      `CANDIDATES:\n${candidates.map((c) => `${c.id}: ${c.description}`).join("\n")}`
    );
  }
  if (draft.objective.trim()) {
    sections.push(`OBJECTIVE:\n${draft.objective.trim()}`);
  }

  return sections.join("\n\n");
}

function canParse(state: QueryBuilderPageState): boolean {
  if (state.mode === "natural") {
    return state.rawInput.trim().length > 0;
  }

  const draft = state.guidedDraft;
  return (
    draft.situation.trim().length > 0 ||
    cleanList(draft.facts).length > 0 ||
    cleanList(draft.constraints).length > 0 ||
    cleanList(draft.uncertainties).length > 0 ||
    draft.candidates.some((c) => c.description.trim().length > 0) ||
    draft.objective.trim().length > 0
  );
}

function canEvaluate(state: QueryBuilderPageState): boolean {
  return Boolean(
    state.parsedQuery &&
      state.previewAccepted &&
      state.parsedQuery.completeness !== "INSUFFICIENT" &&
      !state.isEvaluating
  );
}

function compiledDraftToNomosQuery(
  draft: StructuredDraft,
  rawInput: string
): NomosQuery {
  return {
    rawInput,
    state: {
      description: draft.state.join(" "),
      facts: [],
      constraints: draft.constraints,
      uncertainties: draft.uncertainties,
    },
    candidates: draft.candidates.map((c) => ({
      id: c.id,
      description: c.text,
    })),
    objective:
      draft.objective.length > 0
        ? { description: draft.objective.join(" ") }
        : undefined,
    parserConfidence: "HIGH",
    completeness: "COMPLETE",
    notes: [...draft.warnings, ...draft.notes],
  };
}

/**
 * Call the NOMOS evaluation API.
 * Returns EvaluationResult from the full deterministic + LLM pipeline.
 */
async function callEvaluateApi(query: NomosQuery): Promise<EvaluationResult> {
  const baseUrl = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/nomos/query/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Evaluation API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<EvaluationResult>;
}

/* =========================================================
   Page
   ========================================================= */

export function QueryBuilderPage() {
  const parser = useMemo(() => new HybridNomosQueryParser(), []);
  const { evaluateLiveQuery } = useScenario();

  const [state, setState] = useState<QueryBuilderPageState>({
    mode: "guided",
    rawInput: "",
    guidedDraft: buildEmptyGuidedDraft(),
    parsedQuery: undefined,
    parseErrors: [],
    parseWarnings: [],
    isParsing: false,
    isEvaluating: false,
    previewAccepted: false,
    evaluationResult: undefined,
  });

  const [autoState, setAutoState] = useState<AutoCompileState>(
    buildEmptyAutoState()
  );

  /* --- Guided / Natural handlers --- */

  async function handleParse() {
    if (!canParse(state)) return;

    setState((prev) => ({
      ...prev,
      isParsing: true,
      parseErrors: [],
      parseWarnings: [],
      previewAccepted: false,
      evaluationResult: undefined,
    }));

    try {
      const input =
        state.mode === "natural"
          ? state.rawInput
          : buildRawInputFromGuidedDraft(state.guidedDraft);

      const parsedQuery = await parser.parse({
        rawInput: input,
        operatorHints: [
          "extract constraints conservatively",
          "do not infer legality",
          "prefer explicit candidates over speculative ones",
        ],
        allowFallback: true,
      });

      setState((prev) => ({
        ...prev,
        parsedQuery,
        parseWarnings: parsedQuery.notes,
        isParsing: false,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        parsedQuery: undefined,
        parseErrors: [err instanceof Error ? err.message : String(err)],
        isParsing: false,
      }));
    }
  }

  async function handleEvaluate() {
    if (!state.parsedQuery || !state.previewAccepted) return;
    if (state.parsedQuery.completeness === "INSUFFICIENT") return;

    setState((prev) => ({
      ...prev,
      isEvaluating: true,
      evaluationResult: undefined,
    }));

    try {
      const [evaluationResult] = await Promise.all([
        callEvaluateApi(state.parsedQuery),
        evaluateLiveQuery(state.parsedQuery),
      ]);
      setState((prev) => ({ ...prev, isEvaluating: false, evaluationResult }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isEvaluating: false,
        parseErrors: [
          ...prev.parseErrors,
          err instanceof Error ? err.message : String(err),
        ],
      }));
    }
  }

  function handleReset() {
    setState((prev) => ({
      ...prev,
      rawInput: "",
      guidedDraft: buildEmptyGuidedDraft(),
      parsedQuery: undefined,
      parseErrors: [],
      parseWarnings: [],
      previewAccepted: false,
      evaluationResult: undefined,
      isParsing: false,
      isEvaluating: false,
    }));
  }

  /* --- Auto-compile handlers --- */

  function handleAutoInputChange(value: string) {
    setAutoState((prev) => ({
      ...prev,
      rawInput: value,
      hasCompiled: false,
      isConfirmed: false,
      draft: null,
      evaluationResult: undefined,
      evaluationError: undefined,
    }));
  }

  function handleAutoIntentChange(value: IntentType) {
    setAutoState((prev) => ({
      ...prev,
      intent: value,
      hasCompiled: false,
      isConfirmed: false,
      draft: null,
      evaluationResult: undefined,
      evaluationError: undefined,
    }));
  }

  function handleAutoDetectIntent() {
    const detected = detectIntent(autoState.rawInput);
    const resolved =
      detected === "UNKNOWN" ? "GENERIC_CONSTRAINT_TASK" : detected;
    setAutoState((prev) => ({
      ...prev,
      intent: resolved,
      hasCompiled: false,
      isConfirmed: false,
      draft: null,
    }));
  }

  function handleCompile() {
    if (!autoState.rawInput.trim()) return;
    const result = autoCompile(autoState.rawInput, autoState.intent);
    setAutoState((prev) => ({
      ...prev,
      hasCompiled: true,
      isConfirmed: false,
      draft: result.draft,
      evaluationResult: undefined,
      evaluationError: undefined,
    }));
  }

  function handleAutoConfirm() {
    if (!autoState.draft?.isEvaluable) return;
    setAutoState((prev) => ({ ...prev, isConfirmed: true }));
  }

  function handleAutoRevise() {
    setAutoState((prev) => ({
      ...prev,
      isConfirmed: false,
      evaluationResult: undefined,
      evaluationError: undefined,
    }));
  }

  async function handleAutoEvaluate() {
    if (!autoState.draft || !autoState.draft.isEvaluable || !autoState.isConfirmed)
      return;

    const query = compiledDraftToNomosQuery(
      autoState.draft,
      autoState.rawInput
    );

    setAutoState((prev) => ({
      ...prev,
      isEvaluating: true,
      evaluationResult: undefined,
      evaluationError: undefined,
    }));

    try {
      const [evaluationResult] = await Promise.all([
        callEvaluateApi(query),
        evaluateLiveQuery(query),
      ]);
      setAutoState((prev) => ({
        ...prev,
        isEvaluating: false,
        evaluationResult,
      }));
    } catch (err) {
      setAutoState((prev) => ({
        ...prev,
        isEvaluating: false,
        evaluationError: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  function handleAutoReset() {
    setAutoState(buildEmptyAutoState());
  }

  /* =========================================================
     Render
     ========================================================= */

  const isAutoMode = state.mode === "auto";

  return (
    <div className="query-builder-page">
      <QueryPageHeader
        title="NOMOS Query"
        subtitle="Submit state, constraints, candidates, and objective for evaluation."
        completeness={isAutoMode ? undefined : state.parsedQuery?.completeness}
      />

      <QueryModeSwitcher
        mode={state.mode}
        onChange={(mode) => {
          setState((prev) => ({
            ...prev,
            mode,
            parsedQuery: undefined,
            parseErrors: [],
            parseWarnings: [],
            previewAccepted: false,
            evaluationResult: undefined,
          }));
        }}
      />

      {/* ---- Auto-compile mode ---- */}
      {isAutoMode && (
        <div className="nm-query-page">
          <div className="nm-query-controls">
            <label className="nm-query-controls__field">
              <span>Intent</span>
              <select
                value={autoState.intent}
                onChange={(e) =>
                  handleAutoIntentChange(e.target.value as IntentType)
                }
              >
                <option value="NUTRITION_AUDIT">Nutrition Audit</option>
                <option value="TRAINING_AUDIT">Training Audit</option>
                <option value="SCHEDULE_AUDIT">Schedule Audit</option>
                <option value="GENERIC_CONSTRAINT_TASK">
                  Generic Constraint Task
                </option>
              </select>
            </label>

            <button
              type="button"
              className="nm-btn nm-btn--secondary"
              onClick={handleAutoDetectIntent}
              disabled={!autoState.rawInput.trim()}
              style={{ alignSelf: "flex-end" }}
            >
              Auto-Detect Intent
            </button>
          </div>

          <div className="nm-query-input-panel">
            <div className="nm-query-input-panel__title">RAW INPUT</div>
            <textarea
              className="nm-query-textarea"
              value={autoState.rawInput}
              onChange={(e) => handleAutoInputChange(e.target.value)}
              placeholder="Paste or write your raw request here. NOMOS will compile it into a structured declaration before evaluation."
            />
            <div className="nm-query-input-panel__actions">
              <button
                type="button"
                className="nm-btn nm-btn--primary"
                onClick={handleCompile}
                disabled={!autoState.rawInput.trim()}
              >
                Compile
              </button>
              <button
                type="button"
                className="nm-btn nm-btn--secondary"
                onClick={handleAutoReset}
              >
                Reset
              </button>
            </div>
          </div>

          <CompiledDraftPanel
            draft={autoState.draft}
            isConfirmed={autoState.isConfirmed}
            onConfirm={handleAutoConfirm}
            onRevise={handleAutoRevise}
          />

          {autoState.draft && (
            <div className="nm-query-evaluate">
              <button
                type="button"
                className="nm-btn nm-btn--primary"
                disabled={
                  !autoState.draft.isEvaluable ||
                  !autoState.isConfirmed ||
                  autoState.isEvaluating
                }
                onClick={handleAutoEvaluate}
              >
                {autoState.isEvaluating ? "Evaluating…" : "Evaluate"}
              </button>

              {!autoState.draft.isEvaluable && autoState.hasCompiled && (
                <div className="nm-query-evaluate__note">
                  Evaluation blocked until required fields are present.
                </div>
              )}

              {autoState.draft.isEvaluable && !autoState.isConfirmed && (
                <div className="nm-query-evaluate__note">
                  Confirm the compiled draft before evaluation.
                </div>
              )}
            </div>
          )}

          {autoState.evaluationError && (
            <div className="message-block message-block--error">
              <div className="message-block__title">Evaluation Error</div>
              <p>{autoState.evaluationError}</p>
            </div>
          )}

          {autoState.evaluationResult && (
            <EvaluationResultPanel result={autoState.evaluationResult} />
          )}
        </div>
      )}

      {/* ---- Guided / Natural mode ---- */}
      {!isAutoMode && (
        <div className="query-workspace">
          <div className="query-input-column">
            {state.mode === "guided" ? (
              <GuidedQueryForm
                value={state.guidedDraft}
                onChange={(guidedDraft) =>
                  setState((prev) => ({ ...prev, guidedDraft }))
                }
                onParse={handleParse}
                onEvaluate={handleEvaluate}
                onReset={handleReset}
                canParse={canParse(state)}
                canEvaluate={canEvaluate(state)}
                isParsing={state.isParsing}
                isEvaluating={state.isEvaluating}
              />
            ) : (
              <NaturalLanguageForm
                value={state.rawInput}
                onChange={(rawInput) =>
                  setState((prev) => ({ ...prev, rawInput }))
                }
                onParse={handleParse}
                onReset={handleReset}
                canParse={canParse(state)}
                isParsing={state.isParsing}
              />
            )}
          </div>

          <div className="query-output-column">
            <ParsePreviewPanel
              parsedQuery={state.parsedQuery}
              parseErrors={state.parseErrors}
              parseWarnings={state.parseWarnings}
              previewAccepted={state.previewAccepted}
              onAcceptPreview={(previewAccepted) =>
                setState((prev) => ({ ...prev, previewAccepted }))
              }
            />

            <MissingInfoPanel parsedQuery={state.parsedQuery} />

            <EvaluationLaunchPanel
              parsedQuery={state.parsedQuery}
              previewAccepted={state.previewAccepted}
              isEvaluating={state.isEvaluating}
              canEvaluate={canEvaluate(state)}
              onEvaluate={handleEvaluate}
            />

            <EvaluationResultPanel result={state.evaluationResult} />
          </div>
        </div>
      )}

      <div className="query-footer-note">
        NOMOS evaluates declared and confirmed structure, not implied intent.
      </div>
    </div>
  );
}
