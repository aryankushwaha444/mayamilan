import argon2 from "argon2";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import {
  generateSecret,
  generateQrCode,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  encryptSecret,
  decryptSecret,
} from "../utils/totp.js";
import { logAudit } from "../utils/auditLogger.js";
import { hashToken } from "../utils/generateToken.js";
import { verifyTurnstile } from "../utils/turnstile.js"; // ✅ step-up factor for OAuth
import redis from "../utils/cache.js";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const BACKUP_CODE_COUNT = 8;
const SETUP_EXPIRATION_MINUTES = 15;
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MINUTES = 30;
const LOW_BACKUP_CODE_THRESHOLD = 3;

// ✅ Attacker-prevention toggle (default OFF so applying this fix alone never
// changes UX). When "true", /setup requires a step-up factor (password for local
// users, Turnstile for OAuth users in prod) before any pending secret is issued,
// which closes the stolen-access-token → enable-2FA → revoke-victim-sessions ATO
// path. /2fa/status reports the resulting requirement so the client prompts only
// when the server actually needs it (no hardcoded env on the client).
const reauthRequired = () => process.env["2FA_REQUIRE_REAUTH"] === "true";
const SETUP_TTL_MS = SETUP_EXPIRATION_MINUTES * 60 * 1000;

// ═══════════════════════════════════════════
// STORAGE ABSTRACTION (Redis when present, encrypted DB fallback when not)
// The Redis branch preserves the original behavior exactly; the DB branch keeps
// the SAME security properties (encrypted at rest, expiring, user-bound, cleared
// on success) so 2FA is no longer hostage to infra. DB writes use updateOne so
// they never trip User save/validate hooks.
// ═══════════════════════════════════════════

const pendingSet = async (userId, encryptedSecret) => {
  if (redis) {
    await redis.set(
      `2fa_setup:${userId}`,
      encryptedSecret,
      "EX",
      SETUP_EXPIRATION_MINUTES * 60
    );
    return;
  }
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        twoFactorPendingSecret: encryptedSecret,
        twoFactorPendingExpiresAt: new Date(Date.now() + SETUP_TTL_MS),
      },
    }
  );
};

const pendingGet = async (userId) => {
  if (redis) return (await redis.get(`2fa_setup:${userId}`)) || null;
  const u = await User.findById(userId)
    .select("+twoFactorPendingSecret +twoFactorPendingExpiresAt")
    .lean();
  if (!u || !u.twoFactorPendingSecret) return null;
  if (
    !u.twoFactorPendingExpiresAt ||
    u.twoFactorPendingExpiresAt.getTime() < Date.now()
  ) {
    await pendingClear(userId); // lazily expire
    return null;
  }
  return u.twoFactorPendingSecret;
};

const pendingClear = async (userId) => {
  if (redis) {
    await redis.del(`2fa_setup:${userId}`);
    return;
  }
  await User.updateOne(
    { _id: userId },
    { $set: { twoFactorPendingSecret: null, twoFactorPendingExpiresAt: null } }
  );
};

const checkLockout = async (userId) => {
  if (redis) {
    const lockoutUntil = await redis.get(`2fa_lockout:${userId}`);
    if (lockoutUntil) {
      const remainingMs = parseInt(lockoutUntil) - Date.now();
      if (remainingMs > 0) {
        return {
          locked: true,
          remainingMinutes: Math.ceil(remainingMs / 60000),
        };
      }
    }
    return { locked: false };
  }
  const u = await User.findById(userId).select("+twoFactorLockoutUntil").lean();
  const until = u?.twoFactorLockoutUntil;
  if (until && until.getTime() > Date.now()) {
    return {
      locked: true,
      remainingMinutes: Math.ceil((until.getTime() - Date.now()) / 60000),
    };
  }
  return { locked: false };
};

