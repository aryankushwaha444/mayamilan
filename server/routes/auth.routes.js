import express from "express";
import passport from "passport";
import crypto from "crypto"; // ✅ Added for familyId generation
import { logAudit } from "../utils/auditLogger.js";
import { checkIpReputationMiddleware } from "../middleware/ipReputation.middleware.js";
import { jsonLimit } from "../middleware/bodyLimit.js";
import User from "../models/User.js";

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
  upsertSessionForUser, // ← google logins now dedup + get a structured label
} from "../controllers/auth.controller.js";

import {
  generateAccessToken,
  generateReactivationToken,
  generateTempToken, // ✅ pending 2FA token (correct claims; no more bare jwt.sign)
} from "../utils/generateToken.js";

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
  oauthLimiter,
} from "../middleware/rateLimits.js";

const router = express.Router();

// Validate CLIENT_URL at startup to prevent open redirects
const CLIENT_URL = process.env.CLIENT_URL;
if (!CLIENT_URL) {
  throw new Error("CLIENT_URL environment variable is required");
}

// ✅ FIX: Secure redirect helper using the URL API to prevent Open Redirect attacks
const safeRedirect = (res, path) => {
  try {
    // Ensure path starts with a single slash to prevent protocol-relative URLs
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const targetUrl = new URL(cleanPath, CLIENT_URL);
    const trustedOrigin = new URL(CLIENT_URL).origin;

    // STRICT ORIGIN CHECK: Prevents `https://myapp.com@evil.com` bypass
    if (targetUrl.origin !== trustedOrigin) {
      return res.redirect(CLIENT_URL);
    }

    return res.redirect(targetUrl.toString());
  } catch (err) {
    // Fallback to base URL if URL parsing fails
    return res.redirect(CLIENT_URL);
  }
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

router.post("/login/2fa", loginLimiter, jsonLimit("500b"), loginWith2FA);

router.post("/oauth/2fa", loginLimiter, jsonLimit("500b"), completeOAuth2FA);

router.post(
  "/reactivate",
  reactivationLimiter,
  jsonLimit("500b"),
  reactivateAccount
);

// Note: logout is intentionally NOT protected so users with expired access tokens can still clear their cookies
router.post("/logout", jsonLimit("1kb"), logout);

router.post("/refresh", refreshLimiter, jsonLimit("1kb"), refreshAccessToken);

router.get("/me", protect, getMe);

router.put("/change-password", protect, jsonLimit("1kb"), changePassword);

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
  forgotPassword
);

router.post(
  "/reset-password",
  passwordResetLimiter,
  checkIpReputationMiddleware,
  jsonLimit("1kb"),
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
  revokeSession
);

router.post(
  "/sessions/revoke-others",
  protect,
  sessionManagementLimiter,
  jsonLimit("1kb"),
  revokeAllOtherSessions
);

// ========================================
// GOOGLE OAUTH (✅ RATE LIMITED)
// ========================================

router.get(
  "/google",
  oauthLimiter,
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    state: false,
  })
);

router.get(
  "/google/callback",
  oauthLimiter,
  passport.authenticate("google", {
    session: false,
    state: false,
    failureRedirect: `${CLIENT_URL}/login?error=google_failed`,
  }),
  async (req, res) => {
    console.log("🔵 OAuth callback STARTED");

    try {
      const user = req.user;
      console.log("🔵 User from Passport:", user ? user.email : "NULL");

      if (!user) {
        console.log("❌ No user - redirecting to /login?error=no_user");
        return safeRedirect(res, "/login?error=no_user");
      }

      // ── Deactivated account ──────────
      if (user.deletedAt) {
        console.log("🔵 User is DEACTIVATED");
        const now = new Date();

        if (
          !user.scheduledDeletionAt ||
          now > new Date(user.scheduledDeletionAt)
        ) {
          console.log("❌ Grace period expired");
          return safeRedirect(res, "/login?error=account_permanently_deleted");
        }

        console.log(
          "🔵 Checking reactivation attempts:",
          user.reactivationAttempts
        );
        if ((user.reactivationAttempts || 0) >= 3) {
          console.log("❌ Too many attempts");
          return safeRedirect(res, "/login?error=too_many_attempts");
        }

        const daysRemaining = Math.max(
          1,
          Math.ceil(
            (new Date(user.scheduledDeletionAt) - now) / (1000 * 60 * 60 * 24)
          )
        );
        const attemptsRemaining = 3 - (user.reactivationAttempts || 0);

        console.log("🔵 Incrementing reactivation attempts");
        await User.updateOne(
          { _id: user._id },
          { $inc: { reactivationAttempts: 1 } }
        );

        console.log("🔵 Generating reactivation token");
        const reactivationToken = generateReactivationToken(
          user._id.toString()
        );

        const params = new URLSearchParams({
          reactivate: "1",
          token: reactivationToken,
          days: String(daysRemaining),
          attempts: String(attemptsRemaining),
        });

        const redirectUrl = `/login?${params.toString()}`;
        console.log(
          "✅ Redirecting to:",
          redirectUrl.substring(0, 100) + "..."
        );
        return safeRedirect(res, redirectUrl);
      }

      // ── Email blocked ──────────
      if (user.emailBlockedUntil && user.emailBlockedUntil > new Date()) {
        console.log("❌ Email blocked");
        return safeRedirect(res, "/login?error=email_blocked");
      }

      // ── 2FA ──────────
      if (user.twoFactorEnabled) {
        console.log("🔵 2FA enabled");
        // ✅ Pending token in an httpOnly cookie (NOT the redirect URL). The token
        // previously rode in ?tempToken=... -> leaked to history/Referer/JS. Now the
        // URL carries only the flag; the verify XHR sends the cookie automatically.
        const tempToken = generateTempToken(
          user._id.toString(),
          "oauth-2fa-pending"
        );
        res.cookie("oauth2faPending", tempToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          maxAge: 5 * 60 * 1000,
          path: "/",
        });
        return safeRedirect(res, "/login?oauth2fa=1");
      }

      // ── Normal flow ──────────
      console.log("🔵 Normal login flow");
      const { session, refreshToken } = await upsertSessionForUser(user, req, {
        familyId: crypto.randomUUID(),
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      const accessToken = generateAccessToken(user._id.toString(), session._id);

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

      console.log("✅ Success - redirecting to /oauth-success");
      return safeRedirect(
        res,
        `/oauth-success?token=${encodeURIComponent(
          accessToken
        )}&user=${encodeURIComponent(userB64)}`
      );
    } catch (error) {
      console.error("❌ CRASH in OAuth callback:");
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      return safeRedirect(res, "/login?error=server_error");
    }
  }
);

export default router;
