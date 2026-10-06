import express from "express";
import rateLimit from "express-rate-limit";
import { param, query } from "express-validator";
import { protect } from "../middleware/auth.middleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { jsonLimit } from "../middleware/bodyLimit.js";

import {
  getNotifications,
  getUnreadCount, // ✅ ADDED
  markAllAsRead,
  markAsRead, // ✅ ADDED
  deleteNotification,
  deleteAllNotifications,
} from "../controllers/notification.controller.js";

const router = express.Router();

// ═══════════════════════════════════════════
// RATE LIMITERS
// ═══════════════════════════════════════════

/**
 * Prevents spamming bulk actions (Delete All / Mark All Read)
 * which cause heavy database write operations.
 */
const bulkActionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 bulk actions per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many bulk actions. Please slow down.",
  },
});

// ═══════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════

const validateObjectId = (paramName) =>
  param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName} format`)
    .trim();

// ═══════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════

// 1. Get paginated notifications (with optional type filtering)
router.get(
  "/",
  protect,
  [
    query("page").optional().isInt({ min: 1 }).withMessage("Invalid page"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Invalid limit"),
    query("type").optional().isString().trim(),
  ],
  validateRequest,
  getNotifications
);

// 2. Lightweight endpoint for navbar badge count
router.get("/unread-count", protect, getUnreadCount);

// 3. Mark ALL notifications as read
router.put(
  "/read-all",
  protect,
  bulkActionLimiter,
  jsonLimit("100b"),
  markAllAsRead
);

// 4. Mark a SINGLE notification as read
router.patch(
  "/:id/read",
  protect,
  jsonLimit("100b"),
  [validateObjectId("id")],
  validateRequest,
  markAsRead
);

// 5. Delete ALL notifications
router.delete(
  "/",
  protect,
  bulkActionLimiter,
  jsonLimit("100b"),
  deleteAllNotifications
);

// 6. Delete a SINGLE notification
router.delete(
  "/:id",
  protect,
  jsonLimit("100b"),
  [validateObjectId("id")],
  validateRequest,
  deleteNotification
);

export default router;
