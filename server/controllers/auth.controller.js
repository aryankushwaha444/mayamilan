import argon2 from "argon2";
import crypto from "crypto";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import { registerSchema, loginSchema } from "../validators/auth.validator.js";
import { sendOTP, sendSuspiciousLoginEmail } from "../config/email.js";
import mongoose from "mongoose";
import Match from "../models/Match.js";
import Like from "../models/Like.js";
import Conversation from "../models/Conversation.js";
import Notification from "../models/Notification.js";
import { getIO } from "../sockets/socket.js";
import {
  generateOTP,
  saveOTP,
  verifyOTP,
  checkOtpRequestLimit,
} from "../utils/otp.js";
import { verifyTurnstile } from "../utils/turnstile.js";
import { lookupIp } from "../utils/geoip.js";
import {
  getDeviceId,
  deviceFingerprint,
  describeDevice,
  parseDevice,
} from "../utils/device.js";
import { logAudit } from "../utils/auditLogger.js";
import { verifyTotp, decryptSecret, verifyBackupCode } from "../utils/totp.js";
import {
  checkPasswordBreach,
  getBreachMessage,
} from "../utils/passwordBreach.js";
import {
  generateAccessToken,
  generateRefreshToken,
  generateTempToken, // ✅ pending 2FA token (correct claims)
  hashToken,
  generateReactivationToken,
  verifyRefreshToken,
  verifyReactivationToken,
  verifyTempToken,
  constantTimeCompare,
} from "../utils/generateToken.js";
import redis from "../utils/cache.js";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const HONEYPOT_MIN_TIME_MS = 2000;
const MIN_AGE = 18;
const MIN_PASSWORD_LENGTH = 8;
const MAX_REACTIVATION_ATTEMPTS = 3;
const OTP_VERIFIED_TTL_SECONDS = 600;
const MAX_SESSIONS_PER_USER = parseInt(
  process.env.MAX_SESSIONS_PER_USER || "10",
  10
);

// ✅ Pending 2FA cookie: httpOnly (invisible to JS/XSS, never in the URL), mirrors the
// proven refreshToken flags so it survives the 302->XHR hop in every environment.
const PENDING_2FA_COOKIE = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? "none" : "lax",
  maxAge: 5 * 60 * 1000,
  path: "/",
};

// ✅ Per-user lockout for the 2FA *verify* step (login). A 6-digit TOTP is 10^6;
// without this a leaked password + IP rotation brute-forces each 5m pending token.
// Redis when present, else the User fields added for the manage flow (works on a
// standalone). Login-scoped keys so it can't be unlocked independently of setup.
const TWOFA_MAX_FAILED = 5;
const TWOFA_LOCKOUT_MIN = 15;
const twofaLockoutKey = (id) => `2fa_login_lockout:${id}`;
const twofaAttemptsKey = (id) => `2fa_login_attempts:${id}`;

const checkTwofaLockout = async (userId) => {
  if (redis) {
    const until = await redis.get(twofaLockoutKey(userId));
    if (until) {
      const rem = parseInt(until, 10) - Date.now();
      if (rem > 0)
        return { locked: true, remainingMinutes: Math.ceil(rem / 60000) };
    }
    return { locked: false };
  }
  const u = await User.findById(userId).select("+twoFactorLockoutUntil").lean();
  const until = u?.twoFactorLockoutUntil;
  if (until && until.getTime() > Date.now())
    return {
      locked: true,
      remainingMinutes: Math.ceil((until.getTime() - Date.now()) / 60000),
    };
  return { locked: false };
};

const handleTwofaFailed = async (userId) => {
  if (redis) {
    const n = await redis.incr(twofaAttemptsKey(userId));
    await redis.expire(twofaAttemptsKey(userId), TWOFA_LOCKOUT_MIN * 60);
    if (n >= TWOFA_MAX_FAILED) {
      const until = Date.now() + TWOFA_LOCKOUT_MIN * 60 * 1000;
      await redis.set(
        twofaLockoutKey(userId),
        String(until),
        "EX",
        TWOFA_LOCKOUT_MIN * 60
      );
      await redis.del(twofaAttemptsKey(userId));
    }
    return;
  }
  const u = await User.findById(userId)
    .select("+twoFactorFailedAttempts +twoFactorLockoutUntil")
    .lean();
  const attempts = (u?.twoFactorFailedAttempts || 0) + 1;
  const set = { twoFactorFailedAttempts: attempts };
  if (attempts >= TWOFA_MAX_FAILED) {
    set.twoFactorLockoutUntil = new Date(
      Date.now() + TWOFA_LOCKOUT_MIN * 60 * 1000
    );
    set.twoFactorFailedAttempts = 0;
  }
  await User.updateOne({ _id: userId }, { $set: set });
};

const clearTwofaFailed = async (userId) => {
  if (redis) {
    await redis.del(twofaLockoutKey(userId));
    await redis.del(twofaAttemptsKey(userId));
    return;
  }
  await User.updateOne(
    { _id: userId },
    { $set: { twoFactorFailedAttempts: 0, twoFactorLockoutUntil: null } }
  );
};

// SECURITY: Login attempt tracking
const loginAttempts = new Map(); // email -> { count, lastAttempt, lockedUntil }

// Cleanup old login attempts every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of loginAttempts.entries()) {
    if (now - data.lastAttempt > 15 * 60 * 1000) {
      loginAttempts.delete(email);
    }
  }
}, 5 * 60 * 1000);

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const maskEmail = (email) => {
  try {
    const [local, domain] = email.split("@");
    if (!local || !domain) return "****@****";
    if (local.length <= 4) return `${local[0]}****@${domain}`;
    return `${local.slice(0, 2)}****${local.slice(-2)}@${domain}`;
  } catch {
    return "****@****";
  }
};

const calculateAge = (dateOfBirth) => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
};

/**
 * SECURITY: Track login attempts with exponential backoff
 */
