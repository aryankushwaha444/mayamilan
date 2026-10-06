import express from "express";
import rateLimit from "express-rate-limit";
import { param } from "express-validator";
import { protect } from "../middleware/auth.middleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { jsonLimit } from "../middleware/bodyLimit.js";

import {
  getMatches,
  getMatchById,
  deleteMatch,
} from "../controllers/match.controller.js";

const router = express.Router();

// ═══════════════════════════════════════════
// RATE LIMITERS
// ═══════════════════════════════════════════

/**
 * Prevents mass-unmatch abuse or frontend bugs triggering rapid deletions.
 */
const unmatchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Max 20 unmatches per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many unmatch attempts. Please try again later.",
  },
});

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
// ROUTES
// ═══════════════════════════════════════════

// ✅ FIX: Removed `cached` middleware.
// Match lists contain personalized, real-time data (unread counts, last messages)
// and must never be served from a generic cache.
router.get("/", protect, getMatches);

router.get(
  "/:matchId",
  protect,
  [validateObjectId("matchId")],
  validateRequest,
  getMatchById
);

// ✅ FIX: Added rate limiting, body limits, and input validation
router.delete(
  "/:matchId",
  protect,
  unmatchLimiter,
  jsonLimit("1kb"),
  [validateObjectId("matchId")],
  validateRequest,
  deleteMatch
);

export default router;
