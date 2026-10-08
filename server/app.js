import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import timeout from "connect-timeout";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";
import * as Sentry from "@sentry/node";
import mongoose from "mongoose";

import { sanitizeInput } from "./middleware/sanitizeInput.js";
import { generalApiLimiter } from "./middleware/rateLimits.js";

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

const app = express();

// ═══════════════════════════════════════════
// ENVIRONMENT VARIABLES
// ═══════════════════════════════════════════
const NODE_ENV = process.env.NODE_ENV || "development";
const SITE_URL = process.env.SITE_URL || "https://mayamilan.vercel.app";
const COOKIE_SECRET = process.env.COOKIE_SECRET || "your-cookie-secret-here";

// ✅ Parse allowed origins — always include the canonical public origin (SITE_URL)
//    so the proxied SAME-ORIGIN refresh POST (browser sends Origin: SITE_URL) can
//    never 500 if CLIENT_URL is mis-set, plus dev localhost outside prod. Unknown
//    origins STILL throw — allowlist semantics preserved (this is a widening by
//    exactly our own origin, not a security regression).
const _clientOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",")
      .map((u) => u.trim())
      .filter(Boolean)
  : [];
const allowedOrigins = Array.from(
  new Set(
    [
      ..._clientOrigins,
      SITE_URL, // https://mayamilan.vercel.app (the origin the browser actually sends)
      ...(NODE_ENV !== "production"
        ? [
            "http://localhost:5173",
            "http://localhost:3000",
            "http://127.0.0.1:5173",
          ]
        : []),
    ].filter(Boolean)
  )
);

// ═══════════════════════════════════════════
// SECURITY: Sentry Initialization
// ═══════════════════════════════════════════
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
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// ═══════════════════════════════════════════
// SECURITY: Request ID (MUST BE FIRST)
// ═══════════════════════════════════════════
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || uuidv4();
  res.setHeader("X-Request-ID", req.id);
  req.startTime = Date.now(); // Track request duration
  next();
});

// ═══════════════════════════════════════════
// SECURITY: Request Payload Size Validation (BEFORE body parsing)
// ═══════════════════════════════════════════
app.use((req, res, next) => {
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10MB

  if (contentLength > MAX_PAYLOAD_SIZE) {
    return res.status(413).json({
      success: false,
      message: "Request payload too large",
      code: "PAYLOAD_TOO_LARGE",
      requestId: req.id,
    });
  }
  next();
});

// ═══════════════════════════════════════════
// SECURITY: Slow Request Detection
// ═══════════════════════════════════════════
app.use((req, res, next) => {
  const SLOW_REQUEST_THRESHOLD = 10000; // 10 seconds

  const timeoutId = setTimeout(() => {
    const duration = Date.now() - req.startTime;
    console.warn(
      `⚠️ Slow request detected: ${req.method} ${req.path} took ${duration}ms [${req.id}]`
    );
  }, SLOW_REQUEST_THRESHOLD);

  res.on("finish", () => {
    clearTimeout(timeoutId);
  });

  next();
});

// ═══════════════════════════════════════════
// REQUEST TIMEOUT & HALT MIDDLEWARE
// ═══════════════════════════════════════════
app.use(timeout("30s"));

function haltOnTimedout(req, res, next) {
  if (!req.timedout) next();
}
app.use(haltOnTimedout);

// ═══════════════════════════════════════════
// LOGGING (Development only)
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// SECURITY: Helmet Configuration (Enhanced)
// ═══════════════════════════════════════════
const SECURITY_TXT = `Contact: mailto:${
  process.env.SECURITY_EMAIL || "rupnarayan444@gmail.com"
}
Contact: ${SITE_URL}/security-report
Expires: 2027-12-31T23:59:59.000Z
Preferred-Languages: en, hi, np
Canonical: ${SITE_URL}/.well-known/security.txt
Policy: ${SITE_URL}/security-policy
Acknowledgments: ${SITE_URL}/hall-of-fame`;

app.use(compression({ level: 6 }));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://challenges.cloudflare.com",
          ...(NODE_ENV === "production" ? [] : ["'unsafe-eval'"]),
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://fonts.googleapis.com",
        ],
        imgSrc: [
          "'self'",
          "data:",
          "https:",
          "blob:",
          "https://res.cloudinary.com",
        ],
        mediaSrc: ["'self'", "https:", "blob:"],
        connectSrc: [
          "'self'",
          ...allowedOrigins,
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
        upgradeInsecureRequests: NODE_ENV === "production" ? [] : null,
      },
    },
    hsts:
      NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" }, // Prevents window.opener attacks
    dnsPrefetchControl: { allow: false }, // Prevents DNS prefetching leaks
    permittedCrossDomainPolicies: { permittedPolicies: "none" }, // Blocks Flash/Acrobat
    hidePoweredBy: true, // Remove X-Powered-By header
    xssFilter: true, // Enable XSS filter (legacy browsers)
    noSniff: true, // Prevent MIME type sniffing
    ieNoOpen: true, // Prevent IE from executing downloads
    frameguard: { action: "deny" },
  })
);

