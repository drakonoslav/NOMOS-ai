import React, { useEffect, useMemo, useState } from "react";

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
import { FieldPatchPanel } from "../../components/compiler/FieldPatchPanel";
import { CompilerDebugPanel } from "../../components/debug/CompilerDebugPanel";

import { autoCompile, StructuredDraft } from "../../../compiler/auto_compiler";
import { IntentType } from "../../../compiler/domain_templates";
import { compileConstraints, CompiledConstraint } from "../../../compiler/constraint_compiler";
import { detectIntent } from "../../../compiler/intent_detector";
import { patchDraftField, revalidateDraft } from "../../../compiler/draft_patcher";
import { buildSerializedDraftRecord, serializeDraft } from "../../../compiler/draft_serializer";
import { buildAuditId, buildVersionId } from "../../../audit/audit_versioning";
import { saveAuditRecord, listAuditRecords, deleteAuditRecord, clearAuditRecords } from "../../../audit/audit_store";
import { AuditRecord } from "../../../audit/audit_types";
import { readGovernanceState } from "../../../audit/policy_governance_store";
import { buildEvaluationRoutingDecision, buildPersistedRoutingRecord } from "../../../audit/policy_router";
import type { EvaluationRoutingDecision } from "../../../audit/policy_routing_types";
import { AuditHistoryPanel } from "../../components/audit/AuditHistoryPanel";

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
  patchedDraft: StructuredDraft | null;
  activeField: string | null;
  activeAuditId: string | null;
  activeVersionId: string | null;
  isEvaluating: boolean;
  evaluationResult?: EvaluationResult;
  evaluationError?: string;
  /**
   * The canonical NomosQuery produced by the kernel parser at evaluation time.
   * All three modes converge to a NomosQuery built by the same kernel parser —
   * this field stores the auto-compile mode's parsed result for debug/audit use.
   */
  parsedQuery?: NomosQuery;
  /** Compiled constraint set from the effective draft — populated at evaluation time. */
  compiledConstraints?: CompiledConstraint[];
  /** Domain routing decision resolved before the most recent evaluation. */
  routingDecision?: EvaluationRoutingDecision;
}

