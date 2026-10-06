import { logAudit } from "../utils/auditLogger.js";
import RefreshToken from "../models/RefreshToken.js";
import { hashToken } from "../utils/generateToken.js";
import { verifyTotp, decryptSecret } from "../utils/totp.js";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const ADMIN_ROLES = ["admin", "superadmin"];
const SUPERADMIN_ONLY_PATHS = [
  "/force-reauth",
  "/admin/users/delete",
  "/admin/audit/export",
];

const SENSITIVE_PATHS = [
  "/users",
  "/reports",
  "/audit",
  "/force-reauth",
  "/admin/settings",
  "/admin/export",
  "/admin/import",
  "/admin/delete",
];

const PATHS_REQUIRING_2FA = [
  "/users/delete",
  "/users/ban",
  "/force-reauth",
  "/admin/export",
  "/admin/delete",
  "/reports/resolve",
];

const TWOFA_SESSION_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const requiresSuperadmin = (path) => {
  return SUPERADMIN_ONLY_PATHS.some((p) => path.includes(p));
};

const isSensitivePath = (path) => {
  return SENSITIVE_PATHS.some((p) => path.includes(p));
};

const requires2FA = (path) => {
  return PATHS_REQUIRING_2FA.some((p) => path.includes(p));
};

const validateSession = async (req) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return false;

  const tokenHash = hashToken(refreshToken);
  const session = await RefreshToken.findOne({
    tokenHash,
    user: req.user._id,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  return session !== null;
};

// ✅ ADDED: Check if 2FA session is still valid
const is2FASessionValid = (req) => {
  if (!req.session?.twoFactorVerified) return false;
  if (!req.session.twoFactorExpiresAt) return false;
  return Date.now() < req.session.twoFactorExpiresAt;
};

// ═══════════════════════════════════════════
// ADMIN MIDDLEWARE
// ═══════════════════════════════════════════

export const isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "NO_AUTH",
      });
    }

    if (!req.user.isActive || req.user.deletedAt) {
      await logAudit(req, "admin_access_denied", {
        userId: req.user._id,
        email: req.user.email,
        reason: "account_inactive_or_deleted",
        ip: req.ip,
        path: req.path,
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        message: "Your account is inactive or has been deleted",
        code: "ACCOUNT_INACTIVE",
      });
    }

    if (!ADMIN_ROLES.includes(req.user.role)) {
      await logAudit(req, "admin_access_denied", {
        userId: req.user._id,
        email: req.user.email,
        role: req.user.role,
        reason: "insufficient_privileges",
        ip: req.ip,
        path: req.path,
        method: req.method,
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        message: "Admin access required",
        code: "FORBIDDEN",
      });
    }

    if (requiresSuperadmin(req.path) && req.user.role !== "superadmin") {
      await logAudit(req, "admin_access_denied", {
        userId: req.user._id,
        email: req.user.email,
        role: req.user.role,
        reason: "superadmin_required",
        ip: req.ip,
        path: req.path,
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        message: "Superadmin access required for this operation",
        code: "SUPERADMIN_REQUIRED",
      });
    }

    const sessionValid = await validateSession(req);
    if (!sessionValid) {
      await logAudit(req, "admin_access_denied", {
        userId: req.user._id,
        email: req.user.email,
        reason: "session_revoked_or_expired",
        ip: req.ip,
        path: req.path,
      }).catch(() => {});

      return res.status(401).json({
        success: false,
        message: "Your session has expired. Please log in again.",
        code: "SESSION_EXPIRED",
        sessionExpired: true,
      });
    }

    if (requires2FA(req.path)) {
      if (!req.user.twoFactorEnabled) {
        await logAudit(req, "admin_access_denied", {
          userId: req.user._id,
          email: req.user.email,
          reason: "2fa_required_but_not_enabled",
          ip: req.ip,
          path: req.path,
        }).catch(() => {});

        return res.status(403).json({
          success: false,
          message:
            "Two-factor authentication must be enabled for this operation",
          code: "2FA_REQUIRED",
          requires2FA: true,
        });
      }

      // ✅ FIXED: Check if 2FA session is still valid (not expired)
      if (!is2FASessionValid(req)) {
        await logAudit(req, "admin_access_denied", {
          userId: req.user._id,
          email: req.user.email,
          reason: "2fa_session_expired_or_not_verified",
          ip: req.ip,
          path: req.path,
        }).catch(() => {});

        return res.status(403).json({
          success: false,
          message:
            "Please verify your identity with 2FA before performing this action",
          code: "2FA_VERIFICATION_REQUIRED",
          requires2FAVerification: true,
        });
      }
    }

    if (isSensitivePath(req.path)) {
      await logAudit(req, "admin_access_granted", {
        userId: req.user._id,
        email: req.user.email,
        role: req.user.role,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      }).catch(() => {});
    }

    req.adminContext = {
      isAdmin: true,
      isSuperadmin: req.user.role === "superadmin",
      sessionValid: true,
      twoFactorVerified: is2FASessionValid(req),
    };

    next();
  } catch (error) {
    await logAudit(req, "admin_middleware_error", {
      userId: req.user?._id || "unknown",
      email: req.user?.email || "unknown",
      error: error.name,
      path: req.path,
    }).catch(() => {});

    if (process.env.NODE_ENV === "development") {
      console.error("Admin middleware error:", error);
    }

    return res.status(500).json({
      success: false,
      message: "Authorization check failed",
      code: "AUTH_ERROR",
    });
  }
};