const handleFailedAttempt = async (userId, action) => {
  if (redis) {
    const attemptsKey = `2fa_attempts:${action}:${userId}`;
    const lockoutKey = `2fa_lockout:${userId}`;
    const attempts = await redis.incr(attemptsKey);
    await redis.expire(attemptsKey, LOCKOUT_DURATION_MINUTES * 60);
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      const lockoutUntil = Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000;
      await redis.set(
        lockoutKey,
        lockoutUntil.toString(),
        "EX",
        LOCKOUT_DURATION_MINUTES * 60
      );
      await redis.del(attemptsKey);
    }
    return;
  }
  // DB fallback: single per-user counter + global lockout (slightly stricter than
  // the per-action Redis keys, which is the safe direction). 2FA setup is rare and
  // low-concurrency per user, so the non-atomic incr is acceptable here.
  const u = await User.findById(userId)
    .select("+twoFactorFailedAttempts +twoFactorLockoutUntil")
    .lean();
  const attempts = (u?.twoFactorFailedAttempts || 0) + 1;
  const set = { twoFactorFailedAttempts: attempts };
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    set.twoFactorLockoutUntil = new Date(
      Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000
    );
    set.twoFactorFailedAttempts = 0;
  }
  await User.updateOne({ _id: userId }, { $set: set });
};

const clearFailedAttempts = async (userId) => {
  if (redis) {
    // Redis keeps per-action attempt keys; clear the common ones + the lockout.
    await redis.del(`2fa_lockout:${userId}`);
    for (const a of ["setup", "setup_auth", "disable", "regenerate"]) {
      await redis.del(`2fa_attempts:${a}:${userId}`);
    }
    return;
  }
  await User.updateOne(
    { _id: userId },
    { $set: { twoFactorFailedAttempts: 0, twoFactorLockoutUntil: null } }
  );
};

const verifyTotpOrBackup = async (code, secret, backupCodes) => {
  if (verifyTotp(code, secret)) {
    return { valid: true, method: "totp" };
  }
  const backupIndex = await verifyBackupCode(code, backupCodes);
  if (backupIndex !== -1) {
    return { valid: true, method: "backup_code", backupIndex };
  }
  return { valid: false };
};

// Which step-up factor (if any) the server will demand on /setup for THIS user.
// null => no factor (flag off, or OAuth in a dev where Turnstile is disabled).
const computeReauthMethod = (user) => {
  if (!reauthRequired()) return null;
  const isLocal = !user.oauthProvider || user.oauthProvider === "local";
  if (isLocal) return "password";
  return process.env.TURNSTILE_ENABLED === "true" ? "turnstile" : null;
};

// ═══════════════════════════════════════════
// SETUP 2FA (Step 1: Generate QR)
// ═══════════════════════════════════════════

