import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";

// Initialize once at module load (Singleton)
const window = new JSDOM("").window;
const purify = DOMPurify(window);

// ✅ ADDED: Maximum input length to prevent ReDoS and memory exhaustion
const MAX_INPUT_LENGTH = 10000;
const MAX_URL_LENGTH = 2048;

// ✅ ADDED: Unicode normalization to prevent homograph attacks
const normalizeUnicode = (str) => {
  return str.normalize("NFC");
};

/**
 * Sanitize user input - strip ALL HTML tags and decode entities.
 * Prevents XSS attacks by removing <script>, onclick, javascript:, etc.
 *
 * ⚠️ FRONTEND REQUIREMENT: The output of this function must be rendered
 * as plain text (e.g., React {text} or Vue {{ text }}).
 * Do NOT render it using dangerouslySetInnerHTML or v-html.
 */
export const sanitize = (input) => {
  if (input === null || input === undefined) return "";
  if (typeof input !== "string") return String(input);

  // ✅ ADDED: Length limit to prevent ReDoS and memory exhaustion
  let clean = input.substring(0, MAX_INPUT_LENGTH);

  // ✅ ADDED: Normalize Unicode to prevent homograph attacks
  clean = normalizeUnicode(clean);

  // ✅ ADDED: Remove zero-width characters (invisible Unicode)
  clean = clean.replace(/[\u200B-\u200D\uFEFF]/g, "");

  // 1. Strip all HTML tags safely
  clean = purify.sanitize(clean, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });

  // 2. Decode common HTML entities so they display correctly in plain-text UI
  clean = clean
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");

  // ✅ ADDED: Remove control characters except newlines and tabs
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return clean.trim();
};

/**
 * Sanitize URLs - prevent javascript:, data:, and vbscript: protocol attacks.
 * Uses the native URL API to prevent whitespace bypasses (e.g., "java\nscript:").
 */
export const sanitizeUrl = (url) => {
  if (!url || typeof url !== "string") return "";

  // ✅ ADDED: Length limit
  if (url.length > MAX_URL_LENGTH) return "";

  // Strip whitespace and control characters to prevent protocol bypasses
  const cleanUrl = url.replace(/[\s\x00-\x1F\x7F]/g, "").trim();

  if (!cleanUrl) return "";

  try {
    const parsed = new URL(cleanUrl);

    // Only allow safe web protocols
    const allowedProtocols = ["http:", "https:"];
    if (!allowedProtocols.includes(parsed.protocol)) {
      return "";
    }

    // ✅ ADDED: Block localhost and private IPs to prevent SSRF
    const hostname = parsed.hostname.toLowerCase();
    const blockedPatterns = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "169.254.169.254", // AWS/GCP/Azure metadata endpoint
      "metadata.google.internal",
      ".local",
      ".internal",
    ];

    if (blockedPatterns.some((pattern) => hostname.includes(pattern))) {
      return "";
    }

    // ✅ ADDED: Block private IP ranges
    if (
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)
    ) {
      return "";
    }

    // Return the normalized, safe URL
    return parsed.href;
  } catch {
    // Invalid URL format
    return "";
  }
};

/**
 * ✅ ADDED: Sanitize email to prevent header injection
 */
export const sanitizeEmail = (email) => {
  if (!email || typeof email !== "string") return "";

  const clean = email.trim().toLowerCase();

  // Remove control characters and newlines (prevent header injection)
  if (/[\r\n]/.test(clean)) return "";

  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return "";

  return clean;
};

/**
 * ✅ ADDED: Sanitize filename to prevent path traversal
 */
export const sanitizeFilename = (filename) => {
  if (!filename || typeof filename !== "string") return "file";

  // Remove path traversal attempts
  let clean = filename
    .replace(/\.\./g, "")
    .replace(/[\/\\]/g, "_")
    .replace(/[<>:"|?*]/g, "_");

  // Limit length
  clean = clean.substring(0, 100);

  // Ensure it has an extension
  if (!clean.includes(".")) {
    clean += ".txt";
  }

  return clean;
};
