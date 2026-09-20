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

const router = express.Router();

// ========================================
// CURRENT USER (Profile Management)
// ========================================

router.get("/me", protect, cached("my-profile", 120), getMyProfile);
router.put("/me", protect, updateMyProfile);

// Photo operations
router.post("/me/photos", protect, upload.single("photo"), uploadProfilePhoto);
// ✅ FIXED: Photo deletion now has signature verification
router.delete(
  "/me/photos/:photoId",
  protect,
  verifySignature, // ✅ Prevents unauthorized photo deletion
  deleteProfilePhoto
);
// ✅ FIXED: Primary photo change now has signature verification
router.put(
  "/me/photos/:photoId/primary",
  protect,
  verifySignature, // ✅ Prevents unauthorized primary photo changes
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

router.get("/:userId", protect, cached("profile", 300), getUserProfile);

// ✅ FIXED: User reporting now has signature verification
router.post(
  "/:userId/report",
  protect,
  verifySignature, // ✅ Prevents report tampering
  reportUser
);

router.post("/:userId/block", protect, verifySignature, toggleBlock);
router.get("/:userId/block-status", protect, getBlockStatus);

export default router;
