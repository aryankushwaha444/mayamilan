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

// ✅ Normalize ANY id (ObjectId instance OR route‑param string) to a real ObjectId ONCE.
// The old code mixed ObjectId + string inside `users` / `participants`, so Mongo's
// $all / equality never matched stored ObjectIds against a string (BSON types differ),
// which silently broke conversation dedupe/revive on re‑match.
const toOid = (id) => new mongoose.Types.ObjectId(id.toString());

const sortedPair = (a, b) =>
  [a, b].sort((x, y) => x.toString().localeCompare(y.toString()));

const pairKeyOf = (a, b) => {
  const [x, y] = sortedPair(a, b);
  return `${x.toString()}_${y.toString()}`;
};

const checkBlocked = async (userId1, userId2) => {
  const [user1, user2] = await Promise.all([
    User.findById(userId1).select("blockedUsers").lean(),
    User.findById(userId2).select("blockedUsers").lean(),
  ]);

  const u1 = userId1.toString();
  const u2 = userId2.toString();

  const user1Blocked = (user1?.blockedUsers || []).some(
    (id) => id.toString() === u2
  );
  const user2Blocked = (user2?.blockedUsers || []).some(
    (id) => id.toString() === u1
  );

  return user1Blocked || user2Blocked;
};

const createMatchConversation = async (match, userId1, userId2) => {
  try {
    // ✅ ObjectIds + sorted, so $all matches stored ObjectId arrays and a re‑match
    // reliably REVIVES the archived conversation instead of duplicating it.
    const a = toOid(userId1);
    const b = toOid(userId2);
    const participants = sortedPair(a, b);
    const p1 = participants[0].toString();
    const p2 = participants[1].toString();

    const existing = await Conversation.findOne({
      participants: { $all: participants, $size: 2 },
    });

    if (existing) {
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
          (id) => id.toString() === p1 || id.toString() === p2
        )
      ) {
        existing.hiddenBy = existing.hiddenBy.filter(
          (id) => id.toString() !== p1 && id.toString() !== p2
        );
        revived = true;
      }
      if (revived) await existing.save();
      return existing; // no duplicate system "You matched!" on re‑match
    }

    const conversation = await Conversation.create({
      participants,
      match: match._id,
      lastMessageAt: new Date(),
    });

    await Message.create({
      conversation: conversation._id,
      sender: participants[0],
      receiver: participants[1],
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
// LIKE USER  (✅ IDEMPOTENT + ALWAYS RECONCILES THE MATCH)
// ═══════════════════════════════════════════
//
// ROOT CAUSE FIX: the old handler returned 400 "already liked" BEFORE the mutual‑like
// / match block, so a stale duplicate like (the wall of 400s in your logs) could never
// trigger a match — only an unlike→like toggle reached the match code. Now a like is a
// no‑op‑safe UPSERT: if the like already exists we skip creation + the like notification
// + the daily‑limit charge, but we STILL run the mutual check and reconcile the match.
// Result: mutual likes match on the FIRST try, with or without stale rows, and WITHOUT
// depending on a transaction (correct on your standalone).
//
// PREVENTION: block/active/self enforced before ANY write; daily limit only charged on a
// genuinely new like (duplicates can't bypass or spam quota); match created/reactivated
// via the unique pairKey upsert (one row per pair, race‑safe); conversation deduped by
// normalized ObjectId participants; like/match notifications + pushes + sockets fire
// only on genuinely new events; match notifications deduped so a simultaneous mutual‑like
// can't double‑notify.

export const likeUser = async (req, res, next) => {
  try {
    const me = toOid(req.user._id);
    const them = toOid(req.params.userId);

    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    if (me.equals(them)) {
      return res
        .status(400)
        .json({ success: false, message: "You cannot like yourself" });
    }

    // STEP 1: Validate target + block + daily count (parallel)
    const [targetUser, isBlocked, dailyLikeCount] = await Promise.all([
      User.findOne({ _id: them, isActive: true, deletedAt: null })
        .select("name isOnline")
        .lean(),
      checkBlocked(me, them),
      Like.countDocuments({
        from: me,
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

    // STEP 2: Idempotent like — existing like is NOT an error, it just skips creation.
    let like = await Like.findOne({ from: me, to: them }).lean();
    let isNewLike = false;

    if (!like) {
      if (dailyLikeCount >= DAILY_LIKE_LIMIT) {
        return res.status(429).json({
          success: false,
          message: `Daily like limit reached (${DAILY_LIKE_LIMIT}). Try again tomorrow.`,
          limitReached: true,
          limit: DAILY_LIKE_LIMIT,
          used: dailyLikeCount,
        });
      }
      try {
        const created = await Like.create({ from: me, to: them });
        like = created;
        isNewLike = true;
      } catch (e) {
        if (e.code === 11000) {
          // Lost the create race to an identical like — treat as existing (no dup notif).
          like = await Like.findOne({ from: me, to: them }).lean();
          if (!like) throw e;
          isNewLike = false;
        } else {
          throw e;
        }
      }
    }

    // Like notification ONLY when this request actually created the like.
    if (isNewLike) {
      await Notification.create({
        recipient: them,
        sender: me,
        type: "like",
        message: "liked your profile",
        isRead: false,
      });
    }

    // STEP 3: ALWAYS reconcile the mutual match (this is the bug fix — it used to be
    // unreachable when the actor's like already existed).
    const mutualLike = await Like.findOne({ from: them, to: me }).lean();

    let match = null;
    let createdNewMatch = false;
    let matchNotified = false;
    let conversation = null;

    if (mutualLike) {
      const users = sortedPair(me, them);
      const pairKey = pairKeyOf(me, them);

      const active = await Match.findOne({ pairKey, isActive: true }).lean();

      if (!active) {
        // Create OR reactivate atomically via the unique pairKey index (no transaction).
        // $set repairs users/isActive on an inactive row; $setOnInsert keeps matchedAt
        // stable on re‑match (only set when truly inserted).
        match = await Match.findOneAndUpdate(
          { pairKey },
          {
            $set: {
              users,
              isActive: true,
              unmatchedAt: null,
              unmatchedBy: null,
            },
            $setOnInsert: { matchedAt: new Date() },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        createdNewMatch = true;
      } else {
        match = await Match.findById(active._id);
        if (!match) {
          // Rare race: active row vanished between the two queries — re‑upsert.
          match = await Match.findOneAndUpdate(
            { pairKey },
            {
              $set: {
                users,
                isActive: true,
                unmatchedAt: null,
                unmatchedBy: null,
              },
              $setOnInsert: { matchedAt: new Date() },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          createdNewMatch = true;
        }
      }

      // Ensure the conversation exists / is revived (idempotent; no dup system msg).
      conversation = await createMatchConversation(match, me, them);
      if (
        conversation &&
        (!match.conversation ||
          match.conversation.toString() !== conversation._id.toString())
      ) {
        await Match.updateOne(
          { _id: match._id },
          { $set: { conversation: conversation._id } }
        );
        match.conversation = conversation._id;
      }

      // Match notifications: only on a genuinely new match, and deduped so a simultaneous
      // mutual‑like (both handlers see "no active match") can't double‑notify.
      if (createdNewMatch) {
        const alreadyNotified = await Notification.exists({
          $or: [
            { recipient: me, sender: them, type: "match" },
            { recipient: them, sender: me, type: "match" },
          ],
        });
        if (!alreadyNotified) {
          await Notification.insertMany([
            {
              recipient: me,
              sender: them,
              type: "match",
              message: "You matched!",
              isRead: false,
            },
            {
              recipient: them,
              sender: me,
              type: "match",
              message: "You matched!",
              isRead: false,
            },
          ]);
          matchNotified = true;
        }
      }
    }

    // STEP 4: Sockets — payloads now carry the PEER id so the open feed flips correctly.
    const io = getIO();
    if (io) {
      if (isNewLike) {
        io.to(`user:${them}`).emit("new_notification", {
          type: "like",
          senderId: me.toString(),
        });
      }
      if (createdNewMatch && matchNotified && match) {
        io.to(`user:${me}`).emit("new_match", {
          matchId: match._id,
          conversationId: conversation?._id,
          matchedUserId: them.toString(), // ✅ Discover.jsx listens for this
        });
        io.to(`user:${them}`).emit("new_match", {
          matchId: match._id,
          conversationId: conversation?._id,
          matchedUserId: me.toString(), // ✅ the other side's feed flips too
        });
      }
    }

    // STEP 5: Pushes — like push only on new like; match push only on new notified match.
    if (isNewLike) {
      const liker = await User.findById(me).select("name").lean();
      sendPushIfOffline(them, {
        title: `${liker?.name || "Someone"} liked you ❤️`,
        body: "Tap to view their profile",
        url: `/users/${me}`,
      });
    }

    if (createdNewMatch && matchNotified && match) {
      const meDoc = await User.findById(me).select("name").lean();
      sendPush(me, {
        title: "It's a Match! 💕",
        body: `You and ${targetUser?.name || "someone"} liked each other`,
        url: `/messages?matchId=${match._id}`,
      });
      sendPush(them, {
        title: "It's a Match! 💕",
        body: `You and ${meDoc?.name || "someone"} liked each other`,
        url: `/messages?matchId=${match._id}`,
      });
    }

    await safeLogAudit(req, "user_liked", {
      targetUserId: them.toString(),
      isNewLike,
      matched: !!match,
      newMatch: createdNewMatch,
      matchId: match?._id,
    });

    if (match) {
      await match.populate(
        "users",
        "name dateOfBirth gender photos location occupation"
      );
    }

    const likesRemaining = isNewLike
      ? DAILY_LIKE_LIMIT - dailyLikeCount - 1
      : DAILY_LIKE_LIMIT - dailyLikeCount;

    return res.status(isNewLike ? 201 : 200).json({
      success: true,
      liked: true,
      alreadyLiked: !isNewLike, // ✅ structured, NOT a 400 — client can reconcile silently
      matched: !!match,
      newMatch: createdNewMatch,
      message: match
        ? createdNewMatch
          ? "It's a match!"
          : "You are already matched!"
        : isNewLike
        ? "Like sent successfully"
        : "Already liked",
      likeId: like._id,
      matchId: match?._id,
      match,
      likesRemaining,
    });
  } catch (error) {
    console.error("❌ Like User Error:", error);
    next(error);
  }
};

// ═══════════════════════════════════════════
// UNLIKE USER  (✅ symmetric match_removed payload + match‑notification cleanup)
// ═══════════════════════════════════════════

export const unlikeUser = async (req, res, next) => {
  try {
    const me = toOid(req.user._id);
    const them = toOid(req.params.userId);

    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const deletedLike = await Like.findOneAndDelete({ from: me, to: them });

    if (!deletedLike) {
      return res
        .status(404)
        .json({ success: false, message: "Like not found" });
    }

    let match = null;
    let unmatched = false;
    const pairKey = pairKeyOf(me, them);

    match = await Match.findOne({ pairKey, isActive: true });

    if (match) {
      match.isActive = false;
      match.unmatchedAt = new Date();
      match.unmatchedBy = me;
      await match.save();
      unmatched = true;
    }

    // Remove the like notification AND any match notifications so a future re‑match
    // is allowed to notify again (the old code left stale match rows that suppressed
    // re‑match pushes/sockets).
    await Notification.deleteMany({
      $or: [
        { recipient: them, sender: me, type: "like" },
        { recipient: me, sender: them, type: "match" },
        { recipient: them, sender: me, type: "match" },
      ],
    });

    if (unmatched && match) {
      const io = getIO();
      if (io) {
        // ✅ each room gets the PEER id, matching Discover.jsx's { userId } handler.
        io.to(`user:${me}`).emit("match_removed", {
          matchId: match._id,
          userId: them.toString(),
          unmatchedBy: me.toString(),
        });
        io.to(`user:${them}`).emit("match_removed", {
          matchId: match._id,
          userId: me.toString(),
          unmatchedBy: me.toString(),
        });
      }
    }

    await safeLogAudit(req, "user_unliked", {
      targetUserId: them.toString(),
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
// GET SENT LIKES  (unchanged — grace‑safe: a soft‑deleted counterpart still populates)
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
// GET RECEIVED LIKES  (unchanged — grace‑safe)
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
