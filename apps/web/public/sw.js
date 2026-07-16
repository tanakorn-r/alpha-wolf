// Retire the old Alpha Wolf cache-first service worker. Installed PWAs still work
// online through the web manifest; release HTML and JavaScript must always come from
// the network so Safari cannot remain pinned to an obsolete API implementation.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("alpha-wolf-")).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
      await self.registration.unregister();

      // Existing Safari tabs may still be rendering the bundle supplied by the retired
      // worker. Navigate each controlled client once so it receives the network version.
      const windows = await self.clients.matchAll({ type: "window" });
      await Promise.all(windows.map((client) => client.navigate(client.url)));
    })()
  );
});
