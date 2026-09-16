import express from "express";
import passport from "passport";
import RefreshToken from "../models/RefreshToken.js";

import {
  register,
  login,
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
} from "../controllers/auth.controller.js";

import {
  generateAccessToken,
  generateRefreshToken,
  generateReactivationToken, // ✅ ADD: for Google OAuth reactivation
  hashToken,
} from "../utils/generateToken.js";

import {
  getDeviceId,
  deviceFingerprint,
  describeDevice,
} from "../utils/device.js";

import { protect } from "../middleware/auth.middleware.js";

// ✅ Centralized rate limiters
import {
  loginLimiter,
  registerLimiter,
  refreshLimiter,
  sendOTPLimiter,
  verifyOTPLimiter,
  passwordResetLimiter,
} from "../middleware/rateLimits.js";

const router = express.Router();

// ========================================
// AUTH ROUTES
// ========================================

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/reactivate", reactivateAccount);
router.post("/logout", logout);
router.post("/refresh", refreshLimiter, refreshAccessToken);
router.get("/me", protect, getMe);
router.put("/change-password", protect, changePassword);

// ========================================
// OTP & PASSWORD RESET (rate-limited)
// ========================================

router.post("/send-otp", sendOTPLimiter, sendOTPCode);
router.post("/verify-otp", verifyOTPLimiter, verifyOTPCode);
router.post("/forgot-password", sendOTPLimiter, forgotPassword);
router.post("/reset-password", passwordResetLimiter, resetPassword);

// ========================================
// SESSION MANAGEMENT (Device Binding)
// ========================================

router.get("/sessions", protect, getSessions);
router.delete("/sessions/:sessionId", protect, revokeSession);
router.post("/sessions/revoke-others", protect, revokeAllOtherSessions);

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

      // ✅ CHECK: Is this account deactivated (soft-deleted)?
      if (user.deletedAt) {
        const now = new Date();

        // Grace period expired — permanent deletion
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

        // ✅ Still in grace period — issue one-time reactivation token
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

      // ✅ CHECK: Is the email blocked?
      if (user.emailBlockedUntil && user.emailBlockedUntil > new Date()) {
        return res.redirect(
          `${process.env.CLIENT_URL}/login?error=email_blocked`
        );
      }

      // ========================================
      // Normal flow — user is active
      // ========================================

      const accessToken = generateAccessToken(user._id.toString());
      const refreshToken = generateRefreshToken(user._id.toString());

      const deviceId = getDeviceId(req);

      await RefreshToken.create({
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

      const userB64 = Buffer.from(
        JSON.stringify({
          _id: user._id,
          id: user._id,
          name: user.name,
          email: user.email,
          photos: user.photos || [],
          oauthProvider: user.oauthProvider,
          isVerified: user.isVerified,
          gender: user.gender,
          dateOfBirth: user.dateOfBirth,
          relationshipGoal: user.relationshipGoal,
          role: user.role,
        })
      ).toString("base64");

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
