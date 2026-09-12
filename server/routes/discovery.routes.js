import express from "express";
import { discoverUsers } from "../controllers/discovery.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { cached } from "../utils/cache.js";

const router = express.Router();

router.get("/", protect,cached("discover", 120), discoverUsers);

export default router;