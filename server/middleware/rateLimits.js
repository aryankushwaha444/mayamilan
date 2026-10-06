import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import jwt from "jsonwebtoken";
import redis from "../utils/cache.js";
import { logAudit } from "../utils/auditLogger.js";
import crypto from "crypto";

// ═══════════════════════════════════════════
// CONFIGURATION (from environment)
// ═══════════════════════════════════════════
const CONFIG = {
  enabled: process.env.RATE_LIMIT_ENABLED !== "false",
  useRedis: process.env.RATE_LIMIT_STORE === "redis" && redis,
  whitelistedIPs: (process.env.RATE_LIMIT_WHITELIST || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean),
  whitelistedCIDRs: (process.env.RATE_LIMIT_WHITELIST_CIDR || "")
    .split(",")
    .map((cidr) => cidr.trim())
    .filter(Boolean),
  tierMultipliers: {
    free: 1,
    premium: parseInt(process.env.RATE_LIMIT_PREMIUM_MULTIPLIER || "3", 10),
    vip: parseInt(process.env.RATE_LIMIT_VIP_MULTIPLIER || "10", 10),
  },
  adaptive: {
    enabled: process.env.ADAPTIVE_RATE_LIMIT !== "false",
    suspiciousThreshold: 0.8,
    burstThreshold: 10, // 10 requests in 1 second = burst
    geoBlockEnabled: process.env.GEO_BLOCK_ENABLED === "true",
    blockedCountries: (process.env.BLOCKED_COUNTRIES || "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  },
};

// ═══════════════════════════════════════════
// SECURITY: Suspicious behavior tracking
// ═══════════════════════════════════════════
// NOTE: keyed by the SAME identifier as the limiter (user-or-ip), never raw IP,
// so one co-tenant bursting on a shared network cannot raise the score for another.
const suspiciousActivity = new Map(); // userOrIpKey -> { score, timestamp, patterns }
const burstTracker = new Map(); // userOrIpKey -> { count, windowStart }

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of suspiciousActivity.entries()) {
    if (now - value.timestamp > 15 * 60 * 1000) {
      suspiciousActivity.delete(key);
    }
  }
  for (const [key, value] of burstTracker.entries()) {
    if (now - value.windowStart > 5000) {
      burstTracker.delete(key);
    }
  }
}, 60 * 1000);

const updateSuspiciousScore = (identifier, reason) => {
  const entry = suspiciousActivity.get(identifier) || {
    score: 0,
    timestamp: Date.now(),
    patterns: [],
  };

  entry.score += 1;
  entry.timestamp = Date.now();
  entry.patterns.push(reason);

  if (entry.patterns.length > 20) {
    entry.patterns = entry.patterns.slice(-20);
  }

  suspiciousActivity.set(identifier, entry);
  return entry.score;
};

const detectBurst = (identifier) => {
  const now = Date.now();
  const entry = burstTracker.get(identifier) || { count: 0, windowStart: now };

  if (now - entry.windowStart > 1000) {
    entry.count = 1;
    entry.windowStart = now;
  } else {
    entry.count++;
  }

  burstTracker.set(identifier, entry);

  if (entry.count > CONFIG.adaptive.burstThreshold) {
    updateSuspiciousScore(identifier, "burst_detected");
    return true;
  }

  return false;
};

// ═══════════════════════════════════════════
// STORE CONFIGURATION (with fallback)
// ═══════════════════════════════════════════
const createStore = (prefix = "rl:") => {
  if (!CONFIG.useRedis) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "⚠️  Using memory store for rate limiting. Configure Redis for production."
      );
    }
    return undefined; // Falls back to memory store
  }

  try {
    return new RedisStore({
      sendCommand: async (...args) => {
        try {
          return await redis.call(...args);
        } catch (error) {
          console.error("❌ Redis command failed:", error.message);
          return null;
        }
      },
      prefix,
    });
  } catch (error) {
    console.error("❌ Failed to create Redis store:", error.message);
    return undefined;
  }
};

// ═══════════════════════════════════════════
// SHARED CONFIG
// ═══════════════════════════════════════════
const standardMessage = (action, windowMs) => {
  const windowMinutes = Math.ceil(windowMs / (60 * 1000));
  return {
    success: false,
    message: `Too many ${action} attempts. Please try again in ${windowMinutes} minutes.`,
    code: "RATE_LIMIT_EXCEEDED",
    retryAfter: Math.ceil(windowMs / 1000),
  };
};

