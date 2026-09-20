// server/controllers/twoFactor.controller.js
import argon2 from "argon2";
import User from "../models/User.js";
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
import RefreshToken from "../models/RefreshToken.js";
import { hashToken } from "../utils/generateToken.js";

/**
 * Step 1: Generate secret + QR code (user scans with authenticator app)
 */
export const setup2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("+password");
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    if (user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        message: "2FA is already enabled. Disable it first to reconfigure.",
      });
    }

    const secret = generateSecret();
    const qrCode = await generateQrCode(user.email, secret);

    // Store encrypted secret temporarily (not yet enabled)
    user.twoFactorSecret = encryptSecret(secret);
    await user.save();

    await logAudit(req, "2fa_setup_initiated", {
      userId: user._id,
      email: user.email,
    });

    return res.status(200).json({
      success: true,
      qrCode,
      secret, // For manual entry (if user can't scan QR)
      message:
        "Scan QR code with your authenticator app, then verify with a code.",
    });
  } catch (error) {
    console.error("2FA setup error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to setup 2FA" });
  }
};

/**
 * Step 2: Verify initial TOTP code to activate 2FA
 */
export const verify2FASetup = async (req, res) => {
  try {
    const { totpCode } = req.body;
    if (!totpCode)
      return res
        .status(400)
        .json({ success: false, message: "TOTP code required" });

    const user = await User.findById(req.user._id);
    if (!user || !user.twoFactorSecret) {
      return res
        .status(400)
        .json({ success: false, message: "Please start 2FA setup first" });
    }

    if (user.twoFactorEnabled) {
      return res
        .status(400)
        .json({ success: false, message: "2FA already enabled" });
    }

    const secret = decryptSecret(user.twoFactorSecret);
    const isValid = verifyTotp(totpCode, secret);

    if (!isValid) {
      await logAudit(req, "2fa_setup_failed", {
        userId: user._id,
        email: user.email,
        reason: "invalid_code",
      });
      return res
        .status(401)
        .json({ success: false, message: "Invalid code. Please try again." });
    }

    const backupCodes = generateBackupCodes(8);
    const hashedCodes = await Promise.all(
      backupCodes.map(async (code) => ({
        code: await hashBackupCode(code),
        used: false,
        usedAt: null,
      }))
    );

    // Enable 2FA
    user.twoFactorEnabled = true;
    user.twoFactorEnabledAt = new Date();
    user.twoFactorBackupCodes = hashedCodes;
    await user.save();

    // ✅ Revoke all OTHER sessions — KEEP current session alive
    const currentRefreshToken = req.cookies.refreshToken;
    const currentHash = currentRefreshToken
      ? hashToken(currentRefreshToken)
      : null;

    await RefreshToken.updateMany(
      {
        user: user._id,
        revokedAt: null,
        tokenHash: { $ne: currentHash }, // Exclude current session
      },
      { revokedAt: new Date() }
    );

    await logAudit(req, "2fa_enabled", {
      userId: user._id,
      email: user.email,
    });

    return res.status(200).json({
      success: true,
      message:
        "2FA enabled successfully. Save these backup codes in a safe place!",
      backupCodes,
    });
  } catch (error) {
    console.error("2FA verify error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Verification failed" });
  }
};

/**
 * Disable 2FA
 * - Local users: require password + TOTP/backup code
 * - OAuth users (Google): require only TOTP/backup code (no password exists)
 */
export const disable2FA = async (req, res) => {
  try {
    const { password, totpCode } = req.body;

    if (!totpCode) {
      return res.status(400).json({
        success: false,
        message: "2FA code required",
      });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user || !user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        message: "2FA is not enabled",
      });
    }

    // ✅ Determine if user is local (has password) or OAuth (no password)
    const isLocalUser = !user.oauthProvider || user.oauthProvider === "local";

    // For local users, password is required
    if (isLocalUser) {
      if (!password) {
        return res.status(400).json({
          success: false,
          message: "Password required",
        });
      }
      const passwordValid = await argon2.verify(user.password, password);
      if (!passwordValid) {
        await logAudit(req, "2fa_disable_failed", {
          userId: user._id,
          email: user.email,
          reason: "wrong_password",
        });
        return res.status(401).json({
          success: false,
          message: "Incorrect password",
        });
      }
    }
    // OAuth users: password check skipped (they don't have one)

    // Verify TOTP code first
    const secret = decryptSecret(user.twoFactorSecret);
    const isValidTotp = verifyTotp(totpCode, secret);

    // If TOTP failed, try backup code
    let usedBackupIndex = -1;
    if (!isValidTotp) {
      usedBackupIndex = await verifyBackupCode(
        totpCode,
        user.twoFactorBackupCodes
      );
      if (usedBackupIndex === -1) {
        await logAudit(req, "2fa_disable_failed", {
          userId: user._id,
          email: user.email,
          reason: "invalid_code",
        });
        return res.status(401).json({
          success: false,
          message: "Invalid 2FA code",
        });
      }
    }

    // Disable 2FA
    user.twoFactorEnabled = false;
    user.twoFactorEnabledAt = null;
    user.twoFactorSecret = null;
    user.twoFactorBackupCodes = [];
    await user.save();

    await logAudit(req, "2fa_disabled", {
      userId: user._id,
      email: user.email,
      method: isValidTotp ? "totp" : "backup_code",
      authMethod: isLocalUser ? "password" : "oauth",
    });

    return res.status(200).json({
      success: true,
      message: "2FA has been disabled",
    });
  } catch (error) {
    console.error("2FA disable error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to disable 2FA",
    });
  }
};

/**
 * Get 2FA status for current user
 */
export const get2FAStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const unusedBackupCodes = user.twoFactorBackupCodes.filter(
      (c) => !c.used
    ).length;

    return res.status(200).json({
      success: true,
      enabled: user.twoFactorEnabled,
      backupCodesRemaining: user.twoFactorEnabled ? unusedBackupCodes : 0,
    });
  } catch (error) {
    console.error("2FA status error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to get status" });
  }
};

/**
 * Regenerate backup codes (requires password + TOTP)
 */
export const regenerateBackupCodes = async (req, res) => {
  try {
    const { password, totpCode } = req.body;
    if (!totpCode) {
      return res
        .status(400)
        .json({ success: false, message: "2FA code required" });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user || !user.twoFactorEnabled) {
      return res
        .status(400)
        .json({ success: false, message: "2FA is not enabled" });
    }

    // ✅ Only require password for local users
    const isLocalUser = !user.oauthProvider || user.oauthProvider === "local";
    if (isLocalUser) {
      if (!password) {
        return res
          .status(400)
          .json({ success: false, message: "Password required" });
      }
      const passwordValid = await argon2.verify(user.password, password);
      if (!passwordValid) {
        return res
          .status(401)
          .json({ success: false, message: "Incorrect password" });
      }
    }

    // Verify TOTP
    const secret = decryptSecret(user.twoFactorSecret);
    if (!verifyTotp(totpCode, secret)) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid 2FA code" });
    }

    // Generate new backup codes
    const backupCodes = generateBackupCodes(8);
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
    });

    return res.status(200).json({
      success: true,
      message: "New backup codes generated. Save them now!",
      backupCodes,
    });
  } catch (error) {
    console.error("Regenerate backup codes error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to regenerate codes" });
  }
};
