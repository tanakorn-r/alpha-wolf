// Alpha Wolf Service Worker
// Strategy: cache the app shell on install, serve from cache first,
// fall back to network. API calls always go to network (never cached).

// Bumped so the activate handler's cleanup actually purges every stale entry
// left behind by the old cache-first-navigation bug (see the fetch handler).
const CACHE = "alpha-wolf-v2";

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

// Fetch: network-first for API and navigations, cache-first for static assets.
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

  // Navigations (full page loads) must always prefer the network. Serving them
  // "cached || network" meant the stale response won every time a cache entry
  // existed — the fresh network response only updated the cache for *next* time,
  // which would also be stale by then — so visitors stayed permanently one
  // version behind whatever's actually deployed. Only fall back to a cached
  // shell when genuinely offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // Static assets: cache-first is safe here since production builds content-hash filenames.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok && url.pathname.match(/\.(js|css|png|svg|woff2|webp|gif)$/)) {
        const clone = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }))
  );
});
