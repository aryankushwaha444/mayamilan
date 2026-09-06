import express from "express";

import {
  createOrGetConversation,
  getConversations,
  getMessages,
  sendMessage,
  markMessageAsRead,
  markMessageAsDelivered, // 👈 ADD THIS IMPORT
  getUnreadMessageCount,
  getRecentConversations,
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
 * SPECIFIC MESSAGE ROUTES (MUST BE ABOVE PARAMETERIZED ROUTES)
 * ==========================================
 */

// Get unread message count
router.get("/unread-count", protect, getUnreadMessageCount);

// Get recent conversations for navbar dropdown
router.get("/recent", protect, getRecentConversations);

/*
 * ==========================================
 * PARAMETERIZED MESSAGE ROUTES
 * ==========================================
 */

// Get messages for a specific conversation
router.get("/:conversationId", protect, getMessages);

// Send message to a specific conversation
router.post("/:conversationId", protect, sendMessage);

// Mark message as delivered
router.patch("/:messageId/delivered", protect, markMessageAsDelivered); // 👈 ADD THIS ROUTE

// Mark message as read
router.patch("/:messageId/read", protect, markMessageAsRead);

export default router;
