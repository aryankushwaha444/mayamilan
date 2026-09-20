import crypto from "crypto";
import { logAudit } from "../utils/auditLogger.js";

const SIGNATURE_WINDOW_MS = parseInt(
  process.env.REQUEST_SIGNATURE_WINDOW_MS || "300000",
  10
);

/**
 * Deterministically stringify body (sort keys so order doesn't matter)
 */
const stableStringify = (obj) => {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") return String(obj);
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
 * Verify request signature middleware
 * Apply ONLY to critical endpoints (not all routes)
 */
export const verifySignature = (req, res, next) => {
  try {
    const signature = req.headers["x-signature"];
    const timestamp = req.headers["x-timestamp"];
    const apiSecret = process.env.API_SECRET;

    // Must have secret configured
    if (!apiSecret || apiSecret.length < 64) {
      console.error("❌ API_SECRET not configured or too short");
      return res.status(500).json({
        success: false,
        message: "Server configuration error",
      });
    }

    // Must have signature headers
    if (!signature || !timestamp) {
      return res.status(401).json({
        success: false,
        message: "Request signature required",
        signatureMissing: true,
      });
    }

    // Parse timestamp
    const ts = parseInt(timestamp, 10);
    if (Number.isNaN(ts)) {
      return res.status(401).json({
        success: false,
        message: "Invalid timestamp",
      });
    }

    // Check timestamp freshness (5 min window)
    const age = Math.abs(Date.now() - ts);
    if (age > SIGNATURE_WINDOW_MS) {
      logAudit(req, "signature_rejected", {
        reason: "timestamp_expired",
        age,
        path: req.path,
      }).catch(() => {});

      return res.status(401).json({
        success: false,
        message: "Request expired. Please refresh the page and try again.",
        signatureExpired: true,
      });
    }

    // Build signed payload: body + timestamp
    // Must match what client signed
    const bodyString = req.body ? stableStringify(req.body) : "";
    const payload = `${bodyString}|${ts}`;

    // Compute expected signature
    const expected = crypto
      .createHmac("sha256", apiSecret)
      .update(payload)
      .digest("hex");

    // ✅ Timing-safe comparison (prevents timing attacks)
    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      logAudit(req, "signature_rejected", {
        reason: "signature_invalid",
        path: req.path,
        ip: req.ip,
      }).catch(() => {});

      return res.status(401).json({
        success: false,
        message:
          "Invalid request signature. Request may have been tampered with.",
        signatureInvalid: true,
      });
    }

    next();
  } catch (error) {
    console.error("Signature verification error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Signature verification failed",
    });
  }
};
