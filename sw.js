// v4 — force update, network only, no caching ever
const CACHE_VERSION = 'shoppodium-v4';

self.addEventListener('install', e => {
  // Take over immediately without waiting for old tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        // Force all open tabs to reload
        return self.clients.matchAll({ type: 'window' });
      })
      .then(clients => {
        clients.forEach(client => client.navigate(client.url));
      })
  );
});

// Absolute network only — never touch cache
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).catch(() => fetch(e.request))
  );
});
<!-- deploy test Fri Jun  5 04:58:07 UTC 2026 -->
