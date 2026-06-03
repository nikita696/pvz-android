/* global caches, fetch, self, URL */

const CACHE_NAME = 'pvz-android-shell-v1';
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json', '/pwa-icon-192.png', '/pwa-icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        const responseCopy = networkResponse.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseCopy);
        });

        return networkResponse;
      });
    }),
  );
});
