import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { cached } from "../utils/cache.js";
import Notification from "../models/Notification.js";
import Conversation from "../models/Conversation.js";
import Match from "../models/Match.js";

const router = express.Router();

router.get("/", protect, cached("bootstrap", 60), async (req, res) => {
  const uid = req.user._id;

  const [unreadNotifs, unreadChats, matchesCount, recentChats] =
    await Promise.all([
      Notification.countDocuments({ recipient: uid, isRead: false }),
      Conversation.countDocuments({
        participants: uid,
        "unreadCounts.userId": uid,
        "unreadCounts.count": { $gt: 0 },
      }),
      Match.countDocuments({ users: uid }),
      Conversation.find({ participants: uid })
        .sort({ lastMessageAt: -1 })
        .limit(5)
        .populate("participants", "name photos isOnline lastSeen")
        .populate("lastMessage")
        .lean(),
    ]);

  res.json({
    success: true,
    unreadNotifs,
    unreadChats,
    matchesCount,
    recentChats,
  });
});

export default router;
