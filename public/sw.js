/*
 * Called It service worker. It only does push: shows notifications, routes
 * taps to the right page, and keeps the subscription fresh. No offline cache.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** Only ever open pages on this site, whatever the payload says. */
function sameOrigin(path) {
  try {
    const url = new URL(path || "/inbox", self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL("/inbox", self.location.origin).href;
  } catch {
    return new URL("/inbox", self.location.origin).href;
  }
}

async function windows() {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return all.filter((c) => new URL(c.url).origin === self.location.origin);
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Called It";
  const options = {
    body: data.body || "",
    icon: "/pwa-icon/192?v=2", // keep in sync with ICON_VERSION in src/lib/icon-art.ts
    badge: "/pwa-icon/badge?v=2",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: sameOrigin(data.url) },
  };
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // Let open tabs refresh their inbox badge and lists.
      for (const c of await windows()) c.postMessage({ type: "push" });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || sameOrigin("/inbox");
  event.waitUntil(
    (async () => {
      const [open] = await windows();
      if (open) {
        try {
          await open.focus();
          open.postMessage({ type: "navigate", url });
          return;
        } catch {
          // fall through to a new window
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const key = old && old.options && old.options.applicationServerKey;
      const sub =
        event.newSubscription ||
        (key ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null);
      if (!sub) return;
      await fetch("/api/push/resubscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oldEndpoint: old ? old.endpoint : null, subscription: sub.toJSON() }),
      });
    })(),
  );
});
