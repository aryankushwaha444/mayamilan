import AuditLog from "../models/AuditLog.js";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════

// Keys that should NEVER be logged to the database
const SENSITIVE_KEYS = [
  "password",
  "token",
  "refreshtoken",
  "accesstoken",
  "twofactorsecret",
  "twofactorbackupcodes",
  "secret",
  "creditcard",
  "cvv",
  "authorization",
  "cookie",
  "apikey",
  "privatekey",
  "ssn",
  "socialsecurity",
];

const MAX_METADATA_SIZE = 100 * 1024; // 100KB limit per log to prevent 16MB BSON crashes
const MAX_LOG_RATE = 100; // Max logs per minute per user
const LOG_RATE_WINDOW = 60 * 1000; // 1 minute

// ✅ ADDED: Rate limiting to prevent log flooding
const logRateTracker = new Map();

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Deep redact sensitive information from an object
 */
const redactSensitiveData = (obj, depth = 0) => {
  // ✅ ADDED: Prevent stack overflow from deeply nested objects
  if (depth > 10) return "[MAX_DEPTH]";

  if (!obj || typeof obj !== "object") return obj;

  const redacted = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const lowerKey = key.toLowerCase();

      // Check if key contains any sensitive words
      if (SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive))) {
        redacted[key] = "[REDACTED]";
      } else if (typeof obj[key] === "object" && obj[key] !== null) {
        redacted[key] = redactSensitiveData(obj[key], depth + 1);
      } else if (typeof obj[key] === "string") {
        // ✅ ADDED: Truncate very long strings to prevent log bloat
        redacted[key] = obj[key].substring(0, 1000);
      } else {
        redacted[key] = obj[key];
      }
    }
  }

  return redacted;
};

/**
 * Safely extract IP address, handling proxies and missing req objects
 */
const extractIp = (req) => {
  if (!req) return "unknown";

  // Check standard Express IP
  if (req.ip) return req.ip;

  // Check proxy headers (Cloudflare, Nginx, AWS ALB)
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list: "client, proxy1, proxy2"
    return typeof forwarded === "string"
      ? forwarded.split(",")[0].trim()
      : "unknown";
  }

  // Fallback to raw connection IP
  return req.connection?.remoteAddress || "unknown";
};

/**
 * Safely extract User-Agent, handling Express, WebSockets, and Cron jobs
 */
const extractUserAgent = (req) => {
  if (!req) return "unknown";

  // Express provides req.get()
  if (typeof req.get === "function") {
    return req.get("user-agent") || "unknown";
  }

  // Fallback for raw Node HTTP, WebSockets, or mocked requests
  return req.headers?.["user-agent"] || "unknown";
};

/**
 * ✅ ADDED: Check rate limit for audit logging
 */
const checkLogRateLimit = (userId) => {
  const key = userId || "anonymous";
  const now = Date.now();

  const tracker = logRateTracker.get(key) || { count: 0, windowStart: now };

  if (now - tracker.windowStart > LOG_RATE_WINDOW) {
    tracker.count = 1;
    tracker.windowStart = now;
  } else {
    tracker.count++;
  }

  logRateTracker.set(key, tracker);

  return tracker.count <= MAX_LOG_RATE;
};

// Cleanup old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of logRateTracker.entries()) {
    if (now - data.windowStart > LOG_RATE_WINDOW) {
      logRateTracker.delete(key);
    }
  }
}, 5 * 60 * 1000);

// ═══════════════════════════════════════════
// MAIN LOGGER
// ═══════════════════════════════════════════

export const logAudit = async (req, action, metadata = {}) => {
  try {
    // 1. Safely extract user context
    const userId = req?.user?._id || metadata?.userId || null;
    const email = req?.user?.email || metadata?.email || null;

    // ✅ ADDED: Rate limiting to prevent log flooding attacks
    if (!checkLogRateLimit(userId)) {
      console.warn(`⚠️ Audit log rate limit exceeded for user ${userId}`);
      return;
    }

    // 2. Safely extract network context
    const ip = extractIp(req);
    const userAgent = extractUserAgent(req).substring(0, 500); // ✅ Truncate UA

    // 3. Redact sensitive data from metadata
    const safeMetadata = redactSensitiveData(metadata);

    // 4. Protect against MongoDB 16MB BSON limit crashes
    let finalMetadata = safeMetadata;
    try {
      const metadataString = JSON.stringify(safeMetadata);
      if (metadataString.length > MAX_METADATA_SIZE) {
        finalMetadata = {
          _truncated: true,
          _warning:
            "Metadata exceeded 100KB and was truncated to prevent DB crash",
          // Keep top-level keys for context, but drop the massive payload
          keys: Object.keys(safeMetadata).slice(0, 20),
        };
      }
    } catch (stringifyErr) {
      // Handle circular references
      finalMetadata = {
        _error:
          "Metadata contained circular references and could not be serialized",
      };
    }

    // 5. Insert into database
    // Note: We use .catch() here so that if the DB insert fails,
    // it doesn't throw an unhandled rejection and crash the main app thread.
    await AuditLog.create({
      userId,
      email,
      action,
      ip,
      userAgent,
      metadata: finalMetadata,
    }).catch((dbErr) => {
      console.error("Audit log DB insert failed:", dbErr.message);
    });
  } catch (err) {
    // Catch any synchronous preparation errors
    console.error("Audit log preparation failed:", err.message);
  }
};
