import crypto from "crypto";
import { logAudit } from "../utils/auditLogger.js";

// ═══════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════
const API_SECRET = process.env.API_SECRET;
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes
const NODE_ENV = process.env.NODE_ENV || "development";

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Safe audit logging (fire-and-forget)
 */
const safeLogAudit = async (req, action, metadata) => {
  try {
    await logAudit(req, action, metadata);
  } catch {
    // Silent failure - audit logging shouldn't block responses
  }
};

/**
 * Canonical JSON stringifier.
 * MUST perfectly match JSON.stringify behavior for objects/arrays to prevent
 * client/server mismatch bugs, but with sorted keys for determinism.
 */
const stableStringify = (obj) => {
  if (obj === null) return "null";
  if (obj === undefined) return undefined; // JSON.stringify drops undefined

  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number") {
    // Match JSON.stringify behavior for NaN/Infinity
    if (!Number.isFinite(obj)) return "null";
    return String(obj);
  }
  if (typeof obj === "boolean") return String(obj);

  if (obj instanceof Date) return JSON.stringify(obj.toISOString());

  if (Array.isArray(obj)) {
    return `[${obj.map((v) => stableStringify(v) ?? "null").join(",")}]`;
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    const pairs = [];
    for (const k of keys) {
      const v = stableStringify(obj[k]);
      // Drop undefined values, exactly like JSON.stringify does
      if (v !== undefined) {
        pairs.push(`${JSON.stringify(k)}:${v}`);
      }
    }
    return `{${pairs.join(",")}}`;
  }

  return "";
};

/**
 * Validate hex string safely
 */
const isValidHex = (str) => {
  return typeof str === "string" && /^[a-fA-F0-9]+$/.test(str);
};

// ═══════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════

export const verifySignature = async (req, res, next) => {
  const requestId = req.requestId || req.id;

  // 1. Fail closed if secret missing
  if (!API_SECRET || API_SECRET.length < 32) {
    // Never log the secret or stack trace
    return res.status(500).json({
      success: false,
      message: "Server configuration error",
      code: "SERVER_CONFIG_ERROR",
      requestId,
    });
  }

  const signature = req.headers["x-signature"];
  const timestamp = req.headers["x-timestamp"];

  // 2. Check headers present
  if (!signature || !timestamp) {
    await safeLogAudit(req, "signature_missing", {
      path: req.path,
      method: req.method,
      requestId,
    });

    return res.status(401).json({
      success: false,
      message: "Request signature required",
      code: "SIGNATURE_MISSING",
      requestId,
    });
  }

  // 3. Validate signature format
  if (!isValidHex(signature)) {
    return res.status(401).json({
      success: false,
      message: "Invalid signature format",
      code: "SIGNATURE_INVALID_FORMAT",
      requestId,
    });
  }

  // 4. Check timestamp freshness (prevent replay attacks)
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS) {
    await safeLogAudit(req, "signature_expired", {
      path: req.path,
      method: req.method,
      requestId,
    });

    return res.status(401).json({
      success: false,
      message: "Request timestamp expired",
      code: "SIGNATURE_EXPIRED",
      requestId,
    });
  }

  // 5. Calculate payload based on content type
  let payloadString;

  if (req.is("multipart/form-data")) {
    // ✅ FIX: Do NOT skip verification for multipart.
    // Sign the method, path, and timestamp instead of the body stream.
    // The client MUST use this exact same payload format for file uploads.
    payloadString = `multipart|${req.method}|${req.path}|${timestamp}`;
  } else {
    // For JSON/urlencoded, sign the canonical body
    const bodyString =
      req.body && Object.keys(req.body).length > 0
        ? stableStringify(req.body)
        : "";
    // Add protocol prefix to prevent cross-protocol replay attacks
    payloadString = `json|${bodyString}|${timestamp}`;
  }

  // 6. Calculate expected signature
  const expectedSignature = crypto
    .createHmac("sha256", API_SECRET)
    .update(payloadString)
    .digest("hex");

  // 7. Timing-safe comparison
  let valid = false;
  try {
    if (signature.length === expectedSignature.length) {
      valid = crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expectedSignature, "hex")
      );
    }
  } catch {
    valid = false;
  }

  if (!valid) {
    await safeLogAudit(req, "signature_invalid", {
      path: req.path,
      method: req.method,
      // ✅ FIX: Never log the expected signature (helps attackers)
      providedPrefix: signature.substring(0, 8),
      requestId,
    });

    return res.status(401).json({
      success: false,
      message: "Invalid request signature",
      code: "SIGNATURE_INVALID",
      requestId,
    });
  }

  next();
};

export default verifySignature;
