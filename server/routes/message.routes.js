import express from "express";

import {
  createOrGetConversation,
  getConversations,
  getMessages,
  sendMessage,
  markMessageAsRead,
} from "../controllers/message.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

/*
 * ==========================================
 * CONVERSATIONS
 * ==========================================
 */

// Create or get conversation from match
router.post("/conversations/:matchId", protect, createOrGetConversation);

// Get all conversations
router.get("/conversations", protect, getConversations);

/*
 * ==========================================
 * MESSAGES
 * ==========================================
 */

// Get messages
router.get("/:conversationId", protect, getMessages);

// Send message
router.post("/:conversationId", protect, sendMessage);

// Mark message as read
router.patch("/:messageId/read", protect, markMessageAsRead);

export default router;
