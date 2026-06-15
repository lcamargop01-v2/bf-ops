// BF Ops Service Worker — Cache-first for static assets, network-first for API
const CACHE_NAME = 'bf-ops-v1';
const STATIC_ASSETS = [
  '/app',
  '/static/shell.js',
  '/static/shell.css',
  '/static/modules/logistics.js',
  '/static/modules/logistics.css',
  '/static/modules/inventory.js',
  '/static/modules/inventory.css',
  '/static/modules/purchasing.js',
  '/static/modules/purchasing.css',
  '/static/modules/crm.js',
  '/static/modules/crm.css',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];

// Install — pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Don't fail install if some assets aren't available yet
        console.warn('[SW] Some assets failed to cache during install');
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests — network only (always need fresh data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets — stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => cached); // Offline fallback to cache

        return cached || fetchPromise;
      });
    })
  );
});
