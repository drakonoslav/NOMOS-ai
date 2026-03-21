/**
 * query_api.ts
 *
 * API client for the NOMOS Query endpoints.
 */

import { NomosQuery, NomosQueryResponse } from "./query_types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export async function parseQuery(
  rawInput: string,
  operatorHints?: string[]
): Promise<NomosQuery> {
  const res = await fetch(`${BASE}/api/nomos/query/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rawInput,
      operatorHints: operatorHints ?? [
        "extract constraints conservatively",
        "do not infer legality",
      ],
      allowFallback: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `Parse failed: ${res.status}`);
  }

  return res.json() as Promise<NomosQuery>;
}

export async function evaluateQuery(query: NomosQuery): Promise<NomosQueryResponse> {
  const res = await fetch(`${BASE}/api/nomos/query/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `Evaluate failed: ${res.status}`);
  }

  return res.json() as Promise<NomosQueryResponse>;
}