const trackLoginAttempt = (email, success) => {
  const key = email.toLowerCase();
  const attempts = loginAttempts.get(key) || {
    count: 0,
    lastAttempt: Date.now(),
    lockedUntil: null,
  };

  if (success) {
    loginAttempts.delete(key);
    return { blocked: false };
  }

  attempts.count++;
  attempts.lastAttempt = Date.now();

  // SECURITY: Exponential backoff
  if (attempts.count >= 5) {
    const lockoutDuration = Math.min(
      Math.pow(2, attempts.count - 5) * 60 * 1000, // Exponential: 1min, 2min, 4min, 8min...
      24 * 60 * 60 * 1000 // Max 24 hours
    );
    attempts.lockedUntil = Date.now() + lockoutDuration;
  }

  loginAttempts.set(key, attempts);

  if (attempts.lockedUntil && attempts.lockedUntil > Date.now()) {
    const retryAfter = Math.ceil((attempts.lockedUntil - Date.now()) / 1000);
    return { blocked: true, retryAfter };
  }

  return { blocked: false };
};

const checkHoneypot = async (req, action) => {
  if (req.body.website && req.body.website.trim() !== "") {
    await logAudit(req, "honeypot_triggered", {
      action,
      ip: req.ip,
      reason: "field_filled",
    });
    return true;
  }

  const formLoadTime = req.headers["x-form-load-time"];
  if (formLoadTime) {
    const timeSpent = Date.now() - parseInt(formLoadTime, 10);
    if (timeSpent < HONEYPOT_MIN_TIME_MS) {
      await logAudit(req, "honeypot_triggered", {
        action,
        ip: req.ip,
        reason: "too_fast",
        timeSpent,
      });
      return true;
    }
  }

  return false;
};

const detectSuspiciousLogin = async (req, user) => {
  const currentIp = req.ip;
  const geo = lookupIp(currentIp);
  const previousCountry = user.lastLoginCountry;
  const currentCountry = geo.country;

  if (
    previousCountry &&
    currentCountry &&
    previousCountry !== "Unknown" &&
    currentCountry !== "Unknown" &&
    previousCountry !== currentCountry
  ) {
    sendSuspiciousLoginEmail(user.email, {
      name: user.name,
      ip: currentIp,
      city: geo.city,
      country: geo.country,
      userAgent: req.get("user-agent") || "Unknown",
    }).catch(() => {});

    await logAudit(req, "suspicious_login", {
      email: user.email,
      userId: user._id,
      fromIp: currentIp,
      fromCity: geo.city,
      fromCountry: currentCountry,
      previousCountry,
    });
  }

  user.lastLoginIp = currentIp;
  user.lastLoginCountry = currentCountry;
  user.lastLoginCity = geo.city;
  user.lastSeen = new Date();
  await user.save();

  return { currentIp, currentCountry, geo };
};

const createSessionAndTokens = async (user, req, res) => {
  const activeSessions = await RefreshToken.countDocuments({
    user: user._id,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (activeSessions >= MAX_SESSIONS_PER_USER) {
    const oldestSessions = await RefreshToken.find({
      user: user._id,
      revokedAt: null,
    })
      .sort({ lastUsedAt: 1 })
      .limit(activeSessions - MAX_SESSIONS_PER_USER + 1)
      .select("_id");
    await RefreshToken.updateMany(
      { _id: { $in: oldestSessions.map((s) => s._id) } },
      { revokedAt: new Date(), revokeReason: "manual_logout" }
    );
    await logAudit(req, "session_limit_exceeded", {
      userId: user._id,
      sessionsRevoked: oldestSessions.length,
      maxAllowed: MAX_SESSIONS_PER_USER,
    });
  }

  const { session, refreshToken } = await upsertSessionForUser(user, req);

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    maxAge: REFRESH_TOKEN_EXPIRY_MS,
    path: "/",
  });

  const accessToken = generateAccessToken(user._id.toString(), session._id);
  return { accessToken, session, refreshToken };
};

const clearRefreshTokenCookie = (res) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    path: "/",
  });
};

const formatUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  gender: user.gender,
  relationshipGoal: user.relationshipGoal,
  isVerified: user.isVerified,
  role: user.role,
  twoFactorEnabled: user.twoFactorEnabled,
  photos: user.photos || [],
  oauthProvider: user.oauthProvider,
});

/**
 * SECURITY: Constant-time password comparison with timing protection
 */
const verifyPassword = async (hash, password) => {
  // Add random delay to prevent timing attacks (50-150ms)
  const delay = Math.floor(Math.random() * 100) + 50;
  await new Promise((resolve) => setTimeout(resolve, delay));

  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
};

// ═══════════════════════════════════════════
// REGISTER (Enhanced)
// ═══════════════════════════════════════════

