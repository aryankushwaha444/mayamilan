// src/utils/sanitize.ts — strip tags/control chars from free text before it hits the API,
// a WebView (Turnstile), or a notification body. RN <Text> is safe by default; this protects
// the *payload* and any webview sink from stored-XSS / injection-into-logs.
const TAG_RE = /<[^>]*>/g;
const CTRL_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g;
export function sanitizeText(input: unknown, max = 2000): string {
  if (typeof input !== "string") return "";
  return input.replace(TAG_RE, "").replace(CTRL_RE, "").trim().slice(0, max);
}
export function sanitizeForUrl(input: unknown): string {
  return sanitizeText(input, 2048).replace(/[^\w\-./:?=&%#]/g, "");
}
