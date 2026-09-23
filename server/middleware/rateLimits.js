import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";

// ========================================
// SHARED CONFIG
// ========================================

const standardMessage = (action) => ({
  success: false,
  message: `Too many ${action} attempts. Please slow down.`,
});

const baseConfig = (action) => ({
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage(action),
  validate: false,
});

// ========================================
// KEY GENERATORS
// ========================================

/**
 * Extract user ID from JWT WITHOUT verification.
 * We only need the payload for bucketing — actual auth
 * validation happens in the auth middleware.
 * ✅ Avoids expensive crypto.verify on every request.
 */
const extractUserIdFromToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  try {
    const token = authHeader.split(" ")[1];
    // Decode without verification — just read the payload
    const decoded = jwt.decode(token);
    return decoded?.userId || decoded?.id || null;
  } catch {
    return null;
  }
};

/** IP-only key generator (IPv6 compatible) */
const ipKeyGenerator = (req) => {
  let ip = req.ip || req.connection?.remoteAddress || "unknown";

  // Strip IPv6 prefix from IPv4-mapped addresses
  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }

  // Normalize actual IPv6
  if (ip.includes(":")) {
    ip = ip.toLowerCase();
  }

  return `ip:${ip}`;
};

/** User-first key generator (falls back to IP) */
const userOrIpKeyGenerator = (req) => {
  // From auth middleware
  if (req.user?._id) {
    return `user:${req.user._id.toString()}`;
  }

  // From JWT token (unverified decode for bucketing only)
  const userId = extractUserIdFromToken(req);
  if (userId) {
    return `user:${userId}`;
  }

  // Fall back to IP
  return ipKeyGenerator(req);
};

// ========================================
// AUTH LIMITS (IP-based only)
// ========================================

export const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // ✅ Generous for OAuth redirects (Google may retry)
  skipSuccessfulRequests: true,
  keyGenerator: ipKeyGenerator,
  ...baseConfig("sign-in"),
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: ipKeyGenerator,
  ...baseConfig("login"),
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: ipKeyGenerator,
  ...baseConfig("registration"),
});

export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  skipSuccessfulRequests: true, // ✅ Added
  keyGenerator: ipKeyGenerator,
  ...baseConfig("token refresh"),
});

export const sendOTPLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: ipKeyGenerator,
  ...baseConfig("OTP requests"),
});

export const verifyOTPLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true, // ✅ Added
  keyGenerator: ipKeyGenerator,
  ...baseConfig("OTP verification"),
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: ipKeyGenerator,
  ...baseConfig("password reset requests"),
});

export const sessionManagementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: ipKeyGenerator,
  ...baseConfig("session management"), // ✅ Now uses baseConfig
});

export const reactivationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: ipKeyGenerator,
  ...baseConfig("reactivation"), // ✅ Now uses baseConfig
});

// ========================================
// CONTENT LIMITS (per-user, falls back to IP)
// ========================================

export const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("messages"),
});

export const postLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("posts"),
});

export const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("comments"),
});

export const reactionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("reactions"),
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("uploads"),
});

export const swipeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("swipes"),
});

export const profileViewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("profile views"),
});

// ========================================
// USER ACTION LIMITS
// ========================================

export const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("reports"),
});

export const blockLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("block actions"),
});

export const profileUpdateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("profile updates"),
});

export const accountDeletionLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("account deletion attempts"),
});

export const dataExportLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 2,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("data exports"),
});

// ========================================
// GENERAL API LIMITER
// ========================================

export const generalApiLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 200,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("API requests"),
  skip: (req) => {
    return req.path === "/api/health" || req.path.startsWith("/uploads/");
  },
});

// ========================================
// ADMIN LIMITS
// ========================================

export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: userOrIpKeyGenerator,
  skip: (req) => req.user?.role === "superadmin",
  ...baseConfig("admin operations"),
});

export const adminSensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("sensitive admin operations"), // ✅ Now uses baseConfig
});

export const adminUserActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("admin user actions"),
});

export const adminReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("admin report reviews"),
});
