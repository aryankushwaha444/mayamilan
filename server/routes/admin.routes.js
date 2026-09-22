import express from "express";
import { param, body, query } from "express-validator";
import { protect } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
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
// DASHBOARD
// ========================================
router.get("/stats",adminLimiter, asyncHandler(getDashboardStats));

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
  adminUserActionLimiter, // ✅ Apply user action rate limit
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
    query("role").optional().isIn(["user", "moderator", "admin"]),
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
  adminSensitiveLimiter, // ✅ Stricter limit for updates
  [
    validateObjectId("id"),
    body("name").optional().trim().isLength({ min: 2, max: 50 }),
    body("email").optional().isEmail().normalizeEmail(),
    body("role").optional().isIn(["user", "moderator", "admin"]),
    body("isActive").optional().isBoolean(),
    body("isVerified").optional().isBoolean(),
    body("emailBlockedUntil").optional().isISO8601(), // ✅ Add this
    body("relationshipGoal").optional().trim().isLength({ max: 100 }), 
  ],
  validateRequest,
  asyncHandler(updateUser)
);

router.patch(
  "/users/:id/toggle-status",
  adminSensitiveLimiter, // ✅ Stricter limit for status changes
  [validateObjectId("id")],
  validateRequest,
  asyncHandler(toggleUserStatus)
);

router.delete(
  "/users/:id",
  adminSensitiveLimiter, // ✅ Stricter limit for deletions
  [validateObjectId("id")],
  validateRequest,
  asyncHandler(deleteUser)
);

router.delete(
  "/users/:id/photos/:photoId",
  adminSensitiveLimiter, // ✅ Stricter limit for photo deletions
  [validateObjectId("id"), validateObjectId("photoId")],
  validateRequest,
  asyncHandler(deleteUserPhoto)
);

// ========================================
// REPORTS
// ========================================
router.get(
  "/reports",
  adminReportLimiter, // ✅ Apply report-specific rate limit
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("status")
      .optional()
      .isIn(["pending", "reviewed", "resolved", "dismissed"]),
    query("type").optional().trim(),
    query("userId").optional().isMongoId(),
  ],
  validateRequest,
  asyncHandler(getAllReports)
);

router.patch(
  "/reports/:reportId",
  adminReportLimiter, // ✅ Apply report-specific rate limit
  [
    validateObjectId("reportId"),
    body("status")
      .isIn(["reviewed", "resolved", "dismissed"])
      .withMessage("Invalid status"),
    body("adminNotes").optional().trim().isLength({ max: 500 }),
  ],
  validateRequest,
  asyncHandler(updateReportStatus)
);

export default router;
