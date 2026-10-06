import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Match from "../models/Match.js";
import Conversation from "../models/Conversation.js";
import RefreshToken from "../models/RefreshToken.js";
import { logAudit } from "../utils/auditLogger.js";
import registerChatSocket from "./chat.socket.js";
import registerNotificationSocket from "./notification.socket.js";
import Post from "../models/Post.js";

let io;

// ═══════════════════════════════════════════
// SECURITY: Configuration & Tracking
// ═══════════════════════════════════════════
const CONFIG = {
  maxConnectionsPerUser: parseInt(
    process.env.MAX_SOCKET_CONNECTIONS_PER_USER || "5",
    10
  ),
  maxRoomsPerUser: parseInt(process.env.MAX_ROOMS_PER_USER || "50", 10),
  messageRateLimit: parseInt(process.env.SOCKET_MESSAGE_RATE_LIMIT || "30", 10),
  typingRateLimit: parseInt(process.env.SOCKET_TYPING_RATE_LIMIT || "60", 10),
  maxPayloadSize: parseInt(process.env.SOCKET_MAX_PAYLOAD || "10000", 10),
  disconnectGracePeriod: parseInt(
    process.env.SOCKET_DISCONNECT_GRACE_MS || "5000",
    10
  ),
};

// Track connections per user
const userConnections = new Map();
const messageRateTracker = new Map();
const typingRateTracker = new Map();

// Cleanup old rate tracking every minute
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of messageRateTracker.entries()) {
    if (now - data.windowStart > 60000) {
      messageRateTracker.delete(userId);
    }
  }
  for (const [userId, data] of typingRateTracker.entries()) {
    if (now - data.windowStart > 60000) {
      typingRateTracker.delete(userId);
    }
  }
}, 60 * 1000);

const safeLogAudit = async (req, action, metadata) => {
  try {
    await logAudit(req, action, metadata);
  } catch {
    // Silent failure
  }
};

const checkMessageRate = (userId) => {
  const now = Date.now();
  const tracker = messageRateTracker.get(userId) || {
    count: 0,
    windowStart: now,
  };

  if (now - tracker.windowStart > 60000) {
    tracker.count = 1;
    tracker.windowStart = now;
  } else {
    tracker.count++;
  }

  messageRateTracker.set(userId, tracker);

  if (tracker.count > CONFIG.messageRateLimit) {
    return {
      allowed: false,
      retryAfter: Math.ceil((60000 - (now - tracker.windowStart)) / 1000),
    };
  }

  return { allowed: true };
};

const checkTypingRate = (userId) => {
  const now = Date.now();
  const tracker = typingRateTracker.get(userId) || {
    count: 0,
    windowStart: now,
  };

  if (now - tracker.windowStart > 60000) {
    tracker.count = 1;
    tracker.windowStart = now;
  } else {
    tracker.count++;
  }

  typingRateTracker.set(userId, tracker);

  if (tracker.count > CONFIG.typingRateLimit) {
    return { allowed: false };
  }

  return { allowed: true };
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized!");
  return io;
};

// ✅ ADDED: Validate room name format
const isValidRoomName = (room) => {
  if (typeof room !== "string") return false;
  // Only allow alphanumeric, colons, underscores, hyphens
  return /^[a-zA-Z0-9:_-]+$/.test(room);
};

// ✅ ADDED: Check if user can join a specific room
const canJoinRoom = async (userId, room) => {
  // User can always join their own user room
  if (room === `user:${userId}`) return true;

  // Check if it's a conversation room
  if (room.startsWith("conversation:")) {
    const conversationId = room.replace("conversation:", "");

    // Verify user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      isActive: { $ne: false },
    }).lean();

    return !!conversation;
  }

  // Check if it's a post room (for comments)
  // Post rooms: only users who can actually SEE the post may join, so blocked
  // outsiders can't eavesdrop live new_comment / new_reply / comment_deleted.
  if (room.startsWith("post:")) {
    const postId = room.slice("post:".length);
    if (!/^[a-f\d]{24}$/i.test(postId)) return false;

    const post = await Post.findById(postId)
      .select("author isDeleted isFlagged")
      .lean();
    if (!post || post.isDeleted || post.isFlagged) return false;

    const [ua, ub] = await Promise.all([
      User.findById(userId).select("blockedUsers").lean(),
      User.findById(post.author).select("blockedUsers").lean(),
    ]);
    const u = userId.toString();
    const a = post.author.toString();
    const blockedByAuthor = (ub?.blockedUsers || []).some(
      (id) => id.toString() === u
    );
    const authorBlockedByViewer = (ua?.blockedUsers || []).some(
      (id) => id.toString() === a
    );
    return !blockedByAuthor && !authorBlockedByViewer;
  }

  // Block all other room types by default
  return false;
};

