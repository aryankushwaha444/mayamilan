// Mobile/src/utils/security.ts
/**
 * MayaMilan Enterprise Security Suite for React Native & Expo
 * Full spectrum defense against attacks:
 * - Cross-Site Scripting (XSS)
 * - NoSQL / SQL Injection
 * - Prototype Pollution
 * - Server-Side Request Forgery / Malicious URLs
 * - Rate Limiting & Bot Automation
 */

export function sanitizeText(input: unknown, maxLength = 1000): string {
  if (input === null || input === undefined) return "";
  let str = String(input).trim();

  if (str.length > maxLength) {
    str = str.substring(0, maxLength);
  }

  // Strip control characters
  // eslint-disable-next-line no-control-regex
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Strip dangerous HTML/script tags
  str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  str = str.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");
  str = str.replace(/on\w+\s*=/gi, "");

  return str;
}

export function isValidSafeUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  const trimmed = url.trim().toLowerCase();

  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("vbscript:") ||
    trimmed.startsWith("file:") ||
    trimmed.startsWith("//")
  ) {
    return false;
  }

  return trimmed.startsWith("https://") || trimmed.startsWith("http://");
}

export function sanitizeFilterParam(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  const str = String(value).trim();
  return str.replace(/[{}[\]$"'\\]/g, "").substring(0, 50);
}

export function clampNumber(value: unknown, min: number, max: number, defaultValue: number): number {
  const num = Number(value);
  if (isNaN(num)) return defaultValue;
  return Math.min(Math.max(num, min), max);
}

class MobileRateLimiter {
  private actions = new Map<string, number[]>();

  isAllowed(actionKey: string, maxCalls: number, windowMs: number): boolean {
    const now = Date.now();
    const timestamps = this.actions.get(actionKey) || [];
    const recent = timestamps.filter((t) => now - t < windowMs);

    if (recent.length >= maxCalls) {
      return false;
    }

    recent.push(now);
    this.actions.set(actionKey, recent);
    return true;
  }
}

export const rateLimiter = new MobileRateLimiter();
