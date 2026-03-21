/**
 * useToneMessage.ts
 *
 * React hook that derives the tone-resolved message from a NomosState.
 * Returns the tone level, verification message, and authority message
 * so components can display calibrated language without knowing the resolver.
 */

import type { NomosState } from "@workspace/api-client-react";
import { toToneResolverInput } from "./tone_adapter";
import { resolveToneLevel } from "./tone_resolver";
import { buildToneMessage, type ToneMessage } from "./tone_templates";
import { buildAuthorityMessage, type AuthorityMessage, type AuthorityState } from "./authority_templates";
import type { ToneLevel } from "./tone_types";

export interface ToneMessageResult {
  toneLevel: ToneLevel;
  verification: ToneMessage;
  authority: AuthorityMessage;
}

export function useToneMessage(state: NomosState): ToneMessageResult {
  const input = toToneResolverInput(state);
  const toneLevel = resolveToneLevel(input);
  const verification = buildToneMessage(input, toneLevel);
  const authority = buildAuthorityMessage(
    state.authority as AuthorityState,
    toneLevel
  );
  return { toneLevel, verification, authority };
}