const initializeSocket = (server) => {
  const allowedOrigins = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(",")
    : ["http://localhost:5173", "http://localhost:3000"];

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: CONFIG.maxPayloadSize,
    connectTimeout: 45000,
  });

  // ═══════════════════════════════════════════
  // SOCKET AUTHENTICATION MIDDLEWARE
  // ═══════════════════════════════════════════
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      if (token.length > 2048) {
        return next(new Error("Invalid token"));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET_CURRENT || process.env.JWT_ACCESS_SECRET,
        { algorithms: ["HS256"] }
      );

      if (decoded.type && decoded.type !== "access") {
        return next(new Error("Invalid token type"));
      }

      if (decoded.sessionId) {
        const session = await RefreshToken.findOne({
          _id: decoded.sessionId,
          revokedAt: null,
        });
        if (!session) {
          return next(new Error("Session revoked"));
        }
      }

      const user = await User.findById(decoded.userId)
        .select("_id name photos isActive isOnline lastSeen")
        .lean();

      if (!user) {
        return next(new Error("User not found"));
      }
      if (!user.isActive || user.deletedAt) {
        return next(new Error("Account inactive or deleted"));
      }

      socket.user = user;
      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return next(new Error("Token expired"));
      }
      if (error.name === "JsonWebTokenError") {
        return next(new Error("Invalid token"));
      }
      next(new Error("Authentication failed"));
    }
  });

  // ═══════════════════════════════════════════
  // CONNECTION HANDLER
  // ═══════════════════════════════════════════
  io.on("connection", async (socket) => {
    const userId = socket.user._id.toString();

    console.log(`✅ Socket connected: ${socket.user.name} (${socket.id})`);

    const userSockets = userConnections.get(userId) || new Set();

    if (userSockets.size >= CONFIG.maxConnectionsPerUser) {
      console.warn(
        `⚠️ User ${userId} exceeded max connections (${userSockets.size}), closing oldest`
      );

      const oldestSocketId = Array.from(userSockets)[0];
      const oldestSocket = io.sockets.sockets.get(oldestSocketId);
      if (oldestSocket) {
        oldestSocket.emit("force_disconnect", {
          reason: "Too many connections from your account",
        });
        oldestSocket.disconnect(true);
      }

      await safeLogAudit(
        { ip: socket.handshake.address, user: userId },
        "socket_connection_limit_exceeded",
        {
          currentConnections: userSockets.size,
          maxAllowed: CONFIG.maxConnectionsPerUser,
        }
      );
    }

    userSockets.add(socket.id);
    userConnections.set(userId, userSockets);

    socket.join(`user:${userId}`);

    await User.findByIdAndUpdate(userId, {
      $set: { isOnline: true, lastSeen: new Date() },
    });

    // ✅ FIXED: Limit matched user notifications to prevent performance issues
    const matchedUserIds = await getMatchedUserIds(userId);
    const limitedMatches = matchedUserIds.slice(0, 100); // Max 100 notifications

    limitedMatches.forEach((matchId) => {
      io.to(`user:${matchId}`).emit("user_online", { userId });
    });

    registerChatSocket(io, socket);
    registerNotificationSocket(io, socket);

    // ═══════════════════════════════════════════
    // SECURITY: Global message rate limiting
    // ═══════════════════════════════════════════
    socket.use((packet, next) => {
      if (packet[0] === "send_message" || packet[0] === "message") {
        const rateCheck = checkMessageRate(userId);
        if (!rateCheck.allowed) {
          socket.emit("rate_limit", {
            message: "Too many messages. Please slow down.",
            retryAfter: rateCheck.retryAfter,
          });
          return next(new Error("Rate limit exceeded"));
        }
      }

      if (packet[0] === "typing") {
        const rateCheck = checkTypingRate(userId);
        if (!rateCheck.allowed) {
          // ✅ FIXED: Notify client instead of just throwing error
          socket.emit("typing_rate_limit", {
            message: "Too many typing events. Please slow down.",
          });
          return next(new Error("Typing rate limit exceeded"));
        }
      }

      const payload = JSON.stringify(packet);
      if (payload.length > CONFIG.maxPayloadSize) {
        socket.emit("error", { message: "Message too large" });
        return next(new Error("Payload too large"));
      }

      next();
    });

    // ═══════════════════════════════════════════
    // SECURITY: Room joining with validation
    // ═══════════════════════════════════════════
    const originalJoin = socket.join.bind(socket);
    socket.join = async function (room) {
      // ✅ ADDED: Validate room name format
      if (!isValidRoomName(room)) {
        console.warn(`⚠️ Invalid room name rejected: ${room}`);
        await safeLogAudit(
          { ip: socket.handshake.address, user: userId },
          "socket_invalid_room_join",
          { room: room.substring(0, 50) } // Truncate for logging
        );
        return;
      }

      const currentRooms = Array.from(socket.rooms);

      if (currentRooms.length >= CONFIG.maxRoomsPerUser) {
        console.warn(
          `⚠️ User ${userId} exceeded max rooms (${currentRooms.length})`
        );
        socket.emit("error", { message: "Too many active conversations" });
        return;
      }

      // ✅ ADDED: Verify user can join this room
      const canJoin = await canJoinRoom(userId, room);
      if (!canJoin) {
        console.warn(
          `⚠️ User ${userId} attempted to join unauthorized room: ${room}`
        );
        await safeLogAudit(
          { ip: socket.handshake.address, user: userId },
          "socket_unauthorized_room_join",
          { room: room.substring(0, 50) }
        );
        socket.emit("error", { message: "Unauthorized room access" });
        return;
      }

      return originalJoin(room);
    };

    // ═══════════════════════════════════════════
    // SECURITY: Room leaving
    // ═══════════════════════════════════════════
    socket.on("leave_room", (room) => {
      if (!isValidRoomName(room)) return;

      // User can only leave rooms they're in
      if (socket.rooms.has(room)) {
        socket.leave(room);
      }
    });

    // ═══════════════════════════════════════════
    // DISCONNECT HANDLER
    // ═══════════════════════════════════════════
    socket.on("disconnect", async (reason) => {
      if (!socket.user) return;

      console.log(`🔌 Socket disconnected: ${socket.user.name} (${reason})`);

      const userSockets = userConnections.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          userConnections.delete(userId);
        }
      }

      try {
        await new Promise((resolve) =>
          setTimeout(resolve, CONFIG.disconnectGracePeriod)
        );

        const remainingSockets = await io.in(`user:${userId}`).fetchSockets();

        if (remainingSockets.length === 0) {
          const result = await User.findByIdAndUpdate(
            userId,
            { $set: { isOnline: false, lastSeen: new Date() } },
            { new: true }
          );

          if (result) {
            const matchedUserIds = await getMatchedUserIds(userId);
            const limitedMatches = matchedUserIds.slice(0, 100);

            limitedMatches.forEach((matchId) => {
              io.to(`user:${matchId}`).emit("user_offline", {
                userId,
                lastSeen: result.lastSeen,
              });
            });
          }
        }
      } catch (error) {
        console.error("Disconnect cleanup error:", error);
      }
    });

    socket.on("go_offline", async () => {
      try {
        await User.findByIdAndUpdate(userId, {
          $set: { isOnline: false, lastSeen: new Date() },
        });
        const matchedUserIds = await getMatchedUserIds(userId);
        const limitedMatches = matchedUserIds.slice(0, 100);

        limitedMatches.forEach((matchId) => {
          io.to(`user:${matchId}`).emit("user_offline", {
            userId,
            lastSeen: new Date(),
          });
        });
      } catch (error) {
        console.error("Go offline error:", error);
      }
    });
  });

  // ✅ ADDED: Cleanup on server shutdown
  const cleanup = () => {
    console.log("🧹 Cleaning up Socket.IO connections...");
    userConnections.clear();
    messageRateTracker.clear();
    typingRateTracker.clear();
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  return io;
};

async function getMatchedUserIds(userId) {
  try {
    const matches = await Match.find({
      users: userId,
      $or: [{ isActive: true }, { isActive: { $exists: false } }],
    })
      .select("users")
      .lean();

    return matches
      .map((match) => {
        const otherUser = match.users.find((id) => id.toString() !== userId);
        return otherUser ? otherUser.toString() : null;
      })
      .filter(Boolean);
  } catch (error) {
    console.error("Get matched users error:", error);
    return [];
  }
}

export default initializeSocket;
