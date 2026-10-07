import mongoose from "mongoose";
import {
  isSensitiveKey,
  MAX_AUDIT_METADATA_BYTES,
} from "../utils/sensitiveKeys.js";

// ═══════════════════════════════════════════
// AUDIT ACTIONS (comprehensive enum)
// ═══════════════════════════════════════════
export const AUDIT_ACTIONS = {
  // Authentication
  LOGIN_SUCCESS: "login_success",
  LOGIN_FAILED: "login_failed",
  LOGIN_BLOCKED: "login_blocked",
  LOGIN_DEACTIVATED: "login_deactivated",
  LOGOUT: "logout",
  ACCOUNT_CREATED: "account_created",
  REGISTRATION_FAILED: "registration_failed",
  REGISTRATION_BLOCKED: "registration_blocked",
  AUTH_FAILED: "auth_failed",
  AUTH_MIDDLEWARE_ERROR: "auth_middleware_error",
  ADMIN_ACCESS_DENIED: "admin_access_denied",
  SUPERADMIN_ACCESS_DENIED: "superadmin_access_denied",
  UNVERIFIED_ACCESS_ATTEMPT: "unverified_access_attempt",

  // Password management
  PASSWORD_CHANGED: "password_changed",
  PASSWORD_CHANGE_FAILED: "password_change_failed",
  PASSWORD_RESET_REQUESTED: "password_reset_requested",
  PASSWORD_RESET_SUCCESS: "password_reset_success",
  PASSWORD_RESET_FAILED: "password_reset_failed",
  PASSWORD_RESET_BLOCKED: "password_reset_blocked",

  // OTP & Email
  OTP_SENT: "otp_sent",
  OTP_VERIFICATION_FAILED: "otp_verification_failed",
  OTP_REQUEST_BLOCKED: "otp_request_blocked",
  OTP_RATE_LIMITED: "otp_rate_limited",
  EMAIL_VERIFIED: "email_verified",
  EMAIL_VERIFIED_PRE_REGISTRATION: "email_verified_pre_registration",

  // 2FA
  TWO_FA_SETUP_INITIATED: "2fa_setup_initiated",
  TWO_FA_SETUP_FAILED: "2fa_setup_failed",
  TWO_FA_ENABLED: "2fa_enabled",
  TWO_FA_DISABLED: "2fa_disabled",
  TWO_FA_DISABLE_FAILED: "2fa_disable_failed",
  TWO_FA_BACKUP_CODES_REGENERATED: "2fa_backup_codes_regenerated",
  LOGIN_2FA_REQUIRED: "login_2fa_required",
  LOGIN_2FA_FAILED: "login_2fa_failed",
  OAUTH_2FA_REQUIRED: "oauth_2fa_required",
  OAUTH_2FA_FAILED: "oauth_2fa_failed",

  // Security
  TOKEN_REPLAY_DETECTED: "token_replay_detected",
  DEVICE_MISMATCH_DETECTED: "device_mismatch_detected",
  SESSION_REVOKED: "session_revoked",
  SESSION_LIMIT_EXCEEDED: "session_limit_exceeded",
  ALL_OTHER_SESSIONS_REVOKED: "all_other_sessions_revoked",
  FORCE_REAUTH_ALL_USERS: "force_reauth_all_users",
  SUSPICIOUS_LOGIN: "suspicious_login",
  SUSPICIOUS_IP_CHANGE: "suspicious_ip_change",
  IP_REPUTATION_BLOCKED: "ip_reputation_blocked",
  HONEYPOT_TRIGGERED: "honeypot_triggered",
  CSP_VIOLATION: "csp_violation",
  RATE_LIMIT_EXCEEDED: "rate_limit_exceeded",

  // Socket security
  SOCKET_CONNECTION_LIMIT_EXCEEDED: "socket_connection_limit_exceeded",
  SOCKET_INVALID_ROOM_JOIN: "socket_invalid_room_join",
  SOCKET_UNAUTHORIZED_ROOM_JOIN: "socket_unauthorized_room_join",

  // Profile & Photos
  PROFILE_UPDATED: "profile_updated",
  PHOTO_UPLOADED: "photo_uploaded",
  PHOTO_DELETED: "photo_deleted",
  PRIMARY_PHOTO_CHANGED: "primary_photo_changed",
  PHOTOS_REORDERED: "photos_reordered",
  PHOTO_GPS_STRIPPED: "photo_gps_stripped",
  UPLOAD_REJECTED: "upload_rejected",
  UPLOAD_REJECTED_FILTER: "upload_rejected_filter",
  UPLOAD_REJECTED_BLOCKED_TYPE: "upload_rejected_blocked_type",
  UPLOAD_MIME_NORMALIZED: "upload_mime_normalized",
  IMAGE_REJECTED: "image_rejected",
  IMAGE_PROCESSING_FAILED: "image_processing_failed",
  UNAUTHORIZED_UPLOAD_ATTEMPT: "unauthorized_upload_attempt",

  // Messages & Conversations
  MESSAGE_SENT: "message_sent",
  MESSAGE_EDITED: "message_edited",
  MESSAGE_REACTED: "message_reacted",
  MESSAGE_DELETED: "message_deleted",
  MESSAGE_REJECTED: "message_rejected",
  MESSAGE_BLOCKED_ATTEMPT: "message_blocked_attempt",
  MESSAGE_UNMATCHED_ATTEMPT: "message_unmatched_attempt",
  CONVERSATION_CREATED: "conversation_created",
  CONVERSATION_ACCESSED: "conversation_accessed",
  CONVERSATION_HIDDEN: "conversation_hidden",
  CONVERSATION_BLOCKED_ATTEMPT: "conversation_blocked_attempt",
  ATTACHMENT_UPLOADED: "attachment_uploaded",

  // Matches
  MATCH_CREATED: "match_created",
  MATCH_DELETED: "match_deleted",
  MATCHES_RESTORED_ON_REACTIVATION: "matches_restored_on_reactivation",

  // Posts & Comments
  POST_CREATED: "post_created",
  POST_UPDATED: "post_updated",
  POST_EDITED: "post_edited",
  POST_DELETED: "post_deleted",
  POST_VIEWED: "post_viewed",
  POST_REPORTED: "post_reported",
  POST_HIDDEN: "post_hidden",
  POST_SHARED: "post_shared",
  POST_SAVE_TOGGLED: "post_save_toggled",
  POST_LIKE_TOGGLED: "post_like_toggled",
  POST_LIKED: "post_liked",
  POST_UNLIKED: "post_unliked",
  POST_SAVED: "post_saved",
  POST_UNSAVED: "post_unsaved",
  COMMENT_ADDED: "comment_added",
  COMMENT_UPDATED: "comment_updated",
  COMMENT_DELETED: "comment_deleted",
  COMMENT_REACTED: "comment_reacted",
  REPLY_ADDED: "reply_added",
  REACTION_ADDED: "reaction_added",
  REACTION_REMOVED: "reaction_removed",

  // Notifications
  NOTIFICATIONS_MARKED_READ: "notifications_marked_read",
  ALL_NOTIFICATIONS_DELETED: "all_notifications_deleted",

  // Signatures
  SIGNATURE_MISSING: "signature_missing",
  SIGNATURE_INVALID: "signature_invalid",
  SIGNATURE_EXPIRED: "signature_expired",
  SIGNATURE_INVALID_FORMAT: "signature_invalid_format",

  // User management
  USER_REPORTED: "user_reported",
  USER_BLOCKED: "user_blocked",
  USER_UNBLOCKED: "user_unblocked",
  USER_LIKED: "user_liked",
  USER_UNLIKED: "user_unliked",

  // Account lifecycle
  ACCOUNT_SOFT_DELETED: "account_soft_deleted",
  ACCOUNT_REACTIVATED: "account_reactivated",
  ACCOUNT_DELETION_FAILED: "account_deletion_failed",
  ACCOUNT_PERMANENTLY_DELETED: "account_permanently_deleted",
  DATA_EXPORTED: "data_exported",

  // Admin actions
  ADMIN_USER_UPDATED: "admin_user_updated",
  ADMIN_USER_BANNED: "admin_user_banned",
  ADMIN_USER_UNBANNED: "admin_user_unbanned",
  ADMIN_USER_DELETED: "admin_user_deleted",
  ADMIN_PHOTO_DELETED: "admin_photo_deleted",
  ADMIN_REPORT_UPDATED: "admin_report_updated",

  // System
  CLEANUP_JOB_COMPLETED: "cleanup_job_completed",
  CLEANUP_JOB_FAILED: "cleanup_job_failed",
  SANITIZATION_ERROR: "sanitization_error",
  SANITIZATION_CRASH: "sanitization_crash",

  // OAuth
  OAUTH_ACCOUNT_CREATED: "oauth_account_created",
  OAUTH_LOGIN_DEACTIVATED: "oauth_login_deactivated",
  OAUTH_LOGIN_BANNED: "oauth_login_banned",
  OAUTH_LOGIN_EMAIL_BLOCKED: "oauth_login_email_blocked",
  OAUTH_ACCOUNT_LINKED: "oauth_account_linked",
  OAUTH_LOGIN_SUCCESS: "oauth_login_success",
  OAUTH_LOGIN_FAILED: "oauth_login_failed",

  // Discovery
  DISCOVERY_FEED_VIEWED: "discovery_feed_viewed",

  // Fallback
  OTHER: "other",
};

