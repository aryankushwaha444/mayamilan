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
  sessionManagementLimiter
} from "../middleware/rateLimits.js";

const router = express.Router();

// ========================================
// AUTH ROUTES
// ========================================

// Entry points — IP reputation + rate limit (no signature required)
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

// Critical auth completion — signature required
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

// ✅ FIXED: Added rate limiter to prevent abuse
router.post(
  "/reactivate",
  reactivationLimiter,
  jsonLimit("500b"),
  verifySignature,
  reactivateAccount
);

// Session management
router.post("/logout", jsonLimit("100b"), logout);

router.post("/refresh", refreshLimiter, jsonLimit("100b"), refreshAccessToken);

router.get("/me", protect, getMe);

// Change password with body limit
router.put(
  "/change-password",
  protect,
  jsonLimit("1kb"),
  verifySignature,
  changePassword
);

// ========================================
// OTP & PASSWORD RESET (rate-limited)
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
// SESSION MANAGEMENT (Device Binding)
// ========================================

router.get("/sessions", protect, getSessions);

// ✅ FIXED: Added rate limiter to session management
router.delete(
  "/sessions/:sessionId",
  protect,
  sessionManagementLimiter,
  jsonLimit("100b"),
  verifySignature,
  revokeSession
);

router.post(
  "/sessions/revoke-others",
  protect,
  sessionManagementLimiter,
  jsonLimit("100b"),
  verifySignature,
  revokeAllOtherSessions
);

// ========================================
// GOOGLE OAUTH
// ========================================

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL}/register?error=google_failed`,
  }),
  async (req, res) => {
    try {
      const user = req.user;

      if (!user) {
        return res.redirect(`${process.env.CLIENT_URL}/register?error=no_user`);
      }

      // CHECK: Is this account deactivated (soft-deleted)?
      if (user.deletedAt) {
        const now = new Date();

        if (now > user.scheduledDeletionAt) {
          return res.redirect(
            `${process.env.CLIENT_URL}/login?error=account_permanently_deleted`
          );
        }

        if ((user.reactivationAttempts || 0) >= 3) {
          return res.redirect(
            `${process.env.CLIENT_URL}/login?error=too_many_attempts`
          );
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

        return res.redirect(
          `${process.env.CLIENT_URL}/login?${params.toString()}`
        );
      }

      // CHECK: Is the email blocked?
      if (user.emailBlockedUntil && user.emailBlockedUntil > new Date()) {
        return res.redirect(
          `${process.env.CLIENT_URL}/login?error=email_blocked`
        );
      }

      // ========================================
      // Normal flow — user is active
      // ========================================

      // CHECK: Check if 2FA is enabled — require verification
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

        // Redirect back to login with the pending token
        return res.redirect(
          `${process.env.CLIENT_URL}/login?oauth2fa=1&tempToken=${tempToken}`
        );
      }

      // No 2FA — issue tokens directly
      const refreshToken = generateRefreshToken(user._id.toString());
      const deviceId = getDeviceId(req);

      // Create session FIRST to get _id for access token binding
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

      // Access token now BOUND to session ID for instant revocation
      const accessToken = generateAccessToken(user._id.toString(), session._id);

      // ✅ IMPROVED: Only send minimal user data in URL
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

      // ✅ NOTE: Sensitive data (photos, DOB, etc.) should be fetched via /api/auth/me
      res.redirect(
        `${process.env.CLIENT_URL}/oauth-success?token=${accessToken}&user=${userB64}`
      );
    } catch (error) {
      console.error("Google callback error:", error);
      res.redirect(`${process.env.CLIENT_URL}/register?error=server_error`);
    }
  }
);

export default router;
