import express from "express";
import { cached } from "../utils/cache.js";
import { jsonLimit } from "../middleware/bodyLimit.js";

import {
  createOrGetConversation,
  getConversations,
  getMessages,
  sendMessage,
  markMessageAsRead,
  markMessageAsDelivered,
  getUnreadMessageCount,
  getRecentConversations,
  uploadMemory,
  uploadChatAttachment,
  reactToMessage,
  deleteMessage,
  deleteConversation,
} from "../controllers/message.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import { verifySignature } from "../middleware/verifySignature.js"; // ✅ ADDED
import upload from "../middleware/upload.middleware.js"; // ✅ ADDED for multer
import {
  messageLimiter,
  uploadLimiter,
  reactionLimiter, // ✅ ADDED from your rateLimits.js
} from "../middleware/rateLimits.js";

const router = express.Router();

// ========================================
// UPLOAD ROUTES (MUST BE FIRST — specific paths)
// ========================================

// ✅ FIXED: Separate routes, proper multer, removed jsonLimit (uses multipart)
router.post(
  "/upload/memory",
  protect,
  uploadLimiter,
  upload.single("memory"), // Multer handles file size (10MB)
  uploadMemory
);

router.post(
  "/upload/attachment",
  protect,
  uploadLimiter,
  upload.single("attachment"), // Multer handles file size
  uploadChatAttachment
);

// ========================================
// CONVERSATIONS
// ========================================

router.post(
  "/conversations/:matchId",
  protect,
  jsonLimit("500b"), // ✅ ADDED — minimal body (just matchId in URL)
  createOrGetConversation
);

router.get("/conversations", protect, getConversations);

router.delete(
  "/conversations/:conversationId",
  protect,
  jsonLimit("100b"), // ✅ ADDED — no body expected
  verifySignature, // ✅ ADDED — destructive action, prevent tampering
  deleteConversation
);

// ========================================
// NAVBAR HELPERS (cached)
// ========================================

router.get(
  "/unread-count",
  protect,
  cached("unread", 60),
  getUnreadMessageCount
);

router.get("/recent", protect, cached("recent", 60), getRecentConversations);

// ========================================
// MESSAGES (parameterized routes LAST)
// ========================================

router.get("/:conversationId", protect, getMessages);

router.post(
  "/:conversationId",
  protect,
  messageLimiter,
  jsonLimit("5kb"), // ✅ ADDED — message content (matches text limit)
  sendMessage
);

router.patch(
  "/:messageId/delivered",
  protect,
  jsonLimit("100b"), // ✅ ADDED — no body expected
  markMessageAsDelivered
);

router.patch(
  "/:messageId/read",
  protect,
  jsonLimit("100b"), // ✅ ADDED — no body expected
  markMessageAsRead
);

router.post(
  "/:messageId/react",
  protect,
  reactionLimiter, // ✅ ADDED — prevent reaction spam
  jsonLimit("500b"), // ✅ ADDED — emoji reaction is small
  reactToMessage
);

router.delete(
  "/:messageId",
  protect,
  jsonLimit("100b"), // ✅ ADDED — no body expected
  verifySignature, // ✅ ADDED — destructive action
  deleteMessage
);

export default router;
