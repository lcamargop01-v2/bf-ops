// BF Operations — Service Worker for Push Notifications
const CACHE_NAME = 'bf-ops-v1';

// Install event
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

// Push notification received
self.addEventListener('push', function(event) {
  var data = { title: 'BF Operations', body: 'New notification', url: '/' };
  try {
    if (event.data) data = event.data.json();
  } catch(e) {
    if (event.data) data.body = event.data.text();
  }

  var options = {
    body: data.body || data.message || '',
    icon: '/static/icon-192.png',
    badge: '/static/badge-72.png',
    tag: data.tag || 'bf-ops-notification',
    renotify: true,
    requireInteraction: data.requireInteraction || false,
    data: { url: data.url || '/' },
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'BF Operations', options)
  );
});

// Notification click
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      // Try to focus existing window
      for (var i = 0; i < clients.length; i++) {
        var client = clients[i];
        if (client.url.indexOf(self.location.origin) !== -1 && 'focus' in client) {
          client.focus();
          if (url !== '/') client.navigate(url);
          return;
        }
      }
      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

// Background sync for offline notification queue
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-notifications') {
    // Re-check for notifications when back online
  }
});