// ═══════════════════════════════════════════
// SECURITY CONSTANTS
// ═══════════════════════════════════════════
const MAX_METADATA_DEPTH = 5;
// ✅ shared with the logger so the two size limits can never drift again.
const MAX_METADATA_SIZE = MAX_AUDIT_METADATA_BYTES;
const MAX_STRING_LENGTH = 500;
const MAX_IP_LENGTH = 45; // IPv6 max length
const MAX_USER_AGENT_LENGTH = 256;

// ═══════════════════════════════════════════
// SEVERITY DERIVATION
// Monotonic: pre('save') only UPGRADES toward these, never downgrades an
// explicitly‑higher level a caller passed. Routine churn (auth_failed,
// login_failed, registration_failed, otp_verification_failed, oauth_login_failed)
// is DELIBERATELY left at "info" — an expired‑token 401 is not an alarm.
// ═══════════════════════════════════════════
const LEVEL_RANK = { info: 0, warning: 1, error: 2, critical: 3 };

const SEVERITY_BY_ACTION = {
  // critical — active compromise / abuse indicators
  [AUDIT_ACTIONS.TOKEN_REPLAY_DETECTED]: "critical",
  [AUDIT_ACTIONS.DEVICE_MISMATCH_DETECTED]: "critical",
  [AUDIT_ACTIONS.SOCKET_UNAUTHORIZED_ROOM_JOIN]: "critical",
  [AUDIT_ACTIONS.FORCE_REAUTH_ALL_USERS]: "critical",
  [AUDIT_ACTIONS.IP_REPUTATION_BLOCKED]: "critical",
  [AUDIT_ACTIONS.HONEYPOT_TRIGGERED]: "critical",

  // warning — denied access, tamper, abuse‑attempt, destructive state change
  [AUDIT_ACTIONS.SUSPICIOUS_LOGIN]: "warning",
  [AUDIT_ACTIONS.SUSPICIOUS_IP_CHANGE]: "warning",
  [AUDIT_ACTIONS.SOCKET_INVALID_ROOM_JOIN]: "warning",
  [AUDIT_ACTIONS.SOCKET_CONNECTION_LIMIT_EXCEEDED]: "warning",
  [AUDIT_ACTIONS.SIGNATURE_INVALID]: "warning",
  [AUDIT_ACTIONS.SIGNATURE_MISSING]: "warning",
  [AUDIT_ACTIONS.SIGNATURE_EXPIRED]: "warning",
  [AUDIT_ACTIONS.SIGNATURE_INVALID_FORMAT]: "warning",
  [AUDIT_ACTIONS.ADMIN_ACCESS_DENIED]: "warning",
  [AUDIT_ACTIONS.SUPERADMIN_ACCESS_DENIED]: "warning",
  [AUDIT_ACTIONS.UNVERIFIED_ACCESS_ATTEMPT]: "warning",
  [AUDIT_ACTIONS.LOGIN_BLOCKED]: "warning",
  [AUDIT_ACTIONS.REGISTRATION_BLOCKED]: "warning",
  [AUDIT_ACTIONS.LOGIN_DEACTIVATED]: "warning",
  [AUDIT_ACTIONS.SESSION_LIMIT_EXCEEDED]: "warning",
  [AUDIT_ACTIONS.SESSION_REVOKED]: "warning",
  [AUDIT_ACTIONS.ALL_OTHER_SESSIONS_REVOKED]: "warning",
  [AUDIT_ACTIONS.UNAUTHORIZED_UPLOAD_ATTEMPT]: "warning",
  [AUDIT_ACTIONS.UPLOAD_REJECTED]: "warning",
  [AUDIT_ACTIONS.UPLOAD_REJECTED_FILTER]: "warning",
  [AUDIT_ACTIONS.UPLOAD_REJECTED_BLOCKED_TYPE]: "warning",
  [AUDIT_ACTIONS.IMAGE_REJECTED]: "warning",
  [AUDIT_ACTIONS.MESSAGE_BLOCKED_ATTEMPT]: "warning",
  [AUDIT_ACTIONS.MESSAGE_UNMATCHED_ATTEMPT]: "warning",
  [AUDIT_ACTIONS.CONVERSATION_BLOCKED_ATTEMPT]: "warning",
  [AUDIT_ACTIONS.ACCOUNT_DELETION_FAILED]: "warning",
  [AUDIT_ACTIONS.OTP_REQUEST_BLOCKED]: "warning",
  [AUDIT_ACTIONS.OTP_RATE_LIMITED]: "warning",
  [AUDIT_ACTIONS.PASSWORD_RESET_BLOCKED]: "warning",
  [AUDIT_ACTIONS.PASSWORD_CHANGE_FAILED]: "warning",
  [AUDIT_ACTIONS.PASSWORD_RESET_FAILED]: "warning",
  [AUDIT_ACTIONS.LOGIN_2FA_FAILED]: "warning",
  [AUDIT_ACTIONS.OAUTH_2FA_FAILED]: "warning",
  // ✅ newly promoted (were unlisted → defaulted to info, so the logger's
  // high‑severity bypass couldn't protect them and they sat next to page views):
  // abuse / account‑weakening / misconfig signals, NOT routine churn.
  [AUDIT_ACTIONS.RATE_LIMIT_EXCEEDED]: "warning",
  [AUDIT_ACTIONS.CSP_VIOLATION]: "warning",
  [AUDIT_ACTIONS.TWO_FA_DISABLE_FAILED]: "warning",
  [AUDIT_ACTIONS.TWO_FA_SETUP_FAILED]: "warning",
};

