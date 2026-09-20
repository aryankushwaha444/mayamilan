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
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token || token.trim() === "") {
      return res.status(401).json({
        success: false,
        message: "Token is required",
      });
    }

    const decoded = verifyAccessToken(token);

    if (decoded.type !== "access") {
      return res.status(401).json({
        success: false,
        message: "Invalid access token",
      });
    }

    // ✅ INSTANT REVOCATION: reject if session was revoked
    if (decoded.sid) {
      const alive = await RefreshToken.exists({
        _id: decoded.sid,
        revokedAt: null,
      });
      if (!alive) {
        return res.status(401).json({
          success: false,
          message: "Session has been revoked. Please login again.",
          sessionRevoked: true, // ✅ Add this flag for frontend
        });
      }
    }

    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);

    const isExpired = error.message.includes("expired");

    return res.status(401).json({
      success: false,
      message: isExpired ? "Token expired" : "Invalid or expired token",
    });
  }
};

export const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }

  next();
};

export const requireVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: "Email verification required",
    });
  }

  next();
};
