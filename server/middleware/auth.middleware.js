import mongoose from "mongoose"; // ✅ NEW: ObjectId validation before any DB call
import {
  verifyAccessToken,
  constantTimeCompare,
} from "../utils/generateToken.js";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import { logAudit } from "../utils/auditLogger.js";
import { deviceFingerprint, getDeviceId } from "../utils/device.js";
import crypto from "crypto";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const ADMIN_ROLES = ["admin", "superadmin"];
const SUPERADMIN_ROLE = "superadmin";
const SESSION_CACHE_TTL = 60 * 1000; // 1 minute cache
const SESSION_CACHE_MAX = 50000; // ✅ OOM guard: cap the in-memory cache

const ERROR_CODES = {
  NO_TOKEN: "NO_TOKEN",
  EMPTY_TOKEN: "EMPTY_TOKEN",
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_MISMATCH: "SESSION_MISMATCH",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  ACCOUNT_INACTIVE: "ACCOUNT_INACTIVE",
  AUTH_FAILED: "AUTH_FAILED",
  NO_USER: "NO_USER",
  FORBIDDEN: "FORBIDDEN",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  DEVICE_MISMATCH: "DEVICE_MISMATCH",
};

// ═══════════════════════════════════════════
// SECURITY: In-memory session cache (production should use Redis)
// ═══════════════════════════════════════════
const sessionCache = new Map(); // sessionId -> { valid, timestamp, ... }

// Cleanup old session-cache entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of sessionCache.entries()) {
    if (now - value.timestamp > SESSION_CACHE_TTL) {
      sessionCache.delete(key);
    }
  }
}, 5 * 60 * 1000).unref?.();

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const safeLogAudit = async (req, action, metadata) => {
  try {
    await logAudit(req, action, metadata);
  } catch {
    // Silent failure — never let auditing break auth
  }
};

// ✅ only cache a NEGATIVE result if the id looks like a real ObjectId; junk/probing ids
//    would otherwise fill the map (the OOM vector). Positive results always cache.
const cacheNegative = (sessionId, reason) => {
  if (sessionCache.size >= SESSION_CACHE_MAX) return; // hard stop under flood
  if (!/^[a-f\d]{24}$/i.test(String(sessionId))) return; // don't cache garbage ids
  sessionCache.set(sessionId, { valid: false, reason, timestamp: Date.now() });
};
const cachePositive = (sessionId, session) => {
  if (sessionCache.size >= SESSION_CACHE_MAX) sessionCache.clear(); // reset under extreme flood
  sessionCache.set(sessionId, { valid: true, session, timestamp: Date.now() });
};

/**
 * SECURITY: Validate session with caching + ObjectId guard + device-binding enforcement.
 */
