import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.js";

import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Match from "../models/Match.js";
import User from "../models/User.js";
import { getIO } from "../sockets/socket.js";
import { sendPushIfOffline } from "../utils/push.js";
import { sanitize } from "../utils/sanitize.js";
import { logAudit } from "../utils/auditLogger.js";
// ✅ single source of truth, call-FREE (clients can never POST type:"call").
// The old local `const ALLOWED_MESSAGE_TYPES = [...]` is REMOVED — keeping both
// was a fatal redeclaration (SyntaxError) that blocked server boot.
import { ALLOWED_MESSAGE_TYPES } from "../models/Message.js";
import {
  ALLOWED_MIME,
  MAX_FILE_SIZE,
} from "../middleware/upload.middleware.js";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const MEDIA_REQUIRED_TYPES = new Set(["image", "voice", "gif"]);
const ALLOWED_REACTION_EMOJIS = [
  "❤️",
  "😂",
  "😮",
  "😢",
  "🔥",
  "👍",
  "👎",
  "",
  "👏",
  "🤔",
];

const MAX_MESSAGE_LENGTH = 2000;
const MESSAGES_PER_PAGE = 50;
const MAX_MESSAGES_LIMIT = 100;
const EDIT_TIME_LIMIT_MS = 15 * 60 * 1000;
const MAX_VOICE_SECONDS = 300;
const MAX_DIMENSION = 10000;

