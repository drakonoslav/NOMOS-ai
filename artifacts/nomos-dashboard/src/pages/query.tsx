/**
 * query.tsx
 *
 * NOMOS Query Builder page.
 *
 * Strict 4-step interaction model:
 *   1. User provides input (guided form or natural language).
 *   2. User clicks Parse — extracts canonical NomosQuery.
 *   3. User reviews the parsed preview and confirms it.
 *   4. Evaluate becomes available only after confirmation.
 *
 * Constitutional rule:
 *   - Parser confidence is extraction quality, not lawfulness.
 *   - Evaluation is never triggered from raw input directly.
 *   - LAWFUL / DEGRADED / INVALID decisions remain in the evaluation pipeline.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import {
  NomosQuery,
  NomosQueryResponse,
  GuidedQueryDraft,
  draftToQuery,
} from "@/query/query_types";
import { parseQuery, evaluateQuery } from "@/query/query_api";
import { QueryPageHeader } from "@/components/query/QueryPageHeader";
import { QueryModeSwitcher, type QueryMode } from "@/components/query/QueryModeSwitcher";
import { GuidedQueryForm } from "@/components/query/GuidedQueryForm";
import { NaturalLanguageForm } from "@/components/query/NaturalLanguageForm";
import { ParsePreviewPanel } from "@/components/query/ParsePreviewPanel";
import { MissingInfoPanel } from "@/components/query/MissingInfoPanel";
import { EvaluationLaunchPanel } from "@/components/query/EvaluationLaunchPanel";
import { EvaluationResultPanel } from "@/components/query/EvaluationResultPanel";

const EMPTY_DRAFT: GuidedQueryDraft = {
  situation: "",
  facts: [""],
  constraints: [""],
  uncertainties: [],
  candidates: [
    { id: "A", description: "" },
    { id: "B", description: "" },
  ],
  objective: "",
};

export default function QueryBuilderPage() {
  const [mode, setMode] = useState<QueryMode>("guided");

  const [rawInput, setRawInput] = useState("");
  const [guidedDraft, setGuidedDraft] = useState<GuidedQueryDraft>(EMPTY_DRAFT);

  const [parsedQuery, setParsedQuery] = useState<NomosQuery | undefined>();
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [previewAccepted, setPreviewAccepted] = useState(false);

  const [isParsing, setIsParsing] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const [evaluationResult, setEvaluationResult] = useState<NomosQueryResponse | undefined>();

  const canParseNatural = rawInput.trim().length > 10;
  const canParseGuided =
    guidedDraft.situation.trim().length > 0 ||
    guidedDraft.facts.some((f) => f.trim()) ||
    guidedDraft.candidates.some((c) => c.description.trim());

  async function handleParse() {
    setIsParsing(true);
    setParseErrors([]);
    setPreviewAccepted(false);
    setEvaluationResult(undefined);

    try {
      let result: NomosQuery;
      if (mode === "natural") {
        result = await parseQuery(rawInput);
      } else {
        result = draftToQuery(guidedDraft);
      }
      setParsedQuery(result);
    } catch (err) {
      setParsedQuery(undefined);
      setParseErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setIsParsing(false);
    }
  }

  async function handleEvaluate() {
    if (!parsedQuery || !previewAccepted) return;
    setIsEvaluating(true);
    setEvaluationResult(undefined);
    try {
      const result = await evaluateQuery(parsedQuery);
      setEvaluationResult(result);
    } catch (err) {
      setParseErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setIsEvaluating(false);
    }
  }

  function handleReset() {
    if (mode === "natural") {
      setRawInput("");
    } else {
      setGuidedDraft(EMPTY_DRAFT);
    }
    setParsedQuery(undefined);
    setParseErrors([]);
    setPreviewAccepted(false);
    setEvaluationResult(undefined);
  }

  function handleModeChange(next: QueryMode) {
    setMode(next);
    setParsedQuery(undefined);
    setParseErrors([]);
    setPreviewAccepted(false);
    setEvaluationResult(undefined);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-0"
    >
      <QueryPageHeader completeness={parsedQuery?.completeness} />

      <QueryModeSwitcher mode={mode} onChange={handleModeChange} />

      {/* Workspace: two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-[56fr_44fr] gap-6 items-start">
        {/* Input column */}
        <div>
          {mode === "guided" ? (
            <GuidedQueryForm
              value={guidedDraft}
              onChange={setGuidedDraft}
              onParse={handleParse}
              onReset={handleReset}
              isParsing={isParsing}
              canParse={canParseGuided}
            />
          ) : (
            <NaturalLanguageForm
              value={rawInput}
              onChange={setRawInput}
              onParse={handleParse}
              onReset={handleReset}
              isParsing={isParsing}
              canParse={canParseNatural}
            />
          )}
        </div>

        {/* Output column */}
        <div className="space-y-4">
          <ParsePreviewPanel
            parsedQuery={parsedQuery}
            parseErrors={parseErrors}
            previewAccepted={previewAccepted}
            onAcceptPreview={setPreviewAccepted}
          />

          {parsedQuery && parsedQuery.completeness !== "COMPLETE" && (
            <MissingInfoPanel parsedQuery={parsedQuery} />
          )}

          <EvaluationLaunchPanel
            parsedQuery={parsedQuery}
            previewAccepted={previewAccepted}
            isEvaluating={isEvaluating}
            onEvaluate={handleEvaluate}
          />

          {evaluationResult && (
            <EvaluationResultPanel result={evaluationResult} />
          )}
        </div>
      </div>

      {/* Footer note */}
      <div className="border-t border-border pt-4 mt-8">
        <p className="text-[10px] font-mono text-muted-foreground/50 leading-relaxed">
          NOMOS evaluates declared, structured state — not inferred intent.
          Parser confidence reflects extraction quality, not constitutional status.
          LAWFUL / DEGRADED / INVALID classifications apply to candidate actions only,
          and are determined by constitutional evaluation, not by this parser.
        </p>
      </div>
    </motion.div>
  );
}
