// src/utils/media.ts
//
// THE attacker-prevention gate for every remote media URL + the ObjectId rule.
//
// isSafeMediaUrl():
//  - keeps the old strict behavior: only accepts already-absolute safe URLs
//  - used by existing components that pass a string directly into Image.uri
//
// resolveSafeMediaUrl():
//  - accepts string OR { url } OR { secure_url } OR { path }
//  - resolves relative URLs like "/images/logo.png" against trusted origins
//  - returns an absolute URL only if the final host is trusted
//  - prevents mobile blank images caused by web-only relative URL resolution
//
// SECURITY:
//  - never allows wildcard hosts
//  - never allows unsplash.com
//  - never allows arbitrary user-controlled hosts
//  - http is allowed only for localhost in development

import {
  MEDIA_HOSTS,
  MEDIA_ORIGINS,
  OBJECTID_RE,
} from "../constants/mediaHosts";
import { URL_MAX } from "../constants/limits";

const DEV = typeof __DEV__ !== "undefined" && __DEV__;

const isLoopbackHost = (host: string): boolean =>
  host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";

const isAllowedHost = (host: string): boolean => {
  const h = host.toLowerCase();
  return MEDIA_HOSTS.some((re) => re.test(h));
};

const isAllowedAbsoluteUrl = (url: string): boolean => {
  if (!url || url.length > URL_MAX) return false;

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol === "https:") {
    return isAllowedHost(parsed.hostname);
  }

  if (DEV && parsed.protocol === "http:") {
    return isLoopbackHost(parsed.hostname.toLowerCase());
  }

  return false;
};

const extractUrlString = (raw: unknown): string | null => {
  if (typeof raw === "string") {
    const s = raw.trim();
    return s.length ? s : null;
  }

  if (!raw || typeof raw !== "object") return null;

  const o = raw as any;

  const candidates = [
    o.url,
    o.secure_url,
    o.secureUrl,
    o.path,
    o.src,
    o.href,
    o.value,
  ];

  for (const c of candidates) {
    if (typeof c === "string") {
      const s = c.trim();
      if (s.length) return s;
    }
  }

  return null;
};

const hasScheme = (s: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(s);

const looksLikeRelativePath = (s: string): boolean =>
  s.startsWith("/") || (/^[^:/?#]+\/[^?#]*$/.test(s) && !s.includes("://"));

export function resolveSafeMediaUrl(raw: unknown): string | null {
  const s = extractUrlString(raw);
  if (!s) return null;

  // Absolute URL.
  if (hasScheme(s)) {
    return isAllowedAbsoluteUrl(s) ? s : null;
  }

  // Protocol-relative URL: //host/path
  if (s.startsWith("//")) {
    const abs = `https:${s}`;
    return isAllowedAbsoluteUrl(abs) ? abs : null;
  }

  // Relative URL: /images/logo.png or images/logo.png
  if (looksLikeRelativePath(s)) {
    const path = s.startsWith("/") ? s : `/${s}`;

    for (const origin of MEDIA_ORIGINS) {
      const base = origin.replace(/\/+$/, "");
      const candidate = `${base}${path}`;

      if (isAllowedAbsoluteUrl(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

export function isSafeMediaUrl(u: unknown): u is string {
  if (typeof u !== "string") return false;
  return isAllowedAbsoluteUrl(u);
}

export function isObjectId(v: unknown): v is string {
  return typeof v === "string" && OBJECTID_RE.test(v);
}
