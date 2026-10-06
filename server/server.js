// ✅ CRITICAL: "dotenv/config" automatically runs dotenv.config()
// BEFORE any other imports are evaluated.
import "dotenv/config";

import http from "http";
import mongoose from "mongoose";
import app from "./app.js";
import connectDB from "./config/db.js";
import initializeSocket from "./sockets/socket.js";
import { cleanupDeletedAccounts } from "./utils/cleanupDeletedAccounts.js";

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

// ═══════════════════════════════════════════
// SECURITY: Server Configuration
// ═══════════════════════════════════════════
const SERVER_CONFIG = {
  // Prevent Slowloris attacks - close idle connections after 60s
  keepAliveTimeout: 60000,
  headersTimeout: 65000, // Must be > keepAliveTimeout

  // Limit concurrent connections per IP (prevent DoS)
  maxConnections: 1000,

  // Request timeout (handled in app.js but also at server level)
  requestTimeout: 30000,
};

const startServer = async () => {
  try {
    // ═══════════════════════════════════════════
    // 1. Connect to Database
    // ═══════════════════════════════════════════
    await connectDB();

    // ═══════════════════════════════════════════
    // 2. Initialize HTTP & WebSocket Servers
    // ═══════════════════════════════════════════
    const server = http.createServer(app);

    // Apply server-level security configurations
    server.keepAliveTimeout = SERVER_CONFIG.keepAliveTimeout;
    server.headersTimeout = SERVER_CONFIG.headersTimeout;
    server.maxConnections = SERVER_CONFIG.maxConnections;
    server.timeout = SERVER_CONFIG.requestTimeout;

    const io = initializeSocket(server);
    app.set("io", io);

    // ═══════════════════════════════════════════
    // SECURITY: Connection Tracking (DoS Prevention)
    // ═══════════════════════════════════════════
    const connectionCounts = new Map();
    const MAX_CONNECTIONS_PER_IP = 50; // Max 50 connections per IP

    // behind a single shared proxy (i.e. local / direct exposure).
    const ENFORCE_SOCKET_IP_CAP = process.env.NODE_ENV !== "production";
    server.on("connection", (socket) => {
      const ip = socket.remoteAddress;
      const currentCount = connectionCounts.get(ip) || 0;
      if (ENFORCE_SOCKET_IP_CAP && currentCount >= MAX_CONNECTIONS_PER_IP) {
        console.warn(
          `⚠️ Too many connections from ${ip} (${currentCount}), closing`
        );
        socket.destroy();
        return;
      }
      connectionCounts.set(ip, currentCount + 1);
      socket.on("close", () => {
        const count = connectionCounts.get(ip) || 1;
        if (count <= 1) {
          connectionCounts.delete(ip);
        } else {
          connectionCounts.set(ip, count - 1);
        }
      });
    });

    // ═══════════════════════════════════════════
    // CRON JOB: Daily Account Cleanup
    // ═══════════════════════════════════════════
    const scheduleCleanup = () => {
      const runCleanup = async () => {
        console.log("🧹 Starting daily account cleanup...");
        try {
          await cleanupDeletedAccounts();
          console.log("✅ Daily account cleanup finished");
        } catch (err) {
          console.error("❌ Daily cleanup failed:", err.message);
        }
      };

      const scheduleNext = () => {
        const now = new Date();
        const next2AM = new Date(now);
        next2AM.setHours(2, 0, 0, 0);

        if (next2AM <= now) {
          next2AM.setDate(next2AM.getDate() + 1);
        }

        const delay = next2AM - now;
        console.log(
          `🕐 Next cleanup scheduled for: ${next2AM.toLocaleString()} (in ${Math.round(
            delay / 3600000
          )} hours)`
        );

        setTimeout(() => {
          runCleanup();
          scheduleNext();
        }, delay);
      };

      if (process.env.NODE_ENV === "development") {
        console.log("🧪 Dev mode: Running initial cleanup in 5 seconds...");
        setTimeout(runCleanup, 5000);
      }

      scheduleNext();
    };

    scheduleCleanup();

    // ═══════════════════════════════════════════
    // START LISTENING
    // ═══════════════════════════════════════════
    server.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on http://${HOST}:${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(
        `🔒 Security: Rate limiting ${
          process.env.RATE_LIMIT_ENABLED ? "ENABLED" : "DISABLED"
        }`
      );
    });

    // ═══════════════════════════════════════════
    // GRACEFUL SHUTDOWN (Enhanced)
    // ═══════════════════════════════════════════
    let isShuttingDown = false;

    const gracefulShutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);

      // 1. Stop accepting new connections immediately
      server.close((err) => {
        if (err) {
          console.error("❌ Error closing server:", err.message);
        } else {
          console.log("✅ HTTP server stopped accepting new requests");
        }
      });

      // 2. Close Socket.io connections
      if (io) {
        io.close(() => {
          console.log("✅ WebSocket connections closed");
        });
      }

      // 3. Close MongoDB connection
      try {
        await mongoose.disconnect();
        console.log("✅ MongoDB connection closed");
      } catch (err) {
        console.error("❌ Error closing MongoDB:", err.message);
      }

      // 4. Clear connection tracking
      connectionCounts.clear();

      console.log("👋 Graceful shutdown complete");
      process.exit(0);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // ═══════════════════════════════════════════
    // GLOBAL ERROR HANDLERS (Enhanced)
    // ═══════════════════════════════════════════
    process.on("unhandledRejection", (reason, promise) => {
      console.error("❌ UNHANDLED PROMISE REJECTION:");
      console.error("  Promise:", promise);
      console.error(
        "  Reason:",
        reason instanceof Error ? reason.message : reason
      );
      if (reason instanceof Error && reason.stack) {
        console.error("  Stack:", reason.stack);
      }
    });

    process.on("uncaughtException", (error) => {
      console.error("💥 UNCAUGHT EXCEPTION! Server is in an undefined state:");
      console.error("  Error:", error.message);
      console.error("  Stack:", error.stack);

      // Log to file in production (you could add file logging here)
      if (process.env.NODE_ENV === "production") {
        // In production, you might want to send this to Sentry/monitoring
        console.error("  Timestamp:", new Date().toISOString());
      }

      // Force exit - uncaught exceptions corrupt Node.js state
      process.exit(1);
    });

    // Handle out of memory errors
    process.on("exit", (code) => {
      console.log(`Process exited with code: ${code}`);
    });
  } catch (error) {
    console.error("❌ Server startup error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
};

startServer();
