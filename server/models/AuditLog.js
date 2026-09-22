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
        "auth_failed", // ✅ ADD — generic auth failure
        "admin_access_denied", // ✅ ADD — non-admin accessing admin routes
        "unverified_access_attempt", // ✅ ADD — unverified user accessing protected routes

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
        "oauth_2fa_required",
        "oauth_2fa_failed",

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

        // ===== SIGNATURE / REQUEST INTEGRITY =====
        "signature_missing",
        "signature_invalid",
        "signature_expired",
        "signature_invalid_format", // ✅ ADD — malformed hex signature

        // ===== UPLOAD / MEDIA =====
        "upload_rejected", // ✅ ADD — magic bytes / dimension failure
        "upload_mime_normalized", // ✅ ADD — declared vs detected MIME mismatch
        "image_rejected", // NSFW detection
        "image_processing_failed", // ✅ ADD — sharp processing error
        "message_rejected", // scam/profanity

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
        "csp_violation",

        // ===== ADMIN ACTIONS =====
        "admin_user_updated",
        "admin_user_banned",
        "admin_user_unbanned",
        "admin_user_deleted",
        "admin_photo_deleted",
        "admin_report_updated",

        // ===== CATCH-ALL =====
        "other",
      ],
    },
    ip: {
      type: String,
      required: false,
      default: "system",
    },
    userAgent: { type: String },
    metadata: { type: Map, of: mongoose.Schema.Types.Mixed },
    requestId: { type: String }, // ✅ ADD — for log correlation
  },
  { timestamps: true }
);

// ===== INDEXES FOR PERFORMANCE =====

// User's audit history (sorted newest first)
auditLogSchema.index({ userId: 1, createdAt: -1 });

// Filter by action type + time (admin dashboards, honeypot stats)
auditLogSchema.index({ action: 1, createdAt: -1 });

// IP-based queries (admin IP blocking, suspicious IP detection)
auditLogSchema.index({ ip: 1, createdAt: -1 });

// ✅ Request ID lookup (fast correlation across logs)
auditLogSchema.index({ requestId: 1 });

// TTL index — auto-delete logs older than 90 days
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
          "account_soft_deleted",
          "account_reactivated",
        ],
      },
    },
  }
);

export default mongoose.model("AuditLog", auditLogSchema);
