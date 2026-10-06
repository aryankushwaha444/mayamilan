import express from "express";
import rateLimit from "express-rate-limit";
import { param, body, query } from "express-validator";
import { protect } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js"; // ✅ FIX: Correct import
import { validateRequest } from "../middleware/validateRequest.js";
import { jsonLimit } from "../middleware/bodyLimit.js";

import {
  submitSuggestion,
  getSuggestions,
  getSuggestionById, // ✅ ADDED
  updateSuggestionStatus,
  deleteSuggestion,
  bulkUpdateStatus, // ✅ ADDED
  bulkDeleteSuggestions, // ✅ ADDED
  getSuggestionStats, // ✅ ADDED
} from "../controllers/suggestion.controller.js";

const router = express.Router();

// ═══════════════════════════════════════════
// RATE LIMITERS
// ═══════════════════════════════════════════

/**
 * Prevents bots from spamming the public suggestion form.
 */
const submitSuggestionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Max 5 submissions per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many suggestions submitted. Please try again later.",
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
// PUBLIC ROUTES
// ═══════════════════════════════════════════

router.post(
  "/",
  submitSuggestionLimiter,
  jsonLimit("5kb"),
  [
    body("name")
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Name is required (max 100 chars)"),
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid email is required"),
    body("subject")
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage("Subject is required (max 200 chars)"),
    body("message")
      .isString()
      .trim()
      .isLength({ min: 1, max: 2000 })
      .withMessage("Message is required (max 2000 chars)"),
    body("category")
      .optional()
      .isIn(["general", "bug", "feature", "improvement", "security", "other"]),
    body("website").optional().isString(), // Honeypot field (handled in controller)
  ],
  validateRequest,
  submitSuggestion
);

// ═══════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════

// Apply auth and admin check to all subsequent routes
router.use(protect);
router.use(isAdmin);

// ✅ FIX: Specific routes MUST be defined BEFORE dynamic `/:id` routes
// to prevent Express from treating "bulk" or "stats" as an ObjectId.

router.get("/stats", getSuggestionStats);

router.patch(
  "/bulk/status",
  jsonLimit("5kb"),
  [
    body("ids")
      .isArray({ min: 1, max: 50 })
      .withMessage("Provide an array of 1-50 IDs"),
    body("ids.*").isMongoId().withMessage("Invalid ID format in array"),
    body("status")
      .isIn(["new", "reviewed", "planned", "resolved", "rejected"])
      .withMessage("Invalid status"),
  ],
  validateRequest,
  bulkUpdateStatus
);

router.delete(
  "/bulk",
  jsonLimit("5kb"),
  [
    body("ids")
      .isArray({ min: 1, max: 50 })
      .withMessage("Provide an array of 1-50 IDs"),
    body("ids.*").isMongoId().withMessage("Invalid ID format in array"),
  ],
  validateRequest,
  bulkDeleteSuggestions
);

router.get(
  "/",
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("status")
      .optional()
      .isIn(["new", "reviewed", "planned", "resolved", "rejected"]),
    query("priority").optional().isIn(["low", "medium", "high", "urgent"]),
    query("category")
      .optional()
      .isIn(["general", "bug", "feature", "improvement", "security", "other"]),
    query("search").optional().isString().trim(),
  ],
  validateRequest,
  getSuggestions
);

router.get(
  "/:id",
  [validateObjectId("id")],
  validateRequest,
  getSuggestionById
);

router.patch(
  "/:id",
  jsonLimit("2kb"),
  [
    validateObjectId("id"),
    body("status")
      .optional()
      .isIn(["new", "reviewed", "planned", "resolved", "rejected"]),
    body("priority").optional().isIn(["low", "medium", "high", "urgent"]),
    body("adminNotes").optional().isString().trim().isLength({ max: 2000 }),
  ],
  validateRequest,
  updateSuggestionStatus
);

router.delete(
  "/:id",
  jsonLimit("100b"),
  [validateObjectId("id")],
  validateRequest,
  deleteSuggestion
);

export default router;
