import mongoose from "mongoose";
import AuditLog, { isHighSeverityAction } from "../models/AuditLog.js";
import {
  isSensitiveKey,
  MAX_AUDIT_METADATA_BYTES,
} from "../utils/sensitiveKeys.js";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
// SENSITIVE_KEYS lived here AND in the model and DRIFTED (vector #1). Redaction now
// comes from the shared `isSensitiveKey`; this file no longer owns a list.

const LOG_RATE_WINDOW = 60 * 1000; // 1 minute
const MAX_LOG_RATE = 100; // per‑bucket cap for ROUTINE (info‑level) events only

// ✅ VECTOR #2: high‑severity events are NEVER dropped by the per‑bucket cap (an
// attacker must not be able to spend a bucket to suppress a compromise signal).
// They ARE subject to a global alarm ceiling so a flood is visible (not silent,
// not unbounded): the per‑route edge rate‑limiters already 429 the requests that
// generate these events, so write volume stays bounded; this counter just screams
// if that assumption ever breaks.
const HIGH_SEV_GLOBAL_ALARM = 2000;

// ✅ VECTOR #3: metadata is converted to a real Map before insert so the model's
// duck‑typed redaction layer is GUARANTEED to run (a POJO could be left un‑cast).

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Deep redact sensitive information from an object using the SHARED predicate.
 * No per‑string truncation here — the model bounds strings to 500 in pre('save');
 * doing it twice with two numbers was drift bait. Depth guard + proto guard kept.
 */
const redactSensitiveData = (obj, depth = 0) => {
  if (depth > 10) return "[MAX_DEPTH]";
  if (!obj || typeof obj !== "object") return obj;

  const redacted = Array.isArray(obj) ? [] : {};
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    // ✅ defense‑in‑depth: never copy prototype‑pollution carriers (the model also
    // deletes them, but the logger's intermediate POJO shouldn't carry them either).
    if (key === "__proto__" || key === "constructor" || key === "prototype")
      continue;

    if (isSensitiveKey(key)) {
      redacted[key] = "[REDACTED]";
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      redacted[key] = redactSensitiveData(obj[key], depth + 1);
    } else {
      redacted[key] = obj[key];
    }
  }
  return redacted;
};

/**
 * Safely extract IP address, handling proxies and missing req objects.
 * NOTE: correct client‑IP attribution ultimately depends on Express `trust proxy`
 * being set to the real hop count (server.js/app.js — not in this file); if it is
 * mis‑configured, req.ip may be the proxy IP. We prefer req.ip (Express computes
 * it honoring trust proxy) and only fall back to XFF when req.ip is absent.
 */
const extractIp = (req) => {
  if (!req) return "unknown";
  if (req.ip) return req.ip;
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) {
    return typeof forwarded === "string"
      ? forwarded.split(",")[0].trim()
      : "unknown";
  }
  return req.connection?.remoteAddress || "unknown";
};

const extractUserAgent = (req) => {
  if (!req) return "unknown";
  if (typeof req.get === "function") return req.get("user-agent") || "unknown";
  return req.headers?.["user-agent"] || "unknown";
};

// Best‑effort correlation id (x-request-id is a common convention; null if absent).
const extractRequestId = (req) => {
  const id =
    req?.id || req?.requestId || req?.headers?.["x-request-id"] || null;
  return typeof id === "string" ? id.substring(0, 100) : null;
};

/**
 * Per‑bucket cap for ROUTINE events. Authed actors key by String(_id) (stable across
 * requests — the old code keyed by the ObjectId *instance*, which never accumulated);
 * anonymous actors key by IP (so a distributed flood gets per‑source rows instead of
 * collapsing into one shared "anonymous" ceiling that silently dropped them all).
 */
const checkLogRateLimit = (bucketKey) => {
  const key = bucketKey || "anonymous";
  const now = Date.now();
  const tracker = logRateTracker.get(key) || { count: 0, windowStart: now };
  if (now - tracker.windowStart > LOG_RATE_WINDOW) {
    tracker.count = 1;
    tracker.windowStart = now;
  } else {
    tracker.count++;
  }
  logRateTracker.set(key, tracker);
  return tracker.count <= MAX_LOG_RATE;
};

const logRateTracker = new Map();

// Global high‑severity window (module‑level; single‑process assumption — see notes).
let highSevWindowStart = Date.now();
let highSevCount = 0;
let highSevAlarmFired = false;

