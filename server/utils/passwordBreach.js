// server/utils/passwordBreach.js
import crypto from "crypto";

const HIBP_API_BASE = "https://api.pwnedpasswords.com/range/";
const REQUEST_TIMEOUT = 5000;
const MAX_BREACH_COUNT = 10;

/**
 * Check if password has been breached using HIBP k-Anonymity API
 * Password never leaves server — only first 5 chars of SHA-1 hash sent
 */
export const checkPasswordBreach = async (password) => {
  try {
    if (!password || typeof password !== "string") {
      return { breached: false, count: 0, error: null };
    }

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
          "User-Agent": "MayaMilan-DatingApp",
          "Add-Padding": "true",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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
      const match = lines.find((line) => line.startsWith(suffix));

      if (!match) {
        return { breached: false, count: 0, error: null };
      }

      const count = parseInt(match.split(":")[1], 10);
      return {
        breached: count > MAX_BREACH_COUNT,
        count,
        error: null,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.warn("HIBP API request failed:", fetchError.message);
      return { breached: false, count: 0, error: fetchError.message };
    }
  } catch (error) {
    console.error("Password breach check failed:", error.message);
    return { breached: false, count: 0, error: error.message };
  }
};

export const getBreachMessage = (count) => {
  if (count === 0 || count < 10) return null;
  if (count < 100) {
    return `This password has appeared in ${count} data breaches. Please choose a stronger, unique password.`;
  }
  if (count < 1000) {
    return `This password appeared in ${count} data breaches and is widely known. Please choose another.`;
  }
  return `This password appeared in ${count.toLocaleString()} data breaches. It is extremely unsafe — please choose another.`;
};
