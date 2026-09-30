/* global caches, fetch, self, URL */

const CACHE_NAME = 'pvz-android-shell-v4';
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
      .then(() => self.clients.claim()),
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
    // Always prefer the current deployment for JavaScript/assets. Fall back to
    // the cache only when the network is unavailable, so a deployed fix cannot
    // stay hidden behind a stale PWA asset cache.
    event.respondWith(fetchAndCache(request).catch(() => caches.match(request)));
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
