/**
 * Production-grade input sanitizer for Express.js
 * Prevents NoSQL injection, XSS, and other injection attacks
 * Compatible with Node.js 24+ and Express 5
 */

import { logAudit } from "../utils/auditLogger.js";

// ═══════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════

const MAX_DEPTH = 20;
const MAX_KEYS = 1000;
const MAX_ARRAY_LENGTH = 1000;
const MAX_STRING_LENGTH = 50000; // 50KB per string
const NODE_ENV = process.env.NODE_ENV || "development";

// NoSQL injection patterns
const NOSQL_OPERATORS =
  /^\$(gt|gte|lt|lte|ne|eq|in|nin|exists|type|mod|regex|text|where|jsonSchema|expr|all|elemMatch|size|bitsAllClear|bitsAllSet|bitsAnyClear|bitsAnySet|comment|meta|slice|natural|hint|maxTimeMS|orderby|explain|snapshot|maxScan|returnKey|showDiskLoc|min|max|comment)$/i;

// XSS patterns to escape in strings
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /data:\s*text\/html/gi,
];

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const safeLogAudit = async (req, action, metadata) => {
  try {
    await logAudit(req, action, metadata);
  } catch {
    // Silent failure
  }
};

const isPlainObject = (obj) => {
  if (obj === null || typeof obj !== "object") return false;
  const proto = Object.getPrototypeOf(obj);
  return proto === null || proto === Object.prototype;
};

const escapeHtml = (str) => {
  if (typeof str !== "string") return str;
  if (str.length > MAX_STRING_LENGTH)
    return str.substring(0, MAX_STRING_LENGTH);

  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\//g, "&#x2F;");
};

const sanitizeString = (str, context = "unknown") => {
  if (typeof str !== "string") return str;
  if (str.length > MAX_STRING_LENGTH) {
    if (NODE_ENV === "development")
      console.warn(`String truncated: ${context}`);
    return str.substring(0, MAX_STRING_LENGTH);
  }

  let cleaned = str;
  XSS_PATTERNS.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, "");
  });

  if (context === "html" || context === "body") {
    cleaned = escapeHtml(cleaned);
  }
  return cleaned;
};

const sanitizeKey = (key, context = "unknown") => {
  if (typeof key !== "string") return key;
  if (key.startsWith("$") || NOSQL_OPERATORS.test(key)) return null;
  if (key.includes(".")) return null;

  if (context === "headers") {
    if (!/^[a-zA-Z0-9_\-]+$/.test(key)) return null;
    return key.toLowerCase();
  }

  if (!/^[a-zA-Z0-9_\-\s]+$/.test(key)) return null;
  return key;
};

const sanitize = (
  obj,
  depth = 0,
  seen = new WeakMap(),
  context = "unknown"
) => {
  if (depth > MAX_DEPTH) return null;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return sanitizeString(obj, context);
  if (typeof obj !== "object") return obj;
  if (seen.has(obj)) return "[Circular]";
  seen.set(obj, true);

  if (obj instanceof Date) return obj;
  if (Buffer.isBuffer(obj)) return obj;
  if (obj instanceof RegExp) return obj;

  if (obj instanceof Map) {
    const sanitizedMap = new Map();
    for (const [key, value] of obj.entries()) {
      const sanitizedKey =
        typeof key === "string" ? sanitizeKey(key, context) : key;
      if (sanitizedKey !== null)
        sanitizedMap.set(
          sanitizedKey,
          sanitize(value, depth + 1, seen, context)
        );
    }
    return sanitizedMap;
  }

  if (obj instanceof Set) {
    const sanitizedSet = new Set();
    for (const value of obj)
      sanitizedSet.add(sanitize(value, depth + 1, seen, context));
    return sanitizedSet;
  }

  if (Array.isArray(obj)) {
    if (obj.length > MAX_ARRAY_LENGTH) obj = obj.slice(0, MAX_ARRAY_LENGTH);
    return obj.map((item) => sanitize(item, depth + 1, seen, context));
  }

  if (isPlainObject(obj)) {
    const cleaned = {};
    const keys = Object.keys(obj);
    let keyCount = 0;
    for (const key of keys) {
      if (keyCount >= MAX_KEYS) break;
      const sanitizedKey = sanitizeKey(key, context);
      if (sanitizedKey !== null) {
        cleaned[sanitizedKey] = sanitize(obj[key], depth + 1, seen, context);
        keyCount++;
      }
    }
    return cleaned;
  }

  return obj;
};

