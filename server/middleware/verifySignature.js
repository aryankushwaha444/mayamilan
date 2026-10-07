import crypto from "crypto";
import { logAudit } from "../utils/auditLogger.js";

// ═══════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════
const API_SECRET = process.env.API_SECRET;
const ENFORCE = process.env.SIGNATURE_ENFORCE === "1";
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes
const CANONICAL_VERSION = "v1";

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const safeLogAudit = async (req, action, metadata) => {
  try {
    await logAudit(req, action, metadata);
  } catch {
    // Silent failure - audit logging shouldn't block responses
  }
};

/**
 * Canonical JSON stringifier.
 * SOURCE OF TRUTH: client signRequest.js MUST produce byte-identical output.
 */
const stableStringify = (obj) => {
  if (obj === null) return "null";
  if (obj === undefined) return undefined;

  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number") {
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
      if (v !== undefined) {
        pairs.push(`${JSON.stringify(k)}:${v}`);
      }
    }
    return `{${pairs.join(",")}}`;
  }

  return "";
};

const isValidHex = (str) => {
  return typeof str === "string" && /^[a-fA-F0-9]+$/.test(str);
};

const deriveSigningKey = (sessionId) => {
  if (!API_SECRET || !sessionId) return null;
  return crypto
    .createHmac("sha256", API_SECRET)
    .update(`maya-milan:signing:v1:${String(sessionId)}`)
    .digest("hex");
};

// ═══════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════

export const verifySignature = async (req, res, next) => {
  const requestId = req.requestId || req.id;

  // GET/HEAD and multipart are authenticated by JWT+device alone.
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.is("multipart/form-data")
  ) {
    return next();
  }

  const fail = async (status, code, message, action, meta = {}) => {
    await safeLogAudit(req, action, {
      path: req.path,
      method: req.method,
      requestId,
      ...meta,
    });

    // ✅ Shadow mode: log but allow, so deploying before client mirror is safe.
    if (!ENFORCE) return next();

    return res.status(status).json({
      success: false,
      message,
      code,
      requestId,
    });
  };

  if (ENFORCE && (!API_SECRET || String(API_SECRET).length < 32)) {
    return res.status(500).json({
      success: false,
      message: "Server configuration error",
      code: "SERVER_CONFIG_ERROR",
      requestId,
    });
  }

  const signature = req.headers["x-signature"];
  const timestamp = req.headers["x-timestamp"];
  const clientRequestId = req.headers["x-request-id"];

  if (!signature || !timestamp) {
    return fail(
      401,
      "SIGNATURE_MISSING",
      "Request signature required",
      "signature_missing"
    );
  }

  if (!isValidHex(signature)) {
    return fail(
      401,
      "SIGNATURE_INVALID_FORMAT",
      "Invalid signature format",
      "signature_invalid_format"
    );
  }

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS) {
    return fail(
      401,
      "SIGNATURE_EXPIRED",
      "Request timestamp expired",
      "signature_expired"
    );
  }

  const sessionId = req.authContext?.sessionId;
  if (!sessionId) {
    return fail(
      401,
      "SIGNATURE_NO_SESSION",
      "No session context for signature",
      "signature_no_session"
    );
  }

  const key = deriveSigningKey(sessionId);
  if (!key) {
    return fail(
      401,
      "SIGNATURE_NO_KEY",
      "Signing key unavailable for session",
      "signature_no_key"
    );
  }

  const rid = String(clientRequestId || requestId || "").slice(0, 128);
  if (!rid) {
    return fail(
      401,
      "SIGNATURE_NO_REQUEST_ID",
      "Request id required for signature",
      "signature_no_request_id"
    );
  }

  const bodyString =
    req.body && Object.keys(req.body).length > 0
      ? stableStringify(req.body)
      : "";

  // Canonical payload:
  // v1|timestamp|requestId|canonicalBody
  const payloadString = `${CANONICAL_VERSION}|${timestamp}|${rid}|${bodyString}`;

  const expectedSignature = crypto
    .createHmac("sha256", key)
    .update(payloadString)
    .digest("hex");

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
    return fail(
      401,
      "SIGNATURE_INVALID",
      "Invalid request signature",
      "signature_invalid",
      {
        providedPrefix: signature.substring(0, 8),
      }
    );
  }

  next();
};

export default verifySignature;