const baseConfig = (action, options = {}) => {
  const { windowMs = 60000, storePrefix = "rl:", customSkip } = options;

  return {
    standardHeaders: true,
    legacyHeaders: false,
    message: standardMessage(action, windowMs),
    validate: false,
    store: createStore(storePrefix),
    skip: async (req, res) => {
      if (!CONFIG.enabled) return true;

      const ip = req.ip || req.connection?.remoteAddress;

      if (ip) {
        if (CONFIG.whitelistedIPs.includes(ip)) return true;
        for (const cidr of CONFIG.whitelistedCIDRs) {
          if (isIPInCIDR(ip, cidr)) return true;
        }
      }

      // SECURITY: per-user (not per-IP) suspicious scoring
      if (CONFIG.adaptive.enabled) {
        const identifier = userOrIpKeyGenerator(req);
        if (identifier) {
          const suspicious = suspiciousActivity.get(identifier);
          if (suspicious && suspicious.score > 10) {
            updateSuspiciousScore(identifier, "high_suspicion");
            return false; // Don't skip - enforce limits
          }
        }
      }

      if (customSkip) return customSkip(req, res);

      return false;
    },
    handler: async (req, res, next, options) => {
      const identifier = userOrIpKeyGenerator(req);

      if (identifier) {
        updateSuspiciousScore(identifier, "rate_limit_hit");
      }

      await logAudit(req, "rate_limit_exceeded", {
        ip: req.ip,
        userId: req.user?._id || "anonymous",
        path: req.path,
        method: req.method,
        action,
        userAgent: req.get("user-agent")?.substring(0, 100),
      }).catch(() => {});

      res.status(429).json(options.message);
    },
  };
};

const isIPInCIDR = (ip, cidr) => {
  try {
    const [range, bits] = cidr.split("/");
    const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
    const ipNum = ipToInt(ip);
    const rangeNum = ipToInt(range);
    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
};

const ipToInt = (ip) => {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
  );
};

// ═══════════════════════════════════════════
// KEY GENERATORS
// ═══════════════════════════════════════════

// Hash a target so raw emails/tokens never become redis keys (privacy + bounded length)
const shortHash = (v) =>
  crypto.createHash("sha256").update(String(v)).digest("hex").slice(0, 16);

// Identify the account a PRE-AUTH request targets (login/register/OTP/reset/reactivate)
const identifyTarget = (req) => {
  const b = req.body || {};
  const email =
    typeof b.email === "string" && b.email.trim()
      ? b.email.toLowerCase().trim()
      : "";
  if (email) return `e:${shortHash(email)}`;
  const rt = b.reactivationToken;
  if (typeof rt === "string" && rt) return `rt:${shortHash(rt)}`;
  return "";
};

const getIpKey = (req) => {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  return ipKeyGenerator(ip);
};

/**
 * ✅ Per-(IP + account) key for pre-auth routes: each user gets their OWN budget
 * on a shared network, while an unidentifiable request still falls back to per-IP.
 * Mass enumeration from one IP is additionally capped by generalApiLimiter's
 * per-IP anonymous ceiling and by per-EMAIL trackLoginAttempt in the controller.
 */
export const ipTargetKeyGenerator = (req) => {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const target = identifyTarget(req);
  return target ? `ip:${ip}|${target}` : `ip:${ip}`;
};

/**
 * ✅ Per-USER key for authenticated routes (the core of "each user own limit").
 * Order: req.user (post-protect) -> access-token userId (pre-protect, e.g. the
 * global limiter) -> refresh-cookie userId (cookie-auth routes like /refresh)
 * -> IP (genuinely anonymous). Tier is read from req.user when present.
 */
export const userOrIpKeyGenerator = (req) => {
  if (req.user && req.user._id) {
    const tier = req.user.subscriptionTier || "free";
    return `user:${tier}:${req.user._id.toString()}`;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET_CURRENT || process.env.JWT_SECRET,
        { algorithms: ["HS256"] }
      );
      const userId = decoded?.userId || decoded?.id || decoded?._id;
      if (userId) return `user:free:${userId}`;
    } catch {
      /* expired/invalid -> try refresh cookie, then IP */
    }
  }

  // Cookie-auth routes (e.g. /auth/refresh) identify the user via the refresh JWT
  const refreshCookie = req.cookies?.refreshToken;
  if (typeof refreshCookie === "string" && refreshCookie) {
    try {
      const decoded = jwt.verify(
        refreshCookie,
        process.env.JWT_REFRESH_SECRET_CURRENT ||
          process.env.JWT_REFRESH_SECRET,
        { algorithms: ["HS256"] }
      );
      const userId = decoded?.userId || decoded?.id;
      if (userId && decoded?.type === "refresh") return `user:free:${userId}`;
    } catch {
      /* ignore */
    }
  }

  const ip = req.ip || req.connection?.remoteAddress || "127.0.0.1";
  return `ip:${ip}`;
};

