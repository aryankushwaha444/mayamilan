// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const REQUEST_TIMEOUT_MS = 5000; // 5 seconds

// ✅ ADDED: Token length limits to prevent abuse
const MIN_TOKEN_LENGTH = 100;
const MAX_TOKEN_LENGTH = 10000;

/**
 * Verify Cloudflare Turnstile token
 *
 * @param {string} token - The Turnstile response token from the client
 * @param {string} ip - The user's IP address (optional, for Cloudflare analytics)
 * @param {string} expectedAction - The expected action (e.g., 'login', 'register') to prevent cross-action replay
 * @param {string} expectedCData - Custom data passed during token generation to prevent cross-site replay
 * @returns {Promise<boolean>} True if valid, false if bot/invalid/error
 */
export const verifyTurnstile = async (
  token,
  ip,
  expectedAction = null,
  expectedCData = null
) => {
  // 1. Skip verification if disabled (for local testing)
  if (process.env.TURNSTILE_ENABLED !== "true") {
    if (process.env.NODE_ENV === "development") {
      console.log("⚠️  Turnstile disabled — skipping verification");
    }
    return true;
  }

  // 2. Validate secret exists (Fail fast if misconfigured)
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) {
    console.error("❌ TURNSTILE_SECRET is missing in environment variables");
    return false;
  }

  // 3. ✅ IMPROVED: Validate token format with length checks
  if (!token || typeof token !== "string") {
    return false;
  }

  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
    console.warn(`❌ Turnstile token length invalid: ${token.length}`);
    return false;
  }

  // ✅ ADDED: Basic token format validation (should be alphanumeric with some special chars)
  if (!/^[A-Za-z0-9._-]+$/.test(token)) {
    console.warn("❌ Turnstile token contains invalid characters");
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secret);
    formData.append("response", token);
    if (ip) formData.append("remoteip", ip);

    // Add AbortController to prevent infinite hanging if Cloudflare is slow
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Explicitly check HTTP status before parsing JSON
    if (!res.ok) {
      console.warn(`❌ Turnstile API returned HTTP ${res.status}`);
      return false; // Fail closed on Cloudflare server errors
    }

    const data = await res.json();

    if (!data.success) {
      console.warn("❌ Turnstile verification failed:", {
        errors: data["error-codes"],
      });
      return false;
    }

    // ✅ ADDED: Verify hostname to prevent cross-site token reuse
    if (data.hostname && process.env.SITE_URL) {
      try {
        const expectedHost = new URL(process.env.SITE_URL).hostname;
        if (data.hostname !== expectedHost) {
          console.warn(
            `❌ Turnstile hostname mismatch. Expected: ${expectedHost}, Got: ${data.hostname}`
          );
          return false;
        }
      } catch (urlError) {
        // If SITE_URL is invalid, skip hostname check
      }
    }

    // Verify Action (Prevents Cross-Action Replay Attacks)
    // E.g., Ensures a token generated for "login" can't be used for "password-reset"
    if (expectedAction && data.action !== expectedAction) {
      console.warn(
        `❌ Turnstile action mismatch. Expected: ${expectedAction}, Got: ${data.action}`
      );
      return false;
    }

    // Verify Custom Data (Prevents Cross-Site Replay Attacks)
    if (expectedCData && data.cdata !== expectedCData) {
      console.warn(
        `❌ Turnstile cdata mismatch. Expected: ${expectedCData}, Got: ${data.cdata}`
      );
      return false;
    }

    return true;
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("❌ Turnstile verification timed out (5s)");
    } else {
      console.error("❌ Turnstile verification network error:", error.message);
    }

    // Fails CLOSED in production (secure: blocks login if CF is down).
    // Fails OPEN in dev (convenience: allows login if CF is down).
    return process.env.NODE_ENV !== "production";
  }
};
