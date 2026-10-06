import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  deleteAccount,
  exportUserData,
  cancelDeletion, // ✅ Added missing controller
} from "../controllers/account.controller.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

// ═══════════════════════════════════════════
// RATE LIMITERS
// ═══════════════════════════════════════════

/**
 * Prevents brute-forcing password/2FA on account deletion or cancellation.
 */
const sensitiveActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many sensitive account actions. Please try again later.",
  },
});

/**
 * ⚠️ CRITICAL: Data export is extremely heavy (DB scans + ZIP generation).
 * A strict limit prevents CPU exhaustion and /tmp directory filling (DoS).
 */
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 2, // Max 2 exports per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Data export is limited to 2 requests per hour to ensure server performance.",
  },
});

// ═══════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════

// Soft delete account (starts 15-day grace period)
router.delete("/", protect, sensitiveActionLimiter, deleteAccount);

// ✅ NEW: Cancel pending deletion and reactivate account
router.post("/cancel", protect, sensitiveActionLimiter, cancelDeletion);

// ✅ SECURED: GDPR Data Export with strict DoS protection
router.get("/export", protect, exportLimiter, exportUserData);

export default router;