// ✅ exported so the logger can refuse to DROP these under flood (vector #2).
export const isHighSeverityAction = (action) => {
  const lvl = SEVERITY_BY_ACTION[action];
  return lvl === "warning" || lvl === "error" || lvl === "critical";
};

// ═══════════════════════════════════════════
// SENSITIVE KEYS — now sourced from the shared module (vector #1). The local
// exact‑match Set is REMOVED; `isSensitiveKey` (substring, NFKC‑normalized) is
// imported so the logger and the model can never disagree again.
// ═══════════════════════════════════════════

const sanitizeObject = (obj, depth = 0) => {
  if (!obj || typeof obj !== "object") return obj;
  if (depth > MAX_METADATA_DEPTH) return "[REDACTED: max depth exceeded]";
  if (obj === Object.prototype || obj === Array.prototype) return obj;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === "object" && obj[i] !== null) {
        obj[i] = sanitizeObject(obj[i], depth + 1);
      } else if (
        typeof obj[i] === "string" &&
        obj[i].length > MAX_STRING_LENGTH
      ) {
        obj[i] = obj[i].substring(0, MAX_STRING_LENGTH) + "...[truncated]";
      }
    }
    return obj;
  }

  for (const key of Object.keys(obj)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      delete obj[key];
      continue;
    }
    if (isSensitiveKey(key)) {
      obj[key] = "[REDACTED]";
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      obj[key] = sanitizeObject(obj[key], depth + 1);
    } else if (
      typeof obj[key] === "string" &&
      obj[key].length > MAX_STRING_LENGTH
    ) {
      obj[key] = obj[key].substring(0, MAX_STRING_LENGTH) + "...[truncated]";
    }
  }
  return obj;
};