export const register = async (req, res, next) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: validation.error.issues[0].message,
      });
    }

    if (await checkHoneypot(req, "register")) {
      return res.status(200).json({
        success: true,
        message: "Account created successfully",
      });
    }

    const isHuman = await verifyTurnstile(
      validation.data.turnstileToken,
      req.ip
    );
    if (!isHuman) {
      await logAudit(req, "registration_blocked", {
        email: validation.data.email,
        reason: "bot_detected",
      });
      return res.status(403).json({
        success: false,
        message: "Security verification failed. Please try again.",
      });
    }

    const { name, email, password, dateOfBirth, gender, relationshipGoal } =
      validation.data;

    const age = calculateAge(dateOfBirth);
    if (age < MIN_AGE) {
      await logAudit(req, "registration_failed", {
        email,
        reason: "underage",
        age,
      });
      return res.status(400).json({
        success: false,
        message: `You must be at least ${MIN_AGE} years old to register.`,
      });
    }

    // SECURITY: Check login attempts for this email
    const loginCheck = trackLoginAttempt(email, false);
    if (loginCheck.blocked) {
      return res.status(429).json({
        success: false,
        message: "Too many registration attempts. Please try again later.",
        retryAfter: loginCheck.retryAfter,
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (
        existingUser.emailBlockedUntil &&
        existingUser.emailBlockedUntil > new Date()
      ) {
        await logAudit(req, "registration_blocked", {
          email,
          reason: "email_temporarily_blocked",
          blockedUntil: existingUser.emailBlockedUntil,
        });
        return res.status(403).json({
          success: false,
          message: "This email is temporarily blocked.",
          blocked: true,
          blockedUntil: existingUser.emailBlockedUntil,
        });
      }

      // SECURITY: Don't reveal if email exists
      await logAudit(req, "registration_failed", {
        email,
        reason: "email_exists",
      });
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const breachResult = await checkPasswordBreach(password);
    if (breachResult.breached) {
      const message = getBreachMessage(breachResult.count);
      await logAudit(req, "registration_failed", {
        email,
        reason: "breached_password",
        breachCount: breachResult.count,
      });
      return res.status(400).json({
        success: false,
        message,
        passwordBreached: true,
        breachCount: breachResult.count,
      });
    }

    const emailVerifiedKey = `verified:email:${email.toLowerCase()}`;
    const isEmailVerified = await redis?.get(emailVerifiedKey);

    const hashedPassword = await argon2.hash(password);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      dateOfBirth,
      gender,
      relationshipGoal,
      isVerified: !!isEmailVerified,
    });

    if (isEmailVerified) {
      await redis?.del(emailVerifiedKey);
    }

    // Clear login attempts on success
    trackLoginAttempt(email, true);

    const { accessToken } = await createSessionAndTokens(user, req, res);

    await logAudit(req, "account_created", {
      userId: user._id,
      email: user.email,
      isVerified: user.isVerified,
    });

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      accessToken,
      user: formatUserResponse(user),
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// LOGIN (Enhanced with anti-enumeration)
// ═══════════════════════════════════════════

export const login = async (req, res, next) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: validation.error.issues[0].message,
      });
    }

    if (await checkHoneypot(req, "login")) {
      return res
        .status(200)
        .json({ success: true, message: "Login successful" });
    }

    const isHuman = await verifyTurnstile(
      validation.data.turnstileToken,
      req.ip
    );
    if (!isHuman) {
      await logAudit(req, "login_blocked", {
        email: validation.data.email,
        reason: "bot_detected",
      });
      return res.status(403).json({
        success: false,
        message: "Security verification failed. Please try again.",
      });
    }

    const { email, password } = validation.data;

    // SECURITY: Check login attempts with exponential backoff
    const loginCheck = trackLoginAttempt(email, false);
    if (loginCheck.blocked) {
      await logAudit(req, "login_blocked", {
        email,
        reason: "too_many_attempts",
        retryAfter: loginCheck.retryAfter,
      });
      return res.status(429).json({
        success: false,
        message: "Too many login attempts. Please try again later.",
        retryAfter: loginCheck.retryAfter,
      });
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      // SECURITY: Don't reveal if email exists - return generic error
      await logAudit(req, "login_failed", { email, reason: "user_not_found" });
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    if (user.deletedAt) {
      const now = new Date();

      if (now > user.scheduledDeletionAt) {
        await logAudit(req, "login_failed", {
          email,
          userId: user._id,
          reason: "grace_period_expired",
        });
        return res.status(410).json({
          success: false,
          message: "Your account has been permanently deleted.",
          deleted: true,
        });
      }

      const currentAttempts = Number(user.reactivationAttempts) || 0;
      if (currentAttempts >= MAX_REACTIVATION_ATTEMPTS) {
        await logAudit(req, "login_blocked", {
          email,
          userId: user._id,
          reason: "max_reactivation_attempts",
        });
        return res.status(403).json({
          success: false,
          message: "Too many reactivation attempts.",
          deactivated: true,
          blocked: true,
        });
      }

      const attemptsRemaining = MAX_REACTIVATION_ATTEMPTS - currentAttempts;
      const daysRemaining = Math.ceil(
        (user.scheduledDeletionAt - now) / (1000 * 60 * 60 * 24)
      );

      if (user.oauthProvider && user.oauthProvider !== "local") {
        return res.status(403).json({
          success: false,
          message:
            "This account uses Google sign-in. Click 'Continue with Google' to reactivate.",
          deactivated: true,
          canReactivate: false,
          useGoogle: true,
          daysRemaining,
          attemptsRemaining,
        });
      }

      // SECURITY: Use constant-time password verification
      const passwordValid = await verifyPassword(user.password, password);
      if (!passwordValid) {
        await logAudit(req, "login_failed", {
          email,
          userId: user._id,
          reason: "wrong_password",
        });
        return res
          .status(401)
          .json({ success: false, message: "Invalid email or password" });
      }

      await User.updateOne(
        { _id: user._id },
        { $inc: { reactivationAttempts: 1 } }
      );

      await logAudit(req, "login_deactivated", {
        email,
        userId: user._id,
        daysRemaining,
      });

      return res.status(403).json({
        success: false,
        message: `Your account is deactivated. It will be permanently deleted in ${daysRemaining} days.`,
        deactivated: true,
        canReactivate: true,
        daysRemaining,
        attemptsRemaining,
        userId: user._id,
        reactivationToken: generateReactivationToken(user._id.toString()),
      });
    }

    if (!user.isActive) {
      await logAudit(req, "login_failed", {
        email,
        userId: user._id,
        reason: "account_inactive",
      });
      return res
        .status(403)
        .json({ success: false, message: "Your account is inactive" });
    }

    // SECURITY: Use constant-time password verification
    const passwordValid = await verifyPassword(user.password, password);
    if (!passwordValid) {
      await logAudit(req, "login_failed", {
        email,
        userId: user._id,
        reason: "wrong_password",
      });
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    // Clear login attempts on success
    trackLoginAttempt(email, true);

    if (user.twoFactorEnabled) {
      // ✅ Pending token now in an httpOnly cookie (NOT the response body, NOT a URL),
      // signed with the claims verifyTempToken requires. Body keeps only requires2FA.
      const tempToken = generateTempToken(user._id.toString(), "2fa-pending");
      res.cookie("login2faPending", tempToken, PENDING_2FA_COOKIE);

      await logAudit(req, "login_2fa_required", {
        email: user.email,
        userId: user._id,
      });

      return res.status(401).json({
        success: false,
        message: "Two-factor authentication required",
        requires2FA: true,
      });
    }

    const { accessToken } = await createSessionAndTokens(user, req, res);
    const { currentIp, currentCountry, geo } = await detectSuspiciousLogin(
      req,
      user
    );

    await logAudit(req, "login_success", {
      email: user.email,
      userId: user._id,
      ip: currentIp,
      country: currentCountry,
      city: geo.city,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      user: formatUserResponse(user),
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET CURRENT USER
// ═══════════════════════════════════════════

export const getMe = async (req, res) => {
  res.status(200).json({ success: true, user: req.user });
};

// ═══════════════════════════════════════════
// LOGOUT (Enhanced)
// ═══════════════════════════════════════════

export const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);

      // SECURITY: Use constant-time comparison
      const storedToken = await RefreshToken.findOne({
        tokenHash,
        revokedAt: null,
      });

      if (storedToken) {
        storedToken.revokedAt = new Date();
        await storedToken.save();
      }
    }

    if (req.user) {
      await logAudit(req, "logout", {
        userId: req.user._id,
        email: req.user.email,
      });
    }

    clearRefreshTokenCookie(res);

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
};

export const refreshAccessToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res
        .status(401)
        .json({ success: false, message: "Refresh token missing" });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired refresh token" });
    }

    const tokenHash = hashToken(refreshToken);
    const storedToken = await RefreshToken.findOne({
      tokenHash,
      user: decoded.userId,
      revokedAt: null,
    });

    // Replay detection: a token already rotated away survives in previousTokenHash.
    // (Rotation is now in-place, so there are no tombstone rows to scan.)
    if (!storedToken) {
      const replay = await RefreshToken.findOne({
        user: decoded.userId,
        previousTokenHash: tokenHash,
      });
      if (replay) {
        await RefreshToken.updateMany(
          { user: decoded.userId, revokedAt: null },
          { revokedAt: new Date(), revokeReason: "replay_detected" }
        );
        await logAudit(req, "token_replay_detected", {
          userId: decoded.userId,
          action: "all_sessions_revoked",
        });
        return res.status(401).json({
          success: false,
          message: "Token reuse detected — all sessions terminated",
          sessionRevoked: true,
        });
      }
      return res.status(401).json({
        success: false,
        message: "Session has been revoked. Please login again.",
        sessionRevoked: true,
      });
    }

    if (storedToken.expiresAt < new Date()) {
      await RefreshToken.updateOne(
        { _id: storedToken._id },
        { revokedAt: new Date(), revokeReason: "manual_logout" }
      );
      return res
        .status(401)
        .json({ success: false, message: "Refresh token expired" });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res
        .status(401)
        .json({ success: false, message: "Account unavailable" });
    }

    // Enabling 2FA after a session was issued forces a re-login on that session.
    if (
      user.twoFactorEnabled &&
      user.twoFactorEnabledAt &&
      storedToken.createdAt < user.twoFactorEnabledAt
    ) {
      await RefreshToken.updateOne(
        { _id: storedToken._id },
        { revokedAt: new Date(), revokeReason: "2fa_enabled" }
      );
      return res.status(401).json({
        success: false,
        message: "Two-factor verification required. Please login again.",
        sessionRevoked: true,
      });
    }

    // Device binding: a refresh token presented from a different device kills ALL sessions.
    const deviceId = getDeviceId(req);
    const currentFingerprint = deviceId ? deviceFingerprint(deviceId) : null;
    if (
      storedToken.deviceFingerprint &&
      currentFingerprint &&
      !constantTimeCompare(currentFingerprint, storedToken.deviceFingerprint)
    ) {
      await RefreshToken.updateMany(
        { user: decoded.userId, revokedAt: null },
        { revokedAt: new Date(), revokeReason: "device_mismatch" }
      );
      await logAudit(req, "device_mismatch_detected", {
        userId: decoded.userId,
        expectedDevice: storedToken.deviceInfo,
        actualDevice: describeDevice(req),
        action: "all_sessions_revoked",
      });
      return res.status(401).json({
        success: false,
        message:
          "Unrecognized device detected. All sessions revoked for your safety.",
        sessionRevoked: true,
      });
    }

    // Rotate IN PLACE on the same device row → no duplicate rows, deviceId preserved.
    const newRefreshToken = generateRefreshToken(user._id.toString());
    const rawDeviceId = currentRawDeviceId(req) || storedToken.deviceId || null;
    storedToken.previousTokenHash = storedToken.tokenHash;
    storedToken.tokenHash = hashToken(newRefreshToken);
    storedToken.expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
    storedToken.deviceId = rawDeviceId;
    storedToken.deviceFingerprint =
      currentFingerprint || storedToken.deviceFingerprint;
    storedToken.deviceInfo = parseDevice(req);
    storedToken.lastUsedAt = new Date();
    storedToken.lastIp = req.ip;
    await storedToken.save();

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: IS_PRODUCTION ? "none" : "lax",
      maxAge: REFRESH_TOKEN_EXPIRY_MS,
      path: "/",
    });

    const newAccessToken = generateAccessToken(
      user._id.toString(),
      storedToken._id
    );
    res.status(200).json({ success: true, accessToken: newAccessToken });
  } catch (error) {
    next(error);
  }
};

