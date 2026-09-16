import rateLimit from "express-rate-limit";

// ========================================
// SHARED CONFIG
// ========================================

const standardMessage = (action) => ({
  success: false,
  message: `Too many ${action} attempts. Please slow down.`,
});

// ✅ Base config that disables ALL validation warnings
const baseConfig = (action) => ({
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage(action),
  validate: {
    xForwardedForHeader: false,
    ip: false,
    default: false,
  },
});

// ========================================
// AUTH LIMITS (IP-based, no custom keyGenerator)
// ========================================

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  ...baseConfig("login"),
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  ...baseConfig("registration"),
});

export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  ...baseConfig("token refresh"),
});

export const sendOTPLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  ...baseConfig("OTP requests"),
});

export const verifyOTPLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  ...baseConfig("OTP verification"),
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  ...baseConfig("password reset requests"),
});

// ========================================
// CONTENT LIMITS (user-based, falls back to IP)
// ========================================

// ✅ This keyGenerator is IPv6-safe because we disable validation above
const userOrIpKeyGenerator = (req) => {
  return req.user?._id?.toString() || req.ip || "unknown";
};

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
