// v10 — push notifications + persistent cache bypass
const VAPID_PUBLIC_KEY = 'BGfJ4KXzvCR3lzIEdbiNICijRa5VAMxOPlLJKMH3RIkz-ctumBxhar2XjMSOdJwm5OEAjmtgZ9QksjqA1VRvqtg';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(() => fetch(e.request))
    );
  }
});

// Push notification received
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'ShopPodium';
  const body = data.body || 'You have a new notification';
  const url = data.url || '/app2.html';

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
      vibrate: [100, 50, 100],
      requireInteraction: false,
    })
  );
});

// Tap notification → open dashboard
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/app2.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
