/* Expense Management — service worker
 * Caches the app shell so the interface opens without a connection.
 * It deliberately never caches API responses: expense data must always be live,
 * and a stale approval status is worse than no status at all.
 */
const CACHE = 'expense-shell-v12';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './logo.svg',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll fails the whole install if one CDN hiccups, so add individually
      .then(cache => Promise.all(SHELL.map(url =>
        cache.add(url).catch(() => console.warn('Skipped caching', url)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Never touch the API or anything non-GET. Expense data goes straight to the network.
  if (req.method !== 'GET') return;
  if (req.url.indexOf('script.google.com') >= 0 ||
      req.url.indexOf('googleusercontent.com') >= 0) return;

  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) {
        // Serve instantly, then quietly refresh the cached copy for next time.
        event.waitUntil(
          fetch(req).then(res => {
            if (res && res.status === 200) caches.open(CACHE).then(c => c.put(req, res.clone()));
          }).catch(() => {})
        );
        return hit;
      }
      return fetch(req)
        .then(res => {
          if (res && res.status === 200 && (req.url.startsWith(self.location.origin) ||
              req.url.indexOf('cdn') >= 0)) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

/* ---- Notifications ----
 * Tapping an alert should focus the tab that is already open rather than
 * opening a second copy of the app.
 */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});

/* Push is wired up for later. Nothing sends push messages today — alerts are
 * raised by the page itself while it is open — but this keeps the door open
 * without needing another service worker version. */
self.addEventListener('push', event => {
  let data = { title: 'Expense Management', body: 'You have a new notification.' };
  try { if (event.data) data = event.data.json(); } catch (e) {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: './logo.svg', badge: './logo.svg',
    tag: data.tag || 'expense', vibrate: [80, 40, 80]
  }));
});
