import express from "express";
import { param } from "express-validator";
import { protect } from "../middleware/auth.middleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { jsonLimit } from "../middleware/bodyLimit.js";
import { reactionLimiter } from "../middleware/rateLimits.js"; // ✅ Reuse existing limiter for likes

import {
  likeUser,
  unlikeUser,
  getSentLikes,
  getReceivedLikes,
} from "../controllers/like.controller.js";

const router = express.Router();

// ═══════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════

/**
 * Validate MongoDB ObjectId format
 */
const validateObjectId = (paramName) =>
  param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName} format`)
    .trim();

// ═══════════════════════════════════════════
// SPECIFIC ROUTES (Defined BEFORE dynamic routes)
// ═══════════════════════════════════════════

// ✅ FIX: Define specific routes first to prevent shadowing
router.get("/sent", protect, getSentLikes);

router.get("/received", protect, getReceivedLikes);

// ═══════════════════════════════════════════
// DYNAMIC ROUTES
// ═══════════════════════════════════════════

// ✅ FIX: Added rate limiting, body limits, and input validation
router.post(
  "/:userId",
  protect,
  reactionLimiter, // ✅ Prevents spam liking (max 120 per 15 mins)
  jsonLimit("1kb"), // ✅ Restricts payload size
  [validateObjectId("userId")],
  validateRequest,
  likeUser
);

router.delete(
  "/:userId",
  protect,
  reactionLimiter, // ✅ Prevents spam unliking
  jsonLimit("1kb"),
  [validateObjectId("userId")],
  validateRequest,
  unlikeUser
);

export default router;