const CLOUDINARY_FOLDER_PREFIX = "loveconnect/chat/";
const ALLOWED_MEDIA_HOSTS = [
  /^([a-z0-9-]+\.)*cloudinary\.com$/i,
  /^media\.giphy\.com$/i,
  /^i\.giphy\.com$/i,
  /^media-0\.giphy\.com$/i,
  /^media\d*\.tenor\.com$/i,
  /^([a-z0-9-]+\.)*tenor\.googleusercontent\.com$/i,
];
const SAFE_MIME_RE = /^[a-z0-9!#$&^_.+-]{1,100}\/[a-z0-9!#$&^_.+-]{1,100}$/;
const SAFE_PUBLICID_RE = /^[A-Za-z0-9_\-/]{1,200}$/;

// ═══════════════════════════════════════════
// URL HYGIENE  (decodes the &#x2F; corruption, never re-escapes)
// ═══════════════════════════════════════════
const decodeHtmlEntities = (s) =>
  typeof s !== "string"
    ? s
    : s
        .replace(/&#x2F;/gi, "/")
        .replace(/&#47;/g, "/")
        .replace(/&#x3D;/gi, "=")
        .replace(/&#61;/g, "=")
        .replace(/&#x26;/gi, "&")
        .replace(/&amp;/gi, "&")
        .replace(/&#x22;/gi, '"')
        .replace(/&quot;/gi, '"')
        .replace(/&#x27;/gi, "'")
        .replace(/&#39;/g, "'")
        .replace(/&#x3C;/gi, "<")
        .replace(/&lt;/gi, "<")
        .replace(/&#x3E;/gi, ">")
        .replace(/&gt;/gi, ">")
        .replace(/&#x60;/gi, "`");

const isAllowedHost = (h) => ALLOWED_MEDIA_HOSTS.some((re) => re.test(h));

const normalizeAttachmentUrl = (raw) => {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let parsed;
  try {
    parsed = new URL(decodeHtmlEntities(raw.trim()));
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null; // no javascript:/data:/file:
  if (!isAllowedHost(parsed.hostname)) return null; // anti-SSRF / anti-malware-host
  return parsed.href; // canonical, entity-free
};

const extractPublicIdFromCloudinaryUrl = (url) => {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const upIdx = parts.indexOf("upload");
    if (upIdx === -1) return null;
    let i = upIdx + 1;
    while (i < parts.length && !/^v\d+$/.test(parts[i])) i++; // skip transform folders
    if (i >= parts.length) return null;
    const rest = parts.slice(i + 1).join("/"); // public_id.ext
    if (!rest) return null;
    return rest.replace(/\.[a-z0-9]+$/i, "") || null;
  } catch {
    return null;
  }
};

const sanitizeMessageMedia = (msg) => {
  if (!msg || !msg.attachment || !msg.attachment.url) return msg;
  const clean = normalizeAttachmentUrl(msg.attachment.url);
  if (clean && clean !== msg.attachment.url)
    msg.attachment = { ...msg.attachment, url: clean };
  return msg;
};

// Pick ONLY known attachment fields; clamp numbers; neutralise publicId unless
// it is provably one of OUR chat assets (prevents cross-asset cloudinary.destroy).
const pickAttachment = (input, normalizedUrl) => {
  if (!input || typeof input !== "object") return null;
  const isCloudinary = /cloudinary\.com$/i.test(
    new URL(normalizedUrl).hostname
  );

  let publicId = null;
  if (isCloudinary) {
    const clientPid =
      typeof input.publicId === "string" ? input.publicId.trim() : "";
    const wellFormed =
      clientPid &&
      clientPid.startsWith(CLOUDINARY_FOLDER_PREFIX) &&
      !clientPid.includes("..") &&
      SAFE_PUBLICID_RE.test(clientPid);
    const derived = extractPublicIdFromCloudinaryUrl(normalizedUrl);
    // Trust client pid only when it matches the URL-derived id (or URL unparseable but pid well-formed & folder-scoped).
    if (wellFormed && (derived === null || derived === clientPid))
      publicId = clientPid;
  }

  const clampInt = (v, max) => {
    const n = Number(v);
    return Number.isFinite(n)
      ? Math.max(0, Math.min(max, Math.round(n)))
      : null;
  };
  const mimeType =
    typeof input.mimeType === "string" &&
    SAFE_MIME_RE.test(input.mimeType.toLowerCase())
      ? input.mimeType.toLowerCase()
      : null;
  const thumbnailUrl = input.thumbnailUrl
    ? normalizeAttachmentUrl(input.thumbnailUrl)
    : null;

  return {
    url: normalizedUrl,
    publicId, // null unless verified ours
    mimeType,
    width: clampInt(input.width, MAX_DIMENSION),
    height: clampInt(input.height, MAX_DIMENSION),
    duration: clampInt(input.duration, MAX_VOICE_SECONDS) ?? 0,
    size: clampInt(input.size, MAX_FILE_SIZE),
    thumbnailUrl,
  };
};

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════
const safeLogAudit = async (req, action, metadata = {}) => {
  try {
    const clean = {};
    for (const [k, v] of Object.entries(metadata))
      clean[k] = v === undefined ? null : v;
    await logAudit(req, action, clean);
  } catch {
    /* audit must never break a request */
  }
};

const emitToRoom = (room, event, payload) => {
  const io = getIO();
  if (io) io.to(room).emit(event, payload);
};
const isObjId = (v) => mongoose.Types.ObjectId.isValid(v);

const checkBlocked = async (a, b) => {
  const [u1, u2] = await Promise.all([
    User.findById(a).select("blockedUsers").lean(),
    User.findById(b).select("blockedUsers").lean(),
  ]);
  return (
    (u1?.blockedUsers || []).some((id) => id.toString() === b.toString()) ||
    (u2?.blockedUsers || []).some((id) => id.toString() === a.toString())
  );
};

const verifyMatch = async (a, b) =>
  (await Match.findOne({
    users: { $all: [a, b] },
    $or: [{ isActive: true }, { isActive: { $exists: false } }],
  })) !== null;

const getUnreadCountSafely = (c, id) =>
  !c.unreadCount
    ? 0
    : typeof c.unreadCount.get === "function"
    ? c.unreadCount.get(id) || 0
    : c.unreadCount[id] || 0;
const setUnreadCountSafely = (c, id, v) => {
  if (!c.unreadCount) c.unreadCount = new Map();
  typeof c.unreadCount.set === "function"
    ? c.unreadCount.set(id, v)
    : (c.unreadCount[id] = v);
};

const withTimeout = (factory, ms, fallback) => {
  let t;
  const to = new Promise((r) => (t = setTimeout(() => r(fallback), ms)));
  return Promise.race([
    Promise.resolve()
      .then(factory)
      .catch(() => fallback),
    to,
  ]).finally(() => clearTimeout(t));
};

const probeImageDimensions = (buffer) =>
  withTimeout(
    async () => {
      const { default: sharp } = await import("sharp");
      const m = await sharp(buffer, {
        failOnError: false,
        animated: false,
        limitInputPixels: 50_000_000,
      }).metadata();
      return { width: m.width ?? null, height: m.height ?? null };
    },
    2500,
    { width: null, height: null }
  );

const resolveAudioDuration = async (publicId, resultDuration) => {
  const r = Number(resultDuration);
  if (Number.isFinite(r) && r > 0) return Math.round(r);
  if (!publicId) return 0;
  const d = await withTimeout(
    async () => {
      const res = await cloudinary.api.resource(publicId, {
        resource_type: "video",
      });
      return Number(res?.duration);
    },
    4000,
    NaN
  );
  return Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
};

// ✅ call fields appended to every lastMessage projection so the SIDEBAR can
// render the correct audio/video icon + label + duration after a refresh
// (previously callType was stripped -> a video call showed as "Voice call").
const LAST_MESSAGE_SELECT =
  "_id sender receiver text isRead createdAt type attachment callType callStatus durationMs startedAt endedAt callId";

// ═══════════════════════════════════════════
// CONVERSATIONS
// ═══════════════════════════════════════════
export const createOrGetConversation = async (req, res, next) => {
  try {
    const me = req.user._id;
    const { matchId } = req.params;
    if (!isObjId(matchId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid match ID" });

    const match = await Match.findOne({
      _id: matchId,
      users: me,
      $or: [{ isActive: true }, { isActive: { $exists: false } }],
    });
    if (!match)
      return res
        .status(404)
        .json({ success: false, message: "Match not found" });

    const otherId = match.users.find((id) => id.toString() !== me.toString());
    if (!otherId)
      return res
        .status(400)
        .json({ success: false, message: "No other user in match" });
    if (await checkBlocked(me, otherId)) {
      await safeLogAudit(req, "conversation_blocked_attempt", { matchId });
      return res.status(403).json({
        success: false,
        message: "Cannot start conversation with this user",
      });
    }
    const other = await User.findById(otherId).select("isActive").lean();
    if (!other || !other.isActive)
      return res
        .status(404)
        .json({ success: false, message: "User is not available" });

    const participants = [me.toString(), otherId.toString()]
      .sort()
      .map((id) => new mongoose.Types.ObjectId(id));
    const key = participants.map((id) => id.toString()).join("_");

    let conv = await Conversation.findOne({ participantsKey: key });
    if (!conv)
      conv = await Conversation.findOne({
        participants: { $all: participants, $size: 2 },
      });
    if (conv && !conv.participantsKey) {
      conv.participantsKey = key;
      await conv.save();
    }
    if (!conv) {
      try {
        conv = await Conversation.create({
          participants,
          participantsKey: key,
          match: match._id,
        });
        await safeLogAudit(req, "conversation_created", {
          conversationId: conv._id,
        });
      } catch (e) {
        if (e.code === 11000)
          conv = await Conversation.findOne({ participantsKey: key });
        else throw e;
      }
    }

    // ✅ BUG FIX (regression from the unmatch archive): unmatch set this thread's
    // isActive=false (+ hiddenBy for both). The re-match / open path MUST revive
    // it, otherwise the three isActive-aware readers (getConversations = left list,
    // getRecentConversations = navbar Chats dropdown, getUnreadMessageCount = badge)
    // all hide it while the right panel (which ignores isActive) still opens it —
    // the exact asymmetry in your screenshots. Guarded: we only reach here after an
    // ACTIVE match + block + active-peer check above, so reviving is participant-safe.
    const meStr = me.toString();
    const otherStr = otherId.toString();
    let revived = false;
    if (conv.isActive !== true) {
      conv.isActive = true;
      revived = true;
    }
    if (!conv.match || conv.match.toString() !== match._id.toString()) {
      conv.match = match._id; // relink to the current (reused) match id
      revived = true;
    }
    if (
      Array.isArray(conv.hiddenBy) &&
      conv.hiddenBy.some(
        (id) => id.toString() === meStr || id.toString() === otherStr
      )
    ) {
      conv.hiddenBy = conv.hiddenBy.filter(
        (id) => id.toString() !== meStr && id.toString() !== otherStr
      );
      revived = true;
    }
    if (revived) await conv.save();

    conv = await Conversation.findById(conv._id)
      .populate("participants", "_id name photos isOnline lastSeen")
      .populate("lastMessage", LAST_MESSAGE_SELECT) // ✅ was missing call fields
      .lean();
    sanitizeMessageMedia(conv.lastMessage);

    res.status(200).json({
      success: true,
      conversation: {
        _id: conv._id,
        participants: conv.participants,
        lastMessage: conv.lastMessage || null,
        lastMessageAt: conv.lastMessageAt || conv.createdAt,
        createdAt: conv.createdAt,
        unreadCount: getUnreadCountSafely(conv, me.toString()),
      },
    });
  } catch (e) {
    next(e);
  }
};

export const getConversations = async (req, res, next) => {
  try {
    const me = req.user._id;
    const meStr = me.toString();
    const mine = await User.findById(me)
      .select("blockedUsers hiddenConversations")
      .lean();
    const blocked = new Set(
      (mine?.blockedUsers || []).map((i) => i.toString())
    );
    const hidden = new Set(
      (mine?.hiddenConversations || []).map((i) => i.toString())
    );

    const convs = await Conversation.find({
      participants: me,
      $or: [{ isActive: true }, { isActive: { $exists: false } }],
    })
      .populate(
        "participants",
        "_id name photos isOnline lastSeen blockedUsers"
      )
      .populate("lastMessage", LAST_MESSAGE_SELECT) // ✅ was missing call fields
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();

    const out = convs
      .filter((c) => !hidden.has(c._id.toString()))
      .map((c) => {
        const o = c.participants.find((u) => u._id.toString() !== meStr);
        if (!o) return null;
        if (
          blocked.has(o._id.toString()) ||
          (o.blockedUsers || []).some((i) => i.toString() === meStr)
        )
          return null;
        sanitizeMessageMedia(c.lastMessage);
        return {
          _id: c._id,
          lastMessage: c.lastMessage,
          lastMessageAt: c.lastMessageAt,
          unreadCount: getUnreadCountSafely(c, meStr),
          user: {
            _id: o._id,
            name: o.name,
            photos: o.photos,
            isOnline: o.isOnline,
            lastSeen: o.lastSeen,
          },
          createdAt: c.createdAt,
        };
      })
      .filter(Boolean);

    res
      .status(200)
      .json({ success: true, count: out.length, conversations: out });
  } catch (e) {
    next(e);
  }
};

export const getMessages = async (req, res, next) => {
  try {
    const me = req.user._id;
    const { conversationId } = req.params;
    if (!isObjId(conversationId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid conversation ID" });
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(
      parseInt(req.query.limit) || MESSAGES_PER_PAGE,
      MAX_MESSAGES_LIMIT
    );
    const skip = (page - 1) * limit;

    const conv = await Conversation.findOne({
      _id: conversationId,
      participants: me,
    });
    if (!conv)
      return res
        .status(404)
        .json({ success: false, message: "Conversation not found" });

    const [messages, total] = await Promise.all([
      Message.find({
        conversation: conversationId,
        deletedForEveryone: false,
        deletedFor: { $ne: me },
      })
        .populate("sender", "_id name photos")
        .populate("receiver", "_id name photos")
        .populate("reactions.user", "_id name")
        .populate({
          path: "post",
          select: "content images author",
          populate: { path: "author", select: "name photos" },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Message.countDocuments({
        conversation: conversationId,
        deletedForEveryone: false,
        deletedFor: { $ne: me },
      }),
    ]);
    messages.reverse();
    messages.forEach(sanitizeMessageMedia); // heal historically-corrupted URLs on read (no migration)

    res.status(200).json({
      success: true,
      messages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (e) {
    next(e);
  }
};

// ═══════════════════════════════════════════
// MESSAGE OPS (all ownership-bound)
// ═══════════════════════════════════════════
export const editMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { text } = req.body;
    const me = req.user._id;
    if (!isObjId(messageId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid message ID" });
    if (!text || typeof text !== "string" || !text.trim())
      return res
        .status(400)
        .json({ success: false, message: "Message text required" });
    const clean = sanitize(text);
    if (clean.length > MAX_MESSAGE_LENGTH)
      return res.status(400).json({
        success: false,
        message: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
      });

    const m = await Message.findById(messageId);
    if (!m)
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });
    if (m.sender.toString() !== me.toString()) {
      await safeLogAudit(req, "unauthorized_edit_attempt", { messageId });
      return res
        .status(403)
        .json({ success: false, message: "Only the sender can edit" });
    }
    if (m.type !== "text")
      return res
        .status(400)
        .json({ success: false, message: "Only text messages can be edited" });
    if (m.createdAt < new Date(Date.now() - EDIT_TIME_LIMIT_MS))
      return res.status(400).json({
        success: false,
        message: "Cannot edit messages older than 15 minutes",
      });

    m.text = clean;
    m.isEdited = true;
    m.editedAt = new Date();
    await m.save();
    await safeLogAudit(req, "message_edited", {
      messageId: m._id,
      conversationId: m.conversation,
    });

    const pm = await Message.findById(m._id)
      .populate("sender", "_id name photos")
      .populate("receiver", "_id name photos")
      .lean();
    sanitizeMessageMedia(pm);
    emitToRoom(`conversation:${m.conversation}`, "message_edited", {
      messageId: m._id.toString(),
      text: clean,
      editedAt: m.editedAt,
    });
    res.status(200).json({ success: true, message: pm });
  } catch (e) {
    next(e);
  }
};

export const reactToMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    if (!isObjId(messageId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid message ID" });
    if (
      !emoji ||
      typeof emoji !== "string" ||
      !ALLOWED_REACTION_EMOJIS.includes(emoji)
    )
      return res.status(400).json({ success: false, message: "Invalid emoji" });

    const m = await Message.findById(messageId);
    if (!m)
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });
    const uid = req.user._id.toString();
    if (m.sender.toString() !== uid && m.receiver.toString() !== uid) {
      await safeLogAudit(req, "unauthorized_reaction_attempt", { messageId });
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    const ex = m.reactions.find((r) => r.user.toString() === uid);
    if (ex) {
      if (ex.emoji === emoji)
        m.reactions = m.reactions.filter((r) => r.user.toString() !== uid);
      else ex.emoji = emoji;
    } else m.reactions.push({ user: req.user._id, emoji });
    await m.save();
    await safeLogAudit(req, "message_reacted", { messageId: m._id, emoji });

    const pm = await Message.findById(m._id)
      .populate("reactions.user", "_id name")
      .lean();
    emitToRoom(`conversation:${m.conversation}`, "message_reacted", {
      messageId: m._id.toString(),
      reactions: pm.reactions,
    });
    res.status(200).json({ success: true, reactions: pm.reactions });
  } catch (e) {
    next(e);
  }
};

export const deleteMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const scope = req.query.scope === "everyone" ? "everyone" : "me"; // coerce, never trust raw
    const me = req.user._id;
    if (!isObjId(messageId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid message ID" });

    const m = await Message.findById(messageId);
    if (!m)
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });
    const uid = me.toString();
    if (m.sender.toString() !== uid && m.receiver.toString() !== uid) {
      await safeLogAudit(req, "unauthorized_delete_attempt", {
        messageId,
        scope,
      });
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    if (scope === "everyone") {
      if (m.sender.toString() !== uid) {
        await safeLogAudit(req, "unauthorized_delete_everyone_attempt", {
          messageId,
        });
        return res.status(403).json({
          success: false,
          message: "Only sender can delete for everyone",
        });
      }
      const pid = m.attachment?.publicId; // server-stored, folder-scoped (see pickAttachment)
      m.deletedForEveryone = true;
      await m.save();
      if (pid) cloudinary.uploader.destroy(pid).catch(() => {});
      await safeLogAudit(req, "message_deleted", {
        messageId: m._id,
        conversationId: m.conversation,
        scope,
      });
      emitToRoom(`conversation:${m.conversation}`, "message_deleted", {
        messageId: m._id.toString(),
        scope: "everyone",
      });
    } else {
      if (!m.deletedFor.some((i) => i.toString() === uid))
        m.deletedFor.push(me);
      await m.save();
      await safeLogAudit(req, "message_deleted", {
        messageId: m._id,
        conversationId: m.conversation,
        scope,
      });
    }
    res.status(200).json({ success: true, message: "Message deleted" });
  } catch (e) {
    next(e);
  }
};

export const getUnreadMessageCount = async (req, res, next) => {
  try {
    const myId = req.user._id.toString();
    const mine = await User.findById(myId)
      .select("blockedUsers hiddenConversations")
      .lean();
    const blocked = new Set(
      (mine?.blockedUsers || []).map((i) => i.toString())
    );
    const hidden = new Set(
      (mine?.hiddenConversations || []).map((i) => i.toString())
    );
    const convs = await Conversation.find({
      participants: myId,
      isActive: { $ne: false },
      _id: { $nin: Array.from(hidden) },
    })
      .populate("participants", "_id blockedUsers")
      .select("unreadCount participants")
      .lean();
    let total = 0;
    for (const c of convs) {
      const o = c.participants.find((p) => p._id.toString() !== myId);
      if (!o) continue;
      if (
        !blocked.has(o._id.toString()) &&
        !(o.blockedUsers || []).some((i) => i.toString() === myId)
      )
        total += getUnreadCountSafely(c, myId);
    }
    res.status(200).json({ success: true, count: total });
  } catch (e) {
    next(e);
  }
};

export const markMessageAsDelivered = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const me = req.user._id;
    if (!isObjId(messageId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid message ID" });
    const m = await Message.findOne({ _id: messageId, receiver: me });
    if (!m)
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });
    if (!m.isDelivered) {
      m.isDelivered = true;
      m.deliveredAt = new Date();
      await m.save();
      emitToRoom(`user:${m.sender.toString()}`, "message_delivered", {
        messageId: m._id.toString(),
        conversationId: m.conversation.toString(),
      });
    }
    res.status(200).json({ success: true });
  } catch (e) {
    next(e);
  }
};

export const markMessageAsRead = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const me = req.user._id;
    const meStr = me.toString();
    if (!isObjId(messageId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid message ID" });
    const m = await Message.findOne({ _id: messageId, receiver: me }); // can only read inbound → no spoofing
    if (!m)
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });

    const bulk = await Message.updateMany(
      {
        conversation: m.conversation,
        receiver: me,
        createdAt: { $lte: m.createdAt },
        $or: [{ isRead: false }, { isDelivered: false }],
      },
      {
        $set: {
          isDelivered: true,
          deliveredAt: new Date(),
          isRead: true,
          readAt: new Date(),
        },
      }
    );
    if (bulk.modifiedCount > 0 || !m.isRead) {
      const conv = await Conversation.findById(m.conversation);
      if (conv) {
        setUnreadCountSafely(conv, meStr, 0);
        await conv.save();
      }
      const payload = {
        conversationId: m.conversation.toString(),
        readerId: meStr,
        readUpTo: m.createdAt,
        messageId: m._id.toString(),
      };
      emitToRoom(`user:${m.sender.toString()}`, "messages_read", payload);
      emitToRoom(
        `conversation:${m.conversation.toString()}`,
        "messages_read",
        payload
      );
      emitToRoom(`user:${meStr}`, "unread_updated", {
        conversationId: m.conversation.toString(),
      });
    }
    res.status(200).json({ success: true });
  } catch (e) {
    next(e);
  }
};

export const getRecentConversations = async (req, res, next) => {
  try {
    const me = req.user._id;
    const meStr = me.toString();
    const mine = await User.findById(me)
      .select("blockedUsers hiddenConversations")
      .lean();
    const blocked = new Set(
      (mine?.blockedUsers || []).map((i) => i.toString())
    );
    const hidden = new Set(
      (mine?.hiddenConversations || []).map((i) => i.toString())
    );
    const convs = await Conversation.find({
      participants: me,
      $or: [{ isActive: true }, { isActive: { $exists: false } }],
    })
      .populate(
        "participants",
        "_id name photos isOnline lastSeen blockedUsers"
      )
      .populate("lastMessage", LAST_MESSAGE_SELECT) // ✅ was missing call fields
      .sort({ lastMessageAt: -1 })
      .limit(5)
      .lean();
    const out = convs
      .filter((c) => !hidden.has(c._id.toString()))
      .map((c) => {
        const o = c.participants.find((p) => p._id.toString() !== meStr);
        if (!o) return null;
        if (
          blocked.has(o._id.toString()) ||
          (o.blockedUsers || []).some((i) => i.toString() === meStr)
        )
          return null;
        sanitizeMessageMedia(c.lastMessage);
        return {
          _id: c._id,
          user: o,
          lastMessage: c.lastMessage,
          lastMessageAt: c.lastMessageAt,
          unreadCount: getUnreadCountSafely(c, meStr),
        };
      })
      .filter(Boolean);
    res.status(200).json({ success: true, conversations: out });
  } catch (e) {
    next(e);
  }
};

export const hideConversation = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const me = req.user._id;
    const meStr = me.toString();
    if (!isObjId(conversationId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid conversation ID" });
    const conv = await Conversation.findOne({
      _id: conversationId,
      participants: me,
    });
    if (!conv)
      return res
        .status(404)
        .json({ success: false, message: "Conversation not found" });
    await User.updateOne(
      { _id: me },
      { $addToSet: { hiddenConversations: conversationId } }
    );
    if (!conv.hiddenBy?.some((i) => i.toString() === meStr)) {
      if (!conv.hiddenBy) conv.hiddenBy = [];
      conv.hiddenBy.push(me);
    }
    setUnreadCountSafely(conv, meStr, 0);
    await conv.save();
    await safeLogAudit(req, "conversation_hidden", { conversationId });
    emitToRoom(`user:${meStr}`, "conversation_hidden", {
      conversationId: conversationId.toString(),
    });
    res.status(200).json({ success: true, message: "Conversation hidden" });
  } catch (e) {
    next(e);
  }
};

// ═══════════════════════════════════════════
// UPLOAD  (magic-bytes already enforced in middleware)
// ═══════════════════════════════════════════
export const uploadChatAttachment = async (req, res, next) => {
  try {
    const me = req.user._id;
    const { conversationId } = req.body;
    if (!req.file)
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded", code: "NO_FILE" });
    if (!ALLOWED_MIME.has(req.file.mimetype))
      return res.status(415).json({
        success: false,
        message: "Unsupported file type",
        code: "INVALID_FILE_TYPE",
      });
    if (req.file.size > MAX_FILE_SIZE)
      return res.status(413).json({
        success: false,
        message: "File too large",
        code: "FILE_TOO_LARGE",
      });

    if (conversationId) {
      if (!isObjId(conversationId))
        return res
          .status(400)
          .json({ success: false, message: "Invalid conversation ID" });
      const conv = await Conversation.findOne({
        _id: conversationId,
        participants: me,
      });
      if (!conv) {
        await safeLogAudit(req, "unauthorized_upload_attempt", {
          conversationId,
        });
        return res
          .status(403)
          .json({ success: false, message: "Invalid conversation" });
      }
      const other = conv.participants.find(
        (p) => p.toString() !== me.toString()
      );
      if (!(await verifyMatch(me, other))) {
        await safeLogAudit(req, "unmatched_upload_attempt", { conversationId });
        return res.status(403).json({
          success: false,
          message: "You must be matched to upload files",
        });
      }
    }

    const isImage = req.file.mimetype.startsWith("image/");
    const isAudio = req.file.mimetype.startsWith("audio/");
    const isGif = req.file.mimetype === "image/gif";

    const result = await new Promise((resolve, reject) => {
      const opts = {
        resource_type: isImage ? "image" : "video",
        folder: "loveconnect/chat",
        ...(isGif && {
          transformation: [{ width: 800, height: 800, crop: "limit" }],
        }),
        ...(isImage &&
          !isGif && {
            transformation: [
              { width: 1600, height: 1600, crop: "limit" },
              { quality: "auto:good" },
              { fetch_format: "auto" },
            ],
          }),
        ...(isAudio && { format: "mp3" }),
      };
      const s = cloudinary.uploader.upload_stream(opts, (e, r) =>
        e ? reject(e) : resolve(r)
      );
      s.end(req.file.buffer);
    });

    let width = result.width ?? null,
      height = result.height ?? null;
    if (isImage && (width == null || height == null)) {
      const d = await probeImageDimensions(req.file.buffer);
      width = width ?? d.width;
      height = height ?? d.height;
    }
    const duration = isAudio
      ? await resolveAudioDuration(result.public_id, result.duration)
      : 0;
    const cleanUrl =
      normalizeAttachmentUrl(result.secure_url) || result.secure_url;

    await safeLogAudit(req, "attachment_uploaded", {
      conversationId: conversationId ?? null,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
    });
    res.status(200).json({
      success: true,
      attachment: {
        url: cleanUrl,
        publicId: result.public_id,
        mimeType: req.file.mimetype,
        width,
        height,
        duration,
        size: result.bytes,
      },
    });
  } catch (e) {
    next(e);
  }
};

// ═══════════════════════════════════════════
// SEND MESSAGE
// ═══════════════════════════════════════════
export const sendMessage = async (req, res, next) => {
  try {
    const me = req.user._id;
    const { conversationId } = req.params;
    const { text = "", type = "text", attachment = null } = req.body || {};

    if (!isObjId(conversationId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid conversation ID" });
    if (!ALLOWED_MESSAGE_TYPES.includes(type))
      // ✅ call-free list -> clients cannot forge type:"call"
      return res
        .status(400)
        .json({ success: false, message: "Invalid message type" });
    if (type === "text" && (typeof text !== "string" || !text.trim()))
      return res
        .status(400)
        .json({ success: false, message: "Message cannot be empty" });

    const cleanText = sanitize(typeof text === "string" ? text : "");
    if (cleanText.length > MAX_MESSAGE_LENGTH)
      return res.status(400).json({
        success: false,
        message: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
      });

    let finalAttachment = null;
    if (attachment != null) {
      const url =
        attachment && typeof attachment === "object"
          ? normalizeAttachmentUrl(attachment.url)
          : null;
      if (!url)
        return res.status(400).json({
          success: false,
          message: "Invalid attachment URL",
          code: "INVALID_URL",
        });
      finalAttachment = pickAttachment(attachment, url);
    }
    if (MEDIA_REQUIRED_TYPES.has(type) && !finalAttachment)
      return res.status(400).json({
        success: false,
        message: "This message type requires a valid attachment",
        code: "MISSING_ATTACHMENT",
      });

    const conv = await Conversation.findOne({
      _id: conversationId,
      participants: me,
    });
    if (!conv) throw new Error("Conversation not found");
    const receiverId = conv.participants.find(
      (p) => p.toString() !== me.toString()
    );
    if (!receiverId) throw new Error("Unable to determine receiver");
    if (await checkBlocked(me, receiverId)) {
      await safeLogAudit(req, "message_blocked_attempt", { conversationId });
      throw new Error("You cannot message this user");
    }
    if (!(await verifyMatch(me, receiverId))) {
      await safeLogAudit(req, "message_unmatched_attempt", { conversationId });
      throw new Error("You must be matched to send messages");
    }

    const message = await Message.create({
      conversation: conversationId,
      sender: me,
      receiver: receiverId,
      text: cleanText,
      type,
      attachment: finalAttachment,
    });

    conv.lastMessage = message._id;
    conv.lastMessageAt = message.createdAt;
    const rStr = receiverId.toString();
    setUnreadCountSafely(conv, rStr, getUnreadCountSafely(conv, rStr) + 1);
    if (conv.hiddenBy?.some((i) => i.toString() === rStr))
      conv.hiddenBy = conv.hiddenBy.filter((i) => i.toString() !== rStr);
    await conv.save();
    await User.updateOne(
      { _id: receiverId },
      { $pull: { hiddenConversations: conversationId } }
    );

    const pm = await Message.findById(message._id)
      .populate("sender", "_id name photos")
      .populate("receiver", "_id name photos")
      .lean();
    sanitizeMessageMedia(pm);

    emitToRoom(`conversation:${conversationId}`, "new_message", pm);
    emitToRoom(`user:${receiverId}`, "conversation_updated", {
      conversationId,
      message: pm,
    });

    const io = getIO();
    let deliveredNow = false;
    if (io) {
      const socks = await io.in(`user:${receiverId}`).fetchSockets();
      if (socks.length > 0) {
        deliveredNow = true;
        await Message.findByIdAndUpdate(pm._id, {
          isDelivered: true,
          deliveredAt: new Date(),
        });
        emitToRoom(`user:${me.toString()}`, "message_delivered", {
          messageId: pm._id.toString(),
          conversationId,
        });
      }
    }

    const senderInfo = await User.findById(me).select("name").lean();
    const pushBody =
      type === "text"
        ? (cleanText || "").slice(0, 100)
        : type === "image"
        ? "📷 Photo"
        : type === "voice"
        ? "🎤 Voice"
        : type === "gif"
        ? "🎬 GIF"
        : "New message";
    sendPushIfOffline(
      receiverId,
      {
        title: senderInfo?.name || "New message 💬",
        body: pushBody,
        url: "/messages",
      },
      getIO
    );

    await safeLogAudit(req, "message_sent", {
      messageId: pm._id,
      conversationId,
      type,
    });
    res.status(201).json({
      success: true,
      message: {
        ...pm,
        isDelivered: pm.isDelivered || deliveredNow,
        deliveredAt: pm.deliveredAt || (deliveredNow ? new Date() : null),
      },
    });
  } catch (e) {
    if (e.message === "Conversation not found")
      return res.status(404).json({ success: false, message: e.message });
    if (e.message === "You cannot message this user")
      return res.status(403).json({ success: false, message: e.message });
    if (e.message === "You must be matched to send messages")
      return res.status(403).json({ success: false, message: e.message });
    next(e);
  }
};

export const deleteConversation = hideConversation;
