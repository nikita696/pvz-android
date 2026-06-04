/* global caches, fetch, self, URL */

const CACHE_NAME = 'pvz-android-shell-v2';
const PRECACHE_ASSETS = ['/manifest.json', '/pwa-icon-192.png', '/pwa-icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clients) => {
        clients.forEach((client) => {
          if ('navigate' in client) {
            client.navigate(client.url);
          }
        });
      }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetchAndCache(request).catch(() => caches.match(request)));
    return;
  }

  if (url.pathname.startsWith('/_expo/static/')) {
    event.respondWith(caches.match(request).then((cachedResponse) => cachedResponse ?? fetchAndCache(request)));
    return;
  }

  event.respondWith(
    fetchAndCache(request).catch((error) => caches.match(request).then((cachedResponse) => cachedResponse ?? Promise.reject(error))),
  );
});

function fetchAndCache(request) {
  return fetch(request).then((networkResponse) => {
    if (!networkResponse || networkResponse.status !== 200) {
      return networkResponse;
    }

    const responseCopy = networkResponse.clone();

    caches.open(CACHE_NAME).then((cache) => {
      cache.put(request, responseCopy);
    });

    return networkResponse;
  });
}
