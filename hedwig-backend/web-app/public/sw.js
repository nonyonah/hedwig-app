const CACHE = 'hedwig-v3';

const PRECACHE_URLS = ['/', '/offline'];

self.addEventListener('install', (event) => {
  // delete old caches immediately so we never serve stale chunks
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() =>
      caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // delete any leftover cache we don't own
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for everything — cache is only an offline fallback
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.status === 200 && url.pathname !== '/sw.js') {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
