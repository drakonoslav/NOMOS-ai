import { Router, type IRouter } from "express";
import healthRouter       from "./health";
import nomosRouter        from "./nomos";
import queryRouter        from "./query";
import conversationRouter from "./conversation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(nomosRouter);
router.use(queryRouter);
router.use(conversationRouter);

export default router;
