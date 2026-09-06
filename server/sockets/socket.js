import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import registerChatSocket from "./chat.socket.js";
import registerNotificationSocket from "./notification.socket.js";

// 👇 Store io instance in a module-level variable
let io;

// 👇 Export a function to retrieve it safely (used by like/match controllers)
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
    },
  });

  /*
   * ==========================================
   * SOCKET AUTHENTICATION
   * ==========================================
   */
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

      const user = await User.findById(decoded.userId).select(
        "_id name photos isActive isOnline"
      );

      if (!user || !user.isActive) {
        return next(new Error("User not found or inactive"));
      }

      socket.user = user;
      next();
    } catch (error) {
      console.error("Socket authentication error:", error.message);
      next(new Error("Invalid or expired token"));
    }
  });

  /*
   * ==========================================
   * CONNECTION
   * ==========================================
   */
  io.on("connection", async (socket) => {
    const userId = socket.user._id.toString();

    console.log(`Socket connected: ${socket.user.name} (${userId})`);

    // 👇 JOIN USER'S PERSONAL ROOM
    // This is CRITICAL for receiving match notifications, new likes,
    // AND chat delivery/read receipts (double ticks / blue circles).
    socket.join(`user:${userId}`);
    console.log(`✅ ${socket.user.name} joined room: user:${userId}`);

    // Update online status
    await User.findByIdAndUpdate(userId, { isOnline: true });

    // Register chat and notification events
    registerChatSocket(io, socket);
    registerNotificationSocket(io, socket);

    /*
     * ==========================================
     * DISCONNECT
     * ==========================================
     */
    socket.on("disconnect", async () => {
      console.log(`Socket disconnected: ${socket.user.name}`);

      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date(),
      });
    });
  });

  return io;
};

export default initializeSocket;
