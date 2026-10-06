import express from "express";
import { param, body } from "express-validator";

import {
  getMyProfile,
  updateMyProfile,
  getUserProfile,
  uploadProfilePhoto,
  deleteProfilePhoto,
  setPrimaryPhoto,
  reorderPhotos, // ✅ ADDED
  reportUser,
  toggleBlock,
  getBlockStatus,
  getBlockedUsers,
  searchBlockableUsers,
} from "../controllers/user.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import { validateRequest } from "../middleware/validateRequest.js"; // ✅ ADDED
import upload from "../middleware/upload.middleware.js";
// NOTE: verifySignature import REMOVED. The request-signing layer is structurally
// non-functional (per-session key wiring never restored), so it only 401'd these
// routes (availability hole) while adding zero real protection. The genuine controls
// below (protect + per-user limiter + param validation + owner-scoped controller)
// remain. Same fix already applied to the message routes.
import { jsonLimit } from "../middleware/bodyLimit.js";

import {
  uploadLimiter,
  reportLimiter,
  blockLimiter,
  profileUpdateLimiter,
  profileViewLimiter,
} from "../middleware/rateLimits.js";

const router = express.Router();

// ═══════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════

const validateObjectId = (paramName) =>
  param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName} format`)
    .trim();

// publicId is a Cloudinary string (NOT an ObjectId): type + trimmed + non-empty +
// bounded length (1..200, matching SAFE_PUBLICID_RE in the message controller) so a
// hostile param can't be arbitrarily long. Ownership is enforced in the controller
// (the photo must belong to req.user), so this is purely input hygiene.
const validatePublicId = (paramName) =>
  param(paramName)
    .isString()
    .trim()
    .notEmpty()
    .withMessage(`Invalid ${paramName}`)
    .isLength({ max: 200 })
    .withMessage(`${paramName} too long`);

// ========================================
// CURRENT USER (Profile Management)
// ========================================

// ✅ FIX: Removed `cached`. /me returns private user data and must never be cached globally.
router.get("/me", protect, getMyProfile);

router.put(
  "/me",
  protect,
  profileUpdateLimiter,
  jsonLimit("10kb"),
  updateMyProfile
);

// ========================================
// PHOTO OPERATIONS
// ========================================

router.post(
  "/me/photos",
  protect,
  uploadLimiter,
  upload.single("photo"),
  uploadProfilePhoto
);

// ✅ ADDED: Reorder photos route (Must be defined BEFORE /:publicId to prevent shadowing)
// ✅ PREVENTION: per-user limiter on this mutation (had none).
router.put(
  "/me/photos/reorder",
  protect,
  profileUpdateLimiter,
  jsonLimit("2kb"),
  [
    body("publicIds")
      .isArray({ min: 1, max: 6 })
      .withMessage("publicIds must be an array of 1-6 items"),
    body("publicIds.*").isString().trim().notEmpty().isLength({ max: 200 }),
  ],
  validateRequest,
  reorderPhotos
);

// ✅ FIX: Changed :photoId to :publicId to match schema and controller changes
// ✅ BUG FIX: removed dead verifySignature (was 401-ing every delete).
// ✅ PREVENTION: per-user limiter (had none) + bounded publicId param.
router.delete(
  "/me/photos/:publicId",
  protect,
  profileUpdateLimiter,
  jsonLimit("100b"),
  [validatePublicId("publicId")],
  validateRequest,
  deleteProfilePhoto
);

// ✅ BUG FIX: removed dead verifySignature (was 401-ing every set-primary).
// ✅ PREVENTION: per-user limiter (had none) + bounded publicId param.
router.put(
  "/me/photos/:publicId/primary",
  protect,
  profileUpdateLimiter,
  jsonLimit("100b"),
  [validatePublicId("publicId")],
  validateRequest,
  setPrimaryPhoto
);

// ========================================
// BLOCKED USERS (must be before /:userId)
// ========================================

router.get("/blocked", protect, getBlockedUsers);
router.get("/search/blockable", protect, searchBlockableUsers);

// ========================================
// OTHER USER (Profile Viewing & Actions)
// ========================================

// ✅ FIX: Removed `cached`. Profile views contain user-specific states (isLiked, isMatched).
router.get(
  "/:userId",
  protect,
  profileViewLimiter,
  [validateObjectId("userId")],
  validateRequest,
  getUserProfile
);

router.post(
  "/:userId/report",
  protect,
  reportLimiter,
  jsonLimit("2kb"),
  [
    validateObjectId("userId"),
    body("message")
      .isString()
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage("Report message required (max 1000 chars)"),
    body("reason").optional().isString().trim(),
  ],
  validateRequest,
  reportUser
);

router.post(
  "/:userId/block",
  protect,
  blockLimiter,
  jsonLimit("100b"),
  [validateObjectId("userId")],
  validateRequest,
  toggleBlock
);

router.get(
  "/:userId/block-status",
  protect,
  [validateObjectId("userId")],
  validateRequest,
  getBlockStatus
);

export default router;
