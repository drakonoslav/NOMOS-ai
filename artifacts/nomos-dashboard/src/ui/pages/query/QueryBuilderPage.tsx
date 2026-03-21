import React, { useMemo, useState } from "react";

import { HybridNomosQueryParser } from "../../../query/query_parser";
import { NomosQuery } from "../../../query/query_types";
import { NomosQueryResponse } from "../../../query/query_response_types";
import { useScenario } from "@/context/scenario-context";

import { QueryPageHeader } from "../../components/query/QueryPageHeader";
import { QueryModeSwitcher } from "../../components/query/QueryModeSwitcher";
import { GuidedQueryForm } from "../../components/query/GuidedQueryForm";
import { NaturalLanguageForm } from "../../components/query/NaturalLanguageForm";
import { ParsePreviewPanel } from "../../components/query/ParsePreviewPanel";
import { MissingInfoPanel } from "../../components/query/MissingInfoPanel";
import { EvaluationLaunchPanel } from "../../components/query/EvaluationLaunchPanel";
import { EvaluationResultPanel } from "../../components/query/EvaluationResultPanel";

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

  evaluationResult?: NomosQueryResponse;
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
 * First-pass evaluator.
 * Maps completeness directly to constitutional status.
 * Upgrade path: replace this with a call to POST /api/nomos/query/evaluate.
 */
async function evaluateNomosQuery(query: NomosQuery): Promise<NomosQueryResponse> {
  const candidateEvaluations = query.candidates.map((candidate) => ({
    id: candidate.id,
    classification:
      query.completeness === "COMPLETE"
        ? ("LAWFUL" as const)
        : query.completeness === "PARTIAL"
        ? ("DEGRADED" as const)
        : ("INVALID" as const),
    reasons:
      query.completeness === "COMPLETE"
        ? ["Submission is sufficiently structured for candidate evaluation."]
        : query.completeness === "PARTIAL"
        ? ["Submission is usable but materially incomplete."]
        : ["Submission lacks sufficient declared structure for lawful evaluation."],
  }));

  const lawfulSet =
    query.completeness === "COMPLETE"
      ? query.candidates.map((c) => c.id)
      : query.completeness === "PARTIAL"
      ? query.candidates.slice(0, 1).map((c) => c.id)
      : [];

  return {
    submissionQuality: query.completeness,
    overallStatus:
      query.completeness === "COMPLETE"
        ? "LAWFUL"
        : query.completeness === "PARTIAL"
        ? "DEGRADED"
        : "INVALID",
    candidateEvaluations,
    lawfulSet,
    notes: query.notes,
    adjustments:
      query.completeness === "PARTIAL"
        ? query.candidates.map((c) => ({
            candidateId: c.id,
            actions: [
              "Declare at least one explicit hard constraint.",
              "Clarify missing uncertainties or objective tradeoffs.",
            ],
          }))
        : undefined,
  };
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
        evaluateNomosQuery(state.parsedQuery),
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
