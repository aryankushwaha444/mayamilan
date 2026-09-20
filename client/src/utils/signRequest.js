// ✅ Use Web Crypto API (works in all browsers)
const API_SECRET = import.meta.env.VITE_API_SECRET;

/**
 * Deterministically stringify (must match server)
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
 * Endpoints that require signing (must match server routes)
 */
const SIGNED_ENDPOINTS = [
  "/auth/login/2fa",
  "/auth/oauth/2fa",
  "/auth/reactivate",
  "/auth/change-password",
  "/auth/reset-password",
  "/auth/sessions/",
  "/auth/sessions/revoke-others",
  "/2fa/verify-setup",
  "/2fa/disable",
  "/2fa/regenerate-backup-codes",
  "/users/",
  "/users/me/photos/",
  "/users/report",
];

/**
 * Check if a URL should be signed
 */
const shouldSign = (url, method) => {
  if (!API_SECRET) return false;
  if (method === "GET") return false;
  return SIGNED_ENDPOINTS.some((endpoint) => url.includes(endpoint));
};

/**
 * Sign a request using HMAC-SHA256
 */
export const signRequest = async (config) => {
  if (!shouldSign(config.url, config.method)) {
    return config;
  }

  try {
    const timestamp = Date.now();
    const bodyString = config.data ? stableStringify(config.data) : "";
    const payload = `${bodyString}|${timestamp}`;

    // ✅ Use Web Crypto API (async, browser-native)
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

    // Convert to hex string
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Attach to headers
    config.headers = config.headers || {};
    config.headers["X-Signature"] = signature;
    config.headers["X-Timestamp"] = timestamp.toString();
  } catch (err) {
    console.warn("Request signing failed:", err.message);
    // Continue without signature (server will reject)
  }

  return config;
};
