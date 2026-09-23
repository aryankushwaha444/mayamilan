import express from "express";
import jwt from "jsonwebtoken";
import passport from "passport";
import RefreshToken from "../models/RefreshToken.js";
import { logAudit } from "../utils/auditLogger.js";
import { checkIpReputationMiddleware } from "../middleware/ipReputation.middleware.js";
import { verifySignature } from "../middleware/verifySignature.js";
import { jsonLimit } from "../middleware/bodyLimit.js";

import {
  register,
  login,
  loginWith2FA,
  getMe,
  logout,
  refreshAccessToken,
  changePassword,
  sendOTPCode,
  verifyOTPCode,
  forgotPassword,
  resetPassword,
  getSessions,
  revokeSession,
  revokeAllOtherSessions,
  reactivateAccount,
  completeOAuth2FA,
} from "../controllers/auth.controller.js";

import {
  generateAccessToken,
  generateRefreshToken,
  generateReactivationToken,
  hashToken,
} from "../utils/generateToken.js";

import {
  getDeviceId,
  deviceFingerprint,
  describeDevice,
} from "../utils/device.js";

import { protect } from "../middleware/auth.middleware.js";

import {
  loginLimiter,
  registerLimiter,
  refreshLimiter,
  sendOTPLimiter,
  verifyOTPLimiter,
  passwordResetLimiter,
  reactivationLimiter,
  sessionManagementLimiter,
  oauthLimiter, // ✅ ADD: dedicated OAuth limiter
} from "../middleware/rateLimits.js";

const router = express.Router();

// Validate CLIENT_URL at startup to prevent open redirects
const CLIENT_URL = process.env.CLIENT_URL;
if (!CLIENT_URL) {
  throw new Error("CLIENT_URL environment variable is required");
}

// Safe redirect helper — validates target is within CLIENT_URL
const safeRedirect = (res, path) => {
  const url = `${CLIENT_URL}${path}`;
  // Prevent open redirect: ensure URL starts with trusted origin
  if (!url.startsWith(CLIENT_URL)) {
    return res.redirect(CLIENT_URL);
  }
  return res.redirect(url);
};

// ========================================
// AUTH ROUTES
// ========================================

router.post(
  "/register",
  registerLimiter,
  checkIpReputationMiddleware,
  jsonLimit("2kb"),
  register
);

router.post(
  "/login",
  loginLimiter,
  checkIpReputationMiddleware,
  jsonLimit("1kb"),
  login
);

router.post(
  "/login/2fa",
  loginLimiter,
  jsonLimit("500b"),
  verifySignature,
  loginWith2FA
);

router.post(
  "/oauth/2fa",
  loginLimiter,
  jsonLimit("500b"),
  verifySignature,
  completeOAuth2FA
);

router.post(
  "/reactivate",
  reactivationLimiter,
  jsonLimit("500b"),
  verifySignature,
  reactivateAccount
);

router.post("/logout", jsonLimit("1kb"), logout);

router.post("/refresh", refreshLimiter, jsonLimit("1kb"), refreshAccessToken);

router.get("/me", protect, getMe);

router.put(
  "/change-password",
  protect,
  jsonLimit("1kb"),
  verifySignature,
  changePassword
);

// ========================================
// OTP & PASSWORD RESET
// ========================================

router.post("/send-otp", sendOTPLimiter, jsonLimit("500b"), sendOTPCode);

router.post("/verify-otp", verifyOTPLimiter, jsonLimit("500b"), verifyOTPCode);

router.post(
  "/forgot-password",
  sendOTPLimiter,
  checkIpReputationMiddleware,
  jsonLimit("500b"),
  verifySignature,
  forgotPassword
);

router.post(
  "/reset-password",
  passwordResetLimiter,
  checkIpReputationMiddleware,
  jsonLimit("1kb"),
  verifySignature,
  resetPassword
);

// ========================================
// SESSION MANAGEMENT
// ========================================

