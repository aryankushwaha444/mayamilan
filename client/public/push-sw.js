"use strict";

/**
 * Maya Milan — hardened PWA/push service worker
 *
 * SECURITY GOALS:
 * - No external importScripts.
 * - No eval / dynamic code execution.
 * - No caching of /api, /socket.io, auth, messages, notifications, profile, settings, admin, call routes.
 * - No cross-origin fetch interception.
 * - Notification click URLs are validated to same-origin only.
 * - Push payload text is sanitized/truncated.
 * - Notification images are restricted to same-origin or Cloudinary.
 * - requireInteraction is forced false to prevent abusive persistent notifications.
 *
 * PWA GOAL:
 * - Provides a fetch handler so the app is installable.
 * - Caches only safe static shell/assets/images.
 */

const CACHE_VERSION = "maya-milan-v2";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

const ORIGIN = self.location.origin;

// Keep false in production. Never log push payloads.
const DEBUG = false;

// Notification assets. Adjust if your logo path is different.
const NOTIFICATION_ICON = "/images/logo.png";
const NOTIFICATION_BADGE = "/images/logo.png";

// Max number of images kept in the image cache.
const MAX_IMAGE_CACHE_ENTRIES = 120;

// Paths that must never be cached by this service worker.
const EXCLUDED_PREFIXES = [
  "/api",
  "/socket.io",
  "/auth",
  "/login",
  "/logout",
  "/register",
  "/admin",
  "/messages",
  "/notifications",
  "/profile",
  "/settings",
  "/account",
  "/call",
  "/calls",
  "/push-sw.js",
  "/manifest.webmanifest",
];

// Built from char codes so copy/paste cannot corrupt the range.
const CONTROL_CHARS_RE = new RegExp(
  "[" +
    String.fromCharCode(0) +
    "-" +
    String.fromCharCode(31) +
    String.fromCharCode(127) +
    "-" +
    String.fromCharCode(159) +
    "]",
  "g"
);

function log(...args) {
  if (DEBUG) console.log("[SW]", ...args);
}

function sanitizeText(value, maxLength, fallback = "") {
  if (typeof value !== "string") return fallback;

  const cleaned = value
    .replace(CONTROL_CHARS_RE, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.slice(0, maxLength) || fallback;
}

function safeSameOriginPath(input, fallback = "/") {
  if (typeof input !== "string" || !input) return fallback;

  try {
    const url = new URL(input, ORIGIN);

    if (url.origin !== ORIGIN) return fallback;
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;

    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

function safeNotificationImage(input) {
  if (typeof input !== "string" || !input) return null;

  try {
    const url = new URL(input, ORIGIN);

    // Block credentials in URL.
    if (url.username || url.password) return null;

    // Allow same-origin images.
    if (url.origin === ORIGIN) return url.href;

    // Allow Cloudinary only. Remove this block if you do not use Cloudinary images in notifications.
    const host = url.hostname.toLowerCase();
    if (host === "res.cloudinary.com" || host.endsWith(".cloudinary.com")) {
      return url.href;
    }

    return null;
  } catch {
    return null;
  }
}

function shouldNotCache(response) {
  try {
    const cc = response.headers.get("cache-control") || "";
    return /no-store|private/i.test(cc);
  } catch {
    return true;
  }
}

function isExcluded(pathname) {
  return EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

function isStaticAsset(pathname) {
  return pathname.startsWith("/assets/");
}

function isImageAsset(pathname) {
  return pathname.startsWith("/images/") || pathname.startsWith("/icons/");
}

async function pruneCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    if (keys.length <= maxEntries) return;

    const deleteCount = keys.length - maxEntries;
    for (let i = 0; i < deleteCount; i++) {
      await cache.delete(keys[i]);
    }
  } catch {}
}

async function addToCache(cacheName, request, response) {
  try {
    if (!response) return;
    if (!response.ok) return;
    if (response.type !== "basic") return;
    if (shouldNotCache(response)) return;

    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());

    if (cacheName === IMAGE_CACHE) {
      await pruneCache(IMAGE_CACHE, MAX_IMAGE_CACHE_ENTRIES);
    }
  } catch {}
}

async function networkFirstNavigation(request) {
  try {
    const networkResponse = await fetch(request);

    if (
      networkResponse.ok &&
      networkResponse.type === "basic" &&
      !shouldNotCache(networkResponse)
    ) {
      // Fire-and-forget. Do not block navigation on cache writes.
      void addToCache(SHELL_CACHE, request, networkResponse);
    }

    return networkResponse;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cached =
      (await cache.match("/")) || (await cache.match("/index.html"));

    if (cached) return cached;

    return new Response("Offline", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    void addToCache(cacheName, request, networkResponse);
    return networkResponse;
  } catch {
    return new Response("Offline", {
      status: 504,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((networkResponse) => {
      void addToCache(cacheName, request, networkResponse);
      return networkResponse;
    })
    .catch(() => null);

  if (cached) {
    // Refresh in background, but return cached immediately.
    void networkPromise;
    return cached;
  }

  const networkResponse = await networkPromise;

  if (networkResponse) return networkResponse;

  return new Response("Offline", {
    status: 504,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

/* ============ INSTALL EVENT ============ */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);

      // Precache only safe shell assets.
      // Promise.allSettled prevents one missing file from breaking install.
      await Promise.allSettled(
        ["/", NOTIFICATION_ICON].map((url) => cache.add(url))
      );

      await self.skipWaiting();
    })()
  );
});

/* ============ ACTIVATE EVENT ============ */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter((name) => !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name))
      );

      await self.clients.claim();
    })()
  );
});