// ═══════════════════════════════════════════
// SECURITY: CORS Configuration (Enhanced)
// ═══════════════════════════════════════════
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn(`⚠️ Blocked CORS request from: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  maxAge: 86400,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Device-Id",
    "X-Device-Info", // ✅ ADDED — was the single missing header causing the app-wide preflight block
    "X-Signature",
    "X-Timestamp",
    "X-Form-Load-Time",
    "X-Requested-With",
    "X-Request-ID",
  ],
  exposedHeaders: [
    "X-Cache",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
    "X-Request-ID",
    "Retry-After",
  ],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// ✅ Trust proxy — DEFAULT 2 hops (Vercel edge → Render edge → app). The SPA now
//    calls /api RELATIVELY through the Vercel rewrite, so a request arrives with
//    TWO X-Forwarded-For entries. Trusting only 1 makes req.ip resolve to Vercel's
//    SHARED egress IP for every visitor → the global /api ip-rate-limiter treats all
//    users as one IP → mass 429, and lastIp/"session hijacking" logs become
//    meaningless. Override via TRUST_PROXY env if Render's topology differs.
const _rawTrust = process.env.TRUST_PROXY;
const _trustNum =
  _rawTrust === undefined || _rawTrust === "" ? 2 : Number(_rawTrust);
const TRUST_PROXY_HOPS =
  Number.isInteger(_trustNum) && _trustNum >= 1 ? _trustNum : 2;
app.set("trust proxy", TRUST_PROXY_HOPS);

// ═══════════════════════════════════════════
// BODY PARSERS & GLOBAL MIDDLEWARE
// ═══════════════════════════════════════════
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(sanitizeInput); // Strips $ operators to prevent NoSQL injection
app.use(passport.initialize());
app.use(cookieParser(COOKIE_SECRET));

// ═══════════════════════════════════════════
// STATIC & HEALTH ROUTES
// ═══════════════════════════════════════════
app.get("/.well-known/security.txt", (req, res) => {
  res.type("text/plain; charset=utf-8");
  res.set("Cache-Control", "public, max-age=86400");
  res.send(SECURITY_TXT);
});

app.get("/security.txt", (req, res) =>
  res.redirect(301, "/.well-known/security.txt")
);

app.get("/api/health", (req, res) => {
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
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
    },
  });
});

// ═══════════════════════════════════════════
// SECURITY: Rate Limiting (Applied to all API routes)
// ═══════════════════════════════════════════
app.use("/api", generalApiLimiter);

// ═══════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════
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

// ═══════════════════════════════════════════
// 404 HANDLER
// ═══════════════════════════════════════════
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    requestId: req.id,
  });
});

// ═══════════════════════════════════════════
// ERROR HANDLERS (Enhanced)
// ═══════════════════════════════════════════

// 1. Timeout handler
app.use((err, req, res, next) => {
  if (err.timeout) {
    console.error(`⏱️ Request timeout: ${req.method} ${req.path} [${req.id}]`);
    return res.status(503).json({
      success: false,
      message: "Request timeout. Please try again.",
      code: "REQUEST_TIMEOUT",
      requestId: req.id,
    });
  }
  next(err);
});

// 2. Payload/Multer error handlers
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Request body too large",
      code: "PAYLOAD_TOO_LARGE",
      requestId: req.id,
    });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON in request body",
      code: "INVALID_JSON",
      requestId: req.id,
    });
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      message: "File too large. Maximum size is 10MB.",
      code: "FILE_TOO_LARGE",
      requestId: req.id,
    });
  }
  next(err);
});

// 3. Sentry error handler
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// 4. General catch-all error handler (Enhanced)
app.use((err, req, res, next) => {
  // Sanitize error message to prevent information leakage
  const errorMessage = err.message || "Unknown error";

  // Log error details (sanitize sensitive data)
  console.error("❌ Unhandled error:", {
    requestId: req.id,
    message: errorMessage,
    stack: NODE_ENV === "development" ? err.stack : "[REDACTED]",
    path: req.path,
    method: req.method,
    userId: req.user?._id || "anonymous",
    ip: req.ip,
    userAgent: req.get("user-agent")?.substring(0, 100), // Truncate user agent
  });

  const statusCode = err.statusCode || err.status || 500;

  // In production, don't expose internal error messages
  const message =
    NODE_ENV === "production" ? "Internal server error" : errorMessage;

  res.status(statusCode).json({
    success: false,
    message,
    requestId: req.id,
    code: err.code || "INTERNAL_ERROR",
    ...(NODE_ENV === "development" && { stack: err.stack }),
  });
});

export default app;
