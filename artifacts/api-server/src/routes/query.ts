/**
 * routes/query.ts
 *
 * NOMOS Query API routes.
 *
 * POST /nomos/query/parse     — Extract structured NomosQuery from natural language.
 * POST /nomos/query/evaluate  — Evaluate a NomosQuery using the full evaluation pipeline.
 *
 * Constitutional note:
 * - The parse endpoint is extraction only. It does not assign lawfulness.
 * - The evaluate endpoint runs the deterministic pipeline first, LLM semantic
 *   evaluator second (for UNKNOWN constraint kinds), and produces EvaluationResult.
 */

import { Router } from "express";
import { HybridNomosQueryParser, evaluateQueryCandidates } from "nomos-core";
import type { NomosQuery } from "nomos-core";

const queryRouter = Router();

queryRouter.post("/nomos/query/parse", async (req, res) => {
  const body = req.body as {
    rawInput?: string;
    operatorHints?: string[];
    allowFallback?: boolean;
  };

  const rawInput = typeof body.rawInput === "string" ? body.rawInput.trim() : "";
  if (!rawInput) {
    res.status(400).json({ error: "INVALID_INPUT", message: "rawInput is required." });
    return;
  }

  const parser = new HybridNomosQueryParser();
  try {
    const query = await parser.parse({
      rawInput,
      operatorHints: body.operatorHints ?? [
        "extract constraints conservatively",
        "do not infer legality",
      ],
      allowFallback: body.allowFallback ?? true,
    });
    res.json(query);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parser failure";
    res.status(500).json({ error: "PARSE_FAILURE", message });
  }
});

queryRouter.post("/nomos/query/evaluate", async (req, res) => {
  const body = req.body as { query?: unknown };

  if (!body.query || typeof body.query !== "object") {
    res.status(400).json({ error: "INVALID_INPUT", message: "query object is required." });
    return;
  }

  try {
    const result = await evaluateQueryCandidates(body.query as NomosQuery);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Evaluation failure";
    res.status(500).json({ error: "EVALUATION_FAILURE", message });
  }
});

export default queryRouter;
