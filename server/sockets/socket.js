import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
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

    // Join personal room
    socket.join(`user:${userId}`);

    // Mark online + broadcast
    await User.findByIdAndUpdate(userId, { isOnline: true });
    socket.broadcast.emit("user_online", { userId });

    registerChatSocket(io, socket);
    registerNotificationSocket(io, socket);

    /*
     * ==========================================
     * DISCONNECT (RACE-SAFE)
     * Only mark offline if NO other socket exists for this user
     * ==========================================
     */
    socket.on("disconnect", async () => {
      console.log(`Socket disconnected: ${socket.user.name}`);

      try {
        const remainingSockets = await io.in(`user:${userId}`).fetchSockets();

        if (remainingSockets.length === 0) {
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen: new Date(),
          });

          socket.broadcast.emit("user_offline", { userId });
        } else {
          console.log(
            `ℹ️ ${socket.user.name} still has ${remainingSockets.length} active connection(s)`
          );
        }
      } catch (error) {
        console.error("Disconnect cleanup error:", error);
      }
    });
  });

  return io;
};

export default initializeSocket;
