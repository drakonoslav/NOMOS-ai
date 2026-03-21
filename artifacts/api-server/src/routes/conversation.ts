/**
 * routes/conversation.ts
 *
 * POST /nomos/conversation/suggest
 *
 * LLM-assisted refinement suggestions for the conversation engine.
 * Returns empty array when OPENAI_API_KEY is absent — rule-based fallback handles it.
 */

import { Router } from "express";

const conversationRouter = Router();

conversationRouter.post("/nomos/conversation/suggest", async (req, res) => {
  const body  = req.body as { stage?: string; input?: string };
  const stage = typeof body.stage === "string" ? body.stage : "";
  const input = typeof body.input === "string" ? body.input.trim() : "";

  if (!input) {
    res.json({ suggestions: [] });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    res.json({ suggestions: [] });
    return;
  }

  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });

    const prompt = `You are assisting a structured constitutional decision system.

Your role:
- Suggest improvements ONLY
- Do NOT rewrite user input
- Do NOT assume intent
- Return short, formal suggestions in declarative style

Stage: ${stage}
Input: "${input}"

Return a JSON array (no markdown):
[{ "id": "unique_id", "text": "...", "type": "constraint|intent|assumption", "confidence": "low|moderate|high" }]

Return 1–3 suggestions maximum.`;

    const completion = await client.chat.completions.create({
      model:    process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 256,
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";

    // strip markdown code fences if present
    const cleaned = raw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
    const parsed  = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      res.json({ suggestions: [] });
      return;
    }

    res.json({ suggestions: parsed });
  } catch {
    res.json({ suggestions: [] });
  }
});

export default conversationRouter;
