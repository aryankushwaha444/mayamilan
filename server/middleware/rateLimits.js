import rateLimit from "express-rate-limit";

// ========================================
// SHARED CONFIG
// ========================================

const standardMessage = (action) => ({
  success: false,
  message: `Too many ${action} attempts. Please slow down.`,
});

const standardConfig = (action) => ({
  standardHeaders: true,
  legacyHeaders: false,
  message: standardMessage(action),
});

// ✅ Helper: Safe key generator that handles both user ID and IP properly
const safeKeyGenerator = (req) => {
  // If user is authenticated, use their ID (most secure)
  if (req.user && req.user._id) {
    return req.user._id.toString();
  }
  // Otherwise use IP (default behavior, IPv6-safe)
  return req.ip;
};

// ========================================
// AUTH LIMITS (very strict — these are attack surfaces)
// ========================================

// Login: 10 attempts per 15 minutes per IP (brute-force protection)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  ...standardConfig("login"),
  // ✅ Use default IP-based key generator (no custom keyGenerator)
});

// Register: 3 accounts per hour per IP (anti-account-farming)
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  ...standardConfig("registration"),
});

// Token refresh: 60 per 15 minutes (generous — silent refresh fires often)
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  ...standardConfig("token refresh"),
});

// ========================================
// EMAIL / OTP LIMITS (critical — email sending is expensive)
// ========================================

export const sendOTPLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  ...standardConfig("OTP requests"),
});

export const verifyOTPLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  ...standardConfig("OTP verification"),
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  ...standardConfig("password reset requests"),
});

// ========================================
// CONTENT LIMITS (spam protection)
// ========================================

// Messages: 30 per minute per user
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: safeKeyGenerator, // ✅ Safe for IPv6
  ...standardConfig("messages"),
});

// Posts: 10 per hour per user
export const postLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: safeKeyGenerator,
  ...standardConfig("posts"),
});

// Comments: 30 per 15 minutes per user
export const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: safeKeyGenerator,
  ...standardConfig("comments"),
});

// Likes/reactions: 120 per 15 minutes
export const reactionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: safeKeyGenerator,
  ...standardConfig("reactions"),
});

// ========================================
// UPLOAD LIMITS (storage abuse prevention)
// ========================================

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: safeKeyGenerator,
  ...standardConfig("uploads"),
});

// ========================================
// DISCOVERY / SWIPE LIMITS (prevent bot swiping)
// ========================================

export const swipeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyGenerator: safeKeyGenerator,
  ...standardConfig("swipes"),
});

export const profileViewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: safeKeyGenerator,
  ...standardConfig("profile views"),
});
