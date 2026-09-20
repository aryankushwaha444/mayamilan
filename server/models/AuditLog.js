// server/models/AuditLog.js
import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
    },
    action: {
      type: String,
      required: true,
      enum: [
        // ===== AUTH =====
        "login_success",
        "login_failed",
        "login_blocked",
        "login_deactivated",
        "logout",
        "account_created",
        "registration_failed",
        "registration_blocked",

        // ===== PASSWORD =====
        "password_changed",
        "password_change_failed",
        "password_reset_requested",
        "password_reset_success",
        "password_reset_failed",
        "password_reset_blocked",

        // ===== OTP =====
        "otp_sent",
        "otp_verification_failed",
        "otp_request_blocked",
        "email_verified",
        "email_verified_pre_registration",

        // ===== 2FA =====
        "2fa_setup_initiated",
        "2fa_setup_failed",
        "2fa_enabled",
        "2fa_disabled",
        "2fa_disable_failed",
        "2fa_backup_codes_regenerated",
        "login_2fa_required",
        "login_2fa_failed",

        // ===== OAUTH 2FA =====
        "oauth_2fa_required", // ✅ Already present
        "oauth_2fa_failed", // ✅ Already present

        // ===== SESSIONS =====
        "token_replay_detected",
        "device_mismatch_detected",
        "session_revoked",
        "all_other_sessions_revoked",

        // ===== PROFILE =====
        "profile_updated",
        "photo_uploaded",
        "photo_deleted",
        "primary_photo_changed",
        "photo_gps_stripped",

        // ===== SOCIAL =====
        "user_reported",
        "user_blocked",
        "user_unblocked",

        // ===== ACCOUNT LIFECYCLE =====
        "account_soft_deleted",
        "account_reactivated",
        "account_deletion_failed",
        "data_exported",

        // ===== SECURITY =====
        "suspicious_login",
        "ip_reputation_blocked",
        "honeypot_triggered",
        "signature_invalid", // ✅ ADD — request tampering
        "signature_expired", // ✅ ADD — stale requests

        // ===== CONTENT MODERATION =====
        "image_rejected", // ✅ ADD — NSFW detection
        "message_rejected", // ✅ ADD — scam/profanity
        "csp_violation", // ✅ ADD — CSP header violations

        // ===== ADMIN ACTIONS =====
        "admin_user_updated", // ✅ ADD — admin edited user
        "admin_user_banned", // ✅ ADD — admin banned user
        "admin_user_unbanned", // ✅ ADD — admin unbanned user
        "admin_user_deleted", // ✅ ADD — admin hard-deleted user
        "admin_photo_deleted", // ✅ ADD — admin removed photo
        "admin_report_updated", // ✅ ADD — admin changed report status
      ],
    },
    ip: {
      type: String,
      required: false, // ✅ Changed to false — allows system/background events
      default: "system",
    },
    userAgent: { type: String },
    metadata: { type: Map, of: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// ===== INDEXES FOR PERFORMANCE =====

// User's audit history (sorted newest first)
auditLogSchema.index({ userId: 1, createdAt: -1 });

// Filter by action type + time (admin dashboards, honeypot stats)
auditLogSchema.index({ action: 1, createdAt: -1 });

// ✅ ADD: IP-based queries (admin IP blocking, suspicious IP detection)
auditLogSchema.index({ ip: 1, createdAt: -1 });

// ✅ ADD: TTL index — auto-delete logs older than 90 days (privacy + storage)
// Only applies to non-critical actions. Critical actions (admin, security) should be kept longer.
// For simplicity, we apply 90-day TTL to ALL logs. Adjust as needed.
auditLogSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60, // 90 days
    partialFilterExpression: {
      action: {
        $nin: [
          // Keep these actions forever (or much longer)
          "admin_user_deleted",
          "admin_user_banned",
          "password_reset_success",
          "2fa_enabled",
          "2fa_disabled",
        ],
      },
    },
  }
);

export default mongoose.model("AuditLog", auditLogSchema);
