import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import Notification from "../models/Notification.js";
import Conversation from "../models/Conversation.js";
import Match from "../models/Match.js";
import User from "../models/User.js";
import redis from "../utils/cache.js"; // Ensure this exports your Redis client instance

const router = express.Router();

router.get("/", protect, async (req, res) => {
  const uid = req.user._id;
  const uidStr = uid.toString();

  // ✅ FIX: User-specific cache key prevents data leaking between users
  const cacheKey = `cache:bootstrap:${uidStr}`;

  try {
    // 1. Check Redis cache first
    if (redis) {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return res.json(JSON.parse(cachedData));
      }
    }

    // 2. Fetch blocked users to filter out of recent chats
    const me = await User.findById(uid).select("blockedUsers").lean();
    const blockedIds = new Set(
      (me?.blockedUsers || []).map((id) => id.toString())
    );

    // Base query for active, non-hidden conversations
    const convQuery = {
      participants: uid,
      isActive: true,
      hiddenBy: { $ne: uid }, // ✅ Exclude "deleted for me" chats
    };

    const [unreadNotifs, activeConvs, matchesCount, recentChatsRaw] =
      await Promise.all([
        Notification.countDocuments({ recipient: uid, isRead: false }),
        // Fetch all active convs to calculate unread Map safely in memory
        Conversation.find(convQuery).select("unreadCount").lean(),
        // ✅ FIX: Only count active (non-unmatched) matches
        Match.countDocuments({ users: uid, isActive: true }),
        Conversation.find(convQuery)
          .sort({ lastMessageAt: -1 })
          .limit(10) // Fetch slightly more to account for filtering blocked users
          .populate("participants", "name photos isOnline lastSeen")
          .populate(
            "lastMessage",
            "text type createdAt sender isRead deletedForEveryone"
          )
          .lean(),
      ]);

    // ✅ FIX: Calculate unread chats in memory (safely handles Mongoose Map type)
    const unreadChats = activeConvs.filter((c) => {
      const count =
        c.unreadCount instanceof Map
          ? c.unreadCount.get(uidStr)
          : c.unreadCount?.[uidStr];
      return (count || 0) > 0;
    }).length;

    // Filter and format recent chats
    const recentChats = recentChatsRaw
      .filter((conv) => {
        const otherUser = conv.participants.find(
          (p) => p._id.toString() !== uidStr
        );
        if (!otherUser) return false;
        // ✅ Filter out blocked users
        if (blockedIds.has(otherUser._id.toString())) return false;
        return true;
      })
      .slice(0, 5) // Ensure we only return exactly 5 after filtering
      .map((conv) => {
        const otherUser = conv.participants.find(
          (p) => p._id.toString() !== uidStr
        );

        // ✅ Handle "Deleted for Everyone" last message
        let lastMessage = conv.lastMessage;
        if (lastMessage?.deletedForEveryone) {
          lastMessage = {
            ...lastMessage,
            text: "[Message deleted]",
            type: "text",
          };
        }

        // Get unread count for this specific conversation from the Map
        const unreadCount =
          conv.unreadCount instanceof Map
            ? conv.unreadCount.get(uidStr)
            : conv.unreadCount?.[uidStr];

        return {
          _id: conv._id,
          user: otherUser,
          lastMessage,
          lastMessageAt: conv.lastMessageAt,
          unreadCount: unreadCount || 0,
        };
      });

    const responseData = {
      success: true,
      unreadNotifs,
      unreadChats,
      matchesCount,
      recentChats,
    };

    // 3. Cache the response for 60 seconds (User-specific)
    if (redis) {
      await redis.set(cacheKey, JSON.stringify(responseData), "EX", 60);
    }

    res.json(responseData);
  } catch (error) {
    console.error("Bootstrap error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load dashboard data" });
  }
});

export default router;
