import express from "express";

import {
  getMyProfile,
  updateMyProfile,
  getUserProfile,
  uploadProfilePhoto,
  deleteProfilePhoto,
  setPrimaryPhoto,
  reportUser,
  toggleBlock,
  getBlockStatus,
  getBlockedUsers,
  searchBlockableUsers,
} from "../controllers/user.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/upload.middleware.js";
import { cached } from "../utils/cache.js";
import { verifySignature } from "../middleware/verifySignature.js";
import { jsonLimit } from "../middleware/bodyLimit.js";

// ✅ Import rate limiters from existing file
import {
  uploadLimiter,
  reportLimiter,
  blockLimiter,
  profileUpdateLimiter,
  profileViewLimiter,
} from "../middleware/rateLimits.js";

const router = express.Router();

// ========================================
// CURRENT USER (Profile Management)
// ========================================

router.get("/me", protect, cached("my-profile", 120), getMyProfile);

// ✅ Profile update with body limit and rate limit
router.put(
  "/me",
  protect,
  profileUpdateLimiter, // ✅ 20 updates/hour
  jsonLimit("10kb"), // ✅ Bio + interests can be long
  updateMyProfile
);

// ========================================
// PHOTO OPERATIONS
// ========================================

// ✅ Photo upload: multer handles file size, rate limiter prevents spam
router.post(
  "/me/photos",
  protect,
  uploadLimiter, // ✅ 20 uploads/hour (from existing rateLimits.js)
  upload.single("photo"), // Multer enforces 10MB file limit
  uploadProfilePhoto
);

// ✅ Photo deletion with signature verification
router.delete(
  "/me/photos/:photoId",
  protect,
  jsonLimit("100b"), // ✅ No body expected
  verifySignature,
  deleteProfilePhoto
);

// ✅ Primary photo change with signature verification
router.put(
  "/me/photos/:photoId/primary",
  protect,
  jsonLimit("100b"), // ✅ No body expected
  verifySignature,
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

// ✅ Profile view with rate limit
router.get(
  "/:userId",
  protect,
  profileViewLimiter, // ✅ 100 views/15min (from existing rateLimits.js)
  cached("profile", 300),
  getUserProfile
);

// ✅ Report user with rate limit, body limit, and signature
router.post(
  "/:userId/report",
  protect,
  reportLimiter, // ✅ 10 reports/hour
  jsonLimit("2kb"), // ✅ Report message
  verifySignature,
  reportUser
);

// ✅ Block user with rate limit, body limit, and signature
router.post(
  "/:userId/block",
  protect,
  blockLimiter, // ✅ 30 block actions/hour
  jsonLimit("100b"), // ✅ No body expected
  verifySignature,
  toggleBlock
);

router.get("/:userId/block-status", protect, getBlockStatus);

export default router;
