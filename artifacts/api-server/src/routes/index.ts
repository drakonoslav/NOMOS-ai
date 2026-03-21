import { Router, type IRouter } from "express";
import healthRouter from "./health";
import nomosRouter from "./nomos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(nomosRouter);

export default router;
