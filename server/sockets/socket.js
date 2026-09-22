import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import registerChatSocket from "./chat.socket.js";
import registerNotificationSocket from "./notification.socket.js";

let io;

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"], // ✅ Explicit transport order
    pingTimeout: 60000, // ✅ 60s ping timeout
    pingInterval: 25000, // ✅ Ping every 25s
  });

  // ========================================
  // SOCKET AUTHENTICATION MIDDLEWARE
  // ========================================
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      // ✅ FIXED: Use rotation-aware secret name
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET_CURRENT);

      // ✅ NEW: Verify token type is "access"
      if (decoded.type && decoded.type !== "access") {
        return next(new Error("Invalid token type"));
      }

      // ✅ NEW: Check session revocation (like HTTP middleware)
      if (decoded.sessionId) {
        const session = await RefreshToken.findOne({
          _id: decoded.sessionId,
          revokedAt: null,
        });

        if (!session) {
          return next(new Error("Session revoked"));
        }
      }

      const user = await User.findById(decoded.userId).select(
        "_id name photos isActive isOnline lastSeen"
      );

      if (!user) {
        return next(new Error("User not found"));
      }

      if (!user.isActive || user.deletedAt) {
        return next(new Error("Account inactive or deleted"));
      }

      socket.user = user;
      next();
    } catch (error) {
      console.error("Socket authentication error:", error.message);

      // ✅ NEW: Distinguish error types for better debugging
      if (error.name === "TokenExpiredError") {
        return next(new Error("Token expired"));
      }
      if (error.name === "JsonWebTokenError") {
        return next(new Error("Invalid token"));
      }

      next(new Error("Authentication failed"));
    }
  });

  // ========================================
  // CONNECTION HANDLER
  // ========================================
  io.on("connection", async (socket) => {
    const userId = socket.user._id.toString();

    console.log(`✅ Socket connected: ${socket.user.name} (${socket.id})`);

    // Join personal room
    socket.join(`user:${userId}`);

    // ✅ IMPROVED: Mark online with atomic operation
    await User.findByIdAndUpdate(userId, {
      $set: {
        isOnline: true,
        lastSeen: new Date(),
      },
    });

    // ✅ IMPROVED: Emit to specific rooms instead of broadcast
    // Only notify users who have matched with this user
    const matchedUserIds = await getMatchedUserIds(userId);

    if (matchedUserIds.length > 0) {
      matchedUserIds.forEach((matchId) => {
        io.to(`user:${matchId}`).emit("user_online", { userId });
      });
    }

    // Register socket handlers
    registerChatSocket(io, socket);
    registerNotificationSocket(io, socket);

    // ========================================
    // DISCONNECT HANDLER (RACE-SAFE)
    // ========================================
    socket.on("disconnect", async (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.user.name} (${reason})`);

      try {
        // ✅ IMPROVED: Use small delay to allow reconnect
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // ✅ IMPROVED: Check with fresh data
        const remainingSockets = await io.in(`user:${userId}`).fetchSockets();

        if (remainingSockets.length === 0) {
          // ✅ Only mark offline if truly no connections
          const result = await User.findByIdAndUpdate(
            userId,
            {
              $set: {
                isOnline: false,
                lastSeen: new Date(),
              },
            },
            { new: true }
          );

          if (result) {
            // ✅ Notify matched users only
            const matchedUserIds = await getMatchedUserIds(userId);
            matchedUserIds.forEach((matchId) => {
              io.to(`user:${matchId}`).emit("user_offline", {
                userId,
                lastSeen: result.lastSeen,
              });
            });
          }
        } else {
          console.log(
            `ℹ️ ${socket.user.name} still has ${remainingSockets.length} active connection(s)`
          );
        }
      } catch (error) {
        console.error("Disconnect cleanup error:", error);
      }
    });

    // ✅ NEW: Handle manual "go offline" event
    socket.on("go_offline", async () => {
      try {
        await User.findByIdAndUpdate(userId, {
          $set: {
            isOnline: false,
            lastSeen: new Date(),
          },
        });

        const matchedUserIds = await getMatchedUserIds(userId);
        matchedUserIds.forEach((matchId) => {
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

  return io;
};

/**
 * Helper: Get user IDs that have matched with this user
 */
async function getMatchedUserIds(userId) {
  try {
    const Match = (await import("../models/Match.js")).default;
    const matches = await Match.find({
      $or: [{ user1: userId }, { user2: userId }],
      status: "matched",
    }).select("user1 user2");

    return matches.map((match) =>
      match.user1.toString() === userId
        ? match.user2.toString()
        : match.user1.toString()
    );
  } catch (error) {
    console.error("Get matched users error:", error);
    return [];
  }
}

export default initializeSocket;
