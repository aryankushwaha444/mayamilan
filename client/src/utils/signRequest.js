// ✅ Use Web Crypto API (works in all modern browsers)
const API_SECRET = import.meta.env.VITE_API_SECRET;

/**
 * Deterministically stringify (must match server exactly)
 */
const stableStringify = (obj) => {
  if (obj === null || obj === undefined) return "";

  // ✅ Handle Date objects (convert to ISO string)
  if (obj instanceof Date) {
    return obj.toISOString();
  }

  // ✅ Handle RegExp
  if (obj instanceof RegExp) {
    return obj.toString();
  }

  if (typeof obj !== "object") return String(obj);

  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(",")}]`;
  }

  // ✅ Skip FormData, Blob, File - they can't be serialized
  if (obj instanceof FormData || obj instanceof Blob || obj instanceof File) {
    return "";
  }

  const keys = Object.keys(obj).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`
  );
  return `{${pairs.join(",")}}`;
};

/**
 * Endpoints that require signing
 * ✅ Cleaned up: removed redundant overlaps
 * Order: most-specific patterns first (for readability)
 */
const SIGNED_ENDPOINTS = [
  // Auth sensitive
  "/auth/login/2fa",
  "/auth/oauth/2fa",
  "/auth/reactivate",
  "/auth/change-password",
  "/auth/reset-password",
  "/auth/forgot-password",
  "/auth/sessions",

  // 2FA management
  "/2fa/verify-setup",
  "/2fa/disable",
  "/2fa/regenerate-backup-codes",

  // User actions (broad - covers profile, photos, reports, blocks)
  "/users/",
];

/**
 * Endpoints that are NEVER signed (overrides SIGNED_ENDPOINTS)
 * ✅ FormData uploads can't be reliably signed - server uses file validation instead
 */
const SKIP_SIGNING_ENDPOINTS = [
  "/messages/", // chat attachments
];

/**
 * Check if a URL should be signed
 */
const shouldSign = (url, method, data) => {
  // ✅ Safety: no secret = no signing
  if (!API_SECRET) {
    console.error(
      "❌ VITE_API_SECRET not configured - request signing disabled"
    );
    return false;
  }

  // ✅ Safety: no URL = no signing
  if (!url) return false;

  // ✅ GET requests don't need signing (no mutations)
  if (method?.toUpperCase() === "GET") return false;

  // ✅ FormData can't be reliably signed - skip
  if (data instanceof FormData) return false;

  // ✅ Check skip list first
  if (SKIP_SIGNING_ENDPOINTS.some((endpoint) => url.includes(endpoint))) {
    return false;
  }

  // ✅ Then check sign list
  return SIGNED_ENDPOINTS.some((endpoint) => url.includes(endpoint));
};

/**
 * Sign a request using HMAC-SHA256
 * Payload format: `${body}|${timestamp}`
 * Header names must match server's verifySignature middleware exactly
 */
export const signRequest = async (config) => {
  if (!shouldSign(config.url, config.method, config.data)) {
    return config;
  }

  try {
    const timestamp = Date.now();
    const bodyString = config.data ? stableStringify(config.data) : "";
    const payload = `${bodyString}|${timestamp}`;

    // ✅ Web Crypto API (async, browser-native, no deps)
    const encoder = new TextEncoder();
    const keyData = encoder.encode(API_SECRET);
    const payloadData = encoder.encode(payload);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      payloadData
    );

    // Convert to lowercase hex (must match server)
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // ✅ Attach headers (names must match server exactly)
    config.headers = config.headers || {};
    config.headers["X-Signature"] = signature;
    config.headers["X-Timestamp"] = timestamp.toString();

    // ✅ Add request ID for debugging
    config.headers["X-Request-ID"] =
      config.headers["X-Request-ID"] || crypto.randomUUID();
  } catch (err) {
    // ✅ Don't silently continue - log clearly so devs can debug
    console.error("❌ Request signing failed:", err);
    // We still continue - server will reject with 401, giving a clear error
  }

  return config;
};
