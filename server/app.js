import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import { sanitizeInput } from "./middleware/sanitizeInput.js";
import timeout from "connect-timeout"; // ✅ ADD: npm install connect-timeout
import morgan from "morgan"; // ✅ ADD: npm install morgan
import { v4 as uuidv4 } from "uuid"; // ✅ ADD: npm install uuid
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

import { generalApiLimiter } from "./middleware/rateLimits.js";

const app = express();

// ========================================
// ENVIRONMENT VARIABLES (centralized)
// ========================================
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const SITE_URL = process.env.SITE_URL || "https://mayamilan.vercel.app";
const NODE_ENV = process.env.NODE_ENV || "development";
const COOKIE_SECRET = process.env.COOKIE_SECRET || "your-cookie-secret-here"; // ✅ ADD

// ========================================
// REQUEST TIMEOUT (prevents hanging requests)
// ========================================
app.use(timeout("30s")); // ✅ ADD: 30 second timeout for all requests

// ========================================
// REQUEST ID (for log correlation)
// ========================================
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || uuidv4();
  res.setHeader("X-Request-ID", req.id);
  next();
});

morgan.token("id", (req) => req.id || "-");

morgan.token("status-color", (req, res) => {
  const status = res.statusCode;
  const color =
    status >= 500 ? 31 : status >= 400 ? 33 : status >= 300 ? 36 : 32;
  return `\x1b[${color}m${status}\x1b[0m`;
});

if (NODE_ENV === "development") {
  app.use(
    morgan(
      ":method :url :status-color :res[content-length] - :response-time ms [:id]"
    )
  );
}

// ========================================
// SECURITY.TXT (RFC 9116)
// ========================================
const SECURITY_TXT = `Contact: mailto:${
  process.env.SECURITY_EMAIL || "rupnarayan444@gmail.com"
}
Contact: ${SITE_URL}/security-report
Expires: 2027-12-31T23:59:59.000Z
Preferred-Languages: en, hi, np
Canonical: ${SITE_URL}/.well-known/security.txt
Policy: ${SITE_URL}/security-policy
Acknowledgments: ${SITE_URL}/hall-of-fame
`;

// Sentry setup
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: NODE_ENV,
    tracesSampleRate: NODE_ENV === "production" ? 0.1 : 1.0,
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

// ✅ FIXED CORS
app.use(
  cors({
    origin: [CLIENT_URL].filter(Boolean),
    credentials: true,
    maxAge: 86400,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Device-Id",
      "X-Signature",
      "X-Timestamp",
      "X-Form-Load-Time",
      "X-Requested-With",
      "X-Request-ID", // ✅ ADD: Allow custom request IDs
    ],
    exposedHeaders: [
      "X-Cache",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "X-Request-ID", // ✅ ADD: Expose request ID to client
    ],
  })
);

// ✅ Trust proxy
app.set("trust proxy", NODE_ENV === "production" ? true : 1);

// ✅ IMPROVED Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://challenges.cloudflare.com",
          ...(NODE_ENV === "production" ? [] : ["'unsafe-eval'"]), // ✅ Allow eval in dev
        ],
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
          CLIENT_URL,
          "https://*.cloudinary.com",
          "https://res.cloudinary.com",
          "wss:",
          "ws:",
          ...(process.env.SENTRY_DSN ? ["https://*.ingest.sentry.io"] : []),
          "https://challenges.cloudflare.com",
        ],
        fontSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://fonts.gstatic.com",
          "data:",
        ],
        frameSrc: ["'self'", "https://challenges.cloudflare.com"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: NODE_ENV === "production" ? [] : null, // ✅ ADD: Force HTTPS in production
      },
    },
    hsts:
      NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    frameguard: { action: "deny" },

    permissionsPolicy: {
      policy: {
        camera: ["self"],
        microphone: ["self"],
        geolocation: ["self"],
        payment: [],
        "interest-cohort": [],
        accelerometer: [],
        gyroscope: [],
        magnetometer: [],
        fullscreen: ["self"],
        autoplay: ["self"],
        "display-capture": [],
        "document-domain": [],
        "encrypted-media": ["self"],
        "execution-while-not-rendered": [],
        "execution-while-out-of-viewport": [],
        "publickey-credentials-get": ["self"],
        usb: [],
        "xr-spatial-tracking": [],
        "clipboard-read": ["self"],
        "clipboard-write": ["self"],
      },
    },
  })
);

