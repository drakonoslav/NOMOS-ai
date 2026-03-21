/**
 * ConversationPage.tsx
 *
 * Constitutional conversational query constructor.
 *
 * NOT a chat interface.
 * NOT an assistant.
 *
 * A guided declaration engine: intent → constraints → assumptions → confirmation → evaluation.
 * NOMOS never evaluates unconfirmed input.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  initialState,
  stepConversation,
  getPrompt,
  canConfirm,
  type ConversationState,
} from "../../conversation/conversation_engine";
import {
  ruleBasedSuggestions,
  validationToSuggestions,
  dedupeSuggestions,
  applySuggestion,
  type Suggestion,
} from "../../conversation/suggestion_engine";
import { generateRefinementSuggestions } from "../../conversation/llm_refiner";
import { parseEmphasis }  from "../../conversation/tone_emphasis";
import { ValidationPanel } from "../../components/conversation/ValidationPanel";
import { CompletenessBar } from "../../components/conversation/CompletenessBar";
import type { ConversationDraft } from "../../conversation/types";

/* =========================================================
   Draft preview — structured display of current declaration
   ========================================================= */

function QueryPreviewCard({ draft }: { draft: ConversationDraft }) {
  if (!draft.intent && !draft.constraints?.length && !draft.assumptions?.length) {
    return null;
  }

  return (
    <div className="nm-query-preview">
      {draft.intent && (
        <div className="nm-preview-row">
          <span className="nm-preview-label">Intent</span>
          <span className="nm-preview-value">{draft.intent}</span>
        </div>
      )}

      {draft.constraints?.map((c, i) => (
        <div key={i} className="nm-preview-row">
          <span className="nm-preview-label">{i === 0 ? "Constraints" : ""}</span>
          <span className="nm-preview-value">{c}</span>
        </div>
      ))}

      {draft.assumptions?.map((a, i) => (
        <div key={i} className="nm-preview-row">
          <span className="nm-preview-label">{i === 0 ? "Assumptions" : ""}</span>
          <span className="nm-preview-value">{a}</span>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   System line renderer (parses **bold** markers)
   ========================================================= */

function SystemLine({ text }: { text: string }) {
  return (
    <div className="nm-system-line">
      {text.split("\n").map((line, i) => {
        const segments = parseEmphasis(line);
        return (
          <div key={i}>
            {segments.map((seg, j) =>
              seg.bold
                ? <strong key={j} className="nm-system-emphasis">{seg.text}</strong>
                : <span key={j}>{seg.text}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================
   Suggestions panel
   ========================================================= */

function SuggestionPanel({
  suggestions,
  onApply,
}: {
  suggestions: Suggestion[];
  onApply: (s: Suggestion) => void;
}) {
  if (!suggestions.length) return null;

  return (
    <div className="nm-suggestions">
      <div className="nm-suggestions-title">Suggested refinements</div>
      {suggestions.map((s) => (
        <div key={s.id} className="nm-suggestion">
          <span className={`nm-suggestion-text nm-suggestion--${s.confidence}`}>
            {s.text}
          </span>
          <button className="nm-suggestion-apply" onClick={() => onApply(s)}>
            Apply
          </button>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   Conversation history entry
   ========================================================= */

interface Turn {
  role:    "system" | "user";
  content: string;
}

/* =========================================================
   Main page
   ========================================================= */

export function ConversationPage() {
  const [state,       setState]       = useState<ConversationState>(initialState);
  const [input,       setInput]       = useState("");
  const [history,     setHistory]     = useState<Turn[]>(() => {
    const init = initialState();
    return [{ role: "system", content: getPrompt(init.stage) }];
  });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [confirmed,   setConfirmed]   = useState(false);
  const [evalResult,  setEvalResult]  = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const refreshSuggestions = useCallback(async (
    st: ConversationState,
    rawInput: string
  ) => {
    const rule = ruleBasedSuggestions(st.draftQuery);
    const val  = validationToSuggestions(st.issues);
    const llm  = await generateRefinementSuggestions(st.stage, rawInput);
    setSuggestions(dedupeSuggestions([...val, ...rule, ...llm]));
  }, []);

  useEffect(() => {
    refreshSuggestions(state, "");
  }, []);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    setHistory((h) => [...h, { role: "user", content: text }]);
    setInput("");

    const output = stepConversation(state, text);
    setState({
      stage:        output.nextStage,
      draftQuery:   output.draft,
      issues:       output.issues,
      completeness: output.completeness,
    });
    setHistory((h) => [...h, { role: "system", content: output.line }]);

    await refreshSuggestions(
      {
        stage:        output.nextStage,
        draftQuery:   output.draft,
        issues:       output.issues,
        completeness: output.completeness,
      },
      text
    );

    textareaRef.current?.focus();
  }, [input, state, refreshSuggestions]);

  const handleApplySuggestion = useCallback((s: Suggestion) => {
    const updatedDraft = applySuggestion(state.draftQuery, s);
    const output = stepConversation({ ...state, draftQuery: updatedDraft }, "");
    setState({
      stage:        output.nextStage,
      draftQuery:   updatedDraft,
      issues:       output.issues,
      completeness: output.completeness,
    });
    refreshSuggestions(
      {
        stage:        output.nextStage,
        draftQuery:   updatedDraft,
        issues:       output.issues,
        completeness: output.completeness,
      },
      s.text
    );
  }, [state, refreshSuggestions]);

  const handleConfirm = useCallback(() => {
    if (!canConfirm(state)) return;
    setConfirmed(true);
    setEvalResult("Evaluation submitted. Constitutional review in progress.");
    setHistory((h) => [
      ...h,
      { role: "system", content: "Submission confirmed. Evaluation initiated." },
    ]);
  }, [state]);

  const handleReset = useCallback(() => {
    const init = initialState();
    setState(init);
    setInput("");
    setHistory([{ role: "system", content: getPrompt(init.stage) }]);
    setSuggestions([]);
    setConfirmed(false);
    setEvalResult(null);
    refreshSuggestions(init, "");
  }, [refreshSuggestions]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="nm-conversation-page">
      <div className="nm-conversation-header">
        <h1 className="nm-conversation-title">Conversational Query Constructor</h1>
        <p className="nm-conversation-subtitle">
          Iterative declaration refinement under constraint.
        </p>
      </div>

      <div className="nm-conversation-layout">

        {/* Left: dialogue + input */}
        <div className="nm-conversation-main">
          <div className="nm-conversation-history">
            {history.map((turn, i) => (
              <div key={i} className={`nm-turn nm-turn--${turn.role}`}>
                <span className="nm-turn-label">
                  {turn.role === "system" ? "NOMOS" : "YOU"}
                </span>
                {turn.role === "system"
                  ? <SystemLine text={turn.content} />
                  : <div className="nm-turn-content">{turn.content}</div>
                }
              </div>
            ))}
          </div>

          {!confirmed && (
            <div className="nm-input-area">
              <textarea
                ref={textareaRef}
                className="nm-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter declaration… (Enter to submit)"
                rows={3}
              />

              <div className="nm-input-actions">
                <button
                  className="nm-btn nm-btn--submit"
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                >
                  Submit
                </button>

                {canConfirm(state) && (
                  <button
                    className="nm-btn nm-btn--confirm"
                    onClick={handleConfirm}
                  >
                    Confirm Submission
                  </button>
                )}

                <button className="nm-btn nm-btn--reset" onClick={handleReset}>
                  Reset
                </button>
              </div>
            </div>
          )}

          {confirmed && evalResult && (
            <div className="nm-eval-result">
              <div className="nm-eval-result-label">EVALUATION</div>
              <div className="nm-eval-result-text">{evalResult}</div>
              <button className="nm-btn nm-btn--reset" onClick={handleReset}>
                New Declaration
              </button>
            </div>
          )}
        </div>

        {/* Right: structured state */}
        <div className="nm-conversation-sidebar">
          <CompletenessBar result={state.completeness} />

          <ValidationPanel issues={state.issues} />

          <SuggestionPanel
            suggestions={suggestions}
            onApply={handleApplySuggestion}
          />

          <div className="nm-sidebar-divider" />

          <div className="nm-preview-header">Structured Declaration</div>
          <QueryPreviewCard draft={state.draftQuery} />
        </div>
      </div>
    </div>
  );
}