// ═══════════════════════════════════════════
// SUPERADMIN MIDDLEWARE (✅ FIXED: Simplified)
// ═══════════════════════════════════════════

export const isSuperadmin = async (req, res, next) => {
  try {
    // ✅ FIXED: Run isAdmin first
    await isAdmin(req, res, () => {});

    // If response was already sent (admin check failed), stop here
    if (res.headersSent) return;

    // Check superadmin role
    if (req.user.role !== "superadmin") {
      await logAudit(req, "superadmin_access_denied", {
        userId: req.user._id,
        email: req.user.email,
        role: req.user.role,
        reason: "not_superadmin",
        ip: req.ip,
        path: req.path,
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        message: "Superadmin access required",
        code: "SUPERADMIN_REQUIRED",
      });
    }

    next();
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Superadmin middleware error:", error);
    }
    return res.status(500).json({
      success: false,
      message: "Authorization check failed",
      code: "AUTH_ERROR",
    });
  }
};

// ═══════════════════════════════════════════
// VERIFY 2FA FOR SENSITIVE OPERATIONS (✅ FIXED: Removed dynamic import)
// ═══════════════════════════════════════════

export const verify2FAForAdmin = async (req, res, next) => {
  try {
    const { totpCode } = req.body;

    if (!totpCode) {
      return res.status(400).json({
        success: false,
        message: "2FA code required",
        code: "2FA_CODE_REQUIRED",
      });
    }

    if (!req.user.twoFactorEnabled) {
      return res.status(403).json({
        success: false,
        message: "2FA is not enabled on your account",
        code: "2FA_NOT_ENABLED",
      });
    }

    // ✅ FIXED: Use static import instead of dynamic import
    const secret = decryptSecret(req.user.twoFactorSecret);
    const isValid = verifyTotp(totpCode, secret);

    if (!isValid) {
      await logAudit(req, "admin_2fa_verification_failed", {
        userId: req.user._id,
        email: req.user.email,
        ip: req.ip,
        path: req.path,
      }).catch(() => {});

      return res.status(401).json({
        success: false,
        message: "Invalid 2FA code",
        code: "INVALID_2FA_CODE",
      });
    }

    // Mark session as 2FA verified (valid for 15 minutes)
    if (!req.session) {
      req.session = {};
    }
    req.session.twoFactorVerified = true;
    req.session.twoFactorVerifiedAt = Date.now();
    req.session.twoFactorExpiresAt = Date.now() + TWOFA_SESSION_DURATION_MS;

    await logAudit(req, "admin_2fa_verified", {
      userId: req.user._id,
      email: req.user.email,
      ip: req.ip,
      path: req.path,
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: "2FA verified successfully",
      expiresAt: req.session.twoFactorExpiresAt,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("2FA verification error:", error);
    }
    return res.status(500).json({
      success: false,
      message: "2FA verification failed",
      code: "2FA_ERROR",
    });
  }
};

export default isAdmin;
