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

// ========================================
// AUTH LIMITS (very strict — these are attack surfaces)
// ========================================

// Login: 10 attempts per 15 minutes per IP (brute-force protection)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true, // only count failed attempts
  ...standardConfig("login"),
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

// Send OTP: 5 per hour per IP (prevent email bombing + cost abuse)
export const sendOTPLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  ...standardConfig("OTP requests"),
});

// Verify OTP: 10 attempts per 15 minutes (brute-force OTP codes)
export const verifyOTPLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  ...standardConfig("OTP verification"),
});

// Password reset: 3 per hour per email (prevent password reset spam)
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  ...standardConfig("password reset requests"),
});

// ========================================
// CONTENT LIMITS (spam protection)
// ========================================

// Messages: 30 per minute per user (anti-spam DMs)
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip, // per-user, not per-IP
  ...standardConfig("messages"),
});

// Posts: 10 per hour per user (prevent content spam)
export const postLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  ...standardConfig("posts"),
});

// Comments: 30 per 15 minutes per user
export const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  ...standardConfig("comments"),
});

// Likes/reactions: 120 per 15 minutes (generous — users like a lot)
export const reactionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  ...standardConfig("reactions"),
});

// ========================================
// UPLOAD LIMITS (storage abuse prevention)
// ========================================

// Image uploads: 20 per hour per user
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  ...standardConfig("uploads"),
});

// ========================================
// DISCOVERY / SWIPE LIMITS (prevent bot swiping)
// ========================================

// Swipe actions: 200 per 15 minutes (generous but prevents bots)
export const swipeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  ...standardConfig("swipes"),
});

// Profile views: 100 per 15 minutes
export const profileViewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  ...standardConfig("profile views"),
});