const getTieredMax = (baseMax, req) => {
  if (!req.user) return baseMax;
  const tier = req.user.subscriptionTier || "free";
  const multiplier = CONFIG.tierMultipliers[tier] || 1;
  return Math.floor(baseMax * multiplier);
};

// ═══════════════════════════════════════════
// AUTH LIMITS
// Pre-auth -> per-(IP+account) so co-tenants don't share a budget.
// oauth stays per-IP (no identity before the callback) but skipSuccessfulRequests
// means only FAILED attempts count, so legit co-tenants aren't punished.
// ═══════════════════════════════════════════
export const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skipSuccessfulRequests: true,
  keyGenerator: getIpKey,
  ...baseConfig("OAuth sign-in", {
    windowMs: 15 * 60 * 1000,
    storePrefix: "rl:oauth:",
  }),
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: ipTargetKeyGenerator,
  ...baseConfig("login", {
    windowMs: 15 * 60 * 1000,
    storePrefix: "rl:login:",
  }),
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: ipTargetKeyGenerator,
  ...baseConfig("registration", {
    windowMs: 60 * 60 * 1000,
    storePrefix: "rl:register:",
  }),
});

// refresh is cookie-auth -> per-user via the refresh-JWT branch
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  skipSuccessfulRequests: true,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("token refresh", {
    windowMs: 15 * 60 * 1000,
    storePrefix: "rl:refresh:",
  }),
});

export const sendOTPLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: ipTargetKeyGenerator,
  ...baseConfig("OTP requests", {
    windowMs: 60 * 60 * 1000,
    storePrefix: "rl:otp-send:",
  }),
});

export const verifyOTPLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: ipTargetKeyGenerator,
  ...baseConfig("OTP verification", {
    windowMs: 15 * 60 * 1000,
    storePrefix: "rl:otp-verify:",
  }),
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: ipTargetKeyGenerator,
  ...baseConfig("password reset requests", {
    windowMs: 60 * 60 * 1000,
    storePrefix: "rl:password-reset:",
  }),
});

// session management runs AFTER protect -> per-user
export const sessionManagementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("session management", {
    windowMs: 15 * 60 * 1000,
    storePrefix: "rl:session:",
  }),
});

export const reactivationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: ipTargetKeyGenerator,
  ...baseConfig("reactivation", {
    windowMs: 60 * 60 * 1000,
    storePrefix: "rl:reactivation:",
  }),
});

// ═══════════════════════════════════════════
// CONTENT LIMITS (per-user with tier support)
// ═══════════════════════════════════════════
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: (req) => getTieredMax(30, req),
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("messages", {
    windowMs: 60 * 1000,
    storePrefix: "rl:message:",
  }),
});

export const postLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: (req) => getTieredMax(10, req),
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("posts", {
    windowMs: 60 * 60 * 1000,
    storePrefix: "rl:post:",
  }),
});

export const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => getTieredMax(30, req),
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("comments", {
    windowMs: 15 * 60 * 1000,
    storePrefix: "rl:comment:",
  }),
});

export const reactionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => getTieredMax(120, req),
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("reactions", {
    windowMs: 15 * 60 * 1000,
    storePrefix: "rl:reaction:",
  }),
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: (req) => getTieredMax(20, req),
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("uploads", {
    windowMs: 60 * 60 * 1000,
    storePrefix: "rl:upload:",
  }),
});

export const swipeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => getTieredMax(200, req),
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("swipes", {
    windowMs: 15 * 60 * 1000,
    storePrefix: "rl:swipe:",
  }),
});

export const profileViewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => getTieredMax(100, req),
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("profile views", {
    windowMs: 15 * 60 * 1000,
    storePrefix: "rl:profile-view:",
  }),
});

// ═══════════════════════════════════════════
// USER ACTION LIMITS
// ═══════════════════════════════════════════
export const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: (req) => getTieredMax(10, req),
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("reports", {
    windowMs: 60 * 60 * 1000,
    storePrefix: "rl:report:",
  }),
});

export const blockLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: (req) => getTieredMax(30, req),
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("block actions", {
    windowMs: 60 * 60 * 1000,
    storePrefix: "rl:block:",
  }),
});

export const profileUpdateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: (req) => getTieredMax(20, req),
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("profile updates", {
    windowMs: 60 * 60 * 1000,
    storePrefix: "rl:profile-update:",
  }),
});