// Cleanup old per‑bucket rate entries every 5 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of logRateTracker.entries()) {
    if (now - data.windowStart > LOG_RATE_WINDOW) logRateTracker.delete(key);
  }
}, 5 * 60 * 1000);

// ═══════════════════════════════════════════
// MAIN LOGGER
// ═══════════════════════════════════════════

export const logAudit = async (req, action, metadata = {}) => {
  try {
    // ✅ Normalize metadata: a caller passing null / a primitive / a string would
    // otherwise make `for…in` or JSON.stringify behave oddly and store junk docs.
    if (!metadata || typeof metadata !== "object") metadata = {};

    // 1. Extract + VALIDATE the actor (kills the "anonymous" ObjectId cast crash).
    const rawUserId = req?.user?._id || metadata?.userId || null;
    const userId = isValidActorId(rawUserId) ? rawUserId : null;
    const coercedActor =
      rawUserId != null && userId === null
        ? String(rawUserId).slice(0, 100)
        : null;
    const email = req?.user?.email || metadata?.email || null;

    // 2. Network context hoisted ABOVE the rate check (needed for per‑IP bucketing).
    const ip = extractIp(req);
    const userAgent = extractUserAgent(req).substring(0, 500);
    const requestId = extractRequestId(req);

    // 3. ✅ VECTOR #2: severity‑aware rate limiting.
    const highSev = isHighSeverityAction(action);
    if (!highSev) {
      // Routine churn: per‑bucket cap, drop when exceeded (protects DB from bloat).
      const rateBucket = userId ? String(userId) : ip;
      if (!checkLogRateLimit(rateBucket)) {
        console.warn(
          `⚠️ Audit log rate limit exceeded for bucket ${rateBucket}`
        );
        return;
      }
    } else {
      // Compromise/abuse signal: NEVER dropped. Global alarm accounting only.
      const now = Date.now();
      if (now - highSevWindowStart > LOG_RATE_WINDOW) {
        highSevWindowStart = now;
        highSevCount = 0;
        highSevAlarmFired = false;
      }
      highSevCount++;
      if (highSevCount > HIGH_SEV_GLOBAL_ALARM && !highSevAlarmFired) {
        highSevAlarmFired = true;
        console.error(
          `🚨 High‑severity audit flood: ${highSevCount} in window — verify edge rate‑limiters cover the emitting routes`
        );
      }
    }

    // 4. Redact (shared predicate) + size‑guard. On overflow we keep the KEY NAMES
    // (forensic hint) instead of letting the model nuke the whole map to a placeholder.
    const safeMetadata = redactSensitiveData(metadata);
    let finalMetadata = safeMetadata;
    try {
      const metadataString = JSON.stringify(safeMetadata);
      if (metadataString.length > MAX_AUDIT_METADATA_BYTES) {
        finalMetadata = {
          _truncated: true,
          _warning: "Metadata exceeded 10KB and was reduced to its key names",
          keys: Object.keys(safeMetadata).slice(0, 20),
        };
      }
    } catch {
      finalMetadata = {
        _error:
          "Metadata contained circular references and could not be serialized",
      };
    }
    // Preserve the coerced raw actor across EVERY metadata shape, so a dropped‑to‑null
    // userId never loses the "who" for forensics.
    if (
      coercedActor &&
      finalMetadata &&
      typeof finalMetadata === "object" &&
      !Array.isArray(finalMetadata)
    ) {
      finalMetadata.actor = coercedActor;
    }

    // 5. ✅ VECTOR #3: hand the model a REAL Map so its duck‑typed redaction always runs.
    const metadataMap = new Map(
      Object.entries(
        finalMetadata &&
          typeof finalMetadata === "object" &&
          !Array.isArray(finalMetadata)
          ? finalMetadata
          : {}
      )
    );

    // 6. Insert. Keep the .catch (a DB hiccup must never 500 the request path) but make
    // the failure observable + bounded (Mongoose validation messages can echo the
    // offending value, so slice it; the actor is already coerced so the common cast
    // text is gone, but stay defensive).
    await AuditLog.create({
      userId,
      email,
      action,
      ip,
      userAgent,
      requestId,
      metadata: metadataMap,
    }).catch((dbErr) => {
      console.error(
        "Audit log DB insert failed:",
        String(dbErr?.message).slice(0, 300),
        {
          action,
          userId,
          ip,
        }
      );
    });
  } catch (err) {
    console.error("Audit log preparation failed:", err.message);
  }
};

const isValidActorId = (v) => {
  if (v == null) return false;
  try {
    return mongoose.Types.ObjectId.isValid(v);
  } catch {
    return false;
  }
};
