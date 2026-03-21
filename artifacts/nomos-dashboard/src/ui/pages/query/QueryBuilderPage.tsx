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

import "./query-builder.css";

/* =========================================================
   Types
   ========================================================= */

export type QueryMode = "guided" | "natural";

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
    sections.push(`CONSTRAINTS:\n${constraints.map((x) => `- ${x}`).join("\n")}`);
  }
  if (uncertainties.length > 0) {
    sections.push(`UNCERTAINTIES:\n${uncertainties.map((x) => `- ${x}`).join("\n")}`);
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

  return (
    <div className="query-builder-page">
      <QueryPageHeader
        title="NOMOS Query"
        subtitle="Submit state, constraints, candidates, and objective for evaluation."
        completeness={state.parsedQuery?.completeness}
      />

      <QueryModeSwitcher
        mode={state.mode}
        onChange={(mode) =>
          setState((prev) => ({
            ...prev,
            mode,
            parsedQuery: undefined,
            parseErrors: [],
            parseWarnings: [],
            previewAccepted: false,
            evaluationResult: undefined,
          }))
        }
      />

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

      <div className="query-footer-note">
        NOMOS evaluates declared and confirmed structure, not implied intent.
      </div>
    </div>
  );
}
