import mongoose from "mongoose";
import Match from "../models/Match.js";
import Like from "../models/Like.js";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";
import { getIO } from "../sockets/socket.js";
import redis from "../utils/cache.js";
import { logAudit } from "../utils/auditLogger.js";
import { runAtomic } from "../utils/transaction.js"; // ✅ transaction-optional cascade

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const MATCHES_PER_PAGE = 20;
const MAX_MATCHES_LIMIT = 50;

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

/**
 * ✅ FIXED: Use SCAN instead of KEYS to prevent Redis blocking
 */
const invalidateUserCache = async (userId, prefixes = []) => {
  if (!redis) return;
  try {
    const pipeline = redis.pipeline();

    for (const prefix of prefixes) {
      const pattern = `cache:${prefix}:${userId}:*`;

      // Use SCAN instead of KEYS for production safety
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          pipeline.del(...keys);
        }
      } while (cursor !== "0");
    }

    await pipeline.exec();
  } catch {
    // Cache invalidation failure is non-critical
  }
};

/**
 * Get last message preview for a list of matches
 */
const getLastMessagePreviews = async (matchIds, currentUserId) => {
  if (matchIds.length === 0) return new Map();

  const conversations = await Conversation.find({
    match: { $in: matchIds },
  })
    .populate({
      path: "lastMessage",
      select: "text type createdAt sender isRead",
    })
    .lean();

  const previewMap = new Map();
  const userIdStr = currentUserId.toString();

  conversations.forEach((conv) => {
    if (!conv.match) return;
    const matchId = conv.match.toString();
    const msg = conv.lastMessage;

    let unread = 0;
    if (conv.unreadCount) {
      if (conv.unreadCount instanceof Map) {
        unread = conv.unreadCount.get(userIdStr) || 0;
      } else {
        unread = conv.unreadCount[userIdStr] || 0;
      }
    }

    previewMap.set(matchId, {
      conversationId: conv._id,
      lastMessage: msg
        ? {
            text: msg.type === "system" ? "🎉 You matched!" : msg.text,
            type: msg.type,
            createdAt: msg.createdAt,
            isMine: msg.sender?.toString() === userIdStr,
            isRead: msg.isRead,
          }
        : null,
      unreadCount: unread,
    });
  });

  return previewMap;
};

/**
 * Format match for API response
 */
const formatMatch = (match, currentUserId, previewMap) => {
  const matchedUser = match.users.find(
    (u) => u._id.toString() !== currentUserId.toString()
  );

  if (!matchedUser) return null;

  const age = matchedUser.dateOfBirth
    ? Math.floor(
        (new Date() - new Date(matchedUser.dateOfBirth)) /
          (365.25 * 24 * 60 * 60 * 1000)
      )
    : null;

  const preview = previewMap.get(match._id.toString());

  return {
    _id: match._id,
    matchedAt: match.matchedAt,
    conversationId: preview?.conversationId || null,
    user: {
      _id: matchedUser._id,
      name: matchedUser.name,
      age,
      gender: matchedUser.gender,
      photos: matchedUser.photos || [],
      location: matchedUser.location,
      occupation: matchedUser.occupation,
      isVerified: matchedUser.isVerified || false,
      isOnline: matchedUser.isOnline || false,
      lastSeen: matchedUser.lastSeen,
    },
    lastMessage: preview?.lastMessage || null,
    unreadCount: preview?.unreadCount || 0,
  };
};

// ═══════════════════════════════════════════
// GET ALL MATCHES
// ═══════════════════════════════════════════

