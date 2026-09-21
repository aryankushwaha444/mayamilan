import { verifyAccessToken } from "../utils/generateToken.js";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "NO_TOKEN",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token || token.trim() === "") {
      return res.status(401).json({
        success: false,
        message: "Token is required",
        code: "EMPTY_TOKEN",
      });
    }

    // ✅ verifyAccessToken now handles the fallback (Current -> Previous secret)
    // and throws an error if the token type is not "access"
    const decoded = verifyAccessToken(token);

    // ✅ FIXED: Changed `decoded.sid` to `decoded.sessionId` to match generateToken.js
    // INSTANT REVOCATION: reject if session was revoked or deleted
    if (decoded.sessionId) {
      const alive = await RefreshToken.exists({
        _id: decoded.sessionId,
        revokedAt: null,
      });

      if (!alive) {
        return res.status(401).json({
          success: false,
          message: "Session has been revoked. Please login again.",
          code: "SESSION_REVOKED",
          sessionRevoked: true, // ✅ Flag for frontend to force redirect to login
        });
      }
    }

    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
        code: "USER_NOT_FOUND",
      });
    }

    // ✅ IMPROVED: Check both isActive and deletedAt (soft delete)
    if (!user.isActive || user.deletedAt) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive or has been deleted",
        code: "ACCOUNT_INACTIVE",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);

    // ✅ IMPROVED: Exact error matching instead of fragile `.includes()`
    if (error.message === "Access token expired") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
        code: "TOKEN_EXPIRED",
      });
    }

    if (error.message === "Invalid access token") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
        code: "INVALID_TOKEN",
      });
    }

    // Catch-all for other verification errors
    return res.status(401).json({
      success: false,
      message: "Authentication failed",
      code: "AUTH_FAILED",
    });
  }
};

export const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "NO_USER",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
      code: "FORBIDDEN",
    });
  }

  next();
};

export const requireVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "NO_USER",
    });
  }

  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: "Email verification required",
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  next();
};
