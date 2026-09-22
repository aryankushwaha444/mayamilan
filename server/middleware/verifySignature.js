// server/middleware/verifySignature.js
import crypto from "crypto";
import { logAudit } from "../utils/auditLogger.js";

// ✅ Must match client's VITE_API_SECRET exactly
const API_SECRET = process.env.API_SECRET;

// ✅ 5-minute window for clock skew tolerance
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * ✅ Must match client's stableStringify EXACTLY
 */
const stableStringify = (obj) => {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") return String(obj);

  // ✅ Handle Date objects
  if (obj instanceof Date) return obj.toISOString();

  // ✅ Handle RegExp
  if (obj instanceof RegExp) return obj.toString();

  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(",")}]`;
  }

  const keys = Object.keys(obj).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`
  );
  return `{${pairs.join(",")}}`;
};

/**
 * ✅ Validate hex string safely
 */
const isValidHex = (str) => {
  return typeof str === "string" && /^[a-fA-F0-9]+$/.test(str);
};

export const verifySignature = async (req, res, next) => {
  // ✅ Fail closed if secret missing
  if (!API_SECRET || API_SECRET.length < 32) {
    console.error("❌ API_SECRET not configured or too short");
    return res.status(500).json({
      success: false,
      message: "Server configuration error",
      code: "SERVER_CONFIG_ERROR",
      requestId: req.id,
    });
  }

  const signature = req.headers["x-signature"];
  const timestamp = req.headers["x-timestamp"];

  // ✅ Check headers present
  if (!signature || !timestamp) {
    try {
      await logAudit(req, "signature_missing", {
        path: req.path,
        method: req.method,
        requestId: req.id,
      });
    } catch (auditError) {
      console.error("Audit log failed:", auditError.message);
    }

    return res.status(401).json({
      success: false,
      message: "Request signature required",
      code: "SIGNATURE_MISSING",
      requestId: req.id,
    });
  }

  // ✅ Validate signature format (must be valid hex)
  if (!isValidHex(signature)) {
    try {
      await logAudit(req, "signature_invalid_format", {
        path: req.path,
        method: req.method,
        requestId: req.id,
      });
    } catch (auditError) {
      console.error("Audit log failed:", auditError.message);
    }

    return res.status(401).json({
      success: false,
      message: "Invalid signature format",
      code: "SIGNATURE_INVALID_FORMAT",
      requestId: req.id,
    });
  }

  // ✅ Check timestamp freshness (prevent replay attacks)
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS) {
    try {
      await logAudit(req, "signature_expired", {
        path: req.path,
        method: req.method,
        timestamp,
        requestId: req.id,
      });
    } catch (auditError) {
      console.error("Audit log failed:", auditError.message);
    }

    return res.status(401).json({
      success: false,
      message: "Request timestamp expired",
      code: "SIGNATURE_EXPIRED",
      requestId: req.id,
    });
  }

  // ✅ Skip body for multipart/form-data (photo uploads)
  if (req.is("multipart/form-data")) {
    return next();
  }

  // ✅ Calculate expected signature
  const bodyString = req.body ? stableStringify(req.body) : "";
  const payload = `${bodyString}|${timestamp}`;

  const expectedSignature = crypto
    .createHmac("sha256", API_SECRET)
    .update(payload)
    .digest("hex");

  // ✅ Timing-safe comparison with length check
  let valid = false;
  try {
    if (signature.length === expectedSignature.length) {
      valid = crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expectedSignature, "hex")
      );
    }
  } catch (error) {
    console.error("Signature comparison error:", error.message);
    valid = false;
  }

  if (!valid) {
    try {
      await logAudit(req, "signature_invalid", {
        path: req.path,
        method: req.method,
        providedSignature: signature.substring(0, 16) + "...",
        expectedSignature: expectedSignature.substring(0, 16) + "...",
        requestId: req.id,
      });
    } catch (auditError) {
      console.error("Audit log failed:", auditError.message);
    }

    return res.status(401).json({
      success: false,
      message: "Invalid request signature",
      code: "SIGNATURE_INVALID",
      requestId: req.id,
    });
  }

  next();
};
