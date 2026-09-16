// server/utils/auditLogger.js
import AuditLog from "../models/AuditLog.js";

export const logAudit = async (req, action, metadata = {}) => {
  try {
    await AuditLog.create({
      userId: req.user._id,
      action,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get("user-agent"),
      metadata,
    });
  } catch (err) {
    console.error("Audit log failed:", err);
  }
};