const validateMetadataSize = (metadata) => {
  if (!metadata || typeof metadata.entries !== "function") return true;
  let totalSize = 0;
  for (const [key, value] of metadata.entries()) {
    totalSize += String(key).length;
    let serialized;
    try {
      serialized = JSON.stringify(value);
    } catch {
      serialized = '"[unserializable]"';
    }
    if (serialized !== undefined) totalSize += serialized.length;
    if (totalSize > MAX_METADATA_SIZE) return false;
  }
  return true;
};

// ✅ VECTOR #4: sanitize to a safe charset instead of storing attacker junk. Real
// forms (`::1`, `::ffff:127.0.0.1`, dotted IPv4) survive because every char is in
// [0‑9a‑fA‑F:.]; a spoofed `<script>…` or oversized blob collapses to `unknown`,
// so the indexed `ip` field can't be poisoned with lookalike strings. Sentinels
// pass through untouched (a naive strip would mangle the default 'system' → 'e').
const validateIP = (ip) => {
  if (!ip || typeof ip !== "string") return "system";
  const t = ip.trim();
  if (t === "system" || t === "unknown" || t === "invalid") return t;
  const cleaned = t.substring(0, MAX_IP_LENGTH).replace(/[^0-9a-fA-F:.]/g, "");
  return cleaned || "unknown";
};

