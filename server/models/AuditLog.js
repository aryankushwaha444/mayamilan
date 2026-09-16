// server/models/AuditLog.js
import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "login_success",
        "login_failed",
        "password_changed",
        "profile_updated",
        "photo_uploaded",
        "photo_deleted",
        "post_created",
        "post_deleted",
        "account_deleted",
        "user_blocked",
        "user_reported",
      ],
    },
    ip: { type: String, required: true },
    userAgent: { type: String },
    metadata: { type: Map, of: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