// ✅ FIXED: Body parsers with NoSQL injection protection
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(sanitizeInput); // ✅ ADD: Remove $ operators from user input
app.use(passport.initialize());
app.use(cookieParser(COOKIE_SECRET)); // ✅ FIXED: Add secret for signed cookies

// Security.txt routes
app.get("/.well-known/security.txt", (req, res) => {
  res.type("text/plain; charset=utf-8");
  res.set("Cache-Control", "public, max-age=86400");
  res.send(SECURITY_TXT);
});

app.get("/security.txt", (req, res) => {
  res.redirect(301, "/.well-known/security.txt");
});

// ✅ IMPROVED: Health check with diagnostics
app.get("/api/health", async (req, res) => {
  try {
    // Check MongoDB connection
    const mongoose = (await import("mongoose")).default;
    const dbState = mongoose.connection.readyState;
    const dbStates = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };

    res.json({
      success: true,
      message: "Dating Portal API is running",
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      uptime: process.uptime(),
      database: {
        status: dbStates[dbState] || "unknown",
        host: mongoose.connection.host,
      },
      memory: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(
          process.memoryUsage().heapUsed / 1024 / 1024
        )}MB`,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Health check failed",
      error: NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Apply per-user rate limiter to all /api routes
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
    requestId: req.id, // ✅ ADD: Include request ID for debugging
  });
});

// ✅ IMPROVED: Error handlers with request context
// 1. Timeout handler (must be first)
app.use((err, req, res, next) => {
  if (err.timeout) {
    console.error(`⏱️  Request timeout: ${req.method} ${req.path} [${req.id}]`);
    return res.status(503).json({
      success: false,
      message: "Request timeout. Please try again.",
      code: "REQUEST_TIMEOUT",
      requestId: req.id,
    });
  }
  next(err);
});

// 2. Specific error handlers (body size, multer)
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") {
    console.warn(`📦 Body too large: ${req.method} ${req.path} [${req.id}]`);
    return res.status(413).json({
      success: false,
      message: "Request body too large",
      code: "PAYLOAD_TOO_LARGE",
      requestId: req.id,
    });
  }

  if (err.type === "entity.parse.failed") {
    console.warn(`🔍 Invalid JSON: ${req.method} ${req.path} [${req.id}]`);
    return res.status(400).json({
      success: false,
      message: "Invalid JSON in request body",
      code: "INVALID_JSON",
      requestId: req.id,
    });
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    console.warn(`📁 File too large: ${req.method} ${req.path} [${req.id}]`);
    return res.status(413).json({
      success: false,
      message: "File too large. Maximum size is 10MB.",
      code: "FILE_TOO_LARGE",
      requestId: req.id,
    });
  }

  next(err);
});

// 3. Sentry error handler (logs errors before response)
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// 4. General error handler (sends response to client)
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", {
    requestId: req.id, // ✅ ADD: Request ID for log correlation
    message: err.message,
    stack: NODE_ENV === "development" ? err.stack : undefined,
    path: req.path,
    method: req.method,
    userId: req.user?._id,
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });

  const statusCode = err.statusCode || err.status || 500;
  const message =
    NODE_ENV === "production" ? "Internal server error" : err.message;

  res.status(statusCode).json({
    success: false,
    message,
    requestId: req.id, // ✅ ADD: Include request ID in response
    ...(NODE_ENV === "development" && { stack: err.stack }),
  });
});

export default app;
