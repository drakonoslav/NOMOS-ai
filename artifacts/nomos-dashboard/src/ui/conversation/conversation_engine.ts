/**
 * conversation_engine.ts
 *
 * Constitutional conversational state machine.
 *
 * NOT a chatbot.
 * NOT an assistant.
 *
 * A guided declaration engine that advances through stages only when
 * the declaration is structurally valid at each level.
 *
 * NOMOS never evaluates unconfirmed input.
 */

import type { Stage, ConversationDraft } from "./types";
import { detectIssues, canEvaluate } from "./validation_engine";
import type { ValidationIssue } from "./validation_engine";
import { computeCompleteness } from "./completeness_engine";
import type { CompletenessResult } from "./completeness_engine";
import { compressIssues } from "./validation_format";
import { emphasizeKeyTerms } from "./tone_emphasis";

export interface ConversationState {
  stage:       Stage;
  draftQuery:  ConversationDraft;
  issues:      ValidationIssue[];
  completeness: CompletenessResult;
}

export interface ConversationOutput {
  line:         string;
  draft:        ConversationDraft;
  issues:       ValidationIssue[];
  completeness: CompletenessResult;
  nextStage:    Stage;
}

/* =========================================================
   Public API
   ========================================================= */

export function initialState(): ConversationState {
  const draftQuery: ConversationDraft = {};
  const issues      = detectIssues(draftQuery);
  const completeness = computeCompleteness(draftQuery, issues);

  return {
    stage: "INTENT",
    draftQuery,
    issues,
    completeness,
  };
}

export function stepConversation(
  state: ConversationState,
  input: string
): ConversationOutput {
  const updatedDraft = updateDraft(state, input.trim());
  const issues       = detectIssues(updatedDraft);
  const completeness = computeCompleteness(updatedDraft, issues);
  const next         = nextStage({ draftQuery: updatedDraft, issues });

  const nextState: ConversationState = {
    stage:       next,
    draftQuery:  updatedDraft,
    issues,
    completeness,
  };

  return {
    line:        buildConversationLine(nextState),
    draft:       updatedDraft,
    issues,
    completeness,
    nextStage:   next,
  };
}

export function getPrompt(stage: Stage): string {
  switch (stage) {
    case "INTENT":            return "State objective precisely.";
    case "CONSTRAINTS":       return "Declare constraints.";
    case "MODEL_ASSUMPTIONS": return "Specify assumptions.";
    case "CONFIRMATION":      return "Confirm submission or revise.";
    case "EVALUATION":        return "";
  }
}

export function canConfirm(state: ConversationState): boolean {
  return state.stage === "CONFIRMATION" && canEvaluate(state.issues);
}

/* =========================================================
   Internal
   ========================================================= */

function updateDraft(
  state: ConversationState,
  input: string
): ConversationDraft {
  const { stage, draftQuery } = state;

  if (!input) return draftQuery;

  switch (stage) {
    case "INTENT":
      return { ...draftQuery, intent: input };

    case "CONSTRAINTS":
      return {
        ...draftQuery,
        constraints: [...(draftQuery.constraints ?? []), input],
      };

    case "MODEL_ASSUMPTIONS":
      return {
        ...draftQuery,
        assumptions: [...(draftQuery.assumptions ?? []), input],
      };

    default:
      return draftQuery;
  }
}

function nextStage(partial: {
  draftQuery: ConversationDraft;
  issues: ValidationIssue[];
}): Stage {
  const { draftQuery, issues } = partial;

  if (!draftQuery.intent) return "INTENT";

  const hasConstraintError = issues.some(
    (i) => i.field === "constraint" && i.severity === "error"
  );
  if (!draftQuery.constraints?.length || hasConstraintError) return "CONSTRAINTS";

  if (!draftQuery.assumptions?.length) return "MODEL_ASSUMPTIONS";

  return "CONFIRMATION";
}

function buildConversationLine(state: ConversationState): string {
  const issues = state.issues ?? [];

  if (issues.length > 0) {
    const compressed = compressIssues(issues);
    const primary    = emphasizeKeyTerms(compressed[0] ?? "");
    const prompt     = getPrompt(state.stage);

    return prompt ? `${primary}\n${prompt}` : primary;
  }

  return getPrompt(state.stage);
}
