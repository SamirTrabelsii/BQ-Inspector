// Self-destructing service worker.
// This replaces the old workbox/PWA service worker.
// Once installed, it immediately unregisters itself and clears all caches.
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => { clients.forEach((c) => c.navigate(c.url)); })
  );
});