/**
 * Grace‑layer repair: when a user reactivates, any Match that went INACTIVE during
 * soft‑delete (because the old deleteAccount over‑cascaded) but whose two like rows
 * still mutually exist is reactivated, its archived conversation revived, and both
 * feeds notified — so the partner sees the match again with NO re‑like. Guards:
 * mutual‑like required (never resurrect from a one‑sided like), two‑way block checked,
 * the *other* side must still be active/not deleted, notifications deduped, ids
 * normalized to ObjectId so conversation $all dedupe actually matches stored rows.
 * No‑op when deleteAccount is already correct (finds zero such matches).
 */
const restoreMatchesForReactivatedUser = async (userId, req) => {
  const me = new mongoose.Types.ObjectId(userId.toString());
  const meStr = me.toString();
  const inactive = await Match.find({ users: me, isActive: false }).lean();
  if (!inactive.length) return 0;

  let restored = 0;
  for (const m of inactive) {
    const otherRaw = (m.users || []).find(
      (u) => u && u.toString() !== meStr
    );
    if (!otherRaw) continue;
    const other = new mongoose.Types.ObjectId(otherRaw.toString());
    const otherStr = other.toString();

    // mutual likes still present? (don't rebuild a match from a purged side)
    const [ab, ba] = await Promise.all([
      Like.exists({ from: me, to: other }),
      Like.exists({ from: other, to: me }),
    ]);
    if (!ab || !ba) continue;

    // two‑way block + other‑side liveness guard
    const [um, uo] = await Promise.all([
      User.findById(me).select("blockedUsers").lean(),
      User.findById(other).select("blockedUsers isActive deletedAt").lean(),
    ]);
    const blocked =
      (um?.blockedUsers || []).some((id) => id.toString() === otherStr) ||
      (uo?.blockedUsers || []).some((id) => id.toString() === meStr);
    if (blocked) continue;
    if (!uo || uo.isActive === false || uo.deletedAt) continue;

    // reactivate the match row
    await Match.updateOne(
      { _id: m._id },
      { $set: { isActive: true, unmatchedAt: null, unmatchedBy: null } }
    );

    // revive the archived conversation (normalized ObjectId participants)
    const participants = [me, other].sort((x, y) =>
      x.toString().localeCompare(y.toString())
    );
    const conv = await Conversation.findOne({
      participants: { $all: participants, $size: 2 },
    });
    if (conv) {
      let changed = false;
      if (conv.isActive !== true) { conv.isActive = true; changed = true; }
      if (!conv.match || conv.match.toString() !== m._id.toString()) {
        conv.match = m._id; changed = true;
      }
      if (
        Array.isArray(conv.hiddenBy) &&
        conv.hiddenBy.some((id) => id.toString() === meStr || id.toString() === otherStr)
      ) {
        conv.hiddenBy = conv.hiddenBy.filter(
          (id) => id.toString() !== meStr && id.toString() !== otherStr
        );
        changed = true;
      }
      if (changed) await conv.save();
      if (!m.conversation || m.conversation.toString() !== conv._id.toString()) {
        await Match.updateOne({ _id: m._id }, { $set: { conversation: conv._id } });
      }
    }

    // idempotent match notifications (so a re‑restore can't double‑notify)
    const already = await Notification.exists({
      $or: [
        { recipient: me, sender: other, type: "match" },
        { recipient: other, sender: me, type: "match" },
      ],
    });
    if (!already) {
      await Notification.insertMany([
        { recipient: me, sender: other, type: "match", message: "You matched!", isRead: false },
        { recipient: other, sender: me, type: "match", message: "You matched!", isRead: false },
      ]).catch(() => {});
    }

    const io = getIO();
    if (io) {
      io.to(`user:${me}`).emit("new_match", {
        matchId: m._id, conversationId: conv?._id, matchedUserId: otherStr,
      });
      io.to(`user:${other}`).emit("new_match", {
        matchId: m._id, conversationId: conv?._id, matchedUserId: meStr,
      });
    }
    restored++;
  }
  return restored;
};



