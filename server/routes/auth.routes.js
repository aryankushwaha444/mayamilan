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

// ✅ FIXED — optionalAuth was USED below but NEVER imported here, so this module
//    threw "ReferenceError: optionalAuth is not defined" at load and the server
//    could not boot. Import it alongside protect (and make sure the middleware
//    file actually exports it — see companion edit A).
import { protect, optionalAuth } from "../middleware/auth.middleware.js";
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

// 🔒 Keep the refresh-cookie maxAge in sync with the controller's
//    REFRESH_TOKEN_EXPIRY_MS (30 days). Duplicating the literal here is how the
//    OAuth cookie expiry drifts from the DB row expiry.
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const OAUTH_STATE_COOKIE = "mm_oauth_state";
// ✅ FIXED — was sameSite: IS_PRODUCTION ? "none" : "lax". The SPA calls /api
//    RELATIVELY (Vercel rewrite), so this cookie is FIRST-PARTY; "lax" still
//    rides the cross-site TOP-LEVEL GET navigation that is the OAuth callback,
//    and "none" only widens the CSRF/third-party surface and invites Brave's
//    third-party-cookie blocking. Mirrors the controller's documented precondition.
const oauthStateOpts = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: "lax",
  maxAge: 10 * 60 * 1000,
  path: "/",
};

// ✅ FIXED — same rationale: "lax", matching the controller's REACTIVATE_COOKIE.
const REACTIVATE_COOKIE = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: "lax",
  maxAge: 10 * 60 * 1000,
  path: "/",
};

// ✅ Open-redirect safe: only redirect to a path on a trusted origin.
//    (Blocks "//evil.com" protocol-relative and absolute cross-origin targets.)
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

// ✅ logout is reached via optionalAuth (never 401s) so an EXPIRED access token
//    still clears + revokes the long-lived refresh cookie — this is the actual
//    fix for "logout works only on Chrome". No rate limiter on purpose: it is
//    idempotent and cheap (one indexed hash lookup; no-op without the cookie),
//    and 429-ing it could trap a user who cannot sign out. verifySignature is
//    intentionally absent so logout works even with no/​stale signing key.
router.post("/logout", optionalAuth, jsonLimit("1kb"), logout);

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
    state: false, // manual constant-time cookie-vs-query check below instead
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
        // ✅ FIXED — sameSite "lax" (was "none" in prod), matching the
        //    controller's PENDING_2FA_COOKIE so the half-flow cookie is
        //    first-party and Brave-safe.
        res.cookie(
          "oauth2faPending",
          generateTempToken(user._id.toString(), "oauth-2fa-pending"),
          {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: "lax",
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

      // ✅ FIXED — sameSite "lax" + named maxAge (was "none" + a duplicated
      //    30-day literal), matching login/refresh so a Google session and a
      //    password session produce an identical, first-party, Brave-safe cookie
      //    whose deletion tuple matches clearRefreshTokenCookie in the controller.
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: "lax",
        maxAge: REFRESH_COOKIE_MAX_AGE_MS,
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