export const accountDeletionLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("account deletion attempts", {
    windowMs: 24 * 60 * 60 * 1000,
    storePrefix: "rl:account-delete:",
  }),
});

export const dataExportLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 2,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("data exports", {
    windowMs: 24 * 60 * 60 * 1000,
    storePrefix: "rl:data-export:",
  }),
});

// ═══════════════════════════════════════════
// GENERAL API LIMITER (per-user; burst tracked per-user)
// Mounted app.use("/api", ...) BEFORE protect, so req.user is undefined here —
// userOrIpKeyGenerator extracts the userId from the bearer token instead, which
// is exactly what keeps two users on one Wi-Fi in separate buckets. Anonymous
// requests (no token) fall to ip:<ip>, giving a per-IP DoS/enumeration ceiling.
// ═══════════════════════════════════════════
export const generalApiLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: (req) => {
    const identifier = userOrIpKeyGenerator(req);
    if (identifier && detectBurst(identifier)) {
      return Math.floor(getTieredMax(200, req) * 0.5);
    }
    return getTieredMax(200, req);
  },
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("API requests", {
    windowMs: 30 * 60 * 1000,
    storePrefix: "rl:api:",
    // FIX: req.path is RELATIVE to the "/api" mount, so compare originalUrl
    customSkip: (req) => {
      const url = req.originalUrl || req.url || "";
      return (
        url === "/api/health" ||
        url.startsWith("/uploads/") ||
        url.startsWith("/assets/")
      );
    },
  }),
});

// ═══════════════════════════════════════════
// ADMIN LIMITS
// ═══════════════════════════════════════════
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("admin operations", {
    windowMs: 15 * 60 * 1000,
    storePrefix: "rl:admin:",
    customSkip: (req) => req.user?.role === "superadmin",
  }),
});

export const adminSensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("sensitive admin operations", {
    windowMs: 60 * 60 * 1000,
    storePrefix: "rl:admin-sensitive:",
    customSkip: (req) => req.user?.role === "superadmin",
  }),
});

export const adminUserActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("admin user actions", {
    windowMs: 60 * 60 * 1000,
    storePrefix: "rl:admin-user:",
    customSkip: (req) => req.user?.role === "superadmin",
  }),
});

export const adminReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("admin report reviews", {
    windowMs: 60 * 60 * 1000,
    storePrefix: "rl:admin-report:",
    customSkip: (req) => req.user?.role === "superadmin",
  }),
});

// ═══════════════════════════════════════════
// UTILITY EXPORTS
// ═══════════════════════════════════════════
export const createCustomLimiter = (options) => {
  const {
    windowMs = 60000,
    max = 10,
    keyGenerator = userOrIpKeyGenerator,
    action = "custom",
    storePrefix = "rl:custom:",
    skipSuccessfulRequests = false,
    customSkip,
  } = options;

  return rateLimit({
    windowMs,
    max,
    keyGenerator,
    skipSuccessfulRequests,
    ...baseConfig(action, { windowMs, storePrefix, customSkip }),
  });
};

export const dynamicLimiter = (configFn) => {
  return async (req, res, next) => {
    try {
      const config = await configFn(req);
      const limiter = createCustomLimiter(config);
      return limiter(req, res, next);
    } catch (error) {
      console.error("Dynamic limiter error:", error.message);
      next(); // Fail open - don't block on errors
    }
  };
};

export const getSuspiciousActivity = () => {
  return Array.from(suspiciousActivity.entries()).map(([key, value]) => ({
    identifier: key,
    score: value.score,
    patterns: value.patterns,
    timestamp: value.timestamp,
  }));
};

export const clearSuspiciousActivity = (identifier) => {
  suspiciousActivity.delete(identifier);
};

export default {
  oauthLimiter,
  loginLimiter,
  registerLimiter,
  refreshLimiter,
  sendOTPLimiter,
  verifyOTPLimiter,
  passwordResetLimiter,
  sessionManagementLimiter,
  reactivationLimiter,
  messageLimiter,
  postLimiter,
  commentLimiter,
  reactionLimiter,
  uploadLimiter,
  swipeLimiter,
  profileViewLimiter,
  reportLimiter,
  blockLimiter,
  profileUpdateLimiter,
  accountDeletionLimiter,
  dataExportLimiter,
  generalApiLimiter,
  adminLimiter,
  adminSensitiveLimiter,
  adminUserActionLimiter,
  adminReportLimiter,
  createCustomLimiter,
  dynamicLimiter,
  getSuspiciousActivity,
  clearSuspiciousActivity,
};
