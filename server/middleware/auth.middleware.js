import { verifyAccessToken } from "../utils/generateToken.js";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import { logAudit } from "../utils/auditLogger.js";
import crypto from "crypto";

export const protect = async (req, res, next) => {
  // Generate request ID for debugging
  req.requestId = crypto.randomUUID();

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      await logAudit(req, "auth_failed", {
        reason: "no_token",
        ip: req.ip,
        requestId: req.requestId,
      }).catch(() => {});

      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "NO_TOKEN",
        requestId: req.requestId,
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token || token.trim() === "") {
      await logAudit(req, "auth_failed", {
        reason: "empty_token",
        ip: req.ip,
        requestId: req.requestId,
      }).catch(() => {});

      return res.status(401).json({
        success: false,
        message: "Token is required",
        code: "EMPTY_TOKEN",
        requestId: req.requestId,
      });
    }

    const decoded = verifyAccessToken(token);

    if (decoded.sessionId) {
      const alive = await RefreshToken.exists({
        _id: decoded.sessionId,
        revokedAt: null,
      });

      if (!alive) {
        await logAudit(req, "auth_failed", {
          reason: "session_revoked",
          userId: decoded.userId,
          sessionId: decoded.sessionId,
          ip: req.ip,
          requestId: req.requestId,
        }).catch(() => {});

        return res.status(401).json({
          success: false,
          message: "Session has been revoked. Please login again.",
          code: "SESSION_REVOKED",
          sessionRevoked: true,
          requestId: req.requestId,
        });
      }
    }

    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      await logAudit(req, "auth_failed", {
        reason: "user_not_found",
        userId: decoded.userId,
        ip: req.ip,
        requestId: req.requestId,
      }).catch(() => {});

      return res.status(401).json({
        success: false,
        message: "User no longer exists",
        code: "USER_NOT_FOUND",
        requestId: req.requestId,
      });
    }

    if (!user.isActive || user.deletedAt) {
      await logAudit(req, "auth_failed", {
        reason: "account_inactive",
        userId: user._id,
        email: user.email,
        isActive: user.isActive,
        deletedAt: user.deletedAt,
        ip: req.ip,
        requestId: req.requestId,
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        message: "Your account is inactive or has been deleted",
        code: "ACCOUNT_INACTIVE",
        requestId: req.requestId,
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error(`Auth middleware error [${req.requestId}]:`, error.message);

    await logAudit(req, "auth_failed", {
      reason: error.message,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      requestId: req.requestId,
    }).catch(() => {});

    if (error.message === "Access token expired") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
        code: "TOKEN_EXPIRED",
        requestId: req.requestId,
      });
    }

    if (error.message === "Invalid access token") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
        code: "INVALID_TOKEN",
        requestId: req.requestId,
      });
    }

    return res.status(401).json({
      success: false,
      message: "Authentication failed",
      code: "AUTH_FAILED",
      requestId: req.requestId,
    });
  }
};

export const adminOnly = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "NO_USER",
    });
  }

  if (req.user.role !== "admin") {
    await logAudit(req, "admin_access_denied", {
      userId: req.user._id,
      email: req.user.email,
      role: req.user.role,
      path: req.path,
      method: req.method,
      ip: req.ip,
    }).catch(() => {});

    return res.status(403).json({
      success: false,
      message: "Admin access required",
      code: "FORBIDDEN",
    });
  }

  next();
};

export const requireVerified = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "NO_USER",
    });
  }

  if (!req.user.isVerified) {
    await logAudit(req, "unverified_access_attempt", {
      userId: req.user._id,
      email: req.user.email,
      path: req.path,
      method: req.method,
      ip: req.ip,
    }).catch(() => {});

    return res.status(403).json({
      success: false,
      message: "Email verification required",
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  next();
};
