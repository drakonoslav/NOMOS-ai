/**
 * types.ts — Conversation engine domain types.
 *
 * Distinct from NomosQuery — the conversation layer builds a declaration
 * progressively before any evaluation is triggered.
 */

export type Stage =
  | "INTENT"
  | "CONSTRAINTS"
  | "MODEL_ASSUMPTIONS"
  | "CONFIRMATION"
  | "EVALUATION";

export interface ConversationDraft {
  intent?: string;
  constraints?: string[];
  assumptions?: string[];
}
