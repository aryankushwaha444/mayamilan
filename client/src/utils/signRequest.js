/**
 * Secure request signing using per-session HMAC keys.
 *
 * SECURITY MODEL:
 * - Signing key is issued at login/refresh by the server
 * - Stored ONLY in JavaScript memory (never localStorage/sessionStorage)
 * - Rotated / refreshed with the session
 * - Cleared on logout, tab close detection, or auth failure
 * - An attacker extracting the JS bundle finds NO secrets
 *
 * CANONICAL PAYLOAD (must match server/middleware/verifySignature.js):
 *   v1|timestamp|requestId|canonicalBody
 */

// ✅ In-memory only — never persisted to disk
let signingKey = null;

const CANONICAL_VERSION = "v1";
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Set the signing key after login or token refresh.
 * Called by AuthContext / api.js when receiving auth responses.
 * @param {string} key - HMAC key issued by server
 */
export const setSigningKey = (key) => {
  signingKey =
    typeof key === "string" && key.length >= 16 && key.length <= 256
      ? key
      : null;
};

/**
 * Clear the signing key on logout or auth failure.
 */
export const clearSigningKey = () => {
  signingKey = null;
};

/**
 * Get current signing key status (for debugging only)
 * @returns {boolean}
 */
export const hasSigningKey = () => !!signingKey;

// ═══════════════════════════════════════════
// SAFE HEADER HELPERS (AxiosHeaders or plain object)
// ═══════════════════════════════════════════

const getHeader = (headers, name) => {
  if (!headers) return undefined;
  if (typeof headers.get === "function") return headers.get(name);
  return headers[name] ?? headers[String(name).toLowerCase()];
};

const setHeader = (headers, name, value) => {
  if (!headers) return;
  if (typeof headers.set === "function") {
    headers.set(name, value);
    return;
  }
  headers[name] = value;
};

// ═══════════════════════════════════════════
// BINARY / UNSIGNABLE DATA DETECTION
// ═══════════════════════════════════════════

const isBinaryLike = (data) => {
  if (!data || typeof data !== "object") return false;

  try {
    if (typeof FormData !== "undefined" && data instanceof FormData)
      return true;
  } catch {}

  try {
    if (typeof Blob !== "undefined" && data instanceof Blob) return true;
  } catch {}

  try {
    if (
      typeof ArrayBuffer !== "undefined" &&
      (data instanceof ArrayBuffer || ArrayBuffer.isView(data))
    )
      return true;
  } catch {}

  try {
    if (typeof ReadableStream !== "undefined" && data instanceof ReadableStream)
      return true;
  } catch {}

  return false;
};

// ═══════════════════════════════════════════
// CANONICAL SERIALIZATION
// MUST match server stableStringify byte-for-byte.
// ═══════════════════════════════════════════

const stableStringify = (obj) => {
  if (obj === null) return "null";
  if (obj === undefined) return undefined;

  if (typeof obj === "function" || typeof obj === "symbol") return undefined;
  if (typeof obj === "bigint") return undefined;

  if (typeof obj === "string") return JSON.stringify(obj);

  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) return "null";
    return String(obj);
  }

  if (typeof obj === "boolean") return String(obj);

  // Mirror JSON.stringify().toJSON() behavior before treating as object.
  if (obj && typeof obj.toJSON === "function") {
    try {
      return stableStringify(obj.toJSON());
    } catch {
      return undefined;
    }
  }

  if (obj instanceof Date) return JSON.stringify(obj.toISOString());

  if (Array.isArray(obj)) {
    return `[${obj.map((v) => stableStringify(v) ?? "null").join(",")}]`;
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    const pairs = [];

    for (const k of keys) {
      const v = stableStringify(obj[k]);
      // Drop undefined exactly like JSON.stringify does.
      if (v !== undefined) {
        pairs.push(`${JSON.stringify(k)}:${v}`);
      }
    }

    return `{${pairs.join(",")}}`;
  }

  return "";
};