/* ============ MESSAGE EVENT ============ */
self.addEventListener("message", (event) => {
  // Optional manual update trigger from the page:
  // navigator.serviceWorker.controller?.postMessage({ type: "SKIP_WAITING" });
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* ============ PUSH EVENT ============ */
self.addEventListener("push", (event) => {
  let data = {};

  try {
    const parsed = event.data?.json();
    if (parsed && typeof parsed === "object") {
      data = parsed;
    }
  } catch {
    data = {};
  }

  const title = sanitizeText(data.title, 80, "Maya~Milan");
  const body = sanitizeText(data.body, 180, "New activity");
  const rawTag = sanitizeText(data.tag, 80, "general");
  const tag = `maya-milan:${rawTag}`;
  const url = safeSameOriginPath(data.url, "/");
  const image = safeNotificationImage(data.image);

  const options = {
    body,
    tag,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    dir: "ltr",
    lang: "en",
    renotify: false,
    requireInteraction: false, // forced false: prevents abusive persistent notifications
    silent: false,
    timestamp: Date.now(),
    vibrate: [200, 100, 200],
    actions: [
      { action: "open", title: "Open" },
      { action: "dismiss", title: "Dismiss" },
    ],
    data: {
      url,
    },
  };

  if (image) {
    options.image = image;
  }

  event.waitUntil(
    self.registration.showNotification(title, options).catch((error) => {
      log("Failed to show notification:", error);
    })
  );
});

/* ============ NOTIFICATION CLICK EVENT ============ */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;

  // Only allow explicit dismiss or default/open click.
  if (action === "dismiss") {
    return;
  }

  if (action && action !== "open") {
    return;
  }

  const safePath = safeSameOriginPath(event.notification?.data?.url, "/");
  const targetUrl = new URL(safePath, ORIGIN).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clientList) {
        let clientOrigin = "";

        try {
          clientOrigin = new URL(client.url).origin;
        } catch {
          continue;
        }

        if (clientOrigin !== ORIGIN) continue;

        if ("navigate" in client) {
          try {
            await client.navigate(targetUrl);
            return;
          } catch {
            // Fall through to focus/openWindow.
          }
        }

        if ("focus" in client) {
          try {
            await client.focus();
            return;
          } catch {
            // Fall through.
          }
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});

/* ============ NOTIFICATION CLOSE EVENT ============ */
self.addEventListener("notificationclose", () => {
  // Intentionally no analytics/logging here.
  // If you add analytics, never log raw notification payload data.
});

/* ============ FETCH EVENT ============ */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only intercept GET.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Only intercept same-origin.
  if (url.origin !== ORIGIN) return;

  // Only http/https.
  if (url.protocol !== "https:" && url.protocol !== "http:") return;

  // Never interfere with API, Socket.IO, auth, private, or service-worker files.
  if (isExcluded(url.pathname)) return;

  // SPA navigations: network-first with offline shell fallback.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Hashed build assets: cache-first.
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Local images/icons: stale-while-revalidate.
  if (isImageAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  // Unknown same-origin GET: network only, no caching.
  // This is safer than accidentally caching sensitive HTML/JSON.
});
