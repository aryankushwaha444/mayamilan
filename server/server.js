import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import connectDB from "./config/db.js";
import initializeSocket from "./sockets/socket.js";
import { cleanupDeletedAccounts } from "./utils/cleanupDeletedAccounts.js";

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0"; // ✅ Bind to all interfaces for cloud deployment

const startServer = async () => {
  try {
    await connectDB();

    const server = http.createServer(app);

    const io = initializeSocket(server);
    app.set("io", io);

    // Schedule daily cleanup at 2 AM
    const scheduleCleanup = () => {
      const now = new Date();
      const next2AM = new Date(now);
      next2AM.setHours(2, 0, 0, 0);

      if (next2AM < now) {
        next2AM.setDate(next2AM.getDate() + 1);
      }

      const timeUntilNext2AM = next2AM - now;

      setTimeout(() => {
        cleanupDeletedAccounts();
        setInterval(cleanupDeletedAccounts, 24 * 60 * 60 * 1000);
      }, timeUntilNext2AM);

      console.log(`🕐 Next cleanup scheduled for: ${next2AM.toLocaleString()}`);
    };

    if (process.env.NODE_ENV === "development") {
      setTimeout(cleanupDeletedAccounts, 5000);
    }

    scheduleCleanup();

    // ✅ Fixed: Bind to 0.0.0.0 for cloud deployment compatibility
    server.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on ${HOST}:${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
    });

    // ✅ Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);

      server.close(async () => {
        console.log("✅ HTTP server closed");
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error("⚠️  Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("Server startup error:", error);
    process.exit(1);
  }
};

startServer();
