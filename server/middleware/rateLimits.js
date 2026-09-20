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
  validate: {
    xForwardedForHeader: true,
    ip: true,
    default: true,
  },
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

// IP-only key generator
const ipKeyGenerator = (req) => {
  const ip =
    req.ip?.replace(/^::ffff:/, "") ||
    req.connection?.remoteAddress ||
    "unknown";
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
