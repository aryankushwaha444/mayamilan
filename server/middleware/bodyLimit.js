import express from "express";

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Convert bytes to human-readable format
 */
const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ========================================
// MIDDLEWARE FACTORY
// ========================================

/**
 * Create a JSON body parser with a specific size limit
 * @param {string} limit - e.g., "1kb", "10mb"
 * @param {string} friendlyName - Optional name for error messages (e.g., "profile update")
 */
export const jsonLimit = (limit, friendlyName = "request") => {
  return express.json({
    limit,
    strict: true,
    type: "application/json",
  });
};

// ========================================
// ERROR HANDLER
// ========================================

/**
 * Handle body size and parsing errors gracefully
 * Place this AFTER your routes but BEFORE your general error handler
 */
export const handleBodyLimitError = (err, req, res, next) => {
  // ✅ Check if response already sent (prevents crash)
  if (res.headersSent) {
    return next(err);
  }

  // ✅ Body too large
  if (err.type === "entity.too.large") {
    console.warn(
      `⚠️  Body too large: ${req.method} ${req.path} (${err.length} bytes)`
    );

    return res.status(413).json({
      success: false,
      message: `Request body too large. Maximum size: ${formatBytes(
        err.limit || err.length
      )}.`,
      code: "PAYLOAD_TOO_LARGE",
      limit: err.limit,
      received: err.length,
    });
  }

  // ✅ Invalid JSON syntax
  if (err.type === "entity.parse.failed") {
    console.warn(`⚠️  Invalid JSON: ${req.method} ${req.path}`);

    return res.status(400).json({
      success: false,
      message: "Invalid JSON in request body. Please check your syntax.",
      code: "INVALID_JSON",
    });
  }

  // ✅ Unsupported encoding
  if (err.type === "encoding.unsupported") {
    console.warn(
      `⚠️  Unsupported encoding: ${req.method} ${req.path} (${err.encoding})`
    );

    return res.status(415).json({
      success: false,
      message: `Unsupported content encoding: ${err.encoding}`,
      code: "UNSUPPORTED_ENCODING",
    });
  }

  // ✅ Request aborted (client disconnected)
  if (err.type === "request.aborted") {
    console.warn(`⚠️  Request aborted: ${req.method} ${req.path}`);
    return; // No response needed — client is gone
  }

  // Pass to next error handler
  next(err);
};

// ========================================
// PRE-BUILT LIMITS (convenience exports)
// ========================================

/**
 * Pre-built limits for common use cases
 */
export const limits = {
  tiny: jsonLimit("100b", "minimal data"), // 100 bytes - IDs, flags
  small: jsonLimit("500b", "small form"), // 500 bytes - login, OTP
  medium: jsonLimit("2kb", "form submission"), // 2 KB - reports, messages
  large: jsonLimit("10kb", "profile update"), // 10 KB - bio, interests
  xlarge: jsonLimit("100kb", "admin data"), // 100 KB - bulk operations
};
