import { Router } from "express";
import { runKernelOnce } from "nomos-core";

const nomosRouter = Router();

nomosRouter.get("/nomos/state", async (_req, res) => {
  try {
    const state = await runKernelOnce();
    res.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown kernel error";
    res.status(500).json({ error: "KERNEL_FAILURE", message });
  }
});

export default nomosRouter;