router.get("/sessions", protect, getSessions);

router.delete(
  "/sessions/:sessionId",
  protect,
  sessionManagementLimiter,
  jsonLimit("1kb"),
  verifySignature,
  revokeSession
);

router.post(
  "/sessions/revoke-others",
  protect,
  sessionManagementLimiter,
  jsonLimit("1kb"),
  verifySignature,
  revokeAllOtherSessions
);

// ========================================
// GOOGLE OAUTH (✅ RATE LIMITED)
// ========================================

router.get(
  "/google",
  oauthLimiter, // ✅ Per-IP rate limit on OAuth initiation
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

router.get(
  "/google/callback",
  oauthLimiter, // ✅ Per-IP rate limit on callback (prevents redirect loop abuse)
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${CLIENT_URL}/register?error=google_failed`,
  }),
  async (req, res) => {
    try {
      const user = req.user;

      if (!user) {
        return safeRedirect(res, "/register?error=no_user");
      }

      // ── Deactivated account (soft-deleted) ──────────
      if (user.deletedAt) {
        const now = new Date();

        if (now > user.scheduledDeletionAt) {
          return safeRedirect(res, "/login?error=account_permanently_deleted");
        }

        if ((user.reactivationAttempts || 0) >= 3) {
          return safeRedirect(res, "/login?error=too_many_attempts");
        }

        const daysRemaining = Math.ceil(
          (user.scheduledDeletionAt - now) / (1000 * 60 * 60 * 24)
        );

        const attemptsRemaining = 3 - (user.reactivationAttempts || 0);
        user.reactivationAttempts = (user.reactivationAttempts || 0) + 1;
        await user.save();

        const reactivationToken = generateReactivationToken(
          user._id.toString()
        );

        const params = new URLSearchParams({
          reactivate: "1",
          token: reactivationToken,
          days: String(daysRemaining),
          attempts: String(attemptsRemaining),
        });

        return safeRedirect(res, `/login?${params.toString()}`);
      }

      // ── Email blocked ───────────────────────────────
      if (user.emailBlockedUntil && user.emailBlockedUntil > new Date()) {
        return safeRedirect(res, "/login?error=email_blocked");
      }

      // ── 2FA enabled — require verification ──────────
      if (user.twoFactorEnabled) {
        const tempToken = jwt.sign(
          { userId: user._id.toString(), type: "oauth-2fa-pending" },
          process.env.JWT_ACCESS_SECRET,
          { expiresIn: "5m" }
        );

        await logAudit(req, "oauth_2fa_required", {
          email: user.email,
          userId: user._id,
          ip: req.ip,
        });

        return safeRedirect(res, `/login?oauth2fa=1&tempToken=${tempToken}`);
      }

      // ── Normal flow — issue tokens ──────────────────
      const refreshToken = generateRefreshToken(user._id.toString());
      const deviceId = getDeviceId(req);

      const session = await RefreshToken.create({
        user: user._id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        deviceFingerprint: deviceId ? deviceFingerprint(deviceId) : null,
        deviceInfo: describeDevice(req),
        lastUsedAt: new Date(),
        lastIp: req.ip,
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      const accessToken = generateAccessToken(user._id.toString(), session._id);

      // ✅ Minimal user data in URL — sensitive fields fetched via /me
      const userB64 = Buffer.from(
        JSON.stringify({
          _id: user._id,
          name: user.name,
          email: user.email,
          oauthProvider: user.oauthProvider,
          isVerified: user.isVerified,
          role: user.role,
        })
      ).toString("base64");

      // ✅ URL-encode base64 to prevent special char issues
      safeRedirect(
        res,
        `/oauth-success?token=${encodeURIComponent(
          accessToken
        )}&user=${encodeURIComponent(userB64)}`
      );
    } catch (error) {
      // ✅ No console.error in production
      safeRedirect(res, "/register?error=server_error");
    }
  }
);

export default router;
