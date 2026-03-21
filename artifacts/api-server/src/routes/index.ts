import { Router, type IRouter } from "express";
import healthRouter       from "./health";
import nomosRouter        from "./nomos";
import queryRouter        from "./query";
import conversationRouter from "./conversation";
import auditRouter        from "./audit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(nomosRouter);
router.use(queryRouter);
router.use(conversationRouter);
router.use(auditRouter);

export default router;
