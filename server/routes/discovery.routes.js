import express from "express";
import { discoverUsers } from "../controllers/discovery.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { profileViewLimiter } from "../middleware/rateLimits.js";

const router = express.Router();

// ✅ ADDED: Rate limiting to prevent discovery feed spam
router.get("/", protect, profileViewLimiter, discoverUsers);

export default router;