const validateSession = async (sessionId, userId, req) => {
  // ✅ CastError DoS guard: reject malformed ids before touching the DB
  if (
    !mongoose.Types.ObjectId.isValid(sessionId) ||
    !mongoose.Types.ObjectId.isValid(userId)
  ) {
    return { valid: false, reason: "session_invalid" };
  }

  // Check cache first
  const cached = sessionCache.get(sessionId);
  if (cached && Date.now() - cached.timestamp < SESSION_CACHE_TTL) {
    if (!cached.valid) return { valid: false, reason: cached.reason };
    return { valid: true, session: cached.session };
  }

  // Query database
  const session = await RefreshToken.findOne({
    _id: sessionId,
    user: userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!session) {
    const anySession = await RefreshToken.findById(sessionId).lean();
    let reason = "session_invalid";

    if (!anySession) {
      reason = "session_not_found";
    } else if (anySession.user.toString() !== userId.toString()) {
      reason = "session_mismatch";
    } else if (anySession.revokedAt) {
      reason = "session_revoked";
    } else if (anySession.expiresAt <= new Date()) {
      reason = "session_expired";
    }

    cacheNegative(sessionId, reason); // ✅ capped + id-shaped
    return { valid: false, reason };
  }

  // SECURITY: Device fingerprint validation.
  // ✅ BYPASS CLOSED: if the session HAS a fingerprint, a missing/!matching device id must
  //    FAIL (the old `currentFingerprint && !compare` short-circuited to PASS when the
  //    attacker stripped the X-Device-Id header). Now the header is REQUIRED.
  if (session.deviceFingerprint) {
    const currentDeviceId = getDeviceId(req); // header (XHR) -> cookie (OAuth nav)
    const currentFingerprint = currentDeviceId
      ? deviceFingerprint(currentDeviceId)
      : null;
    if (
      !currentFingerprint ||
      !constantTimeCompare(currentFingerprint, session.deviceFingerprint)
    ) {
      cacheNegative(sessionId, "device_mismatch");
      return {
        valid: false,
        reason: "device_mismatch",
        expectedDevice: session.deviceInfo,
      };
    }
  }

  // SECURITY: IP change detection (potential session hijacking) — log, don't block
  if (session.lastIp && req.ip && session.lastIp !== req.ip) {
    const sessionIpParts = String(session.lastIp).split(".");
    const currentIpParts = String(req.ip).split(".");
    // For IPv4 compare first two octets; for IPv6 the split yields one part so [0] differs
    // on any change (stricter logging, not a block).
    if (
      sessionIpParts[0] !== currentIpParts[0] ||
      (sessionIpParts[1] && sessionIpParts[1] !== currentIpParts[1])
    ) {
      console.warn(
        `⚠️ Potential session hijacking: IP changed from ${session.lastIp} to ${req.ip}`
      );
      await safeLogAudit(req, "suspicious_ip_change", {
        userId,
        sessionId,
        oldIp: session.lastIp,
        newIp: req.ip,
      });
    }
  }

  cachePositive(sessionId, session);
  return { valid: true, session };
};

const handleTokenError = (error, req) => {
  const message = error.message || "";
  // ✅ name-first (robust), message as fallback
  if (error.name === "TokenExpiredError" || message.includes("expired")) {
    return {
      status: 401,
      code: ERROR_CODES.TOKEN_EXPIRED,
      message: "Token expired. Please refresh your token.",
      shouldRefresh: true,
    };
  }
  if (error.name === "JsonWebTokenError" || message.includes("invalid")) {
    return {
      status: 401,
      code: ERROR_CODES.INVALID_TOKEN,
      message: "Invalid token",
      shouldRefresh: false,
    };
  }
  if (message.includes("signature")) {
    return {
      status: 401,
      code: ERROR_CODES.INVALID_TOKEN,
      message: "Invalid token signature",
      shouldRefresh: false,
    };
  }
  return {
    status: 401,
    code: ERROR_CODES.AUTH_FAILED,
    message: "Authentication failed",
    shouldRefresh: false,
  };
};

// ═══════════════════════════════════════════
// PROTECT MIDDLEWARE
// ═══════════════════════════════════════════

export const protect = async (req, res, next) => {
  req.requestId = crypto.randomUUID();
  req.requestStartTime = Date.now();

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      await safeLogAudit(req, "auth_failed", {
        reason: "no_token",
        ip: req.ip,
        requestId: req.requestId,
      });
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: ERROR_CODES.NO_TOKEN,
        requestId: req.requestId,
      });
    }

    const token = authHeader.split(" ")[1];
    if (!token || token.trim() === "") {
      await safeLogAudit(req, "auth_failed", {
        reason: "empty_token",
        ip: req.ip,
        requestId: req.requestId,
      });
      return res.status(401).json({
        success: false,
        message: "Token is required",
        code: ERROR_CODES.EMPTY_TOKEN,
        requestId: req.requestId,
      });
    }
    if (token.length > 2048) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
        code: ERROR_CODES.INVALID_TOKEN,
        requestId: req.requestId,
      });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      const tokenError = handleTokenError(error, req);
      await safeLogAudit(req, "auth_failed", {
        reason: tokenError.code,
        ip: req.ip,
        userAgent: req.get("user-agent")?.substring(0, 100),
        requestId: req.requestId,
      });
      return res.status(tokenError.status).json({
        success: false,
        message: tokenError.message,
        code: tokenError.code,
        shouldRefresh: tokenError.shouldRefresh,
        requestId: req.requestId,
      });
    }

    if (decoded.sessionId) {
      const sessionValidation = await validateSession(
        decoded.sessionId,
        decoded.userId,
        req
      );
      if (!sessionValidation.valid) {
        await safeLogAudit(req, "auth_failed", {
          reason: sessionValidation.reason,
          userId: decoded.userId,
          sessionId: decoded.sessionId,
          ip: req.ip,
          requestId: req.requestId,
        });
        const statusCode =
          sessionValidation.reason === "device_mismatch" ? 403 : 401;
        const errorCode =
          sessionValidation.reason === "session_expired"
            ? ERROR_CODES.SESSION_EXPIRED
            : sessionValidation.reason === "session_revoked"
            ? ERROR_CODES.SESSION_REVOKED
            : sessionValidation.reason === "device_mismatch"
            ? ERROR_CODES.DEVICE_MISMATCH
            : ERROR_CODES.SESSION_MISMATCH;
        return res.status(statusCode).json({
          success: false,
          message:
            sessionValidation.reason === "device_mismatch"
              ? "Unrecognized device. Please login again."
              : sessionValidation.reason === "session_expired"
              ? "Session expired. Please login again."
              : "Session has been revoked. Please login again.",
          code: errorCode,
          sessionRevoked: sessionValidation.reason !== "device_mismatch",
          requestId: req.requestId,
        });
      }
      req.session = sessionValidation.session;
    }

    // ✅ ObjectId guard on the JWT's userId before User.findById
    if (!mongoose.Types.ObjectId.isValid(decoded.userId)) {
      await safeLogAudit(req, "auth_failed", {
        reason: "bad_user_id",
        ip: req.ip,
        requestId: req.requestId,
      });
      return res.status(401).json({
        success: false,
        message: "Invalid token subject",
        code: ERROR_CODES.INVALID_TOKEN,
        requestId: req.requestId,
      });
    }

    const user = await User.findById(decoded.userId)
      .select("-password -refreshToken -twoFactorSecret -twoFactorBackupCodes")
      .lean();

    if (!user) {
      await safeLogAudit(req, "auth_failed", {
        reason: "user_not_found",
        userId: decoded.userId,
        ip: req.ip,
        requestId: req.requestId,
      });
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
        code: ERROR_CODES.USER_NOT_FOUND,
        requestId: req.requestId,
      });
    }
    if (!user.isActive || user.deletedAt) {
      await safeLogAudit(req, "auth_failed", {
        reason: "account_inactive",
        userId: user._id,
        email: user.email,
        ip: req.ip,
        requestId: req.requestId,
      });
      return res.status(403).json({
        success: false,
        message: "Your account is inactive or has been deleted",
        code: ERROR_CODES.ACCOUNT_INACTIVE,
        requestId: req.requestId,
      });
    }

    req.user = user;
    req.isAuthenticated = true;
    req.authContext = {
      userId: user._id,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      sessionId: decoded.sessionId,
      requestId: req.requestId,
    };
    next();
  } catch (error) {
    if (process.env.NODE_ENV === "development")
      console.error(`Auth middleware error [${req.requestId}]:`, error.message);
    await safeLogAudit(req, "auth_middleware_error", {
      error: error.name,
      ip: req.ip,
      requestId: req.requestId,
    });
    return res.status(401).json({
      success: false,
      message: "Authentication failed",
      code: ERROR_CODES.AUTH_FAILED,
      requestId: req.requestId,
    });
  }
};

