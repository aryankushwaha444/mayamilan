import express from "express";
import { param, body, query } from "express-validator";
import { protect } from "../middleware/auth.middleware.js";
import { isAdmin, verify2FAForAdmin } from "../middleware/admin.middleware.js"; // ✅ Added verify2FAForAdmin
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { logAudit } from "../utils/auditLogger.js";

// ✅ Import rate limiters from your existing file
import {
  adminLimiter,
  adminSensitiveLimiter,
  adminUserActionLimiter,
  adminReportLimiter,
} from "../middleware/rateLimits.js";

import {
  getDashboardStats,
  getAllUsers,
  getUserById,
  updateUser,
  toggleUserStatus,
  deleteUser,
  deleteUserPhoto,
  getUserReports,
  updateReportStatus,
  getAllReports,
  getHoneypotStats,
} from "../controllers/admin.controller.js";

const router = express.Router();

// GLOBAL MIDDLEWARE
router.use(protect);
router.use(isAdmin);

// REQUEST LOGGING MIDDLEWARE
router.use(async (req, res, next) => {
  // Only log mutations (POST, PUT, PATCH, DELETE) to reduce log noise
  if (req.method !== "GET") {
    await logAudit(req, "admin_request", {
      userId: req.user._id,
      email: req.user.email,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    }).catch(() => {});
  }
  next();
});

// ========================================
// VALIDATION HELPERS
// ========================================
const validateObjectId = (paramName) =>
  param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName} format`)
    .trim();

// ========================================
// 2FA VERIFICATION (For sensitive admin actions)
// ========================================
// ✅ NEW: Route to verify 2FA before performing destructive actions
router.post(
  "/verify-2fa",
  adminSensitiveLimiter,
  [
    body("totpCode")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("2FA code required"),
  ],
  validateRequest,
  asyncHandler(verify2FAForAdmin)
);

// ========================================
// DASHBOARD
// ========================================
router.get("/stats", adminLimiter, asyncHandler(getDashboardStats));

router.get(
  "/stats/honeypot",
  adminLimiter,
  [
    query("startDate").optional().isISO8601().withMessage("Invalid start date"),
    query("endDate").optional().isISO8601().withMessage("Invalid end date"),
  ],
  validateRequest,
  asyncHandler(getHoneypotStats)
);

// ========================================
// USERS CRUD
// ========================================
router.get(
  "/users",
  adminUserActionLimiter,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be positive"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be 1-100"),
    query("search").optional().trim().isLength({ max: 100 }),
    query("status")
      .optional()
      .isIn(["active", "inactive", "banned", "deleted"]),
    // ✅ FIX: Aligned with User schema enum
    query("role").optional().isIn(["user", "admin", "superadmin"]),
  ],
  validateRequest,
  asyncHandler(getAllUsers)
);

router.get(
  "/users/:id",
  [validateObjectId("id")],
  validateRequest,
  asyncHandler(getUserById)
);

router.get(
  "/users/:id/reports",
  [validateObjectId("id")],
  validateRequest,
  asyncHandler(getUserReports)
);

router.put(
  "/users/:id",
  adminSensitiveLimiter,
  [
    validateObjectId("id"),
    body("name").optional().trim().isLength({ min: 2, max: 50 }),
    body("email").optional().isEmail().normalizeEmail(),
    // ✅ FIX: Aligned with User schema enum
    body("role").optional().isIn(["user", "admin", "superadmin"]),
    body("isActive").optional().isBoolean(),
    body("isVerified").optional().isBoolean(),
    body("emailBlockedUntil").optional().isISO8601(),
    body("relationshipGoal").optional().trim().isLength({ max: 100 }),
  ],
  validateRequest,
  asyncHandler(updateUser)
);

router.patch(
  "/users/:id/toggle-status",
  adminSensitiveLimiter,
  [validateObjectId("id")],
  validateRequest,
  asyncHandler(toggleUserStatus)
);

router.delete(
  "/users/:id",
  adminSensitiveLimiter,
  [validateObjectId("id")],
  validateRequest,
  asyncHandler(deleteUser)
);

router.delete(
  // ✅ FIX: Changed param from :photoId to :publicId
  "/users/:id/photos/:publicId",
  adminSensitiveLimiter,
  [
    validateObjectId("id"),
    // ✅ FIX: Cloudinary publicIds are strings, NOT Mongo ObjectIds
    param("publicId")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("Invalid photo publicId"),
  ],
  validateRequest,
  asyncHandler(deleteUserPhoto)
);

// ========================================
// REPORTS
// ========================================
router.get(
  "/reports",
  adminReportLimiter,
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    // ✅ FIX: Aligned with Report schema enum ("reviewing" instead of "reviewed")
    query("status")
      .optional()
      .isIn(["pending", "reviewing", "resolved", "dismissed"]),
    query("reason").optional().trim(), // Changed from 'type' to 'reason' to match schema
    query("userId").optional().isMongoId(),
  ],
  validateRequest,
  asyncHandler(getAllReports)
);

router.patch(
  "/reports/:reportId",
  adminReportLimiter,
  [
    validateObjectId("reportId"),
    // ✅ FIX: Aligned with Report schema enum
    body("status")
      .isIn(["reviewing", "resolved", "dismissed"])
      .withMessage("Invalid status"),
    body("adminNotes").optional().trim().isLength({ max: 500 }),
    // ✅ NEW: Validate actionTaken against schema enum
    body("actionTaken")
      .optional()
      .isIn(["none", "warning_sent", "content_deleted", "suspend", "ban"])
      .withMessage("Invalid action taken"),
  ],
  validateRequest,
  asyncHandler(updateReportStatus)
);

export default router;
