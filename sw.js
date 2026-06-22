// v9 — persistent, force-fresh HTML, auto-fix stale dashboard on first activate
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => Promise.all(clients.map(c => {
        try {
          const path = new URL(c.url).pathname;
          // If client is stuck on any old dashboard URL, send them through index
          // to get the current version. Index routes to app2.html which has correct styles.
          if (path.includes('app.html') || path.includes('dashboard.html')) {
            return c.navigate('/index.html');
          }
        } catch(_) {}
        return null;
      })))
  );
});

self.addEventListener('fetch', e => {
  // For all page navigations: bypass HTTP cache entirely, always go to network
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(() => fetch(e.request))
    );
  }
  // Static assets: default browser behavior (don't interfere)
});
