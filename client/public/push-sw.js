/* ============ PUSH EVENT — OS shows notification with sound 🔊 ============ */
self.addEventListener("push", (event) => {
  console.log("[SW] Push event received");

  let data;
  try {
    data = event.data?.json() || {};
  } catch (error) {
    console.error("[SW] Failed to parse push data:", error);
    data = {};
  }

  const title = data.title || "Maya~Milan";
  const body = data.body || "💕 New activity";
  const url = data.url || "/notifications";
  const tag = data.tag || "mayamilan";
  const image = data.image || null;
  const requireInteraction = data.requireInteraction || false;

  const options = {
    body,
    icon: "/logo.png",
    badge: "/logo.png",
    tag,
    data: { url },
    requireInteraction,
    silent: false,
    vibrate: [200, 100, 200],
    actions: [
      { action: "open", title: "Open" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  if (image) {
    options.image = image;
  }

  event.waitUntil(
    self.registration.showNotification(title, options).catch((error) => {
      console.error("[SW] Failed to show notification:", error);
    })
  );
});

/* ============ CLICK EVENT — open the app ============ */
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked:", event.action);

  event.notification.close();

  const url = event.notification.data?.url || "/";
  const absoluteUrl = new URL(url, self.location.origin).href;

  if (event.action === "dismiss") {
    console.log("[SW] Notification dismissed");
    return;
  }

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus().then((focusedClient) => {
              return focusedClient.navigate(absoluteUrl);
            });
          }
        }
        return clients.openWindow(absoluteUrl);
      })
      .catch((error) => {
        console.error("[SW] Failed to handle notification click:", error);
      })
  );
});

/* ============ CLOSE EVENT — analytics ============ */
self.addEventListener("notificationclose", (event) => {
  console.log("[SW] Notification closed without interaction");
  const notificationData = event.notification.data;
  if (notificationData?.url) {
    // Optional analytics hook
  }
});

/* ============ INSTALL EVENT — cache assets ============ */
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...");

  event.waitUntil(
    caches.open("mayamilan-v1").then((cache) => {
      return cache.addAll([
        "/",
        "/logo.png",
        // "/offline.html", // Uncomment if you have this file
      ]);
    })
  );

  self.skipWaiting();
});

/* ============ ACTIVATE EVENT — clean old caches ============ */
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== "mayamilan-v1")
          .map((name) => caches.delete(name))
      );
    })
  );

  self.clients.claim();
});

/* ============ FETCH EVENT — offline fallback & caching ============ */
self.addEventListener("fetch", (event) => {
  // ✅ FIX 1: Ignore non-HTTP requests (chrome-extension://, moz-extension://, data:, blob:)
  // The Cache API only supports http and https schemes.
  if (!event.request.url.startsWith("http")) {
    return;
  }

  // ✅ FIX 2: Only handle requests from your own domain (ignore external CDNs/APIs)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Only handle GET requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const responseClone = response.clone();
          caches.open("mayamilan-v1").then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || caches.match("/offline.html");
        });
      })
  );
});
