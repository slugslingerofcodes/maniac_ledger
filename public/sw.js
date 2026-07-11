/*
 * anime_maniacs service worker — vanilla Cache API (no bundler, Turbopack-safe).
 * Served as a static file so it works regardless of webpack/Turbopack.
 *
 * Strategy:
 *   - navigations: network-first, fall back to the cached page when offline
 *   - same-origin static assets (script/style/image/font): cache-first
 *   - everything else (cross-origin: Jikan, MAL posters, Supabase): untouched
 */
const CACHE = "anitrack-v1";
const ASSET_DESTINATIONS = ["style", "script", "image", "font"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/* ---------------------------------------------------------------------------
 * Web Push (migration 0018 + the send-airing-notifications Edge Function).
 * Payload shape: { title, body, url, icon } — all optional.
 * ------------------------------------------------------------------------- */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* non-JSON payload — show a generic notification */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "anime_maniacs", {
      body: data.body || "",
      icon: data.icon || "/icon.png",
      badge: "/icon.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
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
      }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone

  if (request.mode === "navigate") {
    // Network-first, but cache each successful navigation so a previously
    // visited page (e.g. /library) still loads its shell offline — the
    // TanStack Query cache then rehydrates the data from IndexedDB.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/")),
        ),
    );
    return;
  }

  if (ASSET_DESTINATIONS.includes(request.destination)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
