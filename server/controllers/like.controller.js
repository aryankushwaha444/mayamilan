import mongoose from "mongoose";
import User from "../models/User.js";
import Like from "../models/Like.js";
import Match from "../models/Match.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Notification from "../models/Notification.js";
import { getIO } from "../sockets/socket.js";
import { sendPushIfOffline, sendPush } from "../utils/push.js";
import { logAudit } from "../utils/auditLogger.js";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const DAILY_LIKE_LIMIT = 100;
const LIKES_PER_PAGE = 20;

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const safeLogAudit = async (req, action, metadata) => {
  try {
    await logAudit(req, action, metadata);
  } catch {
    // Silent failure
  }
};

const checkBlocked = async (userId1, userId2) => {
  const [user1, user2] = await Promise.all([
    User.findById(userId1).select("blockedUsers").lean(),
    User.findById(userId2).select("blockedUsers").lean(),
  ]);

  const user1Blocked = (user1?.blockedUsers || []).some(
    (id) => id.toString() === userId2.toString()
  );
  const user2Blocked = (user2?.blockedUsers || []).some(
    (id) => id.toString() === userId1.toString()
  );

  return user1Blocked || user2Blocked;
};

const createMatchConversation = async (match, userId1, userId2) => {
  try {
    const existing = await Conversation.findOne({
      participants: { $all: [userId1, userId2], $size: 2 },
    });

    if (existing) {
      // ✅ BUG FIX (regression from the unmatch archive): a re-match reuses the
      // archived conversation (isActive=false, hiddenBy=[both]). Revive it HERE so
      // the left list / navbar dropdown / unread badge (all isActive-aware) show it
      // at once on re-match — not only after someone opens the right panel. Callers
      // already block-checked; participants are the two like-users, so this is safe.
      const u1 = userId1.toString();
      const u2 = userId2.toString();
      let revived = false;
      if (existing.isActive !== true) {
        existing.isActive = true;
        revived = true;
      }
      if (
        !existing.match ||
        existing.match.toString() !== match._id.toString()
      ) {
        existing.match = match._id;
        revived = true;
      }
      if (
        Array.isArray(existing.hiddenBy) &&
        existing.hiddenBy.some(
          (id) => id.toString() === u1 || id.toString() === u2
        )
      ) {
        existing.hiddenBy = existing.hiddenBy.filter(
          (id) => id.toString() !== u1 && id.toString() !== u2
        );
        revived = true;
      }
      if (revived) await existing.save();
      return existing; // no duplicate system "You matched!" message on re-match
    }

    const conversation = await Conversation.create({
      participants: [userId1, userId2],
      match: match._id,
      lastMessageAt: new Date(),
    });

    await Message.create({
      conversation: conversation._id,
      sender: userId1,
      receiver: userId2,
      type: "system",
      text: "You matched! Say hello 👋",
      isSystem: true,
    });

    return conversation;
  } catch (error) {
    console.error("Create match conversation error:", error.message);
    return null;
  }
};

// ═══════════════════════════════════════════
// LIKE USER (✅ FIXED: Removed Transactions)
// ═══════════════════════════════════════════

