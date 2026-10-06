import crypto from "crypto";

const HIBP_API_BASE = "https://api.pwnedpasswords.com/range/";
const REQUEST_TIMEOUT = 5000;
// Business logic: Allow passwords breached < 10 times (reduces false positives for slight variations)
const MAX_BREACH_COUNT = 10;

/**
 * Check if password has been breached using HIBP k-Anonymity API.
 * Password never leaves server — only first 5 chars of SHA-1 hash sent.
 */
export const checkPasswordBreach = async (password) => {
  try {
    if (!password || typeof password !== "string") {
      return { breached: false, count: 0, error: null };
    }

    // HIBP strictly requires SHA-1
    const hash = crypto
      .createHash("sha1")
      .update(password)
      .digest("hex")
      .toUpperCase();

    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(`${HIBP_API_BASE}${prefix}`, {
        headers: {
          // HIBP requires a descriptive User-Agent
          "User-Agent": "MayaMilan-DatingApp (Node.js)",
          // Add-Padding prevents HIBP from guessing the exact password based on response size
          "Add-Padding": "true",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn(`HIBP API error: ${response.status}`);
        return {
          breached: false,
          count: 0,
          error: `HIBP API returned ${response.status}`,
        };
      }

      const text = await response.text();
      const lines = text.split("\n");

      // Find the exact suffix match
      const match = lines.find((line) => line.startsWith(suffix));

      if (!match) {
        return { breached: false, count: 0, error: null };
      }

      // Parse count (parseInt safely handles trailing \r from Windows line endings)
      const count = parseInt(match.split(":")[1], 10) || 0;

      return {
        breached: count > MAX_BREACH_COUNT,
        count,
        error: null,
      };
    } finally {
      // ✅ FIX: Guarantee timer cleanup regardless of success, network error, or parsing error
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // ✅ FIX: Differentiate timeout from network errors for better logging
    const isTimeout = error.name === "AbortError";
    const errorMsg = isTimeout ? "HIBP API request timed out" : error.message;

    console.warn("Password breach check failed:", errorMsg);

    // Fail open: Don't block user registration if HIBP is down
    return { breached: false, count: 0, error: errorMsg };
  }
};

export const getBreachMessage = (count) => {
  // ✅ FIX: Simplified redundant check
  if (!count || count < 10) return null;

  if (count < 100) {
    return `This password has appeared in ${count} data breaches. Please choose a stronger, unique password.`;
  }
  if (count < 1000) {
    return `This password appeared in ${count} data breaches and is widely known. Please choose another.`;
  }
  return `This password appeared in ${count.toLocaleString()} data breaches. It is extremely unsafe — please choose another.`;
};
