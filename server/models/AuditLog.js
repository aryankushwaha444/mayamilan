// server/models/AuditLog.js
import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // ✅ Optional for pre-registration events (OTP, registration)
      default: null,
    },
    action: {
      type: String,
      required: true,
      enum: [
        // Existing actions (keep your current ones)
        "login_success",
        "login_failed",
        "login_blocked",
        "login_deactivated",
        "account_created",
        "registration_failed",
        "registration_blocked",
        "logout",
        "password_changed",
        "password_change_failed",
        "password_reset_requested",
        "password_reset_success",
        "otp_sent",
        "otp_verification_failed",
        "email_verified",
        "token_replay_detected",
        "device_mismatch_detected",
        "session_revoked",
        "all_other_sessions_revoked",
        "profile_updated",
        "photo_uploaded",
        "photo_deleted",
        "primary_photo_changed",
        "user_reported",
        "user_blocked",
        "user_unblocked",
        "account_soft_deleted",
        "account_reactivated",
        "account_deletion_failed",
        "data_exported",
        "suspicious_login",
        "photo_gps_stripped",
        "2fa_setup_initiated",
        "2fa_setup_failed",
        "2fa_enabled",
        "2fa_disabled",
        "2fa_disable_failed",
        "2fa_backup_codes_regenerated",
        "login_2fa_required",
        "login_2fa_failed",
        "password_reset_failed", 
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