export const likeUser = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const targetUserId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    if (currentUserId.toString() === targetUserId.toString()) {
      return res
        .status(400)
        .json({ success: false, message: "You cannot like yourself" });
    }

    // STEP 1: Validate target user and check blocks
    const [targetUser, isBlocked, dailyLikeCount] = await Promise.all([
      User.findOne({ _id: targetUserId, isActive: true, deletedAt: null })
        .select("name isOnline")
        .lean(),
      checkBlocked(currentUserId, targetUserId),
      Like.countDocuments({
        from: currentUserId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);

    if (!targetUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found or inactive" });
    }

    if (isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Cannot interact with this user",
        blocked: true,
      });
    }

    if (dailyLikeCount >= DAILY_LIKE_LIMIT) {
      return res.status(429).json({
        success: false,
        message: `Daily like limit reached (${DAILY_LIKE_LIMIT}). Try again tomorrow.`,
        limitReached: true,
        limit: DAILY_LIKE_LIMIT,
        used: dailyLikeCount,
      });
    }

    // STEP 2: Check if already liked
    const existingLike = await Like.findOne({
      from: currentUserId,
      to: targetUserId,
    }).lean();

    if (existingLike) {
      return res.status(400).json({
        success: false,
        message: "You already liked this user",
        alreadyLiked: true,
      });
    }

    // STEP 3: Create Like (No transaction needed)
    let like = await Like.create({ from: currentUserId, to: targetUserId });

    // Create notification
    await Notification.create({
      recipient: targetUserId,
      sender: currentUserId,
      type: "like",
      message: "liked your profile",
      isRead: false,
    });

    // Check for mutual like
    const mutualLike = await Like.findOne({
      from: targetUserId,
      to: currentUserId,
    }).lean();

    let match = null;
    let newMatch = false;
    let conversation = null;

    if (mutualLike) {
      const userIds = [currentUserId, targetUserId].sort((a, b) =>
        a.toString().localeCompare(b.toString())
      );
      const pairKey = `${userIds[0].toString()}_${userIds[1].toString()}`;

      // Check if an active match already exists
      let existingMatch = await Match.findOne({
        pairKey,
        isActive: true,
      }).lean();

      if (!existingMatch) {
        // Create or reactivate match atomically using upsert
        match = await Match.findOneAndUpdate(
          { pairKey },
          {
            $set: {
              users: userIds,
              matchedAt: new Date(),
              isActive: true,
              unmatchedAt: null,
              unmatchedBy: null,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        newMatch = true;

        conversation = await createMatchConversation(
          match,
          currentUserId,
          targetUserId
        );

        // Create match notifications
        await Notification.insertMany([
          {
            recipient: currentUserId,
            sender: targetUserId,
            type: "match",
            message: "You matched!",
            isRead: false,
          },
          {
            recipient: targetUserId,
            sender: currentUserId,
            type: "match",
            message: "You matched!",
            isRead: false,
          },
        ]);
      } else {
        match = existingMatch;
      }
    }

    // Emit socket events (outside transaction)
    const io = getIO();
    if (io) {
      io.to(`user:${targetUserId}`).emit("new_notification", {
        type: "like",
        senderId: currentUserId,
      });

      if (newMatch && match) {
        io.to(`user:${currentUserId}`).emit("new_match", {
          matchId: match._id,
          conversationId: conversation?._id,
        });
        io.to(`user:${targetUserId}`).emit("new_match", {
          matchId: match._id,
          conversationId: conversation?._id,
        });
      }
    }

    // Send push notifications
    const liker = await User.findById(currentUserId).select("name").lean();
    sendPushIfOffline(targetUserId, {
      title: `${liker?.name || "Someone"} liked you ❤️`,
      body: "Tap to view their profile",
      url: `/users/${currentUserId}`,
    });

    if (newMatch && match) {
      const me = await User.findById(currentUserId).select("name").lean();
      const them = targetUser;

      sendPush(currentUserId, {
        title: "It's a Match! 💕",
        body: `You and ${them?.name || "someone"} liked each other`,
        url: `/messages?matchId=${match._id}`,
      });

      sendPush(targetUserId, {
        title: "It's a Match! 💕",
        body: `You and ${me?.name || "someone"} liked each other`,
        url: `/messages?matchId=${match._id}`,
      });
    }

    // Audit logging
    await safeLogAudit(req, "user_liked", {
      targetUserId,
      matched: newMatch,
      matchId: match?._id,
    });

    if (match) {
      await match.populate(
        "users",
        "name dateOfBirth gender photos location occupation"
      );
    }

    return res.status(201).json({
      success: true,
      liked: true,
      matched: !!match,
      newMatch,
      message: newMatch
        ? "It's a match!"
        : match
        ? "You are already matched!"
        : "Like sent successfully",
      likeId: like._id,
      matchId: match?._id,
      match,
      likesRemaining: DAILY_LIKE_LIMIT - dailyLikeCount - 1,
    });
  } catch (error) {
    console.error("❌ Like User Error:", error);
    next(error);
  }
};

// ═══════════════════════════════════════════
// UNLIKE USER (✅ FIXED: Removed Transactions)
// ═══════════════════════════════════════════

export const unlikeUser = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const targetUserId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const deletedLike = await Like.findOneAndDelete({
      from: currentUserId,
      to: targetUserId,
    });

    if (!deletedLike) {
      return res
        .status(404)
        .json({ success: false, message: "Like not found" });
    }

    let match = null;
    let unmatched = false;

    const userIds = [currentUserId, targetUserId].sort((a, b) =>
      a.toString().localeCompare(b.toString())
    );
    const pairKey = `${userIds[0].toString()}_${userIds[1].toString()}`;

    match = await Match.findOne({ pairKey, isActive: true });

    if (match) {
      match.isActive = false;
      match.unmatchedAt = new Date();
      match.unmatchedBy = currentUserId;
      await match.save();

      unmatched = true;

      await Notification.deleteOne({
        recipient: targetUserId,
        sender: currentUserId,
        type: "like",
      });
    }

    // Emit socket events
    if (unmatched && match) {
      const io = getIO();
      if (io) {
        io.to(`user:${currentUserId}`).emit("match_removed", {
          matchId: match._id,
          unmatchedBy: currentUserId,
        });
        io.to(`user:${targetUserId}`).emit("match_removed", {
          matchId: match._id,
          unmatchedBy: currentUserId,
        });
      }
    }

    // Audit logging
    await safeLogAudit(req, "user_unliked", {
      targetUserId,
      unmatched,
    });

    return res.status(200).json({
      success: true,
      liked: false,
      unmatched,
      message: unmatched
        ? "Like removed and match removed"
        : "Like removed successfully",
    });
  } catch (error) {
    console.error("❌ Unlike User Error:", error);
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET SENT LIKES
// ═══════════════════════════════════════════

export const getSentLikes = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || LIKES_PER_PAGE, 50);
    const skip = (page - 1) * limit;

    const [likes, total] = await Promise.all([
      Like.find({ from: req.user._id })
        .populate("to", "name dateOfBirth gender photos location occupation")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Like.countDocuments({ from: req.user._id }),
    ]);

    const validLikes = likes.filter((like) => like.to !== null);

    res.status(200).json({
      success: true,
      count: validLikes.length,
      likes: validLikes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET RECEIVED LIKES
// ═══════════════════════════════════════════

export const getReceivedLikes = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || LIKES_PER_PAGE, 50);
    const skip = (page - 1) * limit;

    const [likes, total] = await Promise.all([
      Like.find({ to: req.user._id })
        .populate("from", "name dateOfBirth gender photos location occupation")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Like.countDocuments({ to: req.user._id }),
    ]);

    const validLikes = likes.filter((like) => like.from !== null);

    res.status(200).json({
      success: true,
      count: validLikes.length,
      likes: validLikes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    });
  } catch (error) {
    next(error);
  }
};