// ✅ strip ASCII control chars (a UA is attacker‑controlled) before bounding length.
const validateUserAgent = (userAgent) => {
  if (!userAgent || typeof userAgent !== "string") return null;
  return userAgent
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .substring(0, MAX_USER_AGENT_LENGTH);
};

// ═══════════════════════════════════════════
// SCHEMA DEFINITION
// ═══════════════════════════════════════════
const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: Object.values(AUDIT_ACTIONS),
      index: true,
    },
    level: {
      type: String,
      enum: ["info", "warning", "error", "critical"],
      default: "info",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
      maxlength: [254, "Email too long"],
    },
    ip: {
      type: String,
      default: "system",
      maxlength: [MAX_IP_LENGTH, "IP too long"],
      index: true,
    },
    country: {
      type: String,
      default: null,
      maxlength: [100, "Country name too long"],
    },
    city: {
      type: String,
      default: null,
      maxlength: [100, "City name too long"],
    },
    userAgent: {
      type: String,
      default: null,
      maxlength: [MAX_USER_AGENT_LENGTH, "User agent too long"],
    },
    requestId: {
      type: String,
      default: null,
      maxlength: [100, "Request ID too long"],
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => new Map(),
    },
  },
  { timestamps: true, versionKey: false }
);

auditLogSchema.pre("save", async function () {
  try {
    // 1) Severity FIRST (before the metadata early‑return below).
    const target = SEVERITY_BY_ACTION[this.action];
    if (target && (LEVEL_RANK[target] ?? 0) > (LEVEL_RANK[this.level] ?? 0)) {
      this.level = target;
    }

    // 2) ip / user‑agent bounding.
    if (this.ip) this.ip = validateIP(this.ip);
    if (this.userAgent) this.userAgent = validateUserAgent(this.userAgent);

    // 3) metadata redaction (duck‑typed Map; the logger now ALWAYS passes a Map, so
    // this layer is guaranteed to run — vector #3).
    if (this.metadata && typeof this.metadata.entries === "function") {
      if (!validateMetadataSize(this.metadata)) {
        this.metadata = new Map([["error", "[REDACTED: metadata too large]"]]);
        return; // level already set above, so the early‑return is safe
      }
      for (const [key, value] of this.metadata.entries()) {
        if (
          key === "__proto__" ||
          key === "constructor" ||
          key === "prototype"
        ) {
          this.metadata.delete(key);
          continue;
        }
        if (isSensitiveKey(key)) {
          this.metadata.set(key, "[REDACTED]");
        } else if (typeof value === "object" && value !== null) {
          this.metadata.set(key, sanitizeObject(value, 0));
        } else if (
          typeof value === "string" &&
          value.length > MAX_STRING_LENGTH
        ) {
          this.metadata.set(
            key,
            value.substring(0, MAX_STRING_LENGTH) + "...[truncated]"
          );
        }
      }
    }
  } catch (error) {
    console.error("AuditLog sanitization error:", error.message);
    try {
      this.metadata = new Map([["sanitization_error", "redacted"]]);
    } catch {}
  }
});

