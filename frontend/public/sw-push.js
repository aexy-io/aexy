// Service Worker for Web Push Notifications
// Registered by useWebPush hook when user enables push notifications

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const title = data.title || "Aexy";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: "/badge-72.png",
    data: { url: data.action_url },
    tag: data.tag || "aexy-notification",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (url) {
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
        // Focus existing tab if one matches the URL
        for (const client of windowClients) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  }
});
