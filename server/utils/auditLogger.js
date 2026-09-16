// server/utils/auditLogger.js
import AuditLog from "../models/AuditLog.js";

export const logAudit = async (req, action, metadata = {}) => {
  try {
    // ✅ Safely extract userId — fallback to metadata if req.user doesn't exist
    const userId = req?.user?._id || metadata?.userId || null;
    const email = req?.user?.email || metadata?.email || null;

    await AuditLog.create({
      userId: userId,
      email: email,
      action: action,
      ip: req?.ip || req?.connection?.remoteAddress || "unknown",
      userAgent: req?.get("user-agent") || "unknown",
      metadata: metadata,
    });
  } catch (err) {
    // Don't crash the app — audit logging failures should be silent
    console.error("Audit log failed:", err.message);
  }
};
