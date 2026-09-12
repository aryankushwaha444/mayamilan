import express from "express";
import { cached } from "../utils/cache.js";

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
} from "../controllers/message.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// UPLOAD MUST BE FIRST — otherwise "/upload" is treated as a conversationId!
router.post("/upload", protect, uploadMemory, uploadChatAttachment);

// Conversations
router.post("/conversations/:matchId", protect, createOrGetConversation);
router.get("/conversations", protect, getConversations);

// Navbar helpers
router.get("/unread-count", protect, cached("unread", 60), getUnreadMessageCount);
router.get("/recent", protect, cached("recent", 60),getRecentConversations);

// PARAMETERIZED ROUTES LAST
router.get("/:conversationId", protect, getMessages);
router.post("/:conversationId", protect, sendMessage);

router.patch("/:messageId/delivered", protect, markMessageAsDelivered);
router.patch("/:messageId/read", protect, markMessageAsRead);
router.post("/:messageId/react", protect, reactToMessage);
router.delete("/:messageId", protect, deleteMessage);

export default router;