// ═══════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════

export const sanitizeInput = async (req, res, next) => {
  const requestId = req.id || req.requestId || `req-${Date.now()}`;
  const sanitizationErrors = [];

  try {
    if (!req || typeof req !== "object") return next();

    // ✅ FIX: Mutate in place to bypass Express 5 read-only getters (req.query, req.headers, etc.)
    const mutateInPlace = (target, sanitized) => {
      if (!target || typeof target !== "object") return;
      for (const key of Object.keys(target)) delete target[key];
      Object.assign(target, sanitized);
    };

    if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
      try {
        mutateInPlace(req.body, sanitize(req.body, 0, new WeakMap(), "body"));
      } catch (error) {
        sanitizationErrors.push(`body: ${error.message}`);
      }
    }

    if (req.query && typeof req.query === "object") {
      try {
        mutateInPlace(
          req.query,
          sanitize(req.query, 0, new WeakMap(), "query")
        );
      } catch (error) {
        sanitizationErrors.push(`query: ${error.message}`);
      }
    }

    if (req.params && typeof req.params === "object") {
      try {
        mutateInPlace(
          req.params,
          sanitize(req.params, 0, new WeakMap(), "params")
        );
      } catch (error) {
        sanitizationErrors.push(`params: ${error.message}`);
      }
    }

    if (req.headers && typeof req.headers === "object") {
      try {
        mutateInPlace(
          req.headers,
          sanitize(req.headers, 0, new WeakMap(), "headers")
        );
      } catch (error) {
        sanitizationErrors.push(`headers: ${error.message}`);
      }
    }

    if (sanitizationErrors.length > 0) {
      await safeLogAudit(req, "sanitization_error", {
        requestId,
        errors: sanitizationErrors,
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      if (NODE_ENV === "production") {
        return res.status(400).json({
          success: false,
          message: "Invalid request format",
          code: "INVALID_INPUT",
          requestId,
        });
      }
    }

    next();
  } catch (error) {
    await safeLogAudit(req, "sanitization_crash", {
      requestId,
      error: error.message,
      path: req.path,
      method: req.method,
    });
    if (NODE_ENV === "production") {
      return res.status(400).json({
        success: false,
        message: "Request processing error",
        code: "PROCESSING_ERROR",
        requestId,
      });
    }
    next();
  }
};

export const sanitizeFields = (fields) => {
  return (req, res, next) => {
    fields.forEach((field) => {
      if (req.body && req.body[field]) {
        req.body[field] = sanitize(req.body[field], 0, new WeakMap(), "body");
      }
    });
    next();
  };
};

export const sanitizeStrings = (req, res, next) => {
  const sanitizeStringOnly = (obj, depth = 0, seen = new WeakMap()) => {
    if (depth > MAX_DEPTH || obj === null || obj === undefined) return obj;
    if (typeof obj === "string") return sanitizeString(obj, "generic");
    if (typeof obj !== "object") return obj;
    if (seen.has(obj)) return "[Circular]";
    seen.set(obj, true);
    if (Array.isArray(obj))
      return obj.map((item) => sanitizeStringOnly(item, depth + 1, seen));
    if (isPlainObject(obj)) {
      const cleaned = {};
      Object.keys(obj).forEach((key) => {
        cleaned[key] = sanitizeStringOnly(obj[key], depth + 1, seen);
      });
      return cleaned;
    }
    return obj;
  };

  if (req.body && typeof req.body === "object") {
    for (const key of Object.keys(req.body)) delete req.body[key];
    Object.assign(req.body, sanitizeStringOnly(req.body));
  }
  if (req.query && typeof req.query === "object") {
    for (const key of Object.keys(req.query)) delete req.query[key];
    Object.assign(req.query, sanitizeStringOnly(req.query));
  }
  next();
};

export default sanitizeInput;
