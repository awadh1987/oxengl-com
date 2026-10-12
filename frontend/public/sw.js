/**
 * OxenGL Service Worker Cache Bypass & Self-Unregistration
 * Ensures browsers immediately purge cached chunks and fetch fresh bundles from network.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => {
      return self.registration.unregister();
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Pass-through all requests directly to network without caching
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
