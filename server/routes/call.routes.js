import { Router } from "express";
import { protect } from "../middleware/auth.js"; // ⚠️ SEAM: confirm this path/export matches your OTHER route files
import { getCallHistory } from "../controllers/call.controller.js";

const router = Router();
router.get("/history", protect, getCallHistory); // authed; no peer-param needed (it's "my" history)

export default router;
