/* ============ PUSH EVENT — OS shows notification with sound 🔊 ============ */
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {
    title: "Maya~Milan",
    body: "💕 New activity",
    url: "/notifications",
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/logo.png",
      badge: "/logo.png",
      tag: data.tag || "mayamilan",
      // silent defaults to false → OS plays system notification sound 🔊
      data: { url: data.url || "/" },
      actions: [
        { action: "open", title: "Open" },
        { action: "dismiss", title: "Dismiss" },
      ],
    })
  );
});

/* ============ CLICK EVENT — open the app ============ */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});

/* ============ CLOSE EVENT (optional) ============ */
self.addEventListener("notificationclose", (event) => {
  // Analytics or cleanup
});
