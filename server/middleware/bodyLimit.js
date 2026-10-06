import express from "express";
import { logAudit } from "../utils/auditLogger.js";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const NODE_ENV = process.env.NODE_ENV || "development";

// Error codes for consistent responses
const ERROR_CODES = {
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  INVALID_JSON: "INVALID_JSON",
  UNSUPPORTED_ENCODING: "UNSUPPORTED_ENCODING",
  REQUEST_ABORTED: "REQUEST_ABORTED",
};

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

/**
 * Safe audit logging (fire-and-forget)
 */
const safeLogAudit = async (req, action, metadata) => {
  try {
    await logAudit(req, action, metadata);
  } catch {
    // Silent failure - audit logging shouldn't block error handling
  }
};

export const jsonLimit = (limit, options = {}) => {
  const {
    name = "request",
    type = "application/json",
    strict = true,
  } = options;

  return (req, res, next) => {
    // Attach metadata to request for error handler
    req.bodyLimitConfig = {
      limit,
      name,
    };

    express.json({
      limit,
      strict,
      type,
    })(req, res, next);
  };
};

export const urlencodedLimit = (limit, options = {}) => {
  const { extended = false } = options;

  return (req, res, next) => {
    req.bodyLimitConfig = { limit };

    express.urlencoded({
      limit,
      extended,
    })(req, res, next);
  };
};

export const handleBodyLimitError = async (err, req, res, next) => {
  // Check if response already sent (prevents crash)
  if (res.headersSent) {
    return next(err);
  }

  // ═══════════════════════════════════════════
  // BODY TOO LARGE
  // ═══════════════════════════════════════════
  if (err.type === "entity.too.large") {
    const limit = err.limit || 0;
    const received = err.length || 0;

    // Log to audit trail (not console)
    await safeLogAudit(req, "body_too_large", {
      ip: req.ip,
      path: req.path,
      method: req.method,
      limit,
      received,
      routeName: req.bodyLimitConfig?.name || "unknown",
    });

    return res.status(413).json({
      success: false,
      message: `Request body too large. Maximum size: ${formatBytes(limit)}.`,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      limit,
      limitFormatted: formatBytes(limit),
      received,
      receivedFormatted: formatBytes(received),
    });
  }

  // ═══════════════════════════════════════════
  // INVALID JSON SYNTAX
  // ═══════════════════════════════════════════
  if (err.type === "entity.parse.failed") {
    await safeLogAudit(req, "invalid_json", {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });

    return res.status(400).json({
      success: false,
      message: "Invalid JSON in request body. Please check your syntax.",
      code: ERROR_CODES.INVALID_JSON,
      ...(NODE_ENV === "development" && {
        details: err.message,
      }),
    });
  }

  // ═══════════════════════════════════════════
  // UNSUPPORTED ENCODING
  // ═══════════════════════════════════════════
  if (err.type === "encoding.unsupported") {
    await safeLogAudit(req, "unsupported_encoding", {
      ip: req.ip,
      path: req.path,
      method: req.method,
      encoding: err.encoding,
    });

    return res.status(415).json({
      success: false,
      message: `Unsupported content encoding: ${err.encoding}`,
      code: ERROR_CODES.UNSUPPORTED_ENCODING,
      encoding: err.encoding,
    });
  }

  // ═══════════════════════════════════════════
  // REQUEST ABORTED (client disconnected)
  // ═══════════════════════════════════════════
  if (err.type === "request.aborted") {
    // No response needed — client is gone
    // Just log for monitoring
    await safeLogAudit(req, "request_aborted", {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    return;
  }

  // Pass to next error handler
  next(err);
};

export const limits = {
  // Tiny: IDs, flags, simple actions (100 bytes)
  tiny: jsonLimit("100b", { name: "minimal data" }),

  // Small: Login, OTP, simple forms (500 bytes)
  small: jsonLimit("500b", { name: "small form" }),

  // Medium: Reports, messages, comments (2 KB)
  medium: jsonLimit("2kb", { name: "form submission" }),

  // Large: Profile updates, bio, interests (10 KB)
  large: jsonLimit("10kb", { name: "profile update" }),

  // XLarge: Bulk operations, admin data (100 KB)
  xlarge: jsonLimit("100kb", { name: "admin data" }),

  // XXLarge: Large imports, CSV data (1 MB)
  xxlarge: jsonLimit("1mb", { name: "bulk import" }),
};

/**
 * Pre-built URL-encoded limits for form submissions
 */
export const formLimits = {
  small: urlencodedLimit("500b"),
  medium: urlencodedLimit("2kb"),
  large: urlencodedLimit("10kb"),
};

export const createBodyLimit = (config) => {
  const {
    limit,
    name = "custom",
    allowedTypes = ["application/json"],
  } = config;

  return (req, res, next) => {
    // Check content type
    const contentType = req.headers["content-type"];
    if (
      contentType &&
      !allowedTypes.some((type) => contentType.includes(type))
    ) {
      return res.status(415).json({
        success: false,
        message: `Content-Type must be one of: ${allowedTypes.join(", ")}`,
        code: "UNSUPPORTED_CONTENT_TYPE",
      });
    }

    req.bodyLimitConfig = { limit, name };

    express.json({
      limit,
      strict: true,
      type: "application/json",
    })(req, res, next);
  };
};

export default {
  jsonLimit,
  urlencodedLimit,
  handleBodyLimitError,
  limits,
  formLimits,
  createBodyLimit,
};