export const setup2FA = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // (the old `if (!redis) 503` guard stays removed — pending secret + lockout
    //  work via the Redis-or-DB helpers, same as last turn)

    const lockout = await checkLockout(userId);
    if (lockout.locked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${lockout.remainingMinutes} minutes.`,
        locked: true,
        retryAfter: lockout.remainingMinutes,
      });
    }

    // ✅ FIX: was `.select("+password isVerified isActive")` — a MIXED select that
    // turned the query into inclusion-only and DROPPED `email` (=> the QR account
    // label rendered "undefined") and `twoFactorEnabled` (=> the "already enabled,
    // refuse re-setup" guard silently never fired, a stolen-token 2FA-rotation /
    // lockout hole). The all-`+` form below returns the FULL document plus the
    // re-included `password`, matching the pattern the other five selects in this
    // file already use (which is why nothing else broke). No masking fallback like
    // `user.email || req.user.email` is added on purpose: papering over `undefined`
    // is what hid this class of bug; the correct fix is to read the real field.
    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email before enabling 2FA",
      });
    }
    if (!user.isActive) {
      return res
        .status(403)
        .json({ success: false, message: "Account is inactive" });
    }
    if (user.twoFactorEnabled) {
      // ✅ now actually fires (twoFactorEnabled is present again)
      return res.status(400).json({
        success: false,
        message: "2FA is already enabled. Disable it first to reconfigure.",
      });
    }

    // Step-up factor (gated by 2FA_REQUIRE_REAUTH; default off => method === null)
    const method = computeReauthMethod(user);
    if (method === "password") {
      const { password } = req.body || {};
      if (!password || typeof password !== "string") {
        return res.status(428).json({
          success: false,
          reauth_required: true,
          reauthMethod: "password",
          message: "Enter your current password to enable 2FA.",
        });
      }
      const ok = await argon2.verify(user.password, password);
      if (!ok) {
        await handleFailedAttempt(userId, "setup_auth");
        await logAudit(req, "2fa_setup_failed", {
          userId,
          reason: "wrong_password_stepup",
        });
        return res.status(428).json({
          success: false,
          reauth_required: true,
          reauthMethod: "password",
          message: "Incorrect password.",
        });
      }
    } else if (method === "turnstile") {
      const { turnstileToken } = req.body || {};
      const okTok = await verifyTurnstile(
        turnstileToken,
        req.ip,
        "2fa_setup",
        userId.toString()
      );
      if (!okTok) {
        await logAudit(req, "2fa_setup_failed", {
          userId,
          reason: "turnstile_stepup_failed",
        });
        return res.status(428).json({
          success: false,
          reauth_required: true,
          reauthMethod: "turnstile",
          message:
            "Security verification required. Complete the check and retry.",
        });
      }
    }

    const secret = generateSecret();
    // ✅ user.email is now present => the authenticator shows the real account
    // line instead of "undefined" (issuer "Maya~Milan" was always correct).
    const qrCode = await generateQrCode(user.email, secret);
    const encryptedSecret = encryptSecret(secret);
    await pendingSet(userId, encryptedSecret);

    await logAudit(req, "2fa_setup_initiated", {
      userId: user._id,
      email: user.email, // ✅ no longer undefined in the audit row either
    });

    return res.status(200).json({
      success: true,
      qrCode,
      secret,
      message:
        "Scan QR code with your authenticator app, then verify with a code.",
      expiresAt: new Date(
        Date.now() + SETUP_EXPIRATION_MINUTES * 60 * 1000
      ).toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// REQUEST SECRET (for manual entry)
// ═══════════════════════════════════════════

export const request2FASecret = async (req, res, next) => {
  try {
    const userId = req.user._id;
    // ✅ REMOVED the `if (!redis) 503` guard.
    const encryptedSecret = await pendingGet(userId);
    if (!encryptedSecret) {
      return res.status(410).json({
        success: false,
        message: "2FA setup expired or not found. Please start over.",
        expired: true,
      });
    }
    const secret = decryptSecret(encryptedSecret);
    await logAudit(req, "2fa_secret_requested", {
      userId,
      email: req.user.email,
    });
    return res.status(200).json({
      success: true,
      secret,
      message: "Use this secret to manually configure your authenticator app",
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// VERIFY 2FA SETUP (Step 2: Activate)
// ═══════════════════════════════════════════

export const verify2FASetup = async (req, res, next) => {
  try {
    const { totpCode } = req.body;
    const userId = req.user._id;

    if (!totpCode) {
      return res
        .status(400)
        .json({ success: false, message: "TOTP code required" });
    }
    // ✅ REMOVED the `if (!redis) 503` guard.

    const lockout = await checkLockout(userId);
    if (lockout.locked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${lockout.remainingMinutes} minutes.`,
        locked: true,
        retryAfter: lockout.remainingMinutes,
      });
    }

    const encryptedSecret = await pendingGet(userId);
    if (!encryptedSecret) {
      return res.status(410).json({
        success: false,
        message: "2FA setup expired. Please start over.",
        expired: true,
      });
    }
    const secret = decryptSecret(encryptedSecret);

    const isValid = verifyTotp(totpCode, secret);
    if (!isValid) {
      await handleFailedAttempt(userId, "setup");
      await logAudit(req, "2fa_setup_failed", {
        userId,
        email: req.user.email,
        reason: "invalid_code",
      });
      return res
        .status(401)
        .json({ success: false, message: "Invalid code. Please try again." });
    }

    await clearFailedAttempts(userId, "setup");
    await pendingClear(userId); // works on Redis or DB

    const backupCodes = generateBackupCodes(BACKUP_CODE_COUNT);
    const hashedCodes = await Promise.all(
      backupCodes.map(async (code) => ({
        code: await hashBackupCode(code),
        used: false,
        usedAt: null,
      }))
    );

    // Plain load: select:false fields (twoFactorSecret/BackupCodes) are ASSIGNED
    // below and save() $sets them even if not pre-loaded; password stays unloaded.
    const user = await User.findById(userId);
    user.twoFactorEnabled = true;
    user.twoFactorEnabledAt = new Date();
    user.twoFactorSecret = encryptSecret(secret);
    user.twoFactorBackupCodes = hashedCodes;
    await user.save();

    const currentRefreshToken = req.cookies.refreshToken;
    const currentHash = currentRefreshToken
      ? hashToken(currentRefreshToken)
      : null;
    await RefreshToken.updateMany(
      { user: user._id, revokedAt: null, tokenHash: { $ne: currentHash } },
      { revokedAt: new Date(), revokeReason: "2fa_enabled" }
    );

    await logAudit(req, "2fa_enabled", {
      userId: user._id,
      email: user.email,
      backupCodesGenerated: BACKUP_CODE_COUNT,
    });

    return res.status(200).json({
      success: true,
      message:
        "2FA enabled successfully. Save these backup codes in a safe place!",
      backupCodes,
      warning:
        "These codes will only be shown once. Store them securely. Each code can only be used once.",
      backupCodesRemaining: BACKUP_CODE_COUNT,
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// DISABLE 2FA
// ═══════════════════════════════════════════

export const disable2FA = async (req, res, next) => {
  try {
    const { password, totpCode } = req.body;
    const userId = req.user._id;

    if (!totpCode) {
      return res
        .status(400)
        .json({ success: false, message: "2FA code required" });
    }

    const lockout = await checkLockout(userId);
    if (lockout.locked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${lockout.remainingMinutes} minutes.`,
        locked: true,
        retryAfter: lockout.remainingMinutes,
      });
    }

    const user = await User.findById(userId).select(
      "+password +twoFactorSecret +twoFactorBackupCodes"
    );
    if (!user || !user.twoFactorEnabled) {
      return res
        .status(400)
        .json({ success: false, message: "2FA is not enabled" });
    }

    const isLocalUser = !user.oauthProvider || user.oauthProvider === "local";
    if (isLocalUser) {
      if (!password) {
        return res
          .status(400)
          .json({ success: false, message: "Password required" });
      }
      const passwordValid = await argon2.verify(user.password, password);
      if (!passwordValid) {
        await handleFailedAttempt(userId, "disable");
        await logAudit(req, "2fa_disable_failed", {
          userId: user._id,
          email: user.email,
          reason: "wrong_password",
        });
        return res
          .status(401)
          .json({ success: false, message: "Incorrect password" });
      }
    }

    const secret = decryptSecret(user.twoFactorSecret);
    const verification = await verifyTotpOrBackup(
      totpCode,
      secret,
      user.twoFactorBackupCodes
    );
    if (!verification.valid) {
      await handleFailedAttempt(userId, "disable");
      await logAudit(req, "2fa_disable_failed", {
        userId: user._id,
        email: user.email,
        reason: "invalid_code",
      });
      return res
        .status(401)
        .json({ success: false, message: "Invalid 2FA code" });
    }

    if (verification.method === "backup_code") {
      user.twoFactorBackupCodes[verification.backupIndex].used = true;
      user.twoFactorBackupCodes[verification.backupIndex].usedAt = new Date();
    }

    await clearFailedAttempts(userId, "disable");

    user.twoFactorEnabled = false;
    user.twoFactorEnabledAt = null;
    user.twoFactorSecret = null;
    user.twoFactorBackupCodes = [];
    await user.save();

    await logAudit(req, "2fa_disabled", {
      userId: user._id,
      email: user.email,
      method: verification.method,
      authMethod: isLocalUser ? "password" : "oauth",
    });

    return res
      .status(200)
      .json({ success: true, message: "2FA has been disabled" });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET 2FA STATUS
// ═══════════════════════════════════════════

export const get2FAStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      "+twoFactorBackupCodes"
    );
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const unusedBackupCodes = user.twoFactorBackupCodes.filter(
      (c) => !c.used
    ).length;
    const totalBackupCodes = user.twoFactorBackupCodes.length;

    return res.status(200).json({
      success: true,
      enabled: user.twoFactorEnabled,
      enabledAt: user.twoFactorEnabledAt,
      backupCodesRemaining: user.twoFactorEnabled ? unusedBackupCodes : 0,
      backupCodesTotal: user.twoFactorEnabled ? totalBackupCodes : 0,
      lowBackupCodes:
        user.twoFactorEnabled &&
        unusedBackupCodes > 0 &&
        unusedBackupCodes <= LOW_BACKUP_CODE_THRESHOLD,
      backupCodesExhausted: user.twoFactorEnabled && unusedBackupCodes === 0,
      // ✅ drives the client step-up UI; null when 2FA_REQUIRE_REAUTH is off
      reauthRequired: reauthRequired(),
      reauthMethod: computeReauthMethod(user),
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// REGENERATE BACKUP CODES
// ═══════════════════════════════════════════

export const regenerateBackupCodes = async (req, res, next) => {
  try {
    const { password, totpCode } = req.body;
    const userId = req.user._id;

    if (!totpCode) {
      return res
        .status(400)
        .json({ success: false, message: "2FA code required" });
    }

    const lockout = await checkLockout(userId);
    if (lockout.locked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${lockout.remainingMinutes} minutes.`,
        locked: true,
        retryAfter: lockout.remainingMinutes,
      });
    }

    const user = await User.findById(userId).select(
      "+password +twoFactorSecret +twoFactorBackupCodes"
    );
    if (!user || !user.twoFactorEnabled) {
      return res
        .status(400)
        .json({ success: false, message: "2FA is not enabled" });
    }

    const isLocalUser = !user.oauthProvider || user.oauthProvider === "local";
    if (isLocalUser) {
      if (!password) {
        return res
          .status(400)
          .json({ success: false, message: "Password required" });
      }
      const passwordValid = await argon2.verify(user.password, password);
      if (!passwordValid) {
        await handleFailedAttempt(userId, "regenerate");
        return res
          .status(401)
          .json({ success: false, message: "Incorrect password" });
      }
    }

    const secret = decryptSecret(user.twoFactorSecret);
    const verification = await verifyTotpOrBackup(
      totpCode,
      secret,
      user.twoFactorBackupCodes
    );
    if (!verification.valid) {
      await handleFailedAttempt(userId, "regenerate");
      return res
        .status(401)
        .json({ success: false, message: "Invalid 2FA code" });
    }

    if (verification.method === "backup_code") {
      user.twoFactorBackupCodes[verification.backupIndex].used = true;
      user.twoFactorBackupCodes[verification.backupIndex].usedAt = new Date();
    }

    await clearFailedAttempts(userId, "regenerate");

    const backupCodes = generateBackupCodes(BACKUP_CODE_COUNT);
    const hashedCodes = await Promise.all(
      backupCodes.map(async (code) => ({
        code: await hashBackupCode(code),
        used: false,
        usedAt: null,
      }))
    );

    user.twoFactorBackupCodes = hashedCodes;
    await user.save();

    await logAudit(req, "2fa_backup_codes_regenerated", {
      userId: user._id,
      email: user.email,
      newCodesGenerated: BACKUP_CODE_COUNT,
    });

    return res.status(200).json({
      success: true,
      message: "New backup codes generated. Save them now!",
      backupCodes,
      warning:
        "These codes will only be shown once. Store them securely. Each code can only be used once.",
      backupCodesRemaining: BACKUP_CODE_COUNT,
    });
  } catch (error) {
    next(error);
  }
};