// ═══════════════════════════════════════════
// INDEXES
// ═══════════════════════════════════════════
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ targetUserId: 1, createdAt: -1 });
auditLogSchema.index({ email: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ level: 1, createdAt: -1 });
auditLogSchema.index({ ip: 1, createdAt: -1 });
auditLogSchema.index({ requestId: 1 }, { sparse: true });
auditLogSchema.index({ country: 1, createdAt: -1 }, { sparse: true });

auditLogSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: {
      action: {
        $nin: [
          AUDIT_ACTIONS.ADMIN_USER_DELETED,
          AUDIT_ACTIONS.ADMIN_USER_BANNED,
          AUDIT_ACTIONS.ADMIN_USER_UNBANNED,
          AUDIT_ACTIONS.SUPERADMIN_ACCESS_DENIED,
          AUDIT_ACTIONS.PASSWORD_RESET_SUCCESS,
          AUDIT_ACTIONS.TWO_FA_ENABLED,
          AUDIT_ACTIONS.TWO_FA_DISABLED,
          AUDIT_ACTIONS.ACCOUNT_SOFT_DELETED,
          AUDIT_ACTIONS.ACCOUNT_PERMANENTLY_DELETED,
          AUDIT_ACTIONS.ACCOUNT_REACTIVATED,
          AUDIT_ACTIONS.DATA_EXPORTED,
          AUDIT_ACTIONS.TOKEN_REPLAY_DETECTED,
          AUDIT_ACTIONS.DEVICE_MISMATCH_DETECTED,
          AUDIT_ACTIONS.SUSPICIOUS_LOGIN,
          AUDIT_ACTIONS.SUSPICIOUS_IP_CHANGE,
          AUDIT_ACTIONS.IP_REPUTATION_BLOCKED,
          AUDIT_ACTIONS.HONEYPOT_TRIGGERED,
          AUDIT_ACTIONS.FORCE_REAUTH_ALL_USERS,
          AUDIT_ACTIONS.SOCKET_UNAUTHORIZED_ROOM_JOIN,
          AUDIT_ACTIONS.SOCKET_INVALID_ROOM_JOIN,
        ],
      },
    },
  }
);

export default mongoose.model("AuditLog", auditLogSchema);
