/**
 * Secure request signing using per-session HMAC keys.
 *
 * SECURITY MODEL:
 * - Signing key is issued at login/refresh by the server
 * - Stored ONLY in JavaScript memory (never localStorage/sessionStorage)
 * - Rotated on every token refresh
 * - Cleared on logout, tab close detection, or auth failure
 * - An attacker extracting the JS bundle finds NO secrets
 */

// ✅ In-memory only — never persisted to disk
let signingKey = null;

/**
 * Set the signing key after login or token refresh.
 * Called by AuthContext when receiving auth responses.
 * @param {string} key - HMAC key (SHA-256 hash issued by server)
 */
export const setSigningKey = (key) => {
  signingKey = key;
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
// CANONICAL SERIALIZATION
// ═══════════════════════════════════════════

/**
 * Deterministically stringify for HMAC signing.
 * MUST produce identical output to server's canonicalStringify.
 */
const stableStringify = (obj) => {
  if (obj === null || obj === undefined) return "";
  if (obj instanceof Date) return obj.toISOString();
  if (obj instanceof RegExp) return obj.toString();
  if (typeof obj !== "object") return String(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  if (obj instanceof FormData || obj instanceof Blob || obj instanceof File) return "";

  const keys = Object.keys(obj).sort();
  const pairs = [];
  for (const k of keys) {
    if (obj[k] === undefined) continue;
    pairs.push(`${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  }
  return `{${pairs.join(",")}}`;
};

// ═══════════════════════════════════════════
// ENDPOINT CONFIGURATION
// ═══════════════════════════════════════════

const SIGNED_ENDPOINTS = [
  "/auth/login/2fa",
  "/auth/oauth/2fa",
  "/auth/reactivate",
  "/auth/change-password",
  "/auth/reset-password",
  "/auth/forgot-password",
  "/auth/sessions",
  "/2fa/verify-setup",
  "/2fa/disable",
  "/2fa/regenerate-backup-codes",
  "/users/",
];

const SKIP_SIGNING_ENDPOINTS = [
  "/messages/",
];

const shouldSign = (url, method, data) => {
  if (!signingKey) return false;
  if (!url) return false;
  if (method?.toUpperCase() === "GET") return false;
  if (data instanceof FormData) return false;
  if (SKIP_SIGNING_ENDPOINTS.some((ep) => url.includes(ep))) return false;
  return SIGNED_ENDPOINTS.some((ep) => url.includes(ep));
};

// ═══════════════════════════════════════════
// UUID FALLBACK
// ═══════════════════════════════════════════

const generateId = () => {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
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
  if (!shouldSign(config.url, config.method, config.data)) {
    return config;
  }

  try {
    const timestamp = Date.now();
    const bodyString = config.data ? stableStringify(config.data) : "";
    const payload = `${bodyString}|${timestamp}`;

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

    config.headers = config.headers || {};
    config.headers["X-Signature"] = signature;
    config.headers["X-Timestamp"] = timestamp.toString();
    config.headers["X-Request-ID"] = config.headers["X-Request-ID"] || generateId();
  } catch {
    // Silent failure — server rejects with signature error
  }

  return config;
};