// src/constants/mediaHosts.ts
//
// Trusted media origins/hosts for the mobile app.
// SECURITY:
//  - no wildcard "*"
//  - no unsplash.com
//  - no arbitrary user-supplied hosts
//  - only Cloudinary + this app's own known origins + optional explicit env hosts
//
// This exists because web can render relative URLs against the web origin,
// while React Native cannot. We resolve relative URLs only against trusted
// origins we control.

const DEV = typeof __DEV__ !== "undefined" && __DEV__;

export const OBJECTID_RE = /^[0-9a-fA-F]{24}$/;

const trimEnv = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const isLoopbackHost = (host: string): boolean =>
  host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";

const isValidHostname = (host: string): boolean => {
  const h = host.toLowerCase();

  if (h === "localhost") return true;

  return (
    /^[a-z0-9.-]+$/i.test(h) &&
    h.includes(".") &&
    !h.startsWith(".") &&
    !h.endsWith(".") &&
    !h.includes("..")
  );
};

const hostnameFromUrl = (input?: string | null): string | null => {
  if (!input) return null;

  try {
    const u = new URL(input);

    const allowedProtocol =
      u.protocol === "https:" ||
      (DEV &&
        u.protocol === "http:" &&
        isLoopbackHost(u.hostname.toLowerCase()));

    if (!allowedProtocol) return null;

    const host = u.hostname.toLowerCase();
    return isValidHostname(host) ? host : null;
  } catch {
    return null;
  }
};

const normalizeOrigin = (input?: string | null): string | null => {
  if (!input) return null;

  try {
    const u = new URL(input);

    const allowedProtocol =
      u.protocol === "https:" ||
      (DEV &&
        u.protocol === "http:" &&
        isLoopbackHost(u.hostname.toLowerCase()));

    if (!allowedProtocol) return null;

    return u.origin;
  } catch {
    return null;
  }
};

const extraHosts = trimEnv(process.env.EXPO_PUBLIC_ALLOWED_MEDIA_HOSTS)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(isValidHostname);

const originInputs = [
  trimEnv(process.env.EXPO_PUBLIC_MEDIA_BASE_URL),
  trimEnv(process.env.EXPO_PUBLIC_SITE_URL),
  trimEnv(process.env.EXPO_PUBLIC_API_URL),
  "https://mayamilan.vercel.app",
  "https://mayamilan.onrender.com",
];

const originHosts = originInputs
  .map((x) => hostnameFromUrl(x))
  .filter((x): x is string => Boolean(x));

const baseHosts = [
  // Cloudinary is the trusted storage CDN for uploaded media.
  "cloudinary.com",

  // This app's own origins.
  ...originHosts,

  // Optional explicit trusted hosts from env.
  ...extraHosts,
];

if (DEV) {
  baseHosts.push("localhost", "127.0.0.1", "0.0.0.0");
}

const uniqueHosts = Array.from(new Set(baseHosts.filter(isValidHostname)));

export const MEDIA_HOSTS = uniqueHosts.map((host) => {
  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\.)${escaped}$`, "i");
});

export const MEDIA_ORIGINS = Array.from(
  new Set(
    [
      normalizeOrigin(trimEnv(process.env.EXPO_PUBLIC_MEDIA_BASE_URL)),
      normalizeOrigin(trimEnv(process.env.EXPO_PUBLIC_SITE_URL)),
      normalizeOrigin(trimEnv(process.env.EXPO_PUBLIC_API_URL)),
      normalizeOrigin("https://mayamilan.vercel.app"),
      normalizeOrigin("https://mayamilan.onrender.com"),
    ].filter((x): x is string => Boolean(x))
  )
);
