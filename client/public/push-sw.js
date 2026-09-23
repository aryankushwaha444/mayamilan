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
  const image = data.image || null; // Optional rich image
  const requireInteraction = data.requireInteraction || false;

  const options = {
    body,
    icon: "/logo.png",
    badge: "/logo.png",
    tag,
    data: { url },
    requireInteraction, // Keep notification until user interacts
    silent: false, // OS plays system notification sound 🔊
    vibrate: [200, 100, 200], // Haptic feedback on mobile
    actions: [
      { action: "open", title: "Open" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  // ✅ Add image if provided (rich notifications)
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

  // ✅ Handle different actions
  if (event.action === "dismiss") {
    // User dismissed — optionally send analytics
    console.log("[SW] Notification dismissed");
    return;
  }

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // ✅ Try to focus existing window
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus().then((focusedClient) => {
              // Navigate to the notification URL
              return focusedClient.navigate(absoluteUrl);
            });
          }
        }

        // ✅ Open new window if none exists
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

  // ✅ Send analytics (optional)
  const notificationData = event.notification.data;
  if (notificationData?.url) {
    // You could send this to your analytics endpoint
    // fetch("/api/analytics/notification-closed", {
    //   method: "POST",
    //   body: JSON.stringify({ url: notificationData.url }),
    // });
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
        "/offline.html", // Optional offline fallback
      ]);
    })
  );

  // ✅ Activate immediately (skip waiting)
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

  // ✅ Claim all clients immediately
  self.clients.claim();
});

/* ============ FETCH EVENT — offline fallback ============ */
self.addEventListener("fetch", (event) => {
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
