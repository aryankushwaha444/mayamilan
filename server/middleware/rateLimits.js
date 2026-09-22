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
  validate: false, // ✅ DISABLE ALL VALIDATIONS - we handle IPv6 correctly
});

// ========================================
// KEY GENERATORS
// ========================================

// ✅ Extract user ID from JWT token (without full authentication)
const extractUserIdFromToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    return decoded.userId;
  } catch {
    return null;
  }
};

// IP-only key generator (IPv6 compatible)
const ipKeyGenerator = (req) => {
  // Get IP from various sources
  let ip = req.ip || req.connection?.remoteAddress || "unknown";

  // Strip IPv6 prefix from IPv4-mapped addresses
  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }

  // For actual IPv6, normalize it
  if (ip.includes(":") && !ip.startsWith("::ffff:")) {
    // Keep full IPv6 address for proper rate limiting
    ip = ip.toLowerCase();
  }

  return `ip:${ip}`;
};

// ✅ User-first key generator (extracts from JWT if available)
const userOrIpKeyGenerator = (req) => {
  // Try to get user from req.user (if auth middleware already ran)
  if (req.user && req.user._id) {
    return `user:${req.user._id.toString()}`;
  }

  // Try to extract from JWT token (for global API limiter)
  const userId = extractUserIdFromToken(req);
  if (userId) {
    return `user:${userId}`;
  }

  // Fall back to IP
  const ip =
    req.ip?.replace(/^::ffff:/, "") ||
    req.connection?.remoteAddress ||
    "unknown";
  return `ip:${ip}`;
};

// ========================================
// AUTH LIMITS (IP-based only)
// ========================================

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
  keyGenerator: ipKeyGenerator,
  ...baseConfig("OTP verification"),
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: ipKeyGenerator,
  ...baseConfig("password reset requests"),
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
// GENERAL API LIMITER (per-user for authenticated, per-IP for anonymous)
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
// USER ACTION LIMITS (per-user, falls back to IP)
// ========================================

export const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 reports per hour per user
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("reports"),
});

export const blockLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 block/unblock actions per hour per user
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("block actions"),
});

export const profileUpdateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 profile updates per hour per user
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("profile updates"),
});

export const accountDeletionLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3, // 3 deletion attempts per day
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("account deletion attempts"),
});

export const dataExportLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 2, // 2 exports per day (GDPR allows reasonable limits)
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("data exports"),
});

export const sessionManagementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: ipKeyGenerator, // ✅ ADD
  message: {
    success: false,
    message: "Too many session management requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // ✅ ADD THIS
});

export const reactivationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: ipKeyGenerator, // ✅ ADD
  message: {
    success: false,
    message: "Too many reactivation attempts. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // ✅ ADD THIS
});

// ADMIN LIMITS (per-user, stricter for sensitive operations)

export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 admin requests per 15 minutes
  keyGenerator: userOrIpKeyGenerator,
  skip: (req) => req.user?.role === "superadmin",
  ...baseConfig("admin operations"),
});

export const adminSensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKeyGenerator,
  message: {
    success: false,
    message:
      "Too many sensitive admin operations. Please wait before trying again.",
    code: "ADMIN_RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // ✅ ADD THIS
});

export const adminUserActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 user management actions per hour
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("admin user actions"),
});

export const adminReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 report reviews per hour
  keyGenerator: userOrIpKeyGenerator,
  ...baseConfig("admin report reviews"),
});