// ═══════════════════════════════════════════
// ADMIN / SUPERADMIN / VERIFIED / OPTIONAL
// ═══════════════════════════════════════════

export const adminOnly = async (req, res, next) => {
  if (!req.user)
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: ERROR_CODES.NO_USER,
    });
  if (!ADMIN_ROLES.includes(req.user.role)) {
    await safeLogAudit(req, "admin_access_denied", {
      userId: req.user._id,
      email: req.user.email,
      role: req.user.role,
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    return res.status(403).json({
      success: false,
      message: "Admin access required",
      code: ERROR_CODES.FORBIDDEN,
    });
  }
  next();
};

export const superadminOnly = async (req, res, next) => {
  if (!req.user)
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: ERROR_CODES.NO_USER,
    });
  if (req.user.role !== SUPERADMIN_ROLE) {
    await safeLogAudit(req, "superadmin_access_denied", {
      userId: req.user._id,
      email: req.user.email,
      role: req.user.role,
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    return res.status(403).json({
      success: false,
      message: "Superadmin access required",
      code: ERROR_CODES.FORBIDDEN,
    });
  }
  next();
};

export const requireVerified = async (req, res, next) => {
  if (!req.user)
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: ERROR_CODES.NO_USER,
    });
  if (!req.user.isVerified) {
    await safeLogAudit(req, "unverified_access_attempt", {
      userId: req.user._id,
      email: req.user.email,
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    return res.status(403).json({
      success: false,
      message: "Email verification required",
      code: ERROR_CODES.EMAIL_NOT_VERIFIED,
      requiresVerification: true,
    });
  }
  next();
};

export const optionalAuth = (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next(); // anonymous -> fine for logout
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      // your existing verifier
      return next();
    } // expired/invalid -> anonymous, do NOT 401
    req.user = {
      _id: payload.userId ?? payload.id,
      role: payload.role,
      sessionId: payload.sessionId,
    };
    return next();
  } catch {
    return next(); // never block logout
  }
};

export default protect;
