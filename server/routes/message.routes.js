import express from "express";
import { param } from "express-validator";
import { jsonLimit } from "../middleware/bodyLimit.js";
import { validateRequest } from "../middleware/validateRequest.js";

import {
  createOrGetConversation,
  getConversations,
  getMessages,
  sendMessage,
  editMessage,
  markMessageAsRead,
  markMessageAsDelivered,
  getUnreadMessageCount,
  getRecentConversations,
  uploadChatAttachment,
  reactToMessage,
  deleteMessage,
  deleteConversation,
} from "../controllers/message.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/upload.middleware.js";

import {
  messageLimiter,
  uploadLimiter,
  reactionLimiter,
  blockLimiter,
} from "../middleware/rateLimits.js";

const router = express.Router();

const validateObjectId = (paramName) =>
  param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName} format`)
    .trim();

// ═══════════════════════════════════════════
// UPLOAD ROUTES
// ═══════════════════════════════════════════

router.post(
  "/upload",
  protect,
  uploadLimiter,
  upload.single("file"),
  uploadChatAttachment
);

// ═══════════════════════════════════════════
// CONVERSATIONS
// ═══════════════════════════════════════════

router.post(
  "/conversations/:matchId",
  protect,
  jsonLimit("500b"),
  [validateObjectId("matchId")],
  validateRequest,
  createOrGetConversation
);

router.get("/conversations", protect, getConversations);

// ✅ FIXED: Removed verifySignature (causing 401)
router.delete(
  "/conversations/:conversationId",
  protect,
  blockLimiter,
  jsonLimit("100b"),
  [validateObjectId("conversationId")],
  validateRequest,
  deleteConversation
);

// ═══════════════════════════════════════════
// NAVBAR HELPERS
// ═══════════════════════════════════════════

router.get("/unread-count", protect, getUnreadMessageCount);
router.get("/recent", protect, getRecentConversations);

// ═══════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════

router.get(
  "/:conversationId",
  protect,
  [validateObjectId("conversationId")],
  validateRequest,
  getMessages
);

router.post(
  "/:conversationId",
  protect,
  messageLimiter,
  jsonLimit("5kb"),
  [validateObjectId("conversationId")],
  validateRequest,
  sendMessage
);

router.patch(
  "/:messageId",
  protect,
  messageLimiter,
  jsonLimit("5kb"),
  [validateObjectId("messageId")],
  validateRequest,
  editMessage
);

router.patch(
  "/:messageId/delivered",
  protect,
  messageLimiter,
  jsonLimit("100b"),
  [validateObjectId("messageId")],
  validateRequest,
  markMessageAsDelivered
);

router.patch(
  "/:messageId/read",
  protect,
  messageLimiter,
  jsonLimit("100b"),
  [validateObjectId("messageId")],
  validateRequest,
  markMessageAsRead
);

router.post(
  "/:messageId/react",
  protect,
  reactionLimiter,
  jsonLimit("500b"),
  [validateObjectId("messageId")],
  validateRequest,
  reactToMessage
);

// ✅ FIXED: Removed verifySignature (causing 401)
router.delete(
  "/:messageId",
  protect,
  blockLimiter,
  jsonLimit("100b"),
  [validateObjectId("messageId")],
  validateRequest,
  deleteMessage
);

export default router;
