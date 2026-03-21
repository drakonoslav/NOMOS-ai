/**
 * llm_refiner.ts
 *
 * LLM-assisted refinement suggestions via the NOMOS API server.
 * Fails gracefully when the API key is absent — rule-based suggestions always work.
 */

import type { Suggestion } from "./suggestion_engine";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
const API_BASE = BASE_URL.replace(/\/$/, "") + "/api";

export async function generateRefinementSuggestions(
  stage: string,
  input: string
): Promise<Suggestion[]> {
  try {
    const res = await fetch(`${API_BASE}/nomos/conversation/suggest`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ stage, input }),
    });

    if (!res.ok) return [];

    const data = await res.json() as { suggestions?: Suggestion[] };
    return Array.isArray(data.suggestions) ? data.suggestions : [];
  } catch {
    return [];
  }
}