export const getMatches = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(
      parseInt(req.query.limit) || MATCHES_PER_PAGE,
      MAX_MATCHES_LIMIT
    );
    const skip = (page - 1) * limit;

    const [me, blockedMeDocs] = await Promise.all([
      User.findById(currentUserId).select("blockedUsers").lean(),
      User.find({ blockedUsers: currentUserId }).select("_id").lean(),
    ]);

    const iBlocked = (me?.blockedUsers || []).map((id) => id.toString());
    const blockedMe = blockedMeDocs.map((u) => u._id.toString());
    const excludedUserIds = [...new Set([...iBlocked, ...blockedMe])];

    const matchQuery = {
      isActive: { $ne: false },
    };

    if (excludedUserIds.length > 0) {
      matchQuery.users = {
        $all: [currentUserId],
        $nin: excludedUserIds,
      };
    } else {
      matchQuery.users = currentUserId;
    }

    const [matches, total] = await Promise.all([
      Match.find(matchQuery)
        .populate(
          "users",
          "_id name dateOfBirth gender photos location occupation isOnline lastSeen isVerified"
        )
        .sort({ matchedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Match.countDocuments(matchQuery),
    ]);

    const matchIds = matches.map((m) => m._id);
    const previewMap = await getLastMessagePreviews(matchIds, currentUserId);

    const formattedMatches = matches
      .map((m) => formatMatch(m, currentUserId, previewMap))
      .filter(Boolean);

    formattedMatches.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || a.matchedAt;
      const bTime = b.lastMessage?.createdAt || b.matchedAt;
      return new Date(bTime) - new Date(aTime);
    });

    res.status(200).json({
      success: true,
      count: formattedMatches.length,
      matches: formattedMatches,
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
// GET SINGLE MATCH
// ═══════════════════════════════════════════

export const getMatchById = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const { matchId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(matchId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid match ID" });
    }

    const match = await Match.findOne({
      _id: matchId,
      users: currentUserId,
      isActive: { $ne: false },
    })
      .populate(
        "users",
        "_id name dateOfBirth gender photos location occupation education bio interests isOnline lastSeen isVerified"
      )
      .lean();

    if (!match) {
      return res
        .status(404)
        .json({ success: false, message: "Match not found" });
    }

    const previewMap = await getLastMessagePreviews([match._id], currentUserId);
    const formatted = formatMatch(match, currentUserId, previewMap);

    if (!formatted) {
      return res.status(404).json({
        success: false,
        message: "Matched user not found or has been deleted",
      });
    }

    res.status(200).json({ success: true, match: formatted });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// UNMATCH (✅ transaction-optional: atomic on Atlas, sequential on standalone)
// ═══════════════════════════════════════════

export const deleteMatch = async (req, res, next) => {
  // NOTE: the outer `mongoose.startSession()` + `finally { session.endSession() }`
  // and the `session.withTransaction(...)` wrapper were REMOVED. runAtomic now owns
  // the session/transaction lifecycle: on a replica set it runs the body atomically;
  // on a standalone it runs the SAME body with session=null (no transaction issued),
  // which is why this no longer 500s with "Transaction numbers are only allowed on a
  // replica set member or mongos". The body below is unchanged except for that wrapper.
  try {
    const currentUserId = req.user._id;
    const { matchId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(matchId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid match ID" });
    }

    let match = null;
    let otherUserId = null;

    await runAtomic(
      async (session) => {
        match = await Match.findOne({
          _id: matchId,
          users: currentUserId, // 🔒 participant-only ownership (A can't nuke B's match)
        }).session(session);

        if (!match) {
          throw new Error("Match not found");
        }

        otherUserId = match.users.find(
          (userId) => userId.toString() !== currentUserId.toString()
        );

        if (!otherUserId) {
          throw new Error("Match data corrupted");
        }

        // 1. Soft delete the match
        await Match.updateOne(
          { _id: matchId },
          {
            $set: {
              isActive: false,
              unmatchedAt: new Date(),
              unmatchedBy: currentUserId,
            },
          },
          { session }
        );

        // 2. Delete both likes
        await Like.deleteMany({
          $or: [
            { from: currentUserId, to: otherUserId },
            { from: otherUserId, to: currentUserId },
          ],
        }).session(session);

        // 3. Archive the conversation
        await Conversation.updateOne(
          { match: matchId },
          {
            $set: {
              isActive: false,
              hiddenBy: [currentUserId, otherUserId],
            },
          },
          { session }
        );
      },
      { label: "unmatch" }
    );

    // 4. Emit real-time events (outside transaction) — scoped to the two participants only
    const io = getIO();
    if (io) {
      const payload = {
        matchId: match._id,
        userId: otherUserId.toString(),
        unmatchedBy: currentUserId.toString(),
      };
      io.to(`user:${currentUserId}`).emit("match_removed", payload);
      io.to(`user:${otherUserId}`).emit("match_removed", payload);
    }

    // 5. Invalidate caches for both users
    await Promise.all([
      invalidateUserCache(currentUserId, [
        "matches",
        "discover",
        "feed",
        "conversations",
      ]),
      invalidateUserCache(otherUserId, [
        "matches",
        "discover",
        "conversations",
      ]),
    ]);

    // ✅ Audit logging
    await safeLogAudit(req, "match_deleted", {
      matchId,
      otherUserId,
    });

    res.status(200).json({ success: true, message: "Unmatched successfully" });
  } catch (error) {
    if (error.message === "Match not found") {
      return res
        .status(404)
        .json({ success: false, message: "Match not found" });
    }
    if (error.message === "Match data corrupted") {
      return res
        .status(400)
        .json({ success: false, message: "Match data corrupted" });
    }
    next(error);
  }
};
