import DOMPurify from "dompurify";

/**
 * SECURITY: Strips ALL HTML tags. Use for short text (names, subjects, emails).
 * Prevents XSS even if rendered in HTML attributes or dangerouslySetInnerHTML.
 */
export const sanitizeText = (dirty) => {
  if (dirty === null || dirty === undefined) return "";
  if (typeof dirty !== "string") return String(dirty);
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [] });
};

/**
 * SECURITY: Allows only safe line breaks (<br>). Use for long text (bios, messages).
 */
export const sanitizeBio = (dirty) => {
  if (dirty === null || dirty === undefined) return "";
  if (typeof dirty !== "string") return String(dirty);
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: ["br"] });
};
