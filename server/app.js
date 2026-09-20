import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import * as Sentry from "@sentry/node";

// Import all routes
import userRoutes from "./routes/user.routes.js";
import authRoutes from "./routes/auth.routes.js";
import discoveryRoutes from "./routes/discovery.routes.js";
import likeRoutes from "./routes/like.routes.js";
import matchRoutes from "./routes/match.routes.js";
import messageRoutes from "./routes/message.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import suggestionRoutes from "./routes/suggestion.routes.js";
import postRoutes from "./routes/post.routes.js";
import bootstrapRoutes from "./routes/bootstrap.routes.js";
import pushRoutes from "./routes/push.routes.js";
import accountRoutes from "./routes/account.routes.js";
import passport from "./config/passport.js";
import twoFactorRoutes from "./routes/twoFactor.routes.js";

// ✅ Import the per-user rate limiter
import { generalApiLimiter } from "./middleware/rateLimits.js";

const app = express();

// Sentry setup
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app }),
    ],
  });
}

app.use(compression({ level: 6 }));

if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// CORS
app.use(
  cors({
    origin: [process.env.CLIENT_URL || "http://localhost:5173"].filter(Boolean),
    credentials: true,
    maxAge: 86400,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Device-Id"],
  })
);

// ✅ Trust proxy (MUST be before rate limiter)
app.set("trust proxy", 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://fonts.googleapis.com",
        ],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        mediaSrc: ["'self'", "https:", "blob:"],
        connectSrc: [
          "'self'",
          process.env.CLIENT_URL || "http://localhost:5173",
          "https://*.cloudinary.com",
          "wss:",
          "ws:",
        ],
        fontSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://fonts.gstatic.com",
          "data:",
        ],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts:
      process.env.NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    frameguard: { action: "deny" },
  })
);

// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(passport.initialize());
app.use(cookieParser());

// ✅ Health check BEFORE rate limiter (no limit)
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Dating Portal API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// ✅ Apply per-user rate limiter to all /api routes
app.use("/api", generalApiLimiter);

// Routes
app.use("/api/2fa", twoFactorRoutes);
app.use("/api/suggestions", suggestionRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/bootstrap", bootstrapRoutes);
app.use("/api/discovery", discoveryRoutes);
app.use("/api/likes", likeRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/admin", adminRoutes);

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Error handlers
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    path: req.path,
    method: req.method,
    userId: req.user?._id,
  });

  const statusCode = err.statusCode || err.status || 500;
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message;

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

export default app;
