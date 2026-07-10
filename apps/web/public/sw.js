// Alpha Wolf Service Worker
// Strategy: cache the app shell on install, serve from cache first,
// fall back to network. API calls always go to network (never cached).

const CACHE = "alpha-wolf-v1";

const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable.png",
];

// Install: pre-cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for everything else
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always go to network for API calls, external URLs, and non-GET
  if (
    event.request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        // Cache fresh navigations and static assets
        if (response.ok && (event.request.mode === "navigate" || url.pathname.match(/\.(js|css|png|svg|woff2|webp|gif)$/))) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });

      // For navigations: serve stale while revalidating so the app loads
      // instantly even offline, then updates in the background.
      return cached || network;
    })
  );
});
