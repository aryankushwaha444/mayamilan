import express from "express";
import passport from "passport";
import crypto from "crypto";
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
  upsertSessionForUser,
} from "../controllers/auth.controller.js";

import {
  generateReactivationToken,
  generateTempToken,
  constantTimeCompare,
} from "../utils/generateToken.js";

import { protect } from "../middleware/auth.middleware.js";
import { verifySignature } from "../middleware/verifySignature.js";

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

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";

const debugLog = (...args) => {
  if (!IS_PRODUCTION) console.log(...args);
};

// ✅ CLIENT_URL may be comma-separated. Parse to trusted origins.
const CLIENT_RAW = process.env.CLIENT_URL;
if (!CLIENT_RAW) {
  throw new Error("CLIENT_URL environment variable is required");
}

const TRUSTED_ORIGINS = new Set(
  CLIENT_RAW.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try {
        return new URL(s).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
);

const PRIMARY_ORIGIN =
  [...TRUSTED_ORIGINS][0] || CLIENT_RAW.split(",")[0].trim();

if (TRUSTED_ORIGINS.size === 0) {
  throw new Error("CLIENT_URL contains no valid origin");
}

const OAUTH_STATE_COOKIE = "mm_oauth_state";
const oauthStateOpts = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? "none" : "lax",
  maxAge: 10 * 60 * 1000,
  path: "/",
};

const REACTIVATE_COOKIE = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? "none" : "lax",
  maxAge: 10 * 60 * 1000,
  path: "/",
};

// ✅ Open-redirect safe: only redirect to a path on a trusted origin.
const safeRedirect = (res, path) => {
  try {
    const cleanPath = String(path).startsWith("/") ? String(path) : `/${path}`;
    const target = new URL(cleanPath, PRIMARY_ORIGIN);

    if (!TRUSTED_ORIGINS.has(target.origin)) {
      return res.redirect(PRIMARY_ORIGIN);
    }

    return res.redirect(target.toString());
  } catch {
    return res.redirect(PRIMARY_ORIGIN);
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

router.post("/logout", jsonLimit("1kb"), logout);

router.post("/refresh", refreshLimiter, jsonLimit("1kb"), refreshAccessToken);

router.get("/me", protect, getMe);

// ✅ Authenticated JSON mutations: protect -> body limit -> verifySignature -> controller.
router.put(
  "/change-password",
  protect,
  jsonLimit("1kb"),
  verifySignature,
  changePassword
);

router.get("/sessions", protect, verifySignature, getSessions);

router.delete(
  "/sessions/:sessionId",
  protect,
  sessionManagementLimiter,
  verifySignature,
  revokeSession
);

router.post(
  "/sessions/revoke-others",
  protect,
  jsonLimit("1kb"),
  sessionManagementLimiter,
  verifySignature,
  revokeAllOtherSessions
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
// GOOGLE OAUTH (state-bound, no token in URL)
// ========================================

router.get("/google", oauthLimiter, (req, res, next) => {
  // Per-browser anti-substitution nonce: cookie + passed to Google.
  const state = crypto.randomBytes(24).toString("base64url");
  res.cookie(OAUTH_STATE_COOKIE, state, oauthStateOpts);

  return passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    state,
  })(req, res, next);
});

router.get(
  "/google/callback",
  oauthLimiter,
  passport.authenticate("google", {
    session: false,
    state: false,
    failureRedirect: `${PRIMARY_ORIGIN}/login?error=google_failed`,
  }),
  async (req, res) => {
    try {
      // ✅ Substitution guard: returned state MUST equal this browser's cookie.
      const cookieState = req.cookies?.[OAUTH_STATE_COOKIE];
      const queryState = req.query?.state;
      res.clearCookie(OAUTH_STATE_COOKIE, oauthStateOpts);

      if (
        !cookieState ||
        !queryState ||
        !constantTimeCompare(String(cookieState), String(queryState))
      ) {
        await logAudit(req, "oauth_state_mismatch", { ip: req.ip });
        return safeRedirect(res, "/login?error=oauth_state");
      }

      const user = req.user;
      if (!user) {
        return safeRedirect(res, "/login?error=no_user");
      }

      if (!user.isActive) {
        return safeRedirect(res, "/login?error=account_inactive");
      }

      // ── Deactivated account ──────────
      if (user.deletedAt) {
        const now = new Date();

        if (
          !user.scheduledDeletionAt ||
          now > new Date(user.scheduledDeletionAt)
        ) {
          return safeRedirect(res, "/login?error=account_permanently_deleted");
        }

        if ((user.reactivationAttempts || 0) >= 3) {
          return safeRedirect(res, "/login?error=too_many_attempts");
        }

        const daysRemaining = Math.max(
          1,
          Math.ceil(
            (new Date(user.scheduledDeletionAt) - now) / (1000 * 60 * 60 * 24)
          )
        );
        const attemptsRemaining = 3 - (user.reactivationAttempts || 0);

        await User.updateOne(
          { _id: user._id },
          { $inc: { reactivationAttempts: 1 } }
        );

        // ✅ Reactivation token in httpOnly cookie, NOT URL.
        res.cookie(
          "reactivatePending",
          generateReactivationToken(user._id.toString()),
          REACTIVATE_COOKIE
        );

        return safeRedirect(
          res,
          `/login?reactivate=1&days=${daysRemaining}&attempts=${attemptsRemaining}`
        );
      }

      // ── Email blocked ──────────
      if (user.emailBlockedUntil && user.emailBlockedUntil > new Date()) {
        return safeRedirect(res, "/login?error=email_blocked");
      }

      // ── 2FA ──────────
      if (user.twoFactorEnabled) {
        res.cookie(
          "oauth2faPending",
          generateTempToken(user._id.toString(), "oauth-2fa-pending"),
          {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: IS_PRODUCTION ? "none" : "lax",
            maxAge: 5 * 60 * 1000,
            path: "/",
          }
        );
        return safeRedirect(res, "/login?oauth2fa=1");
      }

      // ── Normal flow ──────────
      // ✅ Set refresh cookie only. Redirect clean. SPA obtains access token via /auth/refresh.
      const { refreshToken } = await upsertSessionForUser(user, req, {
        familyId: crypto.randomUUID(),
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: IS_PRODUCTION ? "none" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      return safeRedirect(res, "/oauth-success");
    } catch (error) {
      debugLog("OAuth callback error:", error?.message || String(error));
      await logAudit(req, "oauth_callback_error", {
        ip: req.ip,
        name: error?.name || "Error",
      });
      return safeRedirect(res, "/login?error=server_error");
    }
  }
);

export default router;
