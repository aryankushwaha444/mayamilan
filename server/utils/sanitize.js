import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";

const window = new JSDOM("").window;
const purify = DOMPurify(window);

/**
 * Sanitize user input - strip ALL HTML tags
 * Prevents XSS attacks by removing <script>, onclick, javascript:, etc.
 */
export const sanitize = (input) => {
  if (typeof input !== "string") return input;

  return purify.sanitize(input.trim(), {
    ALLOWED_TAGS: [], // Strip ALL HTML - your app renders plain text
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
};

/**
 * Sanitize URLs - prevent javascript: and data: protocol attacks
 */
export const sanitizeUrl = (url) => {
  if (!url || typeof url !== "string") return "";

  const trimmed = url.trim().toLowerCase();

  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("vbscript:")
  ) {
    return "";
  }

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return "";
  }

  return purify.sanitize(url.trim());
};
