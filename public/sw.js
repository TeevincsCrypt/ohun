/**
 * Web Push service worker.
 *
 * Runs independently of any open tab — that independence is the entire
 * point. A `postgres_changes` listener and the Notification API it drives
 * (see components/ohun/MessageWatcher.tsx) both need this app's JavaScript
 * already running in a live tab, which fails precisely when the person is
 * not looking at the app. A service worker is registered once and then
 * kept alive by the browser/OS to receive push events even with every tab
 * closed — that is what actually reaches someone who has moved on.
 *
 * Deliberately minimal: no caching, no offline support, nothing beyond
 * push delivery and the click that follows it.
 */

self.addEventListener("push", (event) => {
  let payload = { title: "OHUN", body: "You have a new message." };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      // A push service is free to deliver a plain-text payload; fall back
      // to it rather than showing nothing.
      payload = { title: "OHUN", body: event.data.text() };
    }
  }

  const { title, body, url, tag } = payload;

  event.waitUntil(
    self.registration.showNotification(title || "OHUN", {
      body,
      tag,
      // Replaces a still-visible notification with the same tag instead of
      // stacking a second one — several messages from one person while the
      // phone is untouched should read as one updated notification.
      renotify: Boolean(tag),
      icon: "/icon.svg",
      data: { url: url || "/chats" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/chats";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focuses a tab already on this thread rather than opening a second
      // one, if the app happens to be open elsewhere.
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