function buildEmptyAutoState(): AutoCompileState {
  return {
    rawInput: "",
    intent: "NUTRITION_AUDIT",
    hasCompiled: false,
    isConfirmed: false,
    draft: null,
    patchedDraft: null,
    activeField: null,
    activeAuditId: null,
    activeVersionId: null,
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

  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);

  useEffect(() => {
    listAuditRecords().then(setAuditRecords);
  }, []);

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
      patchedDraft: null,
      activeField: null,
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
      patchedDraft: null,
      activeField: null,
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
      patchedDraft: null,
      activeField: null,
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
      patchedDraft: null,
      activeField: null,
      evaluationResult: undefined,
      evaluationError: undefined,
    }));
  }

  function handleFixField(fieldKey: string) {
    setAutoState((prev) => ({
      ...prev,
      activeField: fieldKey,
      isConfirmed: false,
    }));
  }

  function handleSaveField(fieldKey: string, value: unknown) {
    const baseDraft = autoState.patchedDraft ?? autoState.draft;
    if (!baseDraft) return;
    const patched = patchDraftField(baseDraft, fieldKey, value);
    const revalidated = revalidateDraft(patched, autoState.intent);
    setAutoState((prev) => ({
      ...prev,
      patchedDraft: revalidated,
      activeField: null,
      evaluationResult: undefined,
      evaluationError: undefined,
    }));
  }

  function handleCancelFieldEdit() {
    setAutoState((prev) => ({ ...prev, activeField: null }));
  }

  const effectiveDraft = autoState.patchedDraft ?? autoState.draft;

  const serializedRecord = effectiveDraft && autoState.isConfirmed
    ? buildSerializedDraftRecord(effectiveDraft)
    : null;

  function buildAutoAuditRecord(params: {
    evaluationResult: AuditRecord["evaluationResult"];
    isConfirmed: boolean;
    routingDecision?: EvaluationRoutingDecision;
  }): AuditRecord | null {
    if (!effectiveDraft) return null;
    const canonical = buildSerializedDraftRecord(effectiveDraft);
    const auditId = autoState.activeAuditId ?? buildAuditId();
    return {
      id: auditId,
      versionId: buildVersionId(),
      parentVersionId: autoState.activeVersionId ?? null,
      timestamp: new Date().toISOString(),
      intent: effectiveDraft.intent,
      title: effectiveDraft.title,
      isEvaluable: effectiveDraft.isEvaluable,
      isConfirmed: params.isConfirmed,
      canonicalDeclaration: canonical.canonicalText,
      compileResult: autoState.draft
        ? { intent: autoState.intent, template: null, extracted: null, gaps: null, draft: autoState.draft }
        : null,
      patchedDraft: autoState.patchedDraft,
      evaluationResult: params.evaluationResult,
      routingRecord: params.routingDecision
        ? buildPersistedRoutingRecord(params.routingDecision)
        : null,
    };
  }

  async function persistAuditRecord(record: AuditRecord) {
    await saveAuditRecord(record);
    setAuditRecords(await listAuditRecords());
    setAutoState((prev) => ({
      ...prev,
      activeAuditId: record.id,
      activeVersionId: record.versionId,
    }));
  }

  async function handleAutoConfirm() {
    if (!effectiveDraft?.isEvaluable) return;
    setAutoState((prev) => ({ ...prev, isConfirmed: true }));

    const record = buildAutoAuditRecord({ evaluationResult: null, isConfirmed: true });
    if (record) await persistAuditRecord(record);
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
    if (!effectiveDraft || !effectiveDraft.isEvaluable || !autoState.isConfirmed)
      return;

    // Disable the button and clear stale results immediately.
    setAutoState((prev) => ({
      ...prev,
      isEvaluating: true,
      evaluationResult: undefined,
      evaluationError: undefined,
    }));

    try {
      // ── Shared compiler pipeline (Law of mode-invariance) ────────────────
      // Auto-compile serializes the StructuredDraft (display artefact) back to
      // canonical section-formatted text, then parses it through the SAME
      // kernel API endpoint used by Guided and Natural Language modes.
      // This guarantees mode-invariant evaluation: identical semantic input
      // produces identical NomosQuery regardless of entry mode.
      const canonicalText = serializeDraft(effectiveDraft);
      const query = await parser.parse({
        rawInput: canonicalText,
        operatorHints: [
          "extract constraints conservatively",
          "do not infer legality",
        ],
        allowFallback: true,
      });

      // Compile constraints from the kernel-parsed result (not the draft)
      // so the constraint display matches what the evaluator received.
      const compiledConstraints = compileConstraints(query.state.constraints);

      // Resolve domain routing before evaluation so the decision is
      // deterministic and stored alongside the result.
      const governanceState = readGovernanceState();
      const routingDecision = buildEvaluationRoutingDecision(
        governanceState,
        effectiveDraft.intent
      );

      setAutoState((prev) => ({
        ...prev,
        parsedQuery: query,
        compiledConstraints,
        routingDecision,
      }));

      const [evaluationResult] = await Promise.all([
        callEvaluateApi(query),
        evaluateLiveQuery(query),
      ]);

      setAutoState((prev) => ({
        ...prev,
        isEvaluating: false,
        evaluationResult,
      }));

      const record = buildAutoAuditRecord({
        evaluationResult: { status: evaluationResult.overallStatus ?? "COMPLETE", payload: evaluationResult },
        isConfirmed: true,
        routingDecision,
      });
      if (record) await persistAuditRecord(record);
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

  function handleLoadAuditRecord(record: AuditRecord) {
    const loadDraft = record.patchedDraft ?? record.compileResult?.draft ?? null;
    setAutoState({
      rawInput: record.canonicalDeclaration,
      intent: record.intent as IntentType,
      hasCompiled: true,
      isConfirmed: record.isConfirmed,
      draft: record.compileResult?.draft ?? null,
      patchedDraft: record.patchedDraft,
      activeField: null,
      activeAuditId: record.id,
      activeVersionId: record.versionId,
      isEvaluating: false,
      evaluationResult: undefined,
      evaluationError: undefined,
    });
    void loadDraft;
  }

  async function handleDeleteAuditRecord(id: string) {
    await deleteAuditRecord(id);
    setAuditRecords(await listAuditRecords());
  }

  async function handleClearAuditRecords() {
    await clearAuditRecords();
    setAuditRecords([]);
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
                <option value="NUTRITION_MEAL_AUDIT">Nutrition — Meal Audit</option>
                <option value="NUTRITION_TEMPORAL_FUELING">Nutrition — Temporal Fueling</option>
                <option value="NUTRITION_LABEL_TRUTH">Nutrition — Label Truth</option>
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
            draft={effectiveDraft}
            isConfirmed={autoState.isConfirmed}
            onConfirm={handleAutoConfirm}
            onRevise={handleAutoRevise}
            onFixField={handleFixField}
          />

          <FieldPatchPanel
            activeField={autoState.activeField}
            onSave={handleSaveField}
            onCancel={handleCancelFieldEdit}
          />

          {serializedRecord && (
            <div className="nm-serialized-panel">
              <div className="nm-serialized-panel__title">CANONICAL DECLARATION</div>
              <pre className="nm-serialized-panel__body">
                {serializedRecord.canonicalText}
              </pre>
            </div>
          )}

          {effectiveDraft && (
            <div className="nm-query-evaluate">
              <button
                type="button"
                className="nm-btn nm-btn--primary"
                disabled={
                  !effectiveDraft.isEvaluable ||
                  !autoState.isConfirmed ||
                  autoState.isEvaluating
                }
                onClick={handleAutoEvaluate}
              >
                {autoState.isEvaluating ? "Evaluating…" : "Evaluate"}
              </button>

              {!effectiveDraft.isEvaluable && autoState.hasCompiled && (
                <div className="nm-query-evaluate__note">
                  Evaluation blocked until required fields are present.
                </div>
              )}

              {effectiveDraft.isEvaluable && !autoState.isConfirmed && (
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
            <EvaluationResultPanel
              result={autoState.evaluationResult}
              compiledConstraints={autoState.compiledConstraints}
              routingDecision={autoState.routingDecision}
            />
          )}

          <CompilerDebugPanel
            mode="auto"
            rawInput={autoState.rawInput}
            structuredDraft={effectiveDraft}
            canonicalDeclaration={effectiveDraft ? serializeDraft(effectiveDraft) : undefined}
            evaluationRequest={autoState.parsedQuery ?? null}
          />

          <AuditHistoryPanel
            records={auditRecords}
            activeAuditId={autoState.activeAuditId}
            onLoad={handleLoadAuditRecord}
            onDelete={handleDeleteAuditRecord}
            onClear={handleClearAuditRecords}
          />
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

            <CompilerDebugPanel
              mode={state.mode as "guided" | "natural"}
              rawInput={
                state.mode === "guided"
                  ? buildRawInputFromGuidedDraft(state.guidedDraft)
                  : state.rawInput
              }
              canonicalDeclaration={
                state.mode === "guided"
                  ? buildRawInputFromGuidedDraft(state.guidedDraft)
                  : state.rawInput
              }
              evaluationRequest={state.parsedQuery ?? null}
            />
          </div>
        </div>
      )}

      <div className="query-footer-note">
        NOMOS evaluates declared and confirmed structure, not implied intent.
      </div>
    </div>
  );
}
