import { logAudit } from "../utils/auditLogger.js";

export const isAdmin = async (req, res, next) => {
  try {
    // 1. Check authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "NO_AUTH",
      });
    }

    // 2. ✅ NEW: Check if account is active (not deactivated/deleted)
    if (!req.user.isActive || req.user.deletedAt) {
      await logAudit(req, "admin_access_denied", {
        userId: req.user._id,
        email: req.user.email,
        reason: "account_inactive_or_deleted",
        ip: req.ip,
        userAgent: req.get("user-agent"),
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        message: "Your account is inactive or has been deleted",
        code: "ACCOUNT_INACTIVE",
      });
    }

    // 3. Check admin role
    if (req.user.role !== "admin") {
      // ✅ NEW: Log failed admin access attempts
      await logAudit(req, "admin_access_denied", {
        userId: req.user._id,
        email: req.user.email,
        role: req.user.role,
        reason: "insufficient_privileges",
        ip: req.ip,
        userAgent: req.get("user-agent"),
        path: req.path,
        method: req.method,
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        message: "Admin access required",
        code: "FORBIDDEN",
      });
    }

    // 4. ✅ NEW: Log successful admin access (optional, can be noisy)
    // Only log for sensitive operations, not every request
    const sensitivePaths = ["/users", "/reports", "/audit", "/force-reauth"];
    if (sensitivePaths.some((path) => req.path.includes(path))) {
      await logAudit(req, "admin_access_granted", {
        userId: req.user._id,
        email: req.user.email,
        path: req.path,
        method: req.method,
        ip: req.ip,
      }).catch(() => {});
    }

    next();
  } catch (error) {
    console.error("Admin middleware error:", error);
    
    // ✅ Log the error for monitoring
    await logAudit(req, "admin_middleware_error", {
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    }).catch(() => {});

    return res.status(500).json({
      success: false,
      message: "Authorization check failed",
      code: "AUTH_ERROR",
    });
  }
};