const urlSearchParamsToObject = (params) => {
  const obj = {};

  params.forEach((value, key) => {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (Array.isArray(obj[key])) {
        obj[key].push(value);
      } else {
        obj[key] = [obj[key], value];
      }
    } else {
      obj[key] = value;
    }
  });

  return obj;
};

/**
 * Convert request data to the exact body string the server will canonicalize.
 * Returns null when the payload is unsignable (binary / FormData).
 */
const bodyToString = (data) => {
  if (data === undefined || data === null) return "";

  if (isBinaryLike(data)) return null;

  if (
    typeof URLSearchParams !== "undefined" &&
    data instanceof URLSearchParams
  ) {
    return bodyToString(urlSearchParamsToObject(data));
  }

  if (typeof data === "string") {
    if (data.length === 0) return "";

    // If axios was given a pre-serialized JSON string, mirror what the server
    // will see after Express JSON parsing.
    try {
      const parsed = JSON.parse(data);
      return bodyToString(parsed);
    } catch {
      return stableStringify(data);
    }
  }

  if (typeof data === "object") {
    if (Array.isArray(data)) {
      return data.length === 0 ? "" : stableStringify(data);
    }

    const serialized = stableStringify(data);

    // Server treats empty object as "" because Object.keys(req.body).length === 0.
    if (!serialized || serialized === "{}") return "";

    return serialized;
  }

  // Primitives like number / boolean are not valid JSON object bodies in this app.
  // Server's `req.body && Object.keys(req.body).length > 0` evaluates to false.
  return "";
};

// ═══════════════════════════════════════════
// ENDPOINT CONFIGURATION
// ═══════════════════════════════════════════

// Only sign authenticated mutation endpoints that the server verifies.
// Pre-session endpoints must NOT be signed because they have no session context.
const SIGNED_ENDPOINTS = [
  "/auth/change-password",
  "/auth/sessions",
  "/2fa/verify-setup",
  "/2fa/disable",
  "/2fa/regenerate-backup-codes",
  "/users/",
];

const SKIP_SIGNING_ENDPOINTS = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/auth/reactivate",
  "/auth/send-otp",
  "/auth/verify-otp",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/oauth/2fa",
  "/messages/",
];

const shouldSign = (config) => {
  if (!signingKey) return false;
  if (!config?.url) return false;

  const method = String(config.method || "get").toUpperCase();
  if (!MUTATION_METHODS.has(method)) return false;

  if (isBinaryLike(config.data)) return false;

  const url = String(config.url);

  if (SKIP_SIGNING_ENDPOINTS.some((ep) => url.includes(ep))) return false;

  return SIGNED_ENDPOINTS.some((ep) => url.includes(ep));
};

// ═══════════════════════════════════════════
// REQUEST ID FALLBACK
// ═══════════════════════════════════════════

const generateId = () => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {}

  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
};

// ═══════════════════════════════════════════
// REQUEST SIGNER
// ═══════════════════════════════════════════

/**
 * Sign an axios request config using HMAC-SHA256.
 * @param {Object} config - Axios request config
 * @returns {Promise<Object>} Config with signature headers
 */
export const signRequest = async (config) => {
  if (!shouldSign(config)) {
    return config;
  }

  try {
    const bodyString = bodyToString(config.data);
    if (bodyString === null) return config;

    const headers = config.headers || {};
    config.headers = headers;

    const timestamp = Date.now();
    const rawRequestId = getHeader(headers, "X-Request-ID") || generateId();
    const requestId = String(rawRequestId).slice(0, 128);

    setHeader(headers, "X-Request-ID", requestId);
    setHeader(headers, "X-Timestamp", String(timestamp));

    // ✅ Exact server canonical payload:
    // v1|timestamp|requestId|canonicalBody
    const payload = `${CANONICAL_VERSION}|${timestamp}|${requestId}|${bodyString}`;

    const encoder = new TextEncoder();

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signingKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      encoder.encode(payload)
    );

    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    setHeader(headers, "X-Signature", signature);
  } catch {
    // Silent failure — server rejects with signature error when enforcement is on.
  }

  return config;
};
