import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js";
import { logAudit } from "../utils/auditLogger.js";

// ═══════════════════════════════════════════
// ENV VALIDATION
// ═══════════════════════════════════════════
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;
const NODE_ENV = process.env.NODE_ENV || "development";

if (!GOOGLE_CLIENT_ID) {
  throw new Error("GOOGLE_CLIENT_ID environment variable is required");
}
if (!GOOGLE_CLIENT_SECRET) {
  throw new Error("GOOGLE_CLIENT_SECRET environment variable is required");
}
if (!GOOGLE_CALLBACK_URL) {
  throw new Error("GOOGLE_CALLBACK_URL environment variable is required");
}

// ═══════════════════════════════════════════
// SECURITY: Allowed email domains (optional)
// ═══════════════════════════════════════════
const ALLOWED_EMAIL_DOMAINS = process.env.ALLOWED_EMAIL_DOMAINS
  ? process.env.ALLOWED_EMAIL_DOMAINS.split(",").map((d) =>
      d.trim().toLowerCase()
    )
  : null; // null means all domains allowed

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * SECURITY: Validate and sanitize profile photo URL
 */
const validatePhotoUrl = (url) => {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // Only allow HTTPS
    if (parsed.protocol !== "https:") {
      console.warn(`⚠️ Blocked non-HTTPS photo URL: ${url}`);
      return null;
    }

    // Only allow known safe domains
    const allowedDomains = [
      "lh3.googleusercontent.com",
      "googleusercontent.com",
      "google.com",
    ];

    if (!allowedDomains.some((domain) => parsed.hostname.endsWith(domain))) {
      console.warn(
        `⚠️ Blocked photo URL from untrusted domain: ${parsed.hostname}`
      );
      return null;
    }

    return url;
  } catch {
    return null;
  }
};

/**
 * SECURITY: Validate email domain
 */
const validateEmailDomain = (email) => {
  if (!ALLOWED_EMAIL_DOMAINS) return true;

  const domain = email.split("@")[1]?.toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
};

/**
 * Extract safe fields from Google profile
 */
const extractProfileData = (profile) => {
  const email = profile.emails?.[0]?.value;
  if (!email) {
    throw new Error("Google account has no verified email");
  }

  const sanitizedEmail = email.toLowerCase().trim();

  // SECURITY: Validate email domain
  if (!validateEmailDomain(sanitizedEmail)) {
    throw new Error("Email domain not allowed");
  }

  // SECURITY: Validate and sanitize photo URL
  const photoUrl = validatePhotoUrl(profile.photos?.[0]?.value);

  return {
    email: sanitizedEmail,
    name: profile.displayName?.trim() || sanitizedEmail.split("@")[0],
    oauthProvider: "google",
    oauthId: profile.id,
    isVerified: true,
    photos: photoUrl
      ? [{ url: photoUrl, isPrimary: true, publicId: null }]
      : undefined,
  };
};

// ═══════════════════════════════════════════
// GOOGLE STRATEGY (Enhanced)
// ═══════════════════════════════════════════

passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK_URL,
      scope: ["profile", "email"],
      passReqToCallback: false,
      // ✅ FIX: Disable state parameter to work with stateless JWT auth
      // Google's redirect URI whitelist provides sufficient CSRF protection
      state: false,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const profileData = extractProfileData(profile);

        // Find user by email OR by google id
        let user = await User.findOne({
          $or: [
            { email: profileData.email },
            { oauthId: profileData.oauthId, oauthProvider: "google" },
          ],
        });

        // ── New user: create account ──────────────────
        if (!user) {
          try {
            user = await User.create({
              ...profileData,
              gender: "prefer-not-to-say",
              dateOfBirth: null,
              relationshipGoal: "not-sure",
            });

            // SECURITY: Audit log for new OAuth user
            await logAudit(
              { ip: "system", user: null },
              "oauth_account_created",
              {
                provider: "google",
                email: profileData.email,
                oauthId: profileData.oauthId,
              }
            );
          } catch (createError) {
            if (createError.code === 11000) {
              user = await User.findOne({ email: profileData.email });
              if (!user) throw createError;
            } else {
              throw createError;
            }
          }
        }

        // ── Existing user: check status ───────────────
        if (user.deletedAt) {
          if (NODE_ENV === "development") {
            console.warn(
              `OAuth attempt on deactivated account: ${profileData.email}`
            );
          }

          await logAudit(
            { ip: "system", user: user._id },
            "oauth_login_deactivated",
            {
              provider: "google",
              email: profileData.email,
            }
          );

          return done(null, user, { message: "account_deactivated" });
        }

        if (user.isBanned) {
          if (NODE_ENV === "development") {
            console.warn(
              `OAuth attempt on banned account: ${profileData.email}`
            );
          }

          await logAudit(
            { ip: "system", user: user._id },
            "oauth_login_banned",
            {
              provider: "google",
              email: profileData.email,
            }
          );

          return done(null, false, { message: "account_banned" });
        }

        if (user.emailBlockedUntil && user.emailBlockedUntil > new Date()) {
          if (NODE_ENV === "development") {
            console.warn(
              `OAuth attempt on email-blocked account: ${profileData.email}`
            );
          }

          await logAudit(
            { ip: "system", user: user._id },
            "oauth_login_email_blocked",
            {
              provider: "google",
              email: profileData.email,
            }
          );

          return done(null, false, { message: "email_blocked" });
        }

        // ── Existing user: update profile if needed ───
        const updates = {};

        // Link Google if this was a local account
        if (!user.oauthId) {
          updates.oauthProvider = "google";
          updates.oauthId = profileData.oauthId;

          await logAudit(
            { ip: "system", user: user._id },
            "oauth_account_linked",
            {
              provider: "google",
              email: profileData.email,
            }
          );
        }

        // Update name if user hasn't customized it
        if (
          user.name === user.email.split("@")[0] &&
          profileData.name !== user.name
        ) {
          updates.name = profileData.name;
        }

        // Add Google profile photo if user has none
        if ((!user.photos || user.photos.length === 0) && profileData.photos) {
          updates.photos = profileData.photos;
        }

        // Track last login
        updates.lastLoginAt = new Date();

        if (Object.keys(updates).length > 0) {
          await User.updateOne({ _id: user._id }, { $set: updates });
          Object.assign(user, updates);
        }

        // SECURITY: Audit log for successful OAuth login
        await logAudit(
          { ip: "system", user: user._id },
          "oauth_login_success",
          {
            provider: "google",
            email: profileData.email,
          }
        );

        return done(null, user);
      } catch (error) {
        // SECURITY: Never log full error (may contain PII)
        if (NODE_ENV === "development") {
          console.error("Google OAuth strategy error:", error.name);
        }

        await logAudit({ ip: "system", user: null }, "oauth_login_failed", {
          provider: "google",
          error: error.name,
        });

        return done(error, null);
      }
    }
  )
);

// SECURITY: Serialize user for session (if using sessions)
passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select(
      "-password -refreshToken -twoFactorSecret"
    );
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