export const reactivateAccount = async (req, res, next) => {
  try {
    const { reactivationToken } = req.body;

    console.log("🔑 Reactivation attempt received");

    if (!reactivationToken) {
      console.log("❌ No reactivation token provided");
      return res
        .status(400)
        .json({ success: false, message: "Reactivation token required" });
    }

    let decoded;
    try {
      decoded = verifyReactivationToken(reactivationToken);
      console.log("✅ Token decoded successfully for user:", decoded.userId);
    } catch (err) {
      console.log("❌ Token verification failed:", err.message);
      return res.status(401).json({
        success: false,
        message: "Reactivation link expired or invalid. Please login again.",
      });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      console.log("❌ User not found:", decoded.userId);
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!user.deletedAt) {
      console.log("⚠️ Account is not deactivated");
      return res
        .status(400)
        .json({ success: false, message: "Account is not deactivated" });
    }

    const now = new Date();
    if (now > user.scheduledDeletionAt) {
      console.log("❌ Grace period expired");
      return res.status(410).json({
        success: false,
        message: "Grace period expired. Account has been permanently deleted.",
      });
    }

    const result = await User.updateOne(
      { _id: user._id, deletedAt: { $ne: null } },
      {
        $set: {
          isActive: true,
          deletedAt: null,
          scheduledDeletionAt: null,
          reactivationAttempts: 0,
          lastSeen: now,
        },
      }
    );

    if (result.modifiedCount === 0) {
      console.log("❌ Account state changed, modification failed");
      return res.status(409).json({
        success: false,
        message: "Account state changed. Please login again.",
      });
    }

    console.log("✅ Account reactivated successfully:", user.email);

    const { accessToken } = await createSessionAndTokens(user, req, res);

    // ✅ grace‑layer repair: bring back any match that the old soft‑delete cascade
    // deactivated, so the partner sees it again with NO re‑like. No‑op if
    // deleteAccount is already correct. Response shape intentionally unchanged.
    try {
      const restored = await restoreMatchesForReactivatedUser(user._id, req);
      if (restored > 0) {
        await logAudit(req, "matches_restored_on_reactivation", {
          userId: user._id,
          restored,
        });
        console.log(`♻️ Restored ${restored} match(es) on reactivation`);
      }
    } catch (restoreErr) {
      // never fail a reactivation because of the repair step
      console.error("Match restore on reactivation failed:", restoreErr.message);
    }

    await logAudit(req, "account_reactivated", {
      userId: user._id,
      email: user.email,
    });

    res.status(200).json({
      success: true,
      message: "Welcome back! Your account has been reactivated.",
      accessToken,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error("❌ Reactivation error:", error);
    next(error);
  }
};

// ═══════════════════════════════════════════
// CHANGE PASSWORD (Enhanced with re-authentication)
// ═══════════════════════════════════════════

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required.",
      });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const isOAuthUser = user.oauthProvider && user.oauthProvider !== "local";
    if (isOAuthUser) {
      await logAudit(req, "password_change_failed", {
        userId: user._id,
        reason: "oauth_user",
        provider: user.oauthProvider,
      });
      return res.status(403).json({
        success: false,
        message: `You signed in with ${
          user.oauthProvider === "google" ? "Google" : user.oauthProvider
        }. Please use that method to manage your account.`,
        oauthUser: true,
      });
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }

    // SECURITY: Use constant-time password verification
    const isMatch = await verifyPassword(user.password, currentPassword);
    if (!isMatch) {
      await logAudit(req, "password_change_failed", {
        userId: user._id,
        reason: "wrong_current_password",
      });
      return res
        .status(401)
        .json({ success: false, message: "Current password is incorrect." });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password.",
      });
    }

    const breachResult = await checkPasswordBreach(newPassword);
    if (breachResult.breached) {
      const message = getBreachMessage(breachResult.count);
      await logAudit(req, "password_change_failed", {
        userId: user._id,
        reason: "breached_password",
        breachCount: breachResult.count,
      });
      return res.status(400).json({
        success: false,
        message,
        passwordBreached: true,
        breachCount: breachResult.count,
      });
    }

    const hashedPassword = await argon2.hash(newPassword);
    user.password = hashedPassword;
    await user.save();

    await RefreshToken.updateMany(
      { user: user._id, revokedAt: null },
      { revokedAt: new Date() }
    );
    await logAudit(req, "password_changed", {
      userId: user._id,
      allSessionsRevoked: true,
    });

    clearRefreshTokenCookie(res);

    res.status(200).json({
      success: true,
      message:
        "Password changed successfully. Please log in again on all devices.",
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// SEND OTP (Enhanced with rate limiting)
// ═══════════════════════════════════════════

export const sendOTPCode = async (req, res, next) => {
  try {
    if (await checkHoneypot(req, "send_otp")) {
      return res
        .status(200)
        .json({ success: true, message: "OTP sent to your email" });
    }

    const { email, name } = req.body;
    if (!email || !name) {
      return res
        .status(400)
        .json({ success: false, message: "Email and name are required" });
    }

    // ═══════════════════════════════════════════
    // ✅ NEW: Check OTP rate limit (Max 3 requests per 60 minutes)
    // ═══════════════════════════════════════════
    const isRateLimited = await checkOtpRequestLimit(email, 3, 60);
    if (isRateLimited) {
      await logAudit(req, "otp_rate_limited", {
        email,
        reason: "too_many_requests",
      });
      return res.status(429).json({
        success: false,
        message:
          "Too many OTP requests. Please wait before requesting another.",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser && existingUser.isVerified) {
      await logAudit(req, "otp_request_blocked", {
        email,
        reason: "email_already_verified",
      });
      return res
        .status(200)
        .json({ success: true, message: "OTP sent to your email" });
    }

    const otp = generateOTP();
    await saveOTP(email, otp);
    await sendOTP(email, otp, name);

    await logAudit(req, "otp_sent", { email, type: "registration" });

    // ✅ Only log the actual OTP in development mode
    if (process.env.NODE_ENV === "development") {
      console.log(`📧 DEV OTP for ${email}: ${otp}`);
    }

    res.status(200).json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// VERIFY OTP
// ═══════════════════════════════════════════

export const verifyOTPCode = async (req, res, next) => {
  try {
    if (await checkHoneypot(req, "verify_otp")) {
      return res
        .status(200)
        .json({ success: true, message: "Email verified successfully" });
    }

    const { email, otp } = req.body;
    if (!email || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "Email and OTP are required" });
    }

    const result = await verifyOTP(email, otp);
    if (!result.valid) {
      await logAudit(req, "otp_verification_failed", {
        email,
        reason: result.message,
      });
      return res.status(400).json({ success: false, message: result.message });
    }

    const user = await User.findOne({ email });
    if (user && !user.isVerified) {
      user.isVerified = true;
      await user.save();
      await logAudit(req, "email_verified", { email, userId: user._id });
    }

    if (!user) {
      const emailVerifiedKey = `verified:email:${email.toLowerCase()}`;
      await redis?.set(
        emailVerifiedKey,
        "true",
        "EX",
        OTP_VERIFIED_TTL_SECONDS
      );
      await logAudit(req, "email_verified_pre_registration", { email });
    }

    res
      .status(200)
      .json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// FORGOT PASSWORD (Enhanced - don't reveal if email exists)
// ═══════════════════════════════════════════

export const forgotPassword = async (req, res, next) => {
  try {
    if (await checkHoneypot(req, "forgot_password")) {
      return res.status(200).json({
        success: true,
        message: "Password reset OTP sent to your email",
      });
    }

    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    // ═══════════════════════════════════════════
    // ✅ NEW: Check OTP rate limit
    // ═══════════════════════════════════════════
    const isRateLimited = await checkOtpRequestLimit(email, 3, 60);
    if (isRateLimited) {
      await logAudit(req, "otp_rate_limited", {
        email,
        reason: "too_many_requests",
      });
      // Return 200 to prevent email enumeration
      return res.status(200).json({
        success: true,
        message: "If an account exists, a password reset OTP has been sent.",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      await logAudit(req, "password_reset_requested", {
        email,
        reason: "user_not_found",
      });
      return res.status(200).json({
        success: true,
        message: "Password reset OTP sent to your email",
      });
    }

    if (user.oauthProvider && user.oauthProvider !== "local") {
      await logAudit(req, "password_reset_blocked", {
        email,
        userId: user._id,
        reason: "oauth_user",
        provider: user.oauthProvider,
      });
      return res.status(400).json({
        success: false,
        message: `This account uses ${
          user.oauthProvider === "google" ? "Google" : user.oauthProvider
        } sign-in. Password reset is not available.`,
        oauthUser: true,
      });
    }

    const otp = generateOTP();
    await saveOTP(email, otp);
    await sendOTP(email, otp, user.name);

    await logAudit(req, "password_reset_requested", {
      email,
      userId: user._id,
    });

    // ✅ Only log the actual OTP in development mode
    if (process.env.NODE_ENV === "development") {
      console.log(`📧 DEV RESET OTP for ${email}: ${otp}`);
    }

    res.status(200).json({
      success: true,
      message: "Password reset OTP sent to your email",
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// RESET PASSWORD
// ═══════════════════════════════════════════

export const resetPassword = async (req, res, next) => {
  try {
    if (await checkHoneypot(req, "reset_password")) {
      return res
        .status(200)
        .json({ success: true, message: "Password reset successfully" });
    }

    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP and new password are required",
      });
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.oauthProvider && user.oauthProvider !== "local") {
      await logAudit(req, "password_reset_blocked", {
        email,
        userId: user._id,
        reason: "oauth_user",
        provider: user.oauthProvider,
      });
      return res.status(403).json({
        success: false,
        message: `This account uses ${
          user.oauthProvider === "google" ? "Google" : user.oauthProvider
        } sign-in. Password reset is not available.`,
        oauthUser: true,
      });
    }

    const result = await verifyOTP(email, otp);
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.message });
    }

    const breachResult = await checkPasswordBreach(newPassword);
    if (breachResult.breached) {
      const message = getBreachMessage(breachResult.count);
      await logAudit(req, "password_reset_failed", {
        email,
        userId: user._id,
        reason: "breached_password",
        breachCount: breachResult.count,
      });
      return res.status(400).json({
        success: false,
        message,
        passwordBreached: true,
        breachCount: breachResult.count,
      });
    }

    const hashedPassword = await argon2.hash(newPassword);
    user.password = hashedPassword;
    await user.save();

    await RefreshToken.updateMany(
      { user: user._id, revokedAt: null },
      { revokedAt: new Date() }
    );
    await logAudit(req, "password_reset_success", {
      email,
      userId: user._id,
      allSessionsRevoked: true,
    });

    res.status(200).json({
      success: true,
      message:
        "Password reset successfully. Please login with your new password.",
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════

export const getSessions = async (req, res, next) => {
  try {
    const rawDeviceId = currentRawDeviceId(req);
    const sessions = await RefreshToken.find({
      user: req.user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .select("deviceInfo deviceId lastUsedAt lastIp createdAt")
      .sort({ lastUsedAt: -1 })
      .lean();

    const out = sessions.map((s) => ({
      ...s,
      isCurrentDevice: !!(rawDeviceId && s.deviceId === rawDeviceId),
    }));

    res.status(200).json({ success: true, sessions: out });
  } catch (error) {
    next(error);
  }
};

export const revokeSession = async (req, res, next) => {
  try {
    const rawDeviceId = currentRawDeviceId(req);
    const token = await RefreshToken.findOne({
      _id: req.params.sessionId,
      user: req.user._id,
    });
    if (!token)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });

    if (rawDeviceId && token.deviceId === rawDeviceId)
      return res.status(400).json({
        success: false,
        message: "You cannot revoke the device you are currently using.",
      });

    token.revokedAt = new Date();
    token.revokeReason = "manual_logout";
    await token.save();

    await logAudit(req, "session_revoked", {
      userId: req.user._id,
      sessionId: req.params.sessionId,
      deviceInfo: token.deviceInfo,
    });

    res.status(200).json({ success: true, message: "Session revoked" });
  } catch (error) {
    next(error);
  }
};

export const revokeAllOtherSessions = async (req, res, next) => {
  try {
    const rawDeviceId = currentRawDeviceId(req);
    const currentRefreshToken = req.cookies.refreshToken;
    const currentHash = currentRefreshToken
      ? hashToken(currentRefreshToken)
      : null;

    const q = { user: req.user._id, revokedAt: null };
    if (rawDeviceId) q.deviceId = { $ne: rawDeviceId };
    else if (currentHash) q.tokenHash = { $ne: currentHash };

    const result = await RefreshToken.updateMany(q, {
      revokedAt: new Date(),
      revokeReason: "manual_logout",
    });

    await logAudit(req, "all_other_sessions_revoked", {
      userId: req.user._id,
      sessionsRevoked: result.modifiedCount,
    });

    res.status(200).json({
      success: true,
      message: "All other sessions revoked",
      sessionsRevoked: result.modifiedCount,
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// 2FA LOGIN
// ═══════════════════════════════════════════

export const loginWith2FA = async (req, res, next) => {
  try {
    // ✅ token from httpOnly cookie (preferred) OR body (backward-compat / half-deploy)
    const tempToken = req.cookies?.login2faPending || req.body?.tempToken;
    const { totpCode } = req.body;
    if (!tempToken || !totpCode) {
      return res
        .status(400)
        .json({ success: false, message: "Token and code required" });
    }

    let decoded;
    try {
      decoded = verifyTempToken(tempToken, "2fa-pending");
    } catch {
      // No verified userId here -> do NOT touch the lockout (nothing to brute-force).
      return res.status(401).json({
        success: false,
        message: "Session expired or invalid. Please login again.",
      });
    }

    const user = await User.findById(decoded.userId).select(
      "+twoFactorSecret +twoFactorBackupCodes"
    );
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res
        .status(401)
        .json({ success: false, message: "2FA not configured" });
    }

    // ✅ per-user lockout on the verify step (bounds TOTP brute force)
    const lo = await checkTwofaLockout(user._id);
    if (lo.locked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed 2FA attempts. Try again in ${lo.remainingMinutes} minutes.`,
        locked: true,
        retryAfter: lo.remainingMinutes,
      });
    }

    const secret = decryptSecret(user.twoFactorSecret);
    let isValid = verifyTotp(totpCode, secret);
    let usedMethod = "totp";

    if (!isValid) {
      const backupIndex = await verifyBackupCode(
        totpCode,
        user.twoFactorBackupCodes
      );
      if (backupIndex !== -1) {
        isValid = true;
        usedMethod = "backup_code";
        user.twoFactorBackupCodes[backupIndex].used = true;
        user.twoFactorBackupCodes[backupIndex].usedAt = new Date();
        await user.save();
      }
    }

    if (!isValid) {
      await handleTwofaFailed(user._id);
      await logAudit(req, "login_2fa_failed", {
        email: user.email,
        userId: user._id,
      });
      return res
        .status(401)
        .json({ success: false, message: "Invalid 2FA code" });
    }

    await clearTwofaFailed(user._id);
    res.clearCookie("login2faPending", PENDING_2FA_COOKIE); // consume pending token

    const { accessToken } = await createSessionAndTokens(user, req, res);
    const { currentIp, currentCountry, geo } = await detectSuspiciousLogin(
      req,
      user
    );

    await logAudit(req, "login_success", {
      email: user.email,
      userId: user._id,
      ip: currentIp,
      country: currentCountry,
      city: geo.city,
      twoFactorMethod: usedMethod,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      user: formatUserResponse(user),
    });
  } catch (error) {
    next(error);
  }
};

export const completeOAuth2FA = async (req, res, next) => {
  try {
    // ✅ token from httpOnly cookie (preferred) OR body (backward-compat / half-deploy)
    const tempToken = req.cookies?.oauth2faPending || req.body?.tempToken;
    const { totpCode } = req.body;
    if (!tempToken || !totpCode) {
      return res
        .status(400)
        .json({ success: false, message: "Token and code required" });
    }

    let decoded;
    try {
      decoded = verifyTempToken(tempToken, "oauth-2fa-pending");
    } catch {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please try Google sign-in again.",
      });
    }

    const user = await User.findById(decoded.userId).select(
      "+twoFactorSecret +twoFactorBackupCodes"
    );
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(401).json({
        success: false,
        message: "2FA is not configured. Please sign in again.",
      });
    }

    // ✅ per-user lockout on the verify step (bounds TOTP brute force)
    const lo = await checkTwofaLockout(user._id);
    if (lo.locked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed 2FA attempts. Try again in ${lo.remainingMinutes} minutes.`,
        locked: true,
        retryAfter: lo.remainingMinutes,
      });
    }

    const secret = decryptSecret(user.twoFactorSecret);
    let isValid = verifyTotp(totpCode, secret);
    let usedMethod = "totp";

    if (!isValid) {
      const backupIndex = await verifyBackupCode(
        totpCode,
        user.twoFactorBackupCodes
      );
      if (backupIndex !== -1) {
        isValid = true;
        usedMethod = "backup_code";
        user.twoFactorBackupCodes[backupIndex].used = true;
        user.twoFactorBackupCodes[backupIndex].usedAt = new Date();
        await user.save();
      }
    }

    if (!isValid) {
      await handleTwofaFailed(user._id);
      await logAudit(req, "oauth_2fa_failed", {
        email: user.email,
        userId: user._id,
      });
      return res
        .status(401)
        .json({ success: false, message: "Invalid 2FA code" });
    }

    await clearTwofaFailed(user._id);
    res.clearCookie("oauth2faPending", PENDING_2FA_COOKIE); // consume pending token

    const { accessToken } = await createSessionAndTokens(user, req, res);
    const { currentIp, currentCountry, geo } = await detectSuspiciousLogin(
      req,
      user
    );

    await logAudit(req, "login_success", {
      email: user.email,
      userId: user._id,
      provider: "google",
      ip: currentIp,
      country: currentCountry,
      city: geo.city,
      twoFactorMethod: usedMethod,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      user: formatUserResponse(user),
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// ADMIN: FORCE REAUTH ALL USERS
// ═══════════════════════════════════════════

export const forceReauthAllUsers = async (req, res, next) => {
  try {
    if (req.user?.role !== "superadmin") {
      return res
        .status(403)
        .json({ success: false, message: "Superadmin only" });
    }

    await RefreshToken.updateMany({}, { $set: { revokedAt: new Date() } });

    await logAudit(req, "force_reauth_all_users", { adminId: req.user._id });

    res.status(200).json({
      success: true,
      message: "All sessions invalidated. Users must re-authenticate.",
    });
  } catch (error) {
    next(error);
  }
};

const currentRawDeviceId = (req) => getDeviceId(req);

// ── Create OR reuse the active session row for this browser (dedup) ──
export const upsertSessionForUser = async (user, req, opts = {}) => {
  const refreshToken = generateRefreshToken(user._id.toString());
  const rawDeviceId = currentRawDeviceId(req);
  const info = parseDevice(req);
  const fp = deviceFingerprint(getDeviceId(req)); // keep existing device-binding source
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  let session = null;
  if (rawDeviceId) {
    session = await RefreshToken.findOne({
      user: user._id,
      deviceId: rawDeviceId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (session) {
      session.previousTokenHash = session.tokenHash;
      session.tokenHash = hashToken(refreshToken);
      session.expiresAt = expiresAt;
      session.deviceFingerprint = fp || session.deviceFingerprint;
      session.deviceInfo = info;
      session.lastUsedAt = new Date();
      session.lastIp = req.ip;
      session.revokedAt = null;
      session.revokeReason = null;
      if (opts.familyId && !session.familyId) session.familyId = opts.familyId;
      await session.save();
    }
  }
  if (!session) {
    session = await RefreshToken.create({
      user: user._id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
      deviceId: rawDeviceId,
      deviceFingerprint: fp,
      deviceInfo: info,
      familyId: opts.familyId || null,
      lastUsedAt: new Date(),
      lastIp: req.ip,
    });
  }
  return { session, refreshToken };
